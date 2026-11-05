import type { Provider } from '@nestjs/common';
import { QueueName } from '@xstore/shared';
import { type JobsOptions, Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';

export const QUEUES = Symbol('QUEUES');

/** One BullMQ producer per queue name. */
export type Queues = Record<QueueName, Queue>;

/** Defaults for every job the API enqueues (M1 plan, Global Constraints). */
export const JOB_DEFAULTS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: 1000,
  removeOnFail: false,
};

export const queuesProvider: Provider = {
  provide: QUEUES,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): Queues => {
    // Producers share one connection; BullMQ needs no request retry limit on it.
    const connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    connection.on('error', () => {});
    const entries = Object.values(QueueName).map((name) => {
      const queue = new Queue(name, { connection, defaultJobOptions: JOB_DEFAULTS });
      // Redis errors surface through the health check and the failing request.
      queue.on('error', () => {});
      return [name, queue] as const;
    });
    const queues = Object.fromEntries(entries) as Queues;
    connections.set(queues, connection);
    return queues;
  },
};

/** BullMQ leaves a connection it was given open, so it is closed here after the queues. */
const connections = new WeakMap<Queues, Redis>();

export async function closeQueues(queues: Queues): Promise<void> {
  await Promise.all(Object.values(queues).map((queue) => queue.close()));
  connections.get(queues)?.disconnect();
}
