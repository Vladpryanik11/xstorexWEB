import type { Provider } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';

export const REDIS = Symbol('REDIS');

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
