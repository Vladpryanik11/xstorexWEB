import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient, SigningStage } from '@xstore/db';
import { decryptSecret } from '@xstore/secrets/decrypt';
import { signingBundleId } from '@xstore/shared';
import { parseP12 } from '@xstore/signing';
import type { WorkerDeps } from '../deps.js';
import { ensureFreeSpace } from './disk.js';
import { writeIdentityFiles } from './identity-files.js';
import { withTempDir } from './temp.js';
import { runZsign } from './zsign.js';

export type SignOutcome =
  | { status: 'ready'; signedBuildId: string; reused: boolean }
  | { status: 'refused'; code: 'DEVICE_NOT_READY' | 'NOT_FOUND' };

const OPEN_STAGES: SigningStage[] = ['queued', 'downloading', 'signing', 'uploading'];
const IPA = 'application/octet-stream';

/** Storage key of a signed build: one folder per set of device files, so they go together. */
export const signedBuildKey = (deviceCertificateId: string, appVersionId: string): string =>
  `${deviceCertificateId}/${appVersionId}.ipa`;

/** Moves every open request of this queue job to `stage`. */
async function setStage(db: PrismaClient, queueJobId: string, stage: SigningStage): Promise<void> {
  await db.signingJob.updateMany({
    where: { queueJobId, stage: { in: OPEN_STAGES } },
    data: { stage },
  });
}

/** Notes on every open request why the job waits (the admin sees it; the buyer does not). */
export async function noteWaiting(
  db: PrismaClient,
  queueJobId: string,
  failReason: string,
): Promise<void> {
  await db.signingJob.updateMany({
    where: { queueJobId, stage: { in: OPEN_STAGES } },
    data: { failReason },
  });
}

/** Finishes every open request of this queue job (`createdBefore`: only requests made by then). */
export async function finishRequests(
  db: PrismaClient,
  queueJobId: string,
  result: { signedBuildId: string } | { errorCode: string; failReason?: string },
  opts: { createdBefore?: Date } = {},
): Promise<void> {
  await db.signingJob.updateMany({
    where: {
      queueJobId,
      stage: { in: OPEN_STAGES },
      ...(opts.createdBefore ? { createdAt: { lte: opts.createdBefore } } : {}),
    },
    data:
      'signedBuildId' in result
        ? {
            stage: 'ready',
            signedBuildId: result.signedBuildId,
            failReason: null,
            finishedAt: new Date(),
          }
        : {
            stage: 'failed',
            errorCode: result.errorCode,
            failReason: result.failReason ?? null,
            finishedAt: new Date(),
          },
  });
}

/**
 * `signing:sign`: signs one app version with one device's supplier files (spec Н4 §5). A build
 * that already exists is reused. The original is downloaded to a private temp dir, the `.p12`
 * is packed again there under a one-time password, zsign signs under limits, and the result streams up to `signed` in
 * parts. Every request sharing the queue job finishes with the build. Infrastructure errors
 * throw, so BullMQ retries; the caller marks the requests failed after the last attempt.
 */
export async function signAppVersion(deps: WorkerDeps, signingJobId: string): Promise<SignOutcome> {
  const { db, s3, config, logger } = deps;
  const request = await db.signingJob.findUnique({
    where: { id: signingJobId },
    select: {
      queueJobId: true,
      appVersion: { select: { id: true, ipaKey: true, sizeBytes: true, bundleId: true } },
      deviceCertificate: {
        select: {
          id: true,
          status: true,
          appIdPattern: true,
          p12Enc: true,
          p12PasswordEnc: true,
          profile: true,
        },
      },
    },
  });
  if (!request) return { status: 'refused', code: 'NOT_FOUND' };
  const { queueJobId, appVersion: version, deviceCertificate: cert } = request;

  const existing = await db.signedBuild.findUnique({
    where: {
      appVersionId_deviceCertificateId: { appVersionId: version.id, deviceCertificateId: cert.id },
    },
    select: { id: true },
  });
  if (existing) {
    await finishRequests(db, queueJobId, { signedBuildId: existing.id });
    return { status: 'ready', signedBuildId: existing.id, reused: true };
  }
  // Files replaced, revoked or deleted after the tap: the site shows the device status instead.
  if (cert.status !== 'active') {
    await finishRequests(db, queueJobId, { errorCode: 'DEVICE_NOT_READY' });
    return { status: 'refused', code: 'DEVICE_NOT_READY' };
  }
  const keyring = config.keyring;
  if (!keyring) throw new Error('MASTER_KEY_CURRENT is not set: cannot decrypt device files');

  const bundleId = signingBundleId(cert.appIdPattern, version.bundleId);
  const key = signedBuildKey(cert.id, version.id);
  const started = Date.now();
  const sizeBytes = await withTempDir(config.tmpDir, async (dir) => {
    // Original + signed copy + zsign's unpacked tree; while space is short the request stays queued.
    await ensureFreeSpace(dir, Math.ceil(Number(version.sizeBytes) * 2.5));
    await setStage(db, queueJobId, 'downloading');
    const input = join(dir, 'original.ipa');
    await s3.download(s3.bucket('originals'), version.ipaKey, input);

    await setStage(db, queueJobId, 'signing');
    const p12 = decryptSecret(cert.p12Enc, keyring);
    const password = decryptSecret(cert.p12PasswordEnc, keyring);
    let files: Awaited<ReturnType<typeof writeIdentityFiles>>;
    try {
      const parsed = await parseP12(p12, password.toString('utf8'));
      files = await writeIdentityFiles(dir, { parsed, profile: Buffer.from(cert.profile) });
    } finally {
      p12.fill(0);
      password.fill(0);
    }
    const output = join(dir, 'signed.ipa');
    const workDir = join(dir, 'work');
    await mkdir(workDir);
    await runZsign({
      zsignBin: config.signing.zsignBin,
      input,
      output,
      ...files,
      workDir,
      ...(bundleId !== version.bundleId ? { bundleId } : {}),
      timeoutMs: config.signing.timeoutMs,
      memoryMb: config.signing.memoryMb,
      cpuSec: config.signing.cpuSec,
    });

    await setStage(db, queueJobId, 'uploading');
    await s3.uploadFile(s3.bucket('signed'), key, output, IPA);
    return (await stat(output)).size;
  });

  const build = await db.signedBuild.upsert({
    where: {
      appVersionId_deviceCertificateId: { appVersionId: version.id, deviceCertificateId: cert.id },
    },
    create: {
      appVersionId: version.id,
      deviceCertificateId: cert.id,
      key,
      sizeBytes: BigInt(sizeBytes),
      bundleId,
    },
    update: { key, sizeBytes: BigInt(sizeBytes), bundleId, lastUsedAt: new Date() },
    select: { id: true },
  });
  await finishRequests(db, queueJobId, { signedBuildId: build.id });
  logger.info(
    { appVersionId: version.id, deviceCertificateId: cert.id, ms: Date.now() - started, sizeBytes },
    'app signed',
  );
  return { status: 'ready', signedBuildId: build.id, reused: false };
}
