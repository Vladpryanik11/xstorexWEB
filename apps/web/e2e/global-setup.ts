import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { e2eApiEnv } from '../playwright.config';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/**
 * Migrates and wipes the test database, then seeds the e2e catalog (`packages/db/prisma/seed-e2e.ts`)
 * and uploads its images to the test media bucket.
 */
export default function globalSetup(): void {
  execFileSync('pnpm', ['--filter', '@xstore/db', 'seed:e2e'], {
    cwd: repoRoot,
    env: { ...process.env, ...e2eApiEnv() },
    stdio: 'inherit',
  });
}
