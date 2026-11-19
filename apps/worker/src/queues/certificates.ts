import { QueueName } from '@xstore/shared';
import { type Job, type Queue, Worker } from 'bullmq';
import { runCertificateCheck } from '../certificates/check.js';
import type { WorkerDeps } from '../deps.js';
import { UnknownJobError } from './system.js';

export const CertificatesJob = { check: 'certificates:check' } as const;
export const CERTIFICATE_CHECK_EVERY_MS = 10 * 60 * 1000;

/** Registers the repeating check; safe on every start (the scheduler is keyed by its id). */
export async function scheduleCertificateJobs(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    CertificatesJob.check,
    { every: CERTIFICATE_CHECK_EVERY_MS },
    { name: CertificatesJob.check, data: {} },
  );
}

export function createCertificatesWorker(deps: WorkerDeps): Worker {
  return new Worker(
    QueueName.certificates,
    async (job: Job) => {
      if (job.name !== CertificatesJob.check) throw new UnknownJobError(job.name);
      return runCertificateCheck({
        db: deps.db,
        keyring: deps.config.keyring,
        now: new Date(),
        logger: deps.logger,
      });
    },
    { connection: deps.connection, concurrency: 1 },
  );
}
