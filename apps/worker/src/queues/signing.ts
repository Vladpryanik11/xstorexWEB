import { QueueName, signingJob } from '@xstore/shared';
import { DelayedError, type Job, UnrecoverableError, Worker } from 'bullmq';
import type { WorkerDeps } from '../deps.js';
import { DiskFullError } from '../signing/disk.js';
import { finishRequests, noteWaiting, signAppVersion } from '../signing/sign.js';
import { ZsignError } from '../signing/zsign.js';
import { UnknownJobError } from './system.js';

export const SigningJobName = { sign: 'signing:sign' } as const;

/** The admin-only reason of a failure (spec Н4 §5, §7); the buyer always sees SIGNING_FAILED. */
export function failReasonOf(err: unknown): string {
  if (err instanceof DiskFullError) return 'DISK_FULL';
  if (err instanceof ZsignError) return err.reason === 'timeout' ? 'ZSIGN_TIMEOUT' : 'ZSIGN_EXIT';
  return 'ERROR';
}

/** Whether a failure of the attempt now running is the job's last one. */
const lastAttempt = (job: Job, err: unknown): boolean =>
  err instanceof UnrecoverableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

type SigningData = { signingJobId: string; diskWaits?: number };

export function createSigningWorker(deps: WorkerDeps): Worker {
  const { signing } = deps.config;
  const worker = new Worker(
    QueueName.signing,
    async (job: Job, token?: string) => {
      if (job.name !== SigningJobName.sign) throw new UnknownJobError(job.name);
      const parsed = signingJob.safeParse(job.data);
      if (!parsed.success) throw new UnrecoverableError('invalid signing payload');
      const queueJobId = job.id ?? '';
      try {
        return await signAppVersion(deps, parsed.data.signingJobId);
      } catch (err) {
        if (err instanceof DiskFullError) {
          deps.logger.error(
            { needed: err.needed, free: err.free, jobId: job.id },
            'not enough disk space for signing',
          );
          // Space usually comes back (the cleanup runs hourly): wait instead of failing at once.
          const waits = (job.data as SigningData).diskWaits ?? 0;
          if (waits < signing.diskWaits && token) {
            await noteWaiting(deps.db, queueJobId, 'DISK_FULL');
            await job.updateData({ ...(job.data as SigningData), diskWaits: waits + 1 });
            await job.moveToDelayed(Date.now() + signing.diskWaitMs, token);
            throw new DelayedError();
          }
        } else if (err instanceof ZsignError) {
          deps.logger.warn(
            { jobId: job.id, reason: err.reason, exitCode: err.exitCode, stderr: err.stderrTail },
            'zsign failed',
          );
        }
        // The last attempt marks every waiting request itself, while the job still holds its id:
        // a tap after BullMQ drops the job starts a new one and is not caught by this failure.
        if (err instanceof DiskFullError || lastAttempt(job, err)) {
          await finishRequests(deps.db, queueJobId, {
            errorCode: 'SIGNING_FAILED',
            failReason: failReasonOf(err),
          });
          if (err instanceof DiskFullError) throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    { connection: deps.connection, concurrency: signing.concurrency },
  );
  // A job that failed outside the processor (stalled): only requests made before it ended.
  worker.on('failed', (job, err) => {
    if (
      !job?.id ||
      !(err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1))
    )
      return;
    const createdBefore = new Date(job.finishedOn ?? Date.now());
    void finishRequests(
      deps.db,
      job.id,
      { errorCode: 'SIGNING_FAILED', failReason: failReasonOf(err) },
      { createdBefore },
    ).catch((e: unknown) =>
      deps.logger.error({ err: (e as Error).message, jobId: job.id }, 'cannot mark signing failed'),
    );
  });
  return worker;
}
