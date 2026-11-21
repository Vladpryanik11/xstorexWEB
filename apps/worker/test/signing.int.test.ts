import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { resetDatabase } from '@xstore/db/testing';
import { QueueName, signingQueueJobId } from '@xstore/shared';
import { QueueEvents, type Worker } from 'bullmq';
import { pino } from 'pino';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';
import { closeWorkerDeps, createWorkerDeps, type WorkerDeps } from '../src/deps.js';
import { createSigningWorker, SigningJobName } from '../src/queues/signing.js';
import { finishRequests, signAppVersion } from '../src/signing/sign.js';
import { ensureBuckets, fakeZsign, seedSigning } from './helpers/signing.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

let tmp: string;
const MASTER = randomBytes(32).toString('base64');

async function makeDeps(zsignBin: string): Promise<WorkerDeps> {
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
    PAYMENT_PROVIDER: 'fake',
    FAKE_PAYMENT_WEBHOOK_SECRET: 'test-fake-webhook-secret',
    MASTER_KEY_CURRENT: '1',
    MASTER_KEY_V1: MASTER,
    ZSIGN_BIN: zsignBin,
    SIGNING_TIMEOUT_MS: '10000',
    SIGNING_DISK_WAIT_MS: '50',
    SIGNING_DISK_WAITS: '2',
  });
  const deps = createWorkerDeps(config, pino({ level: 'silent' }));
  await ensureBuckets(deps.s3, ['originals', 'signed']);
  return deps;
}

let deps: WorkerDeps;
let zsign: Awaited<ReturnType<typeof fakeZsign>>;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), 'xstore-signing-int-'));
});

beforeEach(async () => {
  await resetDatabase(process.env.DATABASE_URL_TEST ?? '');
});

afterAll(async () => {
  if (deps) await closeWorkerDeps(deps);
});

async function useZsign(opts: Parameters<typeof fakeZsign>[0] = {}) {
  if (deps) await closeWorkerDeps(deps);
  zsign = await fakeZsign(opts);
  deps = await makeDeps(zsign.bin);
  return deps;
}

const keyring = () => {
  const k = deps.config.keyring;
  if (!k) throw new Error('no keyring');
  return k;
};

async function request(seed: Awaited<ReturnType<typeof seedSigning>>) {
  return deps.db.signingJob.create({
    data: {
      userId: seed.user.id,
      deviceId: seed.device.id,
      appVersionId: seed.version.id,
      deviceCertificateId: seed.cert.id,
      queueJobId: signingQueueJobId(seed.version.id, seed.cert.id),
    },
  });
}

const argsFiles = async () =>
  (await readdir(zsign.dir)).filter((f) => f.startsWith('args-')).sort();
const firstArgs = async () => {
  const [name] = await argsFiles();
  if (!name) throw new Error('zsign did not run');
  return readFile(join(zsign.dir, name), 'utf8');
};

it('signs, stores the build and completes every waiting request', async () => {
  await useZsign();
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const first = await request(seed);
  const second = await request(seed);

  const outcome = await signAppVersion(deps, first.id);

  expect(outcome).toMatchObject({ status: 'ready', reused: false });
  const build = await deps.db.signedBuild.findFirstOrThrow();
  expect(build.bundleId).toBe(seed.version.bundleId);
  const rows = await deps.db.signingJob.findMany();
  expect(rows.map((r) => [r.id, r.stage, r.signedBuildId]).sort()).toEqual(
    [
      [first.id, 'ready', build.id],
      [second.id, 'ready', build.id],
    ].sort(),
  );
  const obj = await deps.s3.client.send(
    new GetObjectCommand({ Bucket: deps.s3.bucket('signed'), Key: build.key }),
  );
  expect(Buffer.from((await obj.Body?.transformToByteArray()) ?? [])).toEqual(seed.ipa);
  // The supplier password never reaches zsign; a one-time repack does.
  const args = await firstArgs();
  expect(args).not.toContain(seed.kit.password);
  expect(args).toContain('identity.p12');
  expect(args).not.toContain('-b\n');
  // The temp dir is gone.
  expect(await readdir(tmp)).toEqual([]);
});

it('stages go in order', async () => {
  await useZsign({ wait: true });
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const job = await request(seed);
  const running = signAppVersion(deps, job.id);
  let stage = '';
  for (let i = 0; i < 200 && stage !== 'signing'; i++) {
    await new Promise((r) => setTimeout(r, 25));
    stage = (await deps.db.signingJob.findUniqueOrThrow({ where: { id: job.id } })).stage;
  }
  expect(stage).toBe('signing');
  await zsign.go();
  await running;
  expect((await deps.db.signingJob.findUniqueOrThrow({ where: { id: job.id } })).stage).toBe(
    'ready',
  );
});

it('reuses an existing build', async () => {
  await useZsign();
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  await signAppVersion(deps, (await request(seed)).id);
  const again = await signAppVersion(deps, (await request(seed)).id);
  expect(again).toMatchObject({ status: 'ready', reused: true });
  expect(await argsFiles()).toHaveLength(1);
});

it('signs a single-app profile with its App ID', async () => {
  await useZsign();
  const seed = await seedSigning(deps.db, deps.s3, keyring(), {
    appId: 'TEAM123456.ru.supplier.one',
  });
  await signAppVersion(deps, (await request(seed)).id);
  const args = (await firstArgs()).split('\n');
  expect(args).toEqual(expect.arrayContaining(['-b', 'ru.supplier.one']));
  expect((await deps.db.signedBuild.findFirstOrThrow()).bundleId).toBe('ru.supplier.one');
});

it('refuses when device files ended', async () => {
  await useZsign();
  const seed = await seedSigning(deps.db, deps.s3, keyring(), { certStatus: 'replaced' });
  const job = await request(seed);
  expect(await signAppVersion(deps, job.id)).toEqual({
    status: 'refused',
    code: 'DEVICE_NOT_READY',
  });
  const row = await deps.db.signingJob.findUniqueOrThrow({ where: { id: job.id } });
  expect([row.stage, row.errorCode]).toEqual(['failed', 'DEVICE_NOT_READY']);
  expect(await argsFiles()).toHaveLength(0);
});

it('marks requests failed after the last attempt', async () => {
  await useZsign({ fail: true });
  const queue = deps.queues[QueueName.signing];
  await queue.obliterate({ force: true });
  const events = new QueueEvents(QueueName.signing, { connection: deps.connection.duplicate() });
  await events.waitUntilReady();
  const worker: Worker = createSigningWorker(deps);
  await worker.waitUntilReady();
  try {
    const seed = await seedSigning(deps.db, deps.s3, keyring());
    const job = await request(seed);
    const queued = await queue.add(
      SigningJobName.sign,
      { signingJobId: job.id },
      { jobId: job.queueJobId, attempts: 2, backoff: { type: 'fixed', delay: 10 } },
    );
    await expect(queued.waitUntilFinished(events, 15_000)).rejects.toThrow();
    // Marked by the last attempt itself, before BullMQ drops the job.
    const row = await deps.db.signingJob.findUniqueOrThrow({ where: { id: job.id } });
    expect([row.stage, row.errorCode, row.failReason]).toEqual([
      'failed',
      'SIGNING_FAILED',
      'ZSIGN_EXIT',
    ]);
    expect(await argsFiles()).toHaveLength(2);
    expect(await deps.db.signedBuild.count()).toBe(0);
  } finally {
    await worker.close();
    await events.close();
  }
});

it('a full disk waits, tells the admin, then gives up', async () => {
  await useZsign();
  const queue = deps.queues[QueueName.signing];
  await queue.obliterate({ force: true });
  const events = new QueueEvents(QueueName.signing, { connection: deps.connection.duplicate() });
  await events.waitUntilReady();
  const worker: Worker = createSigningWorker(deps);
  await worker.waitUntilReady();
  try {
    const seed = await seedSigning(deps.db, deps.s3, keyring());
    // An IPA no disk can hold 2.5 times.
    await deps.db.appVersion.update({
      where: { id: seed.version.id },
      data: { sizeBytes: 10n ** 17n },
    });
    const job = await request(seed);
    const queued = await queue.add(
      SigningJobName.sign,
      { signingJobId: job.id },
      { jobId: job.queueJobId, attempts: 2, backoff: { type: 'fixed', delay: 10 } },
    );
    let waited = false;
    for (let i = 0; i < 100; i++) {
      const row = await deps.db.signingJob.findUniqueOrThrow({ where: { id: job.id } });
      if (row.stage === 'queued' && row.failReason === 'DISK_FULL') waited = true;
      if (row.stage === 'failed') break;
      await new Promise((r) => setTimeout(r, 20));
    }
    // While it waits the buyer still sees «Проверяем доступ», the admin sees the reason.
    expect(waited).toBe(true);
    await expect(queued.waitUntilFinished(events, 15_000)).rejects.toThrow();
    const row = await deps.db.signingJob.findUniqueOrThrow({ where: { id: job.id } });
    expect([row.stage, row.errorCode, row.failReason]).toEqual([
      'failed',
      'SIGNING_FAILED',
      'DISK_FULL',
    ]);
    expect(await argsFiles()).toHaveLength(0);
  } finally {
    await worker.close();
    await events.close();
  }
});

it('a late failure never fails a request made after it', async () => {
  await useZsign();
  const seed = await seedSigning(deps.db, deps.s3, keyring());
  const old = await request(seed);
  const cutoff = new Date();
  await new Promise((r) => setTimeout(r, 10));
  const fresh = await request(seed);
  await finishRequests(
    deps.db,
    old.queueJobId,
    { errorCode: 'SIGNING_FAILED' },
    { createdBefore: cutoff },
  );
  const rows = await deps.db.signingJob.findMany({ orderBy: { createdAt: 'asc' } });
  expect(rows.map((r) => [r.id, r.stage])).toEqual([
    [old.id, 'failed'],
    [fresh.id, 'queued'],
  ]);
});
