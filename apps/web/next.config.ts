import type { NextConfig } from 'next';

const apiUrl = process.env.API_INTERNAL_URL;

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@xstore/ui', '@xstore/shared'],
  async rewrites() {
    return apiUrl ? [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
