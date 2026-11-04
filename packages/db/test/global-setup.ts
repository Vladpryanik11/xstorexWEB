import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const prismaCli = createRequire(import.meta.url).resolve('prisma/build/index.js');
const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));
const packageDir = fileURLToPath(new URL('..', import.meta.url));

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: packageDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('TRUNCATE "Setting"');
  } finally {
    await client.end();
  }
}
