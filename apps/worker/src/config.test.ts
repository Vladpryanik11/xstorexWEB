import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from './config.js';

const env = {
  REDIS_URL: 'redis://x',
  DATABASE_URL: 'postgresql://u:p@h/db',
  S3_ENDPOINT: 'http://minio:9000',
  S3_ACCESS_KEY: 'key',
  S3_SECRET_KEY: 'secret',
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
});
