import { pino } from 'pino';
import { loadWorkerConfig } from './config.js';
import { closeWorkerDeps, createWorkerDeps } from './deps.js';
import { createIpaWorker } from './queues/ipa.js';
import { createNotificationsWorker } from './queues/notifications.js';
import { createSystemWorker } from './queues/system.js';

const config = loadWorkerConfig(process.env);
const logger = pino({ level: config.logLevel });
const deps = createWorkerDeps(config, logger);

const workers = [
  createSystemWorker(deps.connection, { concurrency: config.concurrency }),
  createIpaWorker(deps),
  createNotificationsWorker(deps),
];
for (const worker of workers) {
  worker.on('failed', (job, err) =>
    logger.warn(
      { queue: worker.name, job: job?.name, jobId: job?.id, err: err.message },
      'job failed',
    ),
  );
  worker.on('error', (err) =>
    logger.error({ queue: worker.name, err: err.message }, 'worker error'),
  );
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  try {
    await Promise.all(workers.map((worker) => worker.close()));
    await closeWorkerDeps(deps);
    process.exit(0);
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, 'shutdown failed');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await Promise.all(workers.map((worker) => worker.waitUntilReady()));
logger.info(
  { queues: workers.map((w) => w.name), concurrency: config.concurrency },
  'worker started',
);
