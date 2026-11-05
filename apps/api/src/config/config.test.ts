import { expect, it } from 'vitest';
import { loadConfig } from './config.js';

const valid = {
  AUTH_SECRET: Buffer.alloc(32, 't').toString('base64'),
  DATABASE_URL: 'postgresql://a',
  REDIS_URL: 'redis://b',
  SITE_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_URL: 'https://dl.xstorex.ru/',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
};

it('requires at least 32 bytes of base64 authentication secret', () => {
  expect(() => loadConfig({ ...valid, AUTH_SECRET: undefined })).toThrow(/AUTH_SECRET/);
  expect(() => loadConfig({ ...valid, AUTH_SECRET: Buffer.alloc(8).toString('base64') })).toThrow(
    /AUTH_SECRET/,
  );
});

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
