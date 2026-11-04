import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadWorkerConfig } from './config.js';
import { createSystemWorker } from './queues/system.js';

const config = loadWorkerConfig(process.env);
const logger = pino({ level: config.logLevel });

// BullMQ workers require unlimited retries per request on their blocking connection.
const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
connection.on('error', (err) => logger.error({ err: err.message }, 'redis connection error'));

const worker = createSystemWorker(connection, { concurrency: config.concurrency });
worker.on('failed', (job, err) => logger.warn({ job: job?.name, err: err.message }, 'job failed'));
worker.on('error', (err) => logger.error({ err: err.message }, 'worker error'));

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  try {
    await worker.close();
    await connection.quit();
    process.exit(0);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'shutdown failed');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await worker.waitUntilReady();
logger.info({ queue: worker.name, concurrency: config.concurrency }, 'worker started');
