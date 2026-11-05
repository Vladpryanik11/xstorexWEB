import { notificationJob, QueueName } from '@xstore/shared';
import { UnrecoverableError, Worker } from 'bullmq';
import type { WorkerDeps } from '../deps.js';
import { createMailer } from '../notifications/mailer.js';
import { renderEmail } from '../notifications/templates.js';

export function createNotificationsWorker(deps: Pick<WorkerDeps, 'connection' | 'config'>): Worker {
  const mailer = createMailer(deps.config);
  const worker = new Worker(
    QueueName.notifications,
    async (job) => {
      const parsed = notificationJob.safeParse(job.data);
      if (job.name !== 'send' || !parsed.success)
        throw new UnrecoverableError('Invalid notification job');
      const message = renderEmail(parsed.data);
      await mailer.sendMail({ from: deps.config.mailFrom, to: parsed.data.to, ...message });
    },
    { connection: deps.connection, concurrency: deps.config.concurrency },
  );
  worker.on('closed', () => mailer.close());
  return worker;
}
