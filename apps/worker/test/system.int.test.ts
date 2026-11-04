import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { QueueName, type SystemPingResult } from '@xstore/shared';
import { Queue, QueueEvents, type Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createSystemWorker } from '../src/queues/system.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.REDIS_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

let connection: Redis;
let queue: Queue;
let events: QueueEvents;
let worker: Worker<unknown, SystemPingResult>;

beforeAll(async () => {
  const url = process.env.REDIS_URL_TEST;
  if (!url) throw new Error('REDIS_URL_TEST is not set');
  connection = new Redis(url, { maxRetriesPerRequest: null });
  queue = new Queue(QueueName.system, { connection });
  events = new QueueEvents(QueueName.system, { connection: connection.duplicate() });
  await events.waitUntilReady();
  worker = createSystemWorker(connection);
  await worker.waitUntilReady();
});

beforeEach(async () => {
  await queue.obliterate({ force: true });
});

afterAll(async () => {
  await worker.close();
  await events.close();
  await queue.close();
  connection.disconnect();
});

it('answers ping', async () => {
  const job = await queue.add('ping', {});
  const result = await job.waitUntilFinished(events, 5000);
  expect(result.pong).toBe(true);
  expect(new Date(result.at).toString()).not.toBe('Invalid Date');
});

it('fails unknown jobs', async () => {
  const job = await queue.add('nope', {}, { attempts: 1 });
  await expect(job.waitUntilFinished(events, 5000)).rejects.toThrow(/Unknown job: nope/);
});
