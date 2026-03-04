import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Dashboard is localhost-only
  output: 'standalone',
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
