import type { NextConfig } from "next";
import os from "os";
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

type WebpackCompilerKind = "client" | "nodejs" | "edge";

/**
 * Legacy filesystem pack cache (kept for reference / emergency restore).
 * Dev uses memory cache — pack rename races on Windows corrupted modules.
 */
function webpackFilesystemCache(kind: WebpackCompilerKind) {
  const root =
    process.platform === "win32"
      ? path.join(
          process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
          "gatimitra-dashboard-webpack"
        )
      : path.join(os.homedir(), ".cache", "gatimitra-dashboard-webpack");
  return {
    type: "filesystem" as const,
    name: `dashboard-${kind}-v4`,
    version: "pure-expr-v4",
    cacheDirectory: path.join(root, kind),
    compression: false as const,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    buildDependencies: {
      config: [path.join(__dirname, "next.config.ts")],
    },
  };
}
void webpackFilesystemCache;

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
  // Keep Node-only / heavy auth packages out of the webpack graph where possible.
  // Stops AuthAdminApi + PureExpressionDependency failures when the pack cache is stale.
  serverExternalPackages: [
    "postgres",
    "drizzle-orm",
    "@supabase/supabase-js",
    "@supabase/ssr",
    "@supabase/auth-js",
  ],
  output: "standalone",
  // Trace from the MONOREPO ROOT, not dashboard/. In an npm-workspaces repo
  // `next` (and most other deps) gets hoisted to `../node_modules`; tracing
  // only from `dashboard/` left the standalone bundle without a copy of next
  // itself, producing `Cannot find module 'next'` in the runtime container.
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@gatimitra/contracts", "@gatimitra/rider-availability", "@gatimitra/slab-pricing", "geist"],
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
    // Video uploads (packaging tips) exceed the default 10MB proxy body buffer.
    proxyClientMaxBodySize: "80mb",
  },
  /**
   * Must match `outputFileTracingRoot` (Next.js 16 requirement).
   */
  turbopack: {
    root: monorepoRoot,
  },
  // Mapbox is loaded from CDN, no webpack config needed

  webpack: (config, { dev, isServer }) => {
    const onOneDrive = process.platform === "win32" && __dirname.includes("OneDrive");
    if (dev) {
      // OneDrive + concurrent /login + _not-found compiles corrupt memory packs.
      // Disable cache entirely on synced Windows paths; memory cache elsewhere.
      config.cache = onOneDrive
        ? false
        : {
            type: "memory",
            maxGenerations: 1,
          };
      config.optimization = {
        ...config.optimization,
        innerGraph: false,
        usedExports: false,
      };
      if (onOneDrive) {
        config.parallelism = 1;
      }
    } else if (onOneDrive) {
      // Prod on OneDrive: filesystem packs race sync + reference missing compiled config;
      // causes ENOENT on .next/server/pages-manifest.json after a "successful" compile.
      config.cache = false;
    }
    // Prevent postgres (Node-only) from entering the client bundle if imported accidentally.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        postgres: false,
      };
      if (dev) {
        // Dev compiles layout slowly under OneDrive + filesystem cache; default
        // chunkLoadTimeout (~120s) surfaces as ChunkLoadError before the chunk is ready.
        config.output = {
          ...config.output,
          chunkLoadTimeout: 300_000,
        };
      }
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
