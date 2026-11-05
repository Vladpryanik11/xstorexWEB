import { Inject, Injectable } from '@nestjs/common';
import { ErrorCode, type FailedJob, QueueName } from '@xstore/shared';
import type { Job } from 'bullmq';
import { AuditService } from '../audit/audit.service.js';
import type { Actor } from '../common/actor.js';
import { DomainError } from '../common/domain-error.js';
import { QUEUES, type Queues } from '../infra/queues.provider.js';

/** Longest `failedReason` shown in the admin. */
export const MAX_REASON = 500;
/** Most failed jobs listed per queue. */
export const FAILED_LIMIT = 200;

/** A failed job without its data: payloads may name users, devices or files. */
export function toFailedJob(queue: string, job: Job): FailedJob {
  return {
    id: String(job.id),
    queue,
    name: job.name,
    failedReason: (job.failedReason ?? '').slice(0, MAX_REASON),
    attemptsMade: job.attemptsMade,
    finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
  };
}

/** BullMQ's own failed sets: list them and send a job back to the queue. */
@Injectable()
export class JobsService {
  constructor(
    @Inject(QUEUES) private readonly queues: Queues,
    private readonly audit: AuditService,
  ) {}

  async failed(queue?: QueueName): Promise<FailedJob[]> {
    const names = queue ? [queue] : Object.values(QueueName);
    const lists = await Promise.all(
      names.map(async (name) => {
        const jobs = await this.queues[name].getFailed(0, FAILED_LIMIT - 1);
        return jobs.filter((j): j is Job => Boolean(j)).map((j) => toFailedJob(name, j));
      }),
    );
    return lists.flat().sort((a, b) => (b.finishedOn ?? '').localeCompare(a.finishedOn ?? ''));
  }

  async retry(queue: QueueName, id: string, actor: Actor): Promise<void> {
    const job = await this.queues[queue].getJob(id);
    if (!job) throw new DomainError(ErrorCode.NOT_FOUND, 404);
    if ((await job.getState()) !== 'failed') throw new DomainError(ErrorCode.CONFLICT, 409);
    await job.retry('failed');
    await this.audit.record({
      actorId: actor.userId,
      action: 'job.retry',
      entity: 'Job',
      entityId: `${queue}:${id}`,
      diff: { name: job.name, attemptsMade: job.attemptsMade },
      ip: actor.ip,
    });
  }
}
