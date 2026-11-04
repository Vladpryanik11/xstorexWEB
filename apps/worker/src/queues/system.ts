import { QueueName, type SystemPingResult } from '@xstore/shared';
import { type ConnectionOptions, type Job, Worker } from 'bullmq';

export class UnknownJobError extends Error {
  constructor(name: string) {
    super(`Unknown job: ${name}`);
    this.name = 'UnknownJobError';
  }
}

async function processSystemJob(job: Job<unknown, SystemPingResult>): Promise<SystemPingResult> {
  switch (job.name) {
    case 'ping':
      return { pong: true, at: new Date().toISOString() };
    default:
      throw new UnknownJobError(job.name);
  }
}

export function createSystemWorker(
  connection: ConnectionOptions,
  options: { concurrency?: number } = {},
): Worker<unknown, SystemPingResult> {
  return new Worker<unknown, SystemPingResult>(QueueName.system, processSystemJob, {
    connection,
    concurrency: options.concurrency ?? 4,
  });
}
