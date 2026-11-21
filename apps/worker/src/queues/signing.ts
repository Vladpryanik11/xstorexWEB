import { QueueName, signingJob } from '@xstore/shared';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import type { WorkerDeps } from '../deps.js';
import { DiskFullError } from '../signing/disk.js';
import { finishRequests, signAppVersion } from '../signing/sign.js';
import { ZsignError } from '../signing/zsign.js';
import { UnknownJobError } from './system.js';

export const SigningJobName = { sign: 'signing:sign' } as const;

/** Whether this failure was the job's last attempt (or cannot be retried at all). */
const isFinal = (job: Job, err: Error): boolean =>
  err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);

export function createSigningWorker(deps: WorkerDeps): Worker {
  const worker = new Worker(
    QueueName.signing,
    async (job: Job) => {
      if (job.name !== SigningJobName.sign) throw new UnknownJobError(job.name);
      const parsed = signingJob.safeParse(job.data);
      if (!parsed.success) throw new UnrecoverableError('invalid signing payload');
      try {
        return await signAppVersion(deps, parsed.data.signingJobId);
      } catch (err) {
        if (err instanceof DiskFullError) {
          deps.logger.error(
            { needed: err.needed, free: err.free, jobId: job.id },
            'not enough disk space for signing',
          );
        } else if (err instanceof ZsignError) {
          deps.logger.warn(
            { jobId: job.id, reason: err.reason, exitCode: err.exitCode, stderr: err.stderrTail },
            'zsign failed',
          );
        }
        throw err;
      }
    },
    { connection: deps.connection, concurrency: deps.config.signing.concurrency },
  );
  // After the last attempt every waiting request learns about the failure.
  worker.on('failed', (job, err) => {
    if (!job?.id || !isFinal(job, err)) return;
    void finishRequests(deps.db, job.id, { errorCode: 'SIGNING_FAILED' }).catch((e: unknown) =>
      deps.logger.error({ err: (e as Error).message, jobId: job.id }, 'cannot mark signing failed'),
    );
  });
  return worker;
}
