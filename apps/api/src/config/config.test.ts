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

const prodMail = {
  SMTP_URL: 'smtps://user:pw@smtp.example.ru:465',
  MAIL_FROM: 'Xstore <noreply@xstorex.ru>',
  MASTER_KEY_CURRENT: '1',
  MASTER_KEY_V1: Buffer.alloc(32, 1).toString('base64'),
};

it('fake provider refused in production', () => {
  expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(
    /^Invalid environment variables: PAYMENT_PROVIDER$/,
  );
  expect(
    loadConfig({ ...valid, ...prodMail, NODE_ENV: 'production', PAYMENT_PROVIDER: 'platega' })
      .payment,
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

it('mail defaults to the local Mailpit outside production', () => {
  expect(loadConfig(valid).mail).toEqual({
    smtpUrl: 'smtp://127.0.0.1:1025',
    from: 'Xstore <noreply@xstorex.ru>',
  });
  expect(loadConfig({ ...valid, ...prodMail }).mail).toEqual({
    smtpUrl: prodMail.SMTP_URL,
    from: prodMail.MAIL_FROM,
  });
});

it('production requires SMTP_URL and MAIL_FROM', () => {
  const prod = { ...valid, NODE_ENV: 'production', PAYMENT_PROVIDER: 'platega' };
  expect(() => loadConfig(prod)).toThrow(/^Invalid environment variables: SMTP_URL, MAIL_FROM$/);
  expect(() => loadConfig({ ...prod, SMTP_URL: prodMail.SMTP_URL })).toThrow(
    /^Invalid environment variables: MAIL_FROM$/,
  );
});

it('refuses a non-SMTP mail URL without echoing it', () => {
  expect(() => loadConfig({ ...valid, SMTP_URL: 'http://user:hunter2@x' })).toThrow(
    /^Invalid environment variables: SMTP_URL$/,
  );
});

it('enrollment signer and test anchor are optional paths', () => {
  expect(loadConfig(valid).enrollment).toEqual({ signer: null, testAnchorPath: null });
  expect(
    loadConfig({
      ...valid,
      ENROLL_CERT_PATH: '/run/enroll/cert.pem',
      ENROLL_KEY_PATH: '/run/enroll/key.pem',
      ENROLL_TEST_ANCHOR_PATH: '/run/enroll/test-root.pem',
    }).enrollment,
  ).toEqual({
    signer: { certPath: '/run/enroll/cert.pem', keyPath: '/run/enroll/key.pem' },
    testAnchorPath: '/run/enroll/test-root.pem',
  });
});

it('enrollment certificate and key come together', () => {
  expect(() => loadConfig({ ...valid, ENROLL_CERT_PATH: '/c.pem' })).toThrow(
    /^Invalid environment variables: ENROLL_KEY_PATH$/,
  );
  expect(() => loadConfig({ ...valid, ENROLL_KEY_PATH: '/k.pem' })).toThrow(
    /^Invalid environment variables: ENROLL_CERT_PATH$/,
  );
});

it('test enrollment anchor refused in production', () => {
  const prod = { ...valid, ...prodMail, NODE_ENV: 'production', PAYMENT_PROVIDER: 'platega' };
  expect(() => loadConfig({ ...prod, ENROLL_TEST_ANCHOR_PATH: '/t.pem' })).toThrow(
    /^Invalid environment variables: ENROLL_TEST_ANCHOR_PATH$/,
  );
});

const KEY = Buffer.alloc(32, 7).toString('base64');

it('loads the master keyring when MASTER_KEY_CURRENT is set', () => {
  const config = loadConfig({ ...valid, MASTER_KEY_CURRENT: '1', MASTER_KEY_V1: KEY });
  expect(config.keyring?.current).toBe(1);
  expect(config.keyring?.keys.get(1)?.length).toBe(32);
});

it('runs without a keyring outside production', () => {
  expect(loadConfig(valid).keyring).toBeNull();
});

it('requires the master key in production without echoing it', () => {
  const prod = {
    ...valid,
    ...prodMail,
    NODE_ENV: 'production',
    PAYMENT_PROVIDER: 'platega',
    MASTER_KEY_CURRENT: undefined,
    MASTER_KEY_V1: undefined,
  };
  expect(() => loadConfig(prod)).toThrow(/MASTER_KEY_CURRENT/);
  expect(() => loadConfig({ ...prod, MASTER_KEY_CURRENT: '1', MASTER_KEY_V1: 'short' })).toThrow(
    /MASTER_KEY_V1/,
  );
  try {
    loadConfig({ ...prod, MASTER_KEY_CURRENT: '1', MASTER_KEY_V1: 'short' });
  } catch (err) {
    expect(String(err)).not.toContain('short');
  }
});
