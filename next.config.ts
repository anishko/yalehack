import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongodb'],
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
