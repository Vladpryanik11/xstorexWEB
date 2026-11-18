import { QueueName } from '@xstore/shared';
import { type Job, type Queue, Worker } from 'bullmq';
import { expireOrders } from '../billing/expire-orders.js';
import { reconcileOrders } from '../billing/reconcile.js';
import type { WorkerDeps } from '../deps.js';
import { UnknownJobError } from './system.js';

export const BillingJob = {
  reconcile: 'billing:reconcile',
  expireOrders: 'billing:expireOrders',
} as const;

const SCHEDULES = [
  { name: BillingJob.reconcile, every: 5 * 60 * 1000 },
  { name: BillingJob.expireOrders, every: 15 * 60 * 1000 },
] as const;

/** Registers the repeating jobs; safe to call on every start (a scheduler is keyed by its id). */
export async function scheduleBillingJobs(queue: Queue): Promise<void> {
  for (const { name, every } of SCHEDULES) {
    // Payloads carry nothing: the jobs read orders from the database.
    await queue.upsertJobScheduler(name, { every }, { name, data: {} });
  }
}

export function createBillingWorker(deps: WorkerDeps): Worker {
  return new Worker(
    QueueName.billing,
    async (job: Job) => {
      switch (job.name) {
        case BillingJob.reconcile:
          return reconcileOrders(deps);
        case BillingJob.expireOrders:
          return expireOrders(deps);
        default:
          throw new UnknownJobError(job.name);
      }
    },
    { connection: deps.connection, concurrency: 1 },
  );
}
