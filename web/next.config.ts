import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@upto/contracts', '@upto/fixtures'],
};

export default nextConfig;
