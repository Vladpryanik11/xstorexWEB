import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { resetDatabase } from '@xstore/db/testing';
import { QueueName } from '@xstore/shared';
import { QueueEvents, type Worker } from 'bullmq';
import { pino } from 'pino';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { buildIpaBuffer, defaultInfo } from '../../../packages/ios/test/helpers/build-ipa.js';
import { buildMachO } from '../../../packages/ios/test/helpers/build-macho.js';
import { makePng, toCgbi } from '../../../packages/ios/test/helpers/to-cgbi.js';
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
  tmp = await mkdtemp(join(tmpdir(), 'xstore-worker-int-'));
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

async function inspect(body: Buffer) {
  const row = await deps.db.ipaUpload.create({
    data: {
      ownerId,
      purpose: 'catalog',
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
  await runJob(row.id);
  return deps.db.ipaUpload.findUniqueOrThrow({ where: { id: row.id } });
}

async function runJob(uploadId: string) {
  const job = await deps.queues[QueueName.ipa].add('inspect', { uploadId }, { attempts: 1 });
  await job.waitUntilFinished(events, 20_000);
}

async function mediaObject(key: string): Promise<Buffer> {
  const res = await deps.s3.client.send(
    new GetObjectCommand({ Bucket: deps.s3.bucket('media'), Key: key }),
  );
  return Buffer.from((await res.Body?.transformToByteArray()) ?? []);
}

function solidPng(size: number): Buffer {
  return makePng(
    size,
    size,
    Array.from({ length: size * size }, () => [200, 40, 40, 255]),
  );
}

it('inspects an uploaded IPA, stores its icons and cleans up', async () => {
  const info = { ...defaultInfo, CFBundleIconFiles: ['AppIcon60x60'] };
  const ipa = await buildIpaBuffer({
    info,
    files: { 'Payload/Test.app/AppIcon60x60@3x.png': toCgbi(solidPng(180)) },
  });
  const row = await inspect(ipa);
  expect(row.status).toBe('ready');
  expect(row.rejectCode).toBeNull();
  expect(row.inspect).toMatchObject({
    bundleId: 'ru.test.app',
    name: 'Тест',
    version: '1.2',
    build: '45',
    minIos: '15.0',
    deviceFamily: [1, 2],
    encrypted: false,
    sizeBytes: ipa.length,
    icon512Key: `uploads/${row.id}/icon-512.png`,
    icon57Key: `uploads/${row.id}/icon-57.png`,
  });
  await expect(
    sharp(await mediaObject(`uploads/${row.id}/icon-512.png`)).metadata(),
  ).resolves.toMatchObject({
    width: 512,
    height: 512,
    format: 'png',
  });
  await expect(
    sharp(await mediaObject(`uploads/${row.id}/icon-57.png`)).metadata(),
  ).resolves.toMatchObject({
    width: 57,
    height: 57,
  });
  expect(await readdir(tmp)).toEqual([]);
});

it('marks an encrypted binary as ready with encrypted: true', async () => {
  const row = await inspect(
    await buildIpaBuffer({ binary: buildMachO({ fat: true, cryptid: 1 }) }),
  );
  expect(row.status).toBe('ready');
  expect(row.inspect).toMatchObject({ encrypted: true, icon512Key: null, icon57Key: null });
  await expect(
    deps.s3.client.send(
      new HeadObjectCommand({
        Bucket: deps.s3.bucket('media'),
        Key: `uploads/${row.id}/icon-512.png`,
      }),
    ),
  ).rejects.toThrow();
});

it('rejects random bytes with IPA_NOT_ZIP', async () => {
  const row = await inspect(randomBytes(64 * 1024));
  expect(row.status).toBe('rejected');
  expect(row.rejectCode).toBe('IPA_NOT_ZIP');
  expect(row.inspect).toBeNull();
  expect(await readdir(tmp)).toEqual([]);
});

it('does nothing for an upload that is already inspected', async () => {
  const row = await inspect(randomBytes(1024));
  await deps.db.ipaUpload.update({ where: { id: row.id }, data: { rejectCode: 'MARK' } });
  await runJob(row.id);
  const after = await deps.db.ipaUpload.findUniqueOrThrow({ where: { id: row.id } });
  expect(after).toMatchObject({ status: 'rejected', rejectCode: 'MARK' });
});

it('completes without changes when the upload is gone', async () => {
  await expect(runJob('missing-upload')).resolves.toBeUndefined();
});
