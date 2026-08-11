const path = require("path");
const { resolvePartnersiteBackendBaseUrl } = require("./lib/dev-backend-url");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: parent has its own lockfile; pin tracing root so Next.js does not warn.
  outputFileTracingRoot: path.join(__dirname, '..'),
  output: 'standalone',
  reactCompiler: true,
  // Phone / LAN testing hits the machine IP, not localhost — allow Next dev assets.
  allowedDevOrigins: ['10.187.103.181', '127.0.0.1', 'localhost'],
  transpilePackages: [
    '@gatimitra/kot-print',
    '@gatimitra/bill-print',
    '@gatimitra/print-utils',
    '@gatimitra/financial-rules',
    '@gatimitra/merchant-payout',
    '@gatimitra/contracts',
    '@gatimitra/store-status',
  ],
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
  async redirects() {
    return [
      { source: '/privacy', destination: '/privacy-policy', permanent: true },
      { source: '/code-of-conduct', destination: '/coc', permanent: true },
      { source: '/terms-of-service', destination: '/terms', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/notification.wav',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
    ];
  },
  webpack: (config, { dev }) => {
    const onOneDrive = process.platform === 'win32' && __dirname.includes('OneDrive');
    if (dev || onOneDrive) {
      // Disk pack cache + OneDrive file locking causes ENOENT on *.pack.gz — use memory cache.
      config.cache = { type: 'memory' };
    }
    return config;
  },
};

module.exports = nextConfig;
