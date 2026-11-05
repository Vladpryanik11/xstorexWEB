import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Prisma } from '@xstore/db';
import { inspectIpa } from '@xstore/ios';
import { type IpaInspect, ipaInspectJob, QueueName } from '@xstore/shared';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import sharp from 'sharp';
import type { WorkerDeps } from '../deps.js';
import { UnknownJobError } from './system.js';

export type InspectOutcome = { status: 'ready' | 'rejected' | 'skipped' };

const PNG = 'image/png';

async function storeIcons(
  deps: WorkerDeps,
  uploadId: string,
  icon: Buffer,
): Promise<{ icon512Key: string; icon57Key: string } | null> {
  const prefix = `uploads/${uploadId}`;
  let icon512: Buffer;
  let icon57: Buffer;
  try {
    icon512 = await sharp(icon).resize(512, 512, { fit: 'cover' }).png().toBuffer();
    icon57 = await sharp(icon).resize(57, 57, { fit: 'cover' }).png().toBuffer();
  } catch (err) {
    // The IPA stays usable without an icon; the admin can upload one.
    deps.logger.warn({ uploadId, err: (err as Error).message }, 'icon resize failed');
    return null;
  }
  const media = deps.s3.bucket('media');
  const icon512Key = `${prefix}/icon-512.png`;
  const icon57Key = `${prefix}/icon-57.png`;
  await deps.s3.put(media, icon512Key, icon512, PNG);
  await deps.s3.put(media, icon57Key, icon57, PNG);
  return { icon512Key, icon57Key };
}

/**
 * `ipa:inspect`: downloads the original to a private temp dir, inspects it and records the
 * result on the `IpaUpload`. Repeated runs for an upload that is already `ready` or `rejected`
 * change nothing. Infrastructure failures throw so BullMQ retries; the temp dir is always removed.
 */
export async function inspectUpload(deps: WorkerDeps, uploadId: string): Promise<InspectOutcome> {
  const { db, logger } = deps;
  const claimed = await db.ipaUpload.updateMany({
    where: { id: uploadId, status: { in: ['uploaded', 'inspecting'] } },
    data: { status: 'inspecting' },
  });
  if (claimed.count === 0) {
    logger.info({ uploadId }, 'upload is missing or not awaiting inspection');
    return { status: 'skipped' };
  }
  const upload = await db.ipaUpload.findUniqueOrThrow({ where: { id: uploadId } });

  const dir = await mkdtemp(join(deps.config.tmpDir, 'xstore-ipa-'));
  try {
    const file = join(dir, 'original.ipa');
    await deps.s3.download(upload.bucket, upload.key, file);
    const result = await inspectIpa(file, dir);
    if (!result.ok) {
      await db.ipaUpload.update({
        where: { id: uploadId },
        data: { status: 'rejected', rejectCode: result.reason, inspect: Prisma.DbNull },
      });
      logger.info({ uploadId, reason: result.reason }, 'ipa rejected');
      return { status: 'rejected' };
    }
    const icons = result.iconPng ? await storeIcons(deps, uploadId, result.iconPng) : null;
    const { iconNames: _iconNames, ...info } = result.info;
    const inspect: IpaInspect = {
      ...info,
      encrypted: result.encrypted,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
      icon512Key: icons?.icon512Key ?? null,
      icon57Key: icons?.icon57Key ?? null,
    };
    await db.ipaUpload.update({
      where: { id: uploadId },
      data: { status: 'ready', rejectCode: null, inspect },
    });
    logger.info(
      { uploadId, bundleId: inspect.bundleId, encrypted: inspect.encrypted },
      'ipa inspected',
    );
    return { status: 'ready' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function processIpaJob(deps: WorkerDeps, job: Job): Promise<InspectOutcome> {
  switch (job.name) {
    case 'inspect': {
      const data = ipaInspectJob.safeParse(job.data);
      if (!data.success) throw new UnrecoverableError('invalid ipa:inspect payload');
      return inspectUpload(deps, data.data.uploadId);
    }
    default:
      throw new UnknownJobError(job.name);
  }
}

export function createIpaWorker(deps: WorkerDeps): Worker<unknown, InspectOutcome> {
  return new Worker<unknown, InspectOutcome>(QueueName.ipa, (job) => processIpaJob(deps, job), {
    connection: deps.connection,
    concurrency: deps.config.concurrency,
  });
}
