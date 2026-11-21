import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Local runs read the *_TEST values from the root .env (CI sets them in the job).
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * Profile signer and test device root for the e2e API, from `pnpm --filter @xstore/api
 * enroll:dev-cert` and `enroll:test-ca` (.secrets/enroll/, gitignored). Without them the
 * connection tests fail with a hint; everything else runs.
 */
const enrollDir = fileURLToPath(new URL('../../.secrets/enroll/', import.meta.url));
const enrollFiles = {
  ENROLL_CERT_PATH: `${enrollDir}cert.pem`,
  ENROLL_KEY_PATH: `${enrollDir}key.pem`,
  ENROLL_TEST_ANCHOR_PATH: `${enrollDir}test-anchor.pem`,
};
const enrollEnv = Object.values(enrollFiles).every((path) => existsSync(path)) ? enrollFiles : {};

/**
 * Н3: supplier files for the admin upload test (`e2e/admin-devices.spec.ts`), made once per run by
 * `@xstore/signing/testing` (fake keys, a temporary folder, never committed). The e2e API trusts
 * their test root through SIGNING_TEST_ANCHOR_PATH. Workers inherit the folder through the env.
 */
export const E2E_KIT_UDIDS = {
  admin: {
    'mobile-webkit': '00008110-E2E0000000000001',
    'desktop-chromium': '00008110-E2E0000000000002',
  },
  connect: {
    'mobile-webkit': '00008110-E2E0000000000003',
    'desktop-chromium': '00008110-E2E0000000000004',
  },
} as const;
/** The kit's UDID for one test file and Playwright project (each pair binds its own device). */
export const e2eKitUdid = (use: keyof typeof E2E_KIT_UDIDS, project: string): string =>
  E2E_KIT_UDIDS[use][project as keyof (typeof E2E_KIT_UDIDS)['admin']];
// The e2e API and worker encrypt the kit with the master key; CI has no .env, so a run makes its
// own throwaway key (set here once, inherited by the servers and the workers).
if (!process.env.MASTER_KEY_CURRENT) {
  process.env.MASTER_KEY_CURRENT = '1';
  process.env.MASTER_KEY_V1 = randomBytes(32).toString('base64');
}
if (!process.env.XSTORE_E2E_KIT_DIR) {
  const dir = mkdtempSync(join(tmpdir(), 'xstore-e2e-kit-'));
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { writeFileSync } from 'node:fs';
       import { makeKit } from '@xstore/signing/testing';
       const [dir, ...udids] = process.argv.slice(1);
       const kit = makeKit({ udids });
       writeFileSync(dir + '/anchor.pem', kit.anchor.toString());
       writeFileSync(dir + '/kit.p12', kit.p12);
       writeFileSync(dir + '/kit.mobileprovision', kit.profile);
       writeFileSync(dir + '/password.txt', kit.password);`,
      dir,
      ...Object.values(E2E_KIT_UDIDS).flatMap((byProject) => Object.values(byProject)),
    ],
    { cwd: fileURLToPath(new URL('../../packages/signing/', import.meta.url)) },
  );
  process.env.XSTORE_E2E_KIT_DIR = dir;
}
export const e2eKitDir = (): string => process.env.XSTORE_E2E_KIT_DIR as string;

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
    // E2E pays through the development-only fake provider; the key signs only fake webhooks.
    PAYMENT_PROVIDER: 'fake',
    FAKE_PAYMENT_WEBHOOK_SECRET: 'e2e-fake-webhook-secret',
    // Letters go to the test Mailpit; a missing one only logs failed sends.
    SMTP_URL: env.SMTP_URL_TEST ?? 'smtp://127.0.0.1:1025',
    MAIL_FROM: 'Xstore <noreply@xstorex.test>',
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
      command: 'node dist/main.js',
      cwd: '../worker',
      env: {
        ...e2eApiEnv(),
        LOG_LEVEL: 'info',
        ZSIGN_BIN: fileURLToPath(new URL('./e2e/fixtures/fake-zsign.sh', import.meta.url)),
      },
      wait: { stdout: /"msg":"worker started"/ },
      stdout: 'pipe',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
      timeout: 60_000,
    },
    {
      // Built by turbo (`@xstore/web#test:e2e` depends on `@xstore/api#build`).
      command: 'node dist/main.js',
      cwd: '../api',
      url: `http://localhost:${apiPort}/api/v1/health`,
      env: {
        ...e2eApiEnv(),
        ...enrollEnv,
        SIGNING_TEST_ANCHOR_PATH: join(e2eKitDir(), 'anchor.pem'),
        API_PORT: String(apiPort),
        SITE_URL: `http://localhost:${port}`,
        LOG_LEVEL: 'warn',
        XSTORE_DEV_PAGES: '1',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm build && pnpm start -p ${port}`,
      // Not `/`: Playwright starts the servers before global setup migrates and seeds the test
      // database, and every catalog page needs those tables. The dev showcase needs no API.
      url: `http://localhost:${port}/dev/ui`,
      // SITE_URL: the dev payment page settles fake payments through the API, whose Origin
      // check expects this site, not the development one from the root .env.
      env: {
        XSTORE_DEV_PAGES: '1',
        API_INTERNAL_URL: `http://localhost:${apiPort}`,
        SITE_URL: `http://localhost:${port}`,
      },
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
