import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // `prisma generate` does not connect, so a missing URL must not fail the build.
    url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@localhost:5432/invalid',
  },
});
