import path from 'node:path';
import type { NextConfig } from 'next';

// The repo has one .env, at its root (README: `cp .env.example .env`), but Next
// only reads .env files from web/. Load the root one here so
// NEXT_PUBLIC_API_URL and NEXT_PUBLIC_USE_FIXTURES reach the web app.
// Anything already set in the environment wins over the file.
try {
  process.loadEnvFile(path.resolve(__dirname, '..', '.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const nextConfig: NextConfig = {
  transpilePackages: ['@upto/contracts', '@upto/fixtures'],
};

export default nextConfig;
