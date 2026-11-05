import { Inject, Injectable } from '@nestjs/common';
import { type NotificationJob, notificationJob, QueueName } from '@xstore/shared';
import { QUEUES, type Queues } from '../infra/queues.provider.js';

@Injectable()
export class NotifyService {
  constructor(@Inject(QUEUES) private readonly queues: Queues) {}

  async send(job: NotificationJob): Promise<void> {
    await this.queues[QueueName.notifications].add('send', notificationJob.parse(job), {
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
