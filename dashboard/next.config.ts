import type { NextConfig } from "next";
import path from "path";

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
      // "rename ... 0.pack.gz_" webpack cache errors. Memory-only avoids corrupt .next/dev.
      config.cache = false;
    }
    return config;
  },

  // In dev, disable browser cache for dashboard so HTML/JS updates show after code changes.
  // Default dev uses webpack (npm run dev --webpack) to avoid Turbopack ChunkLoadError; use npm run dev:turbopack for Turbopack.
  // If UI still doesn't update, run: npm run dev:clean to clear .next cache.
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
