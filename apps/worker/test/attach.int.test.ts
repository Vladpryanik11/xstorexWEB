import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateBucketCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type { UploadPurpose } from '@xstore/db';
import { resetDatabase } from '@xstore/db/testing';
import { QueueName } from '@xstore/shared';
import { QueueEvents, type Worker } from 'bullmq';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildIpaBuffer, defaultInfo } from '../../../packages/ios/test/helpers/build-ipa.js';
import { makePng, toCgbi } from '../../../packages/ios/test/helpers/to-cgbi.js';
import { attachToCatalog } from '../src/catalog/attach.js';
import { loadWorkerConfig } from '../src/config.js';
import { closeWorkerDeps, createWorkerDeps, type WorkerDeps } from '../src/deps.js';
import { createIpaWorker } from '../src/queues/ipa.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

let tmp: string;
let deps: WorkerDeps;
let worker: Worker;
let events: QueueEvents;
let ownerId: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'xstore-attach-int-'));
  const env = process.env;
  const config = loadWorkerConfig({
    DATABASE_URL: env.DATABASE_URL_TEST,
    REDIS_URL: env.REDIS_URL_TEST,
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_REGION: env.S3_REGION,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    S3_BUCKET_PREFIX: env.S3_BUCKET_PREFIX_TEST,
    TMP_DIR: tmp,
    LOG_LEVEL: 'error',
  });
  deps = createWorkerDeps(config, pino({ level: 'silent' }));
  for (const name of ['originals', 'media'] as const) {
    try {
      await deps.s3.client.send(new CreateBucketCommand({ Bucket: deps.s3.bucket(name) }));
    } catch (err) {
      const code = (err as { name?: string }).name;
      if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err;
    }
  }
  events = new QueueEvents(QueueName.ipa, { connection: deps.connection.duplicate() });
  await events.waitUntilReady();
  worker = createIpaWorker(deps);
  await worker.waitUntilReady();
});

beforeEach(async () => {
  await deps.queues[QueueName.ipa].obliterate({ force: true });
  await resetDatabase(process.env.DATABASE_URL_TEST ?? '');
  ownerId = (await deps.db.user.create({ data: { email: 'admin@xstorex.ru', role: 'admin' } })).id;
});

afterAll(async () => {
  await worker?.close();
  await events?.close();
  if (deps) await closeWorkerDeps(deps);
  await rm(tmp, { recursive: true, force: true });
});

const icon = toCgbi(
  makePng(
    120,
    120,
    Array.from({ length: 120 * 120 }, () => [10, 120, 200, 255]),
  ),
);

function ipa(info: Record<string, unknown> = {}): Promise<Buffer> {
  return buildIpaBuffer({
    info: { ...defaultInfo, CFBundleIconFiles: ['AppIcon60x60'], ...info },
    files: { 'Payload/Test.app/AppIcon60x60@2x.png': icon },
  });
}

async function putUpload(body: Buffer, purpose: UploadPurpose = 'catalog') {
  const row = await deps.db.ipaUpload.create({
    data: {
      ownerId,
      purpose,
      bucket: deps.s3.bucket('originals'),
      key: '',
      fileName: 'test.ipa',
      sizeBytes: BigInt(body.length),
      partSize: 64 * 1024 ** 2,
      status: 'uploaded',
    },
  });
  const key = `originals/${row.id}.ipa`;
  await deps.db.ipaUpload.update({ where: { id: row.id }, data: { key } });
  await deps.s3.client.send(new PutObjectCommand({ Bucket: row.bucket, Key: key, Body: body }));
  return { ...row, key };
}

async function runJob(uploadId: string) {
  const job = await deps.queues[QueueName.ipa].add('inspect', { uploadId }, { attempts: 1 });
  await job.waitUntilFinished(events, 20_000);
}

async function upload(body: Buffer, purpose: UploadPurpose = 'catalog') {
  const row = await putUpload(body, purpose);
  await runJob(row.id);
  return deps.db.ipaUpload.findUniqueOrThrow({ where: { id: row.id } });
}

async function exists(bucket: 'originals' | 'media', key: string): Promise<boolean> {
  try {
    await deps.s3.client.send(new HeadObjectCommand({ Bucket: deps.s3.bucket(bucket), Key: key }));
    return true;
  } catch {
    return false;
  }
}

it('creates a draft app for a new bundle id', async () => {
  const row = await upload(await ipa());
  expect(row.status).toBe('ready');
  expect(row.appVersionId).not.toBeNull();

  const version = await deps.db.appVersion.findUniqueOrThrow({
    where: { id: row.appVersionId ?? '' },
    include: { app: true },
  });
  expect(version).toMatchObject({
    bundleId: 'ru.test.app',
    version: '1.2',
    build: '45',
    minIos: '15.0',
    encrypted: false,
    status: 'draft',
    ipaKey: row.key,
    sizeBytes: row.sizeBytes,
    icon57Key: `apps/${version.appId}/${version.id}/icon-57.png`,
  });
  expect(version.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(version.app).toMatchObject({
    slug: 'test',
    name: 'Тест',
    status: 'draft',
    iconKey: `apps/${version.appId}/icon-512.png`,
    // The card is filled in by the admin; nothing is imported from iTunes.
    itunesId: null,
    description: null,
    developer: null,
    rating: null,
    screenshotKeys: [],
  });

  expect(await exists('media', `apps/${version.appId}/icon-512.png`)).toBe(true);
  expect(await exists('media', `apps/${version.appId}/${version.id}/icon-57.png`)).toBe(true);
  expect(await exists('media', `uploads/${row.id}/icon-512.png`)).toBe(false);
  expect(await exists('media', `uploads/${row.id}/icon-57.png`)).toBe(false);
  expect(row.inspect).toMatchObject({
    icon512Key: `apps/${version.appId}/icon-512.png`,
    icon57Key: `apps/${version.appId}/${version.id}/icon-57.png`,
  });
  expect(await exists('originals', row.key)).toBe(true);
});

it('adds a version to an existing app', async () => {
  const first = await upload(await ipa());
  const app = await deps.db.app.findFirstOrThrow();
  await deps.db.app.update({ where: { id: app.id }, data: { iconKey: 'apps/custom.png' } });

  const second = await upload(
    await ipa({ CFBundleShortVersionString: '1.3', CFBundleVersion: '46' }),
  );
  expect(second.status).toBe('ready');
  const versions = await deps.db.appVersion.findMany({ orderBy: { createdAt: 'asc' } });
  expect(versions.map((v) => [v.appId, v.version, v.build])).toEqual([
    [app.id, '1.2', '45'],
    [app.id, '1.3', '46'],
  ]);
  expect(versions.map((v) => v.id)).toEqual([first.appVersionId, second.appVersionId]);
  expect(await deps.db.app.count()).toBe(1);
  // An icon set by the admin is kept.
  expect((await deps.db.app.findUniqueOrThrow({ where: { id: app.id } })).iconKey).toBe(
    'apps/custom.png',
  );
});

it('duplicate version is rejected', async () => {
  await upload(await ipa());
  const dup = await upload(await ipa());
  expect(dup).toMatchObject({
    status: 'rejected',
    rejectCode: 'DUPLICATE_VERSION',
    appVersionId: null,
  });
  expect(await deps.db.appVersion.count()).toBe(1);
  expect(await exists('originals', dup.key)).toBe(false);
  expect(await exists('media', `uploads/${dup.id}/icon-512.png`)).toBe(false);
  expect(await exists('media', `uploads/${dup.id}/icon-57.png`)).toBe(false);
});

it('gives a second app with the same name its own slug', async () => {
  await upload(await ipa());
  await upload(await ipa({ CFBundleIdentifier: 'ru.other.app' }));
  const slugs = (await deps.db.app.findMany({ orderBy: { createdAt: 'asc' } })).map((a) => a.slug);
  expect(slugs).toEqual(['test', 'test-2']);
});

it('creates the app without an icon when the IPA has none', async () => {
  const row = await upload(await buildIpaBuffer());
  const version = await deps.db.appVersion.findUniqueOrThrow({
    where: { id: row.appVersionId ?? '' },
    include: { app: true },
  });
  expect(version.icon57Key).toBeNull();
  expect(version.app.iconKey).toBeNull();
});

it('leaves signer uploads out of the catalog', async () => {
  const row = await upload(await ipa(), 'signer');
  expect(row).toMatchObject({ status: 'ready', appVersionId: null });
  expect(await deps.db.app.count()).toBe(0);
  expect(await exists('media', `uploads/${row.id}/icon-512.png`)).toBe(true);
});

it('finishes attaching when a retry finds the upload already inspected', async () => {
  const row = await upload(await ipa(), 'signer');
  // As if the worker had stopped right after inspection.
  await deps.db.ipaUpload.update({ where: { id: row.id }, data: { purpose: 'catalog' } });
  await runJob(row.id);
  const after = await deps.db.ipaUpload.findUniqueOrThrow({ where: { id: row.id } });
  expect(after.status).toBe('ready');
  expect(after.appVersionId).not.toBeNull();
  expect(await deps.db.appVersion.count()).toBe(1);
});

it('attaching twice is a no-op', async () => {
  const row = await upload(await ipa());
  const again = await attachToCatalog(deps, row);
  expect(again).toMatchObject({ versionId: row.appVersionId, created: false });
  expect(await deps.db.appVersion.count()).toBe(1);
  expect(await deps.db.app.count()).toBe(1);
});
