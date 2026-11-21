import { EVICT_SIGNED_JOB, QueueName } from '@xstore/shared';
import { type Job, type Queue, Worker } from 'bullmq';
import type { WorkerDeps } from '../deps.js';
import { evictSignedBuilds } from '../signing/evict.js';
import { UnknownJobError } from './system.js';

/** Hourly, and right after device files end (the API and the certificate check enqueue it). */
export const MaintenanceJob = { evictSigned: EVICT_SIGNED_JOB } as const;
export const EVICT_EVERY_MS = 60 * 60 * 1000;

export async function scheduleMaintenanceJobs(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    MaintenanceJob.evictSigned,
    { every: EVICT_EVERY_MS },
    { name: MaintenanceJob.evictSigned, data: {} },
  );
}

export function createMaintenanceWorker(deps: WorkerDeps): Worker {
  return new Worker(
    QueueName.maintenance,
    async (job: Job) => {
      if (job.name !== MaintenanceJob.evictSigned) throw new UnknownJobError(job.name);
      return evictSignedBuilds(deps);
    },
    { connection: deps.connection, concurrency: 1 },
  );
}
