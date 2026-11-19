import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyMigrations } from '@xstore/db/testing';

const rootEnv = fileURLToPath(new URL('../../../.env', import.meta.url));

export default function setup(): void {
  if (!process.env.DATABASE_URL_TEST && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
  if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST is not set');
  if (!process.env.REDIS_URL_TEST) throw new Error('REDIS_URL_TEST is not set');
  applyMigrations(process.env.DATABASE_URL_TEST);
}
