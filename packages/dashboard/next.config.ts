import type { NextConfig } from 'next';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Dashboard is localhost-only
  output: 'standalone',
  // Set tracing root to monorepo root so standalone paths are predictable
  outputFileTracingRoot: join(__dirname, '../../'),
  // Transpile workspace packages
  transpilePackages: ['@murph/config', '@murph/security'],
  // Prevent bundling native modules
  serverExternalPackages: ['pg', 'keytar', 'bcrypt', '@mapbox/node-pre-gyp', 'chokidar', 'pino'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Prevent webpack from trying to bundle native modules
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('keytar', 'bcrypt', '@mapbox/node-pre-gyp', 'chokidar');
      }
    }
    return config;
  },
};

export default nextConfig;
