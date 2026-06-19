const path = require("path");
const { resolvePartnersiteBackendBaseUrl } = require("./lib/dev-backend-url");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: parent has its own lockfile; pin tracing root so Next.js does not warn.
  outputFileTracingRoot: path.join(__dirname, '..'),
  output: 'standalone',
  reactCompiler: true,
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
    const backend = resolvePartnersiteBackendBaseUrl();
    if (!backend) return [];
    const base = String(backend).trim().replace(/\/+$/, '');
    if (!base) return [];
    return [{ source: '/v1/:path*', destination: `${base}/v1/:path*` }];
  },
};

module.exports = nextConfig;
