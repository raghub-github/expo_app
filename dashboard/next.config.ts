import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Reduce chunk load errors with Turbopack (Next 16)
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Mapbox is loaded from CDN, no webpack config needed
};

export default nextConfig;
