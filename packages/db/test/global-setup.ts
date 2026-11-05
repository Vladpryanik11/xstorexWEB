import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyMigrations, resetDatabase } from '../src/testing.js';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));

export default async function setup(): Promise<void> {
  if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  applyMigrations(url);
  await resetDatabase(url);
}
