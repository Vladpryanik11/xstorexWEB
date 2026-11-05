import type { Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';

export const REDIS = Symbol('REDIS');

const READY_TIMEOUT_MS = 1000;

export const redisProvider: Provider = {
  provide: REDIS,
  inject: [APP_CONFIG],
  useFactory: (config: AppConfig): Redis => {
    const redis = new Redis(config.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    // Connection errors surface through the health check; avoid unhandled error events.
    redis.on('error', () => {});
    return redis;
  },
};

/**
 * The client has no offline queue, so commands fail until it is connected. Connects on first use
 * and waits briefly for a reconnect in progress; rejects if Redis stays unavailable.
 */
export async function redisReady(redis: Redis): Promise<Redis> {
  if (redis.status === 'ready') return redis;
  if (redis.status === 'wait' || redis.status === 'end') {
    await redis.connect();
    return redis;
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      redis.off('ready', onReady);
      reject(new Error('Redis is not ready'));
    }, READY_TIMEOUT_MS);
    const onReady = (): void => {
      clearTimeout(timer);
      resolve();
    };
    redis.once('ready', onReady);
  });
  return redis;
}
