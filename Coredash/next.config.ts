import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output for the production Docker image (treasury.gatimitra.com).
  // The image is built from the Coredash/ dir alone (self-contained, not a
  // monorepo workspace), so the file-tracing/turbopack roots are the app dir
  // itself — never the monorepo parent (which is absent from the build context).
  output: "standalone",
  outputFileTracingRoot: __dirname,
  serverExternalPackages: [
    "postgres",
    "drizzle-orm",
    "@supabase/supabase-js",
    "@supabase/ssr",
  ],
  transpilePackages: ["geist"],
  devIndicators: false,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  turbopack: {
    root: __dirname,
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
