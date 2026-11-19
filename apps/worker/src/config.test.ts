import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from './config.js';

const env = {
  REDIS_URL: 'redis://x',
  DATABASE_URL: 'postgresql://u:p@h/db',
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
  PAYMENT_PROVIDER: 'fake',
  FAKE_PAYMENT_WEBHOOK_SECRET: 'test-fake-webhook-secret',
};

const prodMail = {
  SMTP_URL: 'smtps://user:pw@smtp.example.ru:465',
  MAIL_FROM: 'Xstore <noreply@xstorex.ru>',
  MASTER_KEY_CURRENT: '1',
  MASTER_KEY_V1: Buffer.alloc(32, 1).toString('base64'),
};

describe('loadWorkerConfig', () => {
  it('requires REDIS_URL', () => {
    expect(() => loadWorkerConfig({})).toThrow(/REDIS_URL/);
  });

  it('requires the database and S3 settings, naming only the variables', () => {
    const check = () => loadWorkerConfig({ REDIS_URL: 'redis://x', S3_SECRET_KEY: 'hush' });
    expect(check).toThrow(/DATABASE_URL.*S3_ENDPOINT.*S3_ACCESS_KEY/);
    expect(check).not.toThrow(/hush/);
  });

  it('applies defaults', () => {
    expect(loadWorkerConfig(env)).toEqual({
      keyring: null,
      redisUrl: 'redis://x',
      databaseUrl: 'postgresql://u:p@h/db',
      logLevel: 'info',
      concurrency: 4,
      tmpDir: tmpdir(),
      s3: {
        endpoint: 'http://minio:9000',
        region: 'us-east-1',
        accessKey: 'key',
        secretKey: 'secret',
        bucketPrefix: 'xstore-',
      },
      payment: {
        provider: 'fake',
        fakeWebhookSecret: 'test-fake-webhook-secret',
        siteUrl: 'http://localhost:3000',
      },
      mail: { smtpUrl: 'smtp://127.0.0.1:1025', from: 'Xstore <noreply@xstorex.ru>' },
    });
  });

  it('defaults concurrency to 4', () => {
    expect(loadWorkerConfig(env).concurrency).toBe(4);
  });

  it('takes TMP_DIR and the bucket prefix from the environment', () => {
    const c = loadWorkerConfig({ ...env, TMP_DIR: '/data/tmp', S3_BUCKET_PREFIX: 'test-' });
    expect(c.tmpDir).toBe('/data/tmp');
    expect(c.s3.bucketPrefix).toBe('test-');
  });

  it('requires a payment provider and refuses the fake one in production', () => {
    const { PAYMENT_PROVIDER: _p, ...rest } = env;
    expect(() => loadWorkerConfig(rest)).toThrow(/PAYMENT_PROVIDER/);
    expect(() => loadWorkerConfig({ ...env, NODE_ENV: 'production' })).toThrow(/PAYMENT_PROVIDER/);
    expect(() => loadWorkerConfig({ ...env, FAKE_PAYMENT_WEBHOOK_SECRET: undefined })).toThrow(
      /FAKE_PAYMENT_WEBHOOK_SECRET/,
    );
    const c = loadWorkerConfig({
      ...env,
      ...prodMail,
      PAYMENT_PROVIDER: 'platega',
      NODE_ENV: 'production',
    });
    expect(c.payment).toMatchObject({ provider: 'platega', fakeWebhookSecret: null });
  });

  it('takes the mail settings and requires them in production', () => {
    expect(loadWorkerConfig({ ...env, ...prodMail }).mail).toEqual({
      smtpUrl: prodMail.SMTP_URL,
      from: prodMail.MAIL_FROM,
    });
    const prod = { ...env, PAYMENT_PROVIDER: 'platega', NODE_ENV: 'production' };
    expect(() => loadWorkerConfig(prod)).toThrow(
      /^Invalid environment variables: SMTP_URL, MAIL_FROM$/,
    );
    expect(() => loadWorkerConfig({ ...env, SMTP_URL: 'http://u:hunter2@x' })).toThrow(
      /^Invalid environment variables: SMTP_URL$/,
    );
  });

  it('loads the master keyring and requires it in production', () => {
    const key = Buffer.alloc(32, 9).toString('base64');
    expect(loadWorkerConfig(env).keyring).toBeNull();
    expect(
      loadWorkerConfig({ ...env, MASTER_KEY_CURRENT: '1', MASTER_KEY_V1: key }).keyring?.current,
    ).toBe(1);
    expect(() =>
      loadWorkerConfig({
        ...env,
        ...prodMail,
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'platega',
        MASTER_KEY_CURRENT: undefined,
      }),
    ).toThrow(/MASTER_KEY_CURRENT/);
  });
});
