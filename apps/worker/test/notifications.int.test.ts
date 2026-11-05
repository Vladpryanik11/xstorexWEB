import { notificationJob, QueueName } from '@xstore/shared';
import { Queue, QueueEvents, type Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { loadWorkerConfig } from '../src/config.js';
import { createNotificationsWorker } from '../src/queues/notifications.js';

const mailpit = process.env.MAILPIT_API ?? 'http://127.0.0.1:8025';
let connection: Redis;
let eventsConnection: Redis;
let queue: Queue;
let events: QueueEvents;
let worker: Worker;

beforeAll(async () => {
  connection = new Redis(process.env.REDIS_URL_TEST ?? '', { maxRetriesPerRequest: null });
  eventsConnection = connection.duplicate();
  queue = new Queue(QueueName.notifications, { connection });
  await queue.obliterate({ force: true });
  events = new QueueEvents(QueueName.notifications, { connection: eventsConnection });
  await events.waitUntilReady();
  worker = createNotificationsWorker({
    connection,
    config: loadWorkerConfig({
      DATABASE_URL: process.env.DATABASE_URL_TEST,
      REDIS_URL: process.env.REDIS_URL_TEST,
      S3_ENDPOINT: process.env.S3_ENDPOINT,
      S3_ACCESS_KEY: process.env.S3_ACCESS_KEY,
      S3_SECRET_KEY: process.env.S3_SECRET_KEY,
      SMTP_URL: process.env.SMTP_URL,
      MAIL_FROM: 'Xstore <noreply@xstorex.ru>',
    }),
  });
  await worker.waitUntilReady();
});

beforeEach(async () => {
  await fetch(`${mailpit}/api/v1/messages`, { method: 'DELETE' });
});

afterAll(async () => {
  await worker?.close();
  await events?.close();
  await queue?.close();
  eventsConnection?.disconnect();
  connection?.disconnect();
});

it('delivers an email through the real queue and SMTP server', async () => {
  const job = await queue.add('send', {
    template: 'email-code',
    to: 'test@xstorex.ru',
    vars: { code: '654321' },
  });
  await job.waitUntilFinished(events, 10_000);
  await expect
    .poll(
      async () => {
        const list = await (await fetch(`${mailpit}/api/v1/messages`)).json();
        const first = list.messages[0];
        if (!first) return '';
        const mail = await (await fetch(`${mailpit}/api/v1/message/${first.ID}`)).json();
        expect(mail.From.Address).toBe('noreply@xstorex.ru');
        expect(mail.To[0].Address).toBe('test@xstorex.ru');
        return mail.Text;
      },
      { timeout: 10_000 },
    )
    .toContain('654321');
});

it('validates notification payloads and normalizes the recipient', () => {
  expect(
    notificationJob.parse({
      template: 'email-code',
      to: ' U@XSTOREX.RU ',
      vars: { code: '123456' },
    }).to,
  ).toBe('u@xstorex.ru');
  expect(
    notificationJob.safeParse({
      template: 'email-code',
      to: 'u@xstorex.ru',
      vars: { code: '12345' },
    }).success,
  ).toBe(false);
});

it('rejects malformed queued messages without sending mail', async () => {
  const job = await queue.add('send', {
    template: 'email-code',
    to: 'u@xstorex.ru',
    vars: { code: '<script>' },
  });
  await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow();
  const list = await (await fetch(`${mailpit}/api/v1/messages`)).json();
  expect(list.total).toBe(0);
});
