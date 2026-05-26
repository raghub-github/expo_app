const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: parent has its own lockfile; pin tracing root so Next.js does not warn.
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Turbopack + `output: 'standalone'` can fail on Windows during finalize (missing middleware.js.nft.json).
  // Use Docker multi-stage copy of `.next` + `node_modules` or run `next build --webpack` if you need standalone.
  // output: 'standalone',
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
    const backend =
      process.env.GATIMITRA_BACKEND_API_URL ||
      process.env.MERCHANT_API_PROXY_TARGET ||
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_BACKEND_API_URL ||
      (process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:3000' : '');
    if (!backend) return [];
    const base = String(backend).trim().replace(/\/+$/, '');
    if (!base) return [];
    return [{ source: '/v1/:path*', destination: `${base}/v1/:path*` }];
  },
};

module.exports = nextConfig;
