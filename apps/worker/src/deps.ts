import type { PaymentProvider } from '@xstore/billing';
import { createPrismaClient, type PrismaClient } from '@xstore/db';
import { createSmtpMailer, type MailDeps } from '@xstore/mail';
import { defaultJobOptions, QueueName } from '@xstore/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { createWorkerPaymentProvider } from './billing/provider.js';
import type { WorkerConfig } from './config.js';
import { createWorkerS3, type WorkerS3 } from './s3.js';

export type WorkerDeps = {
  db: PrismaClient;
  s3: WorkerS3;
  /** Null while the Platega adapter is not wired in: billing jobs then do nothing. */
  payments: PaymentProvider | null;
  /** Letters: SMTP mailer, the same database and the site address. */
  mail: MailDeps;
  /** Producers, for jobs that enqueue follow-up jobs. */
  queues: Record<QueueName, Queue>;
  /** Shared by workers and producers; BullMQ needs `maxRetriesPerRequest: null` on it. */
  connection: Redis;
  logger: Logger;
  config: WorkerConfig;
};

export function createWorkerDeps(config: WorkerConfig, logger: Logger): WorkerDeps {
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (err) => logger.error({ err: err.message }, 'redis connection error'));
  const queues = Object.fromEntries(
    Object.values(QueueName).map((name) => {
      const queue = new Queue(name, { connection, defaultJobOptions });
      queue.on('error', (err) => logger.error({ queue: name, err: err.message }, 'queue error'));
      return [name, queue] as const;
    }),
  ) as Record<QueueName, Queue>;
  const db = createPrismaClient(config.databaseUrl);
  return {
    db,
    s3: createWorkerS3(config.s3),
    payments: createWorkerPaymentProvider(config.payment, connection),
    mail: {
      db,
      mailer: createSmtpMailer(config.mail),
      siteUrl: config.payment.siteUrl,
      logger,
    },
    queues,
    connection,
    logger,
    config,
  };
}

/** Closes what `createWorkerDeps` opened; close the workers first. */
export async function closeWorkerDeps(deps: WorkerDeps): Promise<void> {
  await Promise.all(Object.values(deps.queues).map((q) => q.close()));
  deps.mail.mailer.close();
  await deps.db.$disconnect();
  deps.s3.destroy();
  await deps.connection.quit();
}
