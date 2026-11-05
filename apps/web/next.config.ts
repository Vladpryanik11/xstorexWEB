import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

// Same as apps/api/src/main.ts: the root .env feeds local runs (`pnpm dev`, `next start`).
// Variables already set in the environment win; Docker builds have no .env and pass build args.
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiUrl = process.env.API_INTERNAL_URL;

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@xstore/ui', '@xstore/shared'],
  async rewrites() {
    return apiUrl ? [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
