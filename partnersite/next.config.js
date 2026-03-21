const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactCompiler: true,
  // Default 10MB truncates large JSON bodies (e.g. progress saves); register-store-progress needs headroom.
  experimental: {
    proxyClientMaxBodySize: '32mb',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
