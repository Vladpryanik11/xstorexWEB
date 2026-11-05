import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * Environment for `loadConfig` in integration tests: the *_TEST database and Redis, and the S3
 * buckets under `S3_BUCKET_PREFIX_TEST` so tests never touch development buckets.
 */
export function testEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = process.env;
  return {
    DATABASE_URL: env.DATABASE_URL_TEST,
    REDIS_URL: env.REDIS_URL_TEST,
    SITE_URL: 'http://localhost:3000',
    LOG_LEVEL: 'error',
    S3_ENDPOINT: env.S3_ENDPOINT,
    S3_PUBLIC_URL: env.S3_PUBLIC_URL,
    S3_REGION: env.S3_REGION,
    S3_ACCESS_KEY: env.S3_ACCESS_KEY,
    S3_SECRET_KEY: env.S3_SECRET_KEY,
    S3_BUCKET_PREFIX: env.S3_BUCKET_PREFIX_TEST,
    ...overrides,
  };
}
