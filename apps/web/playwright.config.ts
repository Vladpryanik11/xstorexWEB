import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Local runs read the *_TEST values from the root .env (CI sets them in the job).
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const port = 3100;
const apiPort = 3101;

/** The e2e API: test database, Redis and buckets, so e2e runs never touch development data. */
export const e2eApiEnv = (env: NodeJS.ProcessEnv = process.env): Record<string, string> => {
  const pick = (name: string, value: string | undefined) => {
    if (!value) throw new Error(`${name} is not set (see .env.example)`);
    return value;
  };
  return {
    DATABASE_URL: pick('DATABASE_URL_TEST', env.DATABASE_URL_TEST),
    REDIS_URL: pick('REDIS_URL_TEST', env.REDIS_URL_TEST),
    S3_ENDPOINT: pick('S3_ENDPOINT', env.S3_ENDPOINT),
    S3_PUBLIC_URL: pick('S3_PUBLIC_URL', env.S3_PUBLIC_URL),
    S3_REGION: env.S3_REGION ?? 'us-east-1',
    S3_ACCESS_KEY: pick('S3_ACCESS_KEY', env.S3_ACCESS_KEY),
    S3_SECRET_KEY: pick('S3_SECRET_KEY', env.S3_SECRET_KEY),
    S3_BUCKET_PREFIX: pick('S3_BUCKET_PREFIX_TEST', env.S3_BUCKET_PREFIX_TEST),
  };
};

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'mobile-webkit', use: { ...devices['iPhone 15'] } },
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      // Built by turbo (`@xstore/web#test:e2e` depends on `@xstore/api#build`).
      command: 'node dist/main.js',
      cwd: '../api',
      url: `http://localhost:${apiPort}/api/v1/health`,
      env: {
        ...e2eApiEnv(),
        API_PORT: String(apiPort),
        SITE_URL: `http://localhost:${port}`,
        LOG_LEVEL: 'warn',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm start -p ${port}`,
      url: `http://localhost:${port}`,
      env: { XSTORE_DEV_PAGES: '1', API_INTERNAL_URL: `http://localhost:${apiPort}` },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
