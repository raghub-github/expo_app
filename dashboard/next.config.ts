import type { NextConfig } from "next";
import path from "path";

/** Where Fastify lives when the merchant app uses EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 (Next dev). */
const merchantApiProxyTarget =
  process.env.MERCHANT_API_PROXY_TARGET?.trim() ||
  (process.env.NODE_ENV === "development" ? "http://127.0.0.1:4000" : "");

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep tracing inside dashboard so this repo is fully standalone
  outputFileTracingRoot: path.join(process.cwd()),
  transpilePackages: ["@gatimitra/contracts"],
  // Disable dev indicator ("• Rendering..." / "Compiling...") at bottom-left to avoid delay and visual noise
  devIndicators: false,
  // Image optimization: allow quality 75 (default) and 95 for crisp logos/hero images
  images: {
    qualities: [75, 95],
  },
  // Compression: Vercel/hosts typically enable gzip; for self-hosted, use nginx or middleware.
  // Reduce chunk load errors with Turbopack (Next 16)
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  /**
   * Configure Turbopack root so it resolves Next.js from the dashboard folder
   * instead of incorrectly treating src/app as the workspace root.
   */
  turbopack: {
    root: path.join(process.cwd()),
  },
  // Mapbox is loaded from CDN, no webpack config needed

  webpack: (config, { dev }) => {
    if (dev) {
      // Disk pack cache + OneDrive / Windows file locking causes ENOENT on manifests and
      // "rename ... 0.pack.gz_" webpack cache errors. Fully disabling cache (`false`) can
      // leave webpack resolving chunks before they exist → "Cannot read properties of undefined
      // (reading 'call')" and recoverable SSR failures. In-memory cache avoids disk locks
      // without that race.
      config.cache = { type: "memory" };
    }
    return config;
  },

  // In dev, disable browser cache for dashboard so HTML/JS updates show after code changes.
  // Default dev uses webpack (npm run dev --webpack) to avoid Turbopack ChunkLoadError; use npm run dev:turbopack for Turbopack.
  // If UI still doesn't update, run: npm run dev:clean to clear .next cache.
  /**
   * Proxy REST API so mobile/web clients can use the same host:port as `next dev` (3000)
   * while Fastify runs on another port (default 4000 in development).
   * Override: MERCHANT_API_PROXY_TARGET=http://127.0.0.1:YOUR_API_PORT
   */
  async rewrites() {
    if (!merchantApiProxyTarget) return [];
    const base = merchantApiProxyTarget.replace(/\/+$/, "");
    return [{ source: "/v1/:path*", destination: `${base}/v1/:path*` }];
  },

  async headers() {
    if (process.env.NODE_ENV !== "development") return [];
    return [
      {
        source: "/dashboard",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
      {
        source: "/dashboard/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
