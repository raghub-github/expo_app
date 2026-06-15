import type { NextConfig } from "next";
import path from "path";

/** Where Fastify lives when the merchant app uses EXPO_PUBLIC_API_BASE_URL=http://localhost:3000 (Next dev). */
function normalizeDevBackendProxyTarget(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "";
  }
  if (trimmed === "http://127.0.0.1:4000" || trimmed === "http://localhost:4000") {
    return "http://127.0.0.1:3000";
  }
  return trimmed;
}

const merchantApiProxyTarget = normalizeDevBackendProxyTarget(
  process.env.MERCHANT_API_PROXY_TARGET
);

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "drizzle-orm"],
  output: "standalone",
  // Trace from the MONOREPO ROOT, not dashboard/. In an npm-workspaces repo
  // `next` (and most other deps) gets hoisted to `../node_modules`; tracing
  // only from `dashboard/` left the standalone bundle without a copy of next
  // itself, producing `Cannot find module 'next'` in the runtime container.
  outputFileTracingRoot: path.join(__dirname, ".."),
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

  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Disk pack cache + OneDrive / Windows file locking causes ENOENT on manifests and
      // "rename ... 0.pack.gz_" webpack cache errors. Fully disabling cache (`false`) can
      // leave webpack resolving chunks before they exist → "Cannot read properties of undefined
      // (reading 'call')" and recoverable SSR failures. In-memory cache avoids disk locks
      // without that race.
      config.cache = { type: "memory" };
    }
    // Prevent postgres (Node-only) from entering the client bundle if imported accidentally.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        postgres: false,
      };
    }
    return config;
  },

  // In dev, disable browser cache for dashboard so HTML/JS updates show after code changes.
  // Default dev uses webpack (npm run dev --webpack) to avoid Turbopack ChunkLoadError; use npm run dev:turbopack for Turbopack.
  // If UI still doesn't update, run: npm run dev:clean to clear .next cache.
  /**
   * Proxy REST API so mobile/web clients can use the same host:port as `next dev` (3001)
   * while Fastify runs on port 3000 (backend `npm run dev`).
   * Legacy MERCHANT_API_PROXY_TARGET=http://127.0.0.1:4000 is mapped to :3000 in dev.
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
