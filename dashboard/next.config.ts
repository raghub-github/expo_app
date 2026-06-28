import type { NextConfig } from "next";
import path from "path";

/** Where Fastify lives in local dev (backend `npm run dev` → port 3000). */
function normalizeDevBackendProxyTarget(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) {
    return process.env.NODE_ENV === "development" ? "http://127.0.0.1:3000" : "";
  }
  if (
    trimmed === "http://127.0.0.1:4000" ||
    trimmed === "http://localhost:4000" ||
    trimmed === "http://127.0.0.1:30000" ||
    trimmed === "http://localhost:30000"
  ) {
    return "http://127.0.0.1:3000";
  }
  return trimmed;
}

const merchantApiProxyTarget = normalizeDevBackendProxyTarget(
  process.env.MERCHANT_API_PROXY_TARGET
);

/** Monorepo root — used for standalone tracing and Turbopack (must match per Next.js 16). */
const monorepoRoot = path.join(__dirname, "..");

/** Legacy top-level paths from the removed `(dashboard)` route group → `/dashboard/*`. */
const LEGACY_DASHBOARD_REDIRECTS = [
  "merchants",
  "super-admin",
  "offers",
  "tickets",
  "system",
  "riders",
  "payments",
  "orders",
  "customers",
  "analytics",
  "area-managers",
  "agents",
] as const;

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "drizzle-orm"],
  output: "standalone",
  // Trace from the MONOREPO ROOT, not dashboard/. In an npm-workspaces repo
  // `next` (and most other deps) gets hoisted to `../node_modules`; tracing
  // only from `dashboard/` left the standalone bundle without a copy of next
  // itself, producing `Cannot find module 'next'` in the runtime container.
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@gatimitra/contracts", "@gatimitra/slab-pricing"],
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
   * Must match `outputFileTracingRoot` (Next.js 16 requirement).
   */
  turbopack: {
    root: monorepoRoot,
  },
  // Mapbox is loaded from CDN, no webpack config needed

  webpack: (config, { dev, isServer }) => {
    // Note: previously aliased @gatimitra/slab-pricing to its src/index.ts.
    // After the package was given a real `tsc` build emitting dist/, the
    // alias broke webpack — it pointed at a .ts file whose own internal
    // imports use the .js extension (required for Node ESM), which the
    // alias couldn't follow. Drop the alias and let Next resolve via
    // package.json `main: ./dist/index.js`. The Dockerfile builds
    // slab-pricing before dashboard, so dist/ is present at build time.
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
   * Legacy :4000 / :30000 backend URLs are auto-mapped to :3000 in dev.
   */
  async rewrites() {
    if (!merchantApiProxyTarget) return [];
    const base = merchantApiProxyTarget.replace(/\/+$/, "");
    return [{ source: "/v1/:path*", destination: `${base}/v1/:path*` }];
  },

  async redirects() {
    return LEGACY_DASHBOARD_REDIRECTS.map((segment) => ({
      source: `/${segment}`,
      destination: `/dashboard/${segment}`,
      permanent: false,
    }));
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
