import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || undefined,
};

export default nextConfig;