import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { resetDatabase } from '@xstore/db/testing';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';
import { closeWorkerDeps, createWorkerDeps, type WorkerDeps } from '../src/deps.js';
import { CACHE_MAX_GB_KEY, evictSignedBuilds } from '../src/signing/evict.js';
import { ensureBuckets, seedSigning } from './helpers/signing.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const DAY = 86_400_000;
const GB = 1024 ** 3;
let deps: WorkerDeps;

beforeAll(async () => {
  const env = process.env;
  deps = createWorkerDeps(
    loadWorkerConfig({
      DATABASE_URL: env.DATABASE_URL_TEST,
      REDIS_URL: env.REDIS_URL_TEST,
      S3_ENDPOINT: env.S3_ENDPOINT,
      S3_REGION: env.S3_REGION,
      S3_ACCESS_KEY: env.S3_ACCESS_KEY,
      S3_SECRET_KEY: env.S3_SECRET_KEY,
      S3_BUCKET_PREFIX: env.S3_BUCKET_PREFIX_TEST,
      TMP_DIR: await mkdtemp(join(tmpdir(), 'xstore-evict-')),
      LOG_LEVEL: 'error',
      PAYMENT_PROVIDER: 'fake',
      FAKE_PAYMENT_WEBHOOK_SECRET: 'test-fake-webhook-secret',
      MASTER_KEY_CURRENT: '1',
      MASTER_KEY_V1: randomBytes(32).toString('base64'),
    }),
    pino({ level: 'silent' }),
  );
  await ensureBuckets(deps.s3, ['originals', 'signed']);
});
afterAll(async () => closeWorkerDeps(deps));
beforeEach(async () => resetDatabase(process.env.DATABASE_URL_TEST ?? ''));

const NOW = new Date();

async function build(
  seed: Awaited<ReturnType<typeof seedSigning>>,
  opts: { lastUsedAt?: Date; sizeBytes?: number } = {},
) {
  const version = await deps.db.appVersion.create({
    data: {
      appId: seed.app.id,
      version: '1.0',
      build: randomBytes(3).toString('hex'),
      bundleId: seed.version.bundleId,
      sizeBytes: 10n,
      sha256: 'x',
      ipaKey: seed.version.ipaKey,
      encrypted: false,
      status: 'published',
    },
  });
  const key = `${seed.cert.id}/${version.id}.ipa`;
  await deps.s3.put(
    deps.s3.bucket('signed'),
    key,
    Buffer.from('signed'),
    'application/octet-stream',
  );
  return deps.db.signedBuild.create({
    data: {
      appVersionId: version.id,
      deviceCertificateId: seed.cert.id,
      key,
      sizeBytes: BigInt(Math.round(opts.sizeBytes ?? 6)),
      bundleId: seed.version.bundleId,
      lastUsedAt: opts.lastUsedAt ?? NOW,
    },
  });
}

const keyring = () => {
  const k = deps.config.keyring;
  if (!k) throw new Error('no keyring');
  return k;
};
const exists = (key: string) =>
  deps.s3.client
    .send(new HeadObjectCommand({ Bucket: deps.s3.bucket('signed'), Key: key }))
    .then(() => true)
    .catch(() => false);

async function liveToken(
  seed: Awaited<ReturnType<typeof seedSigning>>,
  buildId: string,
  appVersionId: string,
) {
  await deps.db.installToken.create({
    data: {
      tokenHash: randomBytes(16).toString('hex'),
      userId: seed.user.id,
      deviceId: seed.device.id,
      signedBuildId: buildId,
      appVersionId,
      expiresAt: new Date(NOW.getTime() + 3600_000),
    },
  });
}

it('evicts builds unused for 3 days', async () => {
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const old = await build(seed, { lastUsedAt: new Date(NOW.getTime() - 4 * DAY) });
  const fresh = await build(seed, { lastUsedAt: new Date(NOW.getTime() - 1 * DAY) });
  expect(await evictSignedBuilds(deps, NOW)).toEqual({ ended: 0, stale: 1, trimmed: 0 });
  expect((await deps.db.signedBuild.findMany()).map((b) => b.id)).toEqual([fresh.id]);
  expect(await exists(old.key)).toBe(false);
  expect(await exists(fresh.key)).toBe(true);
});

it('keeps builds with a live token', async () => {
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const old = await build(seed, { lastUsedAt: new Date(NOW.getTime() - 4 * DAY) });
  await liveToken(seed, old.id, old.appVersionId);
  expect(await evictSignedBuilds(deps, NOW)).toEqual({ ended: 0, stale: 0, trimmed: 0 });
  expect(await exists(old.key)).toBe(true);
});

it('trims by size, oldest first', async () => {
  await deps.db.setting.create({ data: { key: CACHE_MAX_GB_KEY, value: 1 } });
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const a = await build(seed, {
    lastUsedAt: new Date(NOW.getTime() - 3 * 3600_000),
    sizeBytes: 0.6 * GB,
  });
  const b = await build(seed, {
    lastUsedAt: new Date(NOW.getTime() - 2 * 3600_000),
    sizeBytes: 0.6 * GB,
  });
  const c = await build(seed, {
    lastUsedAt: new Date(NOW.getTime() - 1 * 3600_000),
    sizeBytes: 0.3 * GB,
  });
  expect(await evictSignedBuilds(deps, NOW)).toEqual({ ended: 0, stale: 0, trimmed: 1 });
  expect(
    (await deps.db.signedBuild.findMany({ orderBy: { lastUsedAt: 'asc' } })).map((x) => x.id),
  ).toEqual([b.id, c.id]);
  expect(await exists(a.key)).toBe(false);
});

it('ended device files drop their builds at once, even with a live token', async () => {
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const copy = await build(seed);
  await liveToken(seed, copy.id, copy.appVersionId);
  await deps.db.deviceCertificate.update({
    where: { id: seed.cert.id },
    data: { status: 'revoked' },
  });
  expect(await evictSignedBuilds(deps, NOW)).toEqual({ ended: 1, stale: 0, trimmed: 0 });
  expect(await deps.db.signedBuild.count()).toBe(0);
  expect(await deps.db.installToken.count()).toBe(0);
  expect(await exists(copy.key)).toBe(false);
});
