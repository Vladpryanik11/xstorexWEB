import { expect, it } from 'vitest';
import { loadConfig } from './config.js';

const valid = {
  DATABASE_URL: 'postgresql://a',
  REDIS_URL: 'redis://b',
  SITE_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_URL: 'https://dl.xstorex.ru/',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  PAYMENT_PROVIDER: 'fake',
  FAKE_PAYMENT_WEBHOOK_SECRET: 'fake-webhook-secret-0123',
};

it('parses a valid env', () => {
  expect(loadConfig(valid)).toMatchObject({
    port: 3001,
    logLevel: 'info',
    s3: {
      endpoint: 'http://minio:9000',
      publicUrl: 'https://dl.xstorex.ru',
      region: 'us-east-1',
      bucketPrefix: 'xstore-',
    },
    payment: { provider: 'fake', fakeWebhookSecret: 'fake-webhook-secret-0123' },
    devPages: false,
  });
});

it('names every missing variable', () => {
  expect(() => loadConfig({})).toThrow(/DATABASE_URL.*REDIS_URL|REDIS_URL.*DATABASE_URL/s);
  expect(() => loadConfig({})).toThrow(/S3_ACCESS_KEY.*S3_SECRET_KEY/s);
});

it('refuses an S3 URL with a path', () => {
  expect(() => loadConfig({ ...valid, S3_PUBLIC_URL: 'https://dl.xstorex.ru/bucket' })).toThrow(
    /S3_PUBLIC_URL/,
  );
});

it('names a bad variable without echoing its value', () => {
  expect(() => loadConfig({ ...valid, S3_ENDPOINT: 'ftp://hunter2' })).toThrow(
    /^Invalid environment variables: S3_ENDPOINT$/,
  );
});

it('fake provider refused in production', () => {
  expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(
    /^Invalid environment variables: PAYMENT_PROVIDER$/,
  );
  expect(
    loadConfig({ ...valid, NODE_ENV: 'production', PAYMENT_PROVIDER: 'platega' }).payment,
  ).toEqual({ provider: 'platega', fakeWebhookSecret: null });
});

it('requires a payment provider and the fake webhook secret', () => {
  expect(() => loadConfig({ ...valid, PAYMENT_PROVIDER: undefined })).toThrow(/PAYMENT_PROVIDER/);
  expect(() => loadConfig({ ...valid, FAKE_PAYMENT_WEBHOOK_SECRET: undefined })).toThrow(
    /^Invalid environment variables: FAKE_PAYMENT_WEBHOOK_SECRET$/,
  );
});

it('dev pages only with XSTORE_DEV_PAGES=1', () => {
  expect(loadConfig({ ...valid, XSTORE_DEV_PAGES: '1' }).devPages).toBe(true);
  expect(loadConfig({ ...valid, XSTORE_DEV_PAGES: '0' }).devPages).toBe(false);
});
