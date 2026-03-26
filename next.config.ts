import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "172.16.0.189"],
  typedRoutes: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || undefined,
};

export default nextConfig;