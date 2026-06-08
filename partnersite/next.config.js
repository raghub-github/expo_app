const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: parent has its own lockfile; pin tracing root so Next.js does not warn.
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Standalone output bundles `next` + traced deps into .next/standalone so the
  // production Docker image doesn't need to install node_modules separately.
  // The previous comment about Turbopack failing on Windows applies to local
  // Windows dev only — production builds in Docker run on Linux where the
  // finalize step works correctly.
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
  async rewrites() {
    const backend = resolveBackendFromEnv();
    if (!backend) return [];
    const base = String(backend).trim().replace(/\/+$/, '');
    if (!base) return [];
    return [{ source: '/v1/:path*', destination: `${base}/v1/:path*` }];
  },
};

function resolveBackendFromEnv() {
  return (
    process.env.GATIMITRA_BACKEND_API_URL ||
    process.env.MERCHANT_API_PROXY_TARGET ||
    process.env.BACKEND_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_API_URL ||
    process.env.BACKEND_URL ||
    ''
  );
}

module.exports = nextConfig;
