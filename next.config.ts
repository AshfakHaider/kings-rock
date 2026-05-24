import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: false,
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb"
    }
  }
};

export default nextConfig;
