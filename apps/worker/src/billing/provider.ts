import { createFakeProvider, type PaymentProvider } from '@xstore/billing';
import type { Redis } from 'ioredis';
import type { WorkerPaymentConfig } from '../config.js';

/**
 * Same choice as the API (`PAYMENT_PROVIDER`). Platega is not wired in yet, so with it there is no
 * provider and the billing jobs skip their work.
 */
export function createWorkerPaymentProvider(
  config: WorkerPaymentConfig,
  redis: Redis,
): PaymentProvider | null {
  if (config.provider === 'platega') return null;
  if (!config.fakeWebhookSecret) throw new Error('FAKE_PAYMENT_WEBHOOK_SECRET is not set');
  return createFakeProvider(redis, {
    siteUrl: config.siteUrl,
    webhookSecret: config.fakeWebhookSecret,
  });
}
