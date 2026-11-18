import type { Provider } from '@nestjs/common';
import { createFakeProvider, type FakeProvider, type PaymentProvider } from '@xstore/billing';
import type { Redis } from 'ioredis';
import type { AppConfig } from '../config/config.js';
import { APP_CONFIG } from '../config/tokens.js';
import { REDIS, redisReady } from '../infra/redis.provider.js';

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Until the Platega adapter lands (task 12) every call fails, so checkout answers 503. */
function plategaNotConfigured(): PaymentProvider {
  const fail = (): never => {
    throw new Error('Platega adapter is not configured');
  };
  return { name: 'platega', createPayment: fail, authenticateWebhook: fail, getPayment: fail };
}

export function isFakeProvider(p: PaymentProvider): p is FakeProvider {
  return p.name === 'fake' && 'setStatus' in p;
}

export const paymentProvider: Provider = {
  provide: PAYMENT_PROVIDER,
  inject: [APP_CONFIG, REDIS],
  useFactory: (config: AppConfig, redis: Redis): PaymentProvider => {
    const { provider, fakeWebhookSecret } = config.payment;
    if (provider === 'platega') return plategaNotConfigured();
    if (!fakeWebhookSecret) throw new Error('FAKE_PAYMENT_WEBHOOK_SECRET is not set');
    // The shared client has no offline queue: connect on first use.
    const lazy = {
      get: async (key: string) => (await redisReady(redis)).get(key),
      set: async (...args: unknown[]) => {
        const ready = await redisReady(redis);
        return (ready.set as (...a: unknown[]) => Promise<unknown>).apply(ready, args);
      },
    } as unknown as Pick<Redis, 'get' | 'set'>;
    return createFakeProvider(lazy, {
      siteUrl: new URL(config.siteUrl).origin,
      webhookSecret: fakeWebhookSecret,
    });
  },
};
