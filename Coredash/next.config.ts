import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "postgres",
    "drizzle-orm",
    "@supabase/supabase-js",
    "@supabase/ssr",
  ],
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["geist"],
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  turbopack: {
    root: monorepoRoot,
  },
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      config.cache = { type: "memory", maxGenerations: 1 };
    }
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        postgres: false,
      };
    }
    return config;
  },
};

export default nextConfig;
