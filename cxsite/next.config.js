/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone build is required by the cxsite Dockerfile multi-stage copy.
  // Disable with NEXT_OUTPUT=default when iterating on the dev server.
  output: process.env.NEXT_OUTPUT === 'default' ? undefined : 'standalone',
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

