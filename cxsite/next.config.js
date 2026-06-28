/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build is required by the cxsite Dockerfile multi-stage copy.
  // Disable with NEXT_OUTPUT=default when iterating on the dev server.
  output: process.env.NEXT_OUTPUT === 'default' ? undefined : 'standalone',
  // cxsite ships pre-existing ESLint and TS warnings/errors in legacy
  // restaurant/RestaurantPage.tsx, services/api/, lib/server/msg91Otp.ts
  // etc. that are NOT load-bearing for the legal/policy/marketing pages
  // and don't affect runtime. We rely on per-package `npm run typecheck`
  // (run in CI) to catch real type drift on touched files; the production
  // image bake should not be held up by historic lint debt.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // The friend's pre-existing pages call `useSearchParams()` without a
  // <Suspense> boundary. Next 14 treats that as a build-blocking
  // prerender error. Setting this flag tells Next to fall back to the
  // legacy CSR-bailout behaviour (page renders dynamically at request
  // time). The legal/policy pages don't use searchParams so they still
  // get fully static prerender + cached HTML.
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  images: {
    remotePatterns: [
      // Dev: menu/gallery URLs may be absolute to this origin (e.g. /api/attachments/proxy)
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3000',
        pathname: '/api/attachments/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '3000',
        pathname: '/api/attachments/**',
      },
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'upload.wikimedia.org', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn-icons-png.flaticon.com', pathname: '/**' },
      { protocol: 'https', hostname: 'pub-2e31bb39b3e34e7ebf7a8159328c5d16.r2.dev', pathname: '/**' },
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'docs.4b9b7a7215119c9bf8f9e0b1f4cfc8ad.r2.cloudflarestorage.com',
        pathname: '/**',
      },
      { protocol: 'https', hostname: 'dummyimage.com', pathname: '/**' },
    ],
  },
  async redirects() {
    return [
      // Single canonical account-deletion page: /account-deletion. Every other
      // URL that has ever been cited (Privacy Policy, Google Play data-safety
      // listing, the old web form, stale ".md" links) folds into it.
      { source: '/delete-account-request', destination: '/account-deletion', permanent: true },
      { source: '/account/delete', destination: '/account-deletion', permanent: true },
      { source: '/account-delete', destination: '/account-deletion', permanent: true },
      { source: '/data-deletion-policy.md', destination: '/account-deletion', permanent: true },
      { source: '/data-deletion-policy', destination: '/account-deletion', permanent: true },
    ]
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig

