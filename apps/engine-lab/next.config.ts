import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactStrictMode: true,
  transpilePackages: [
    "@flicksend/database",
    "@flicksend/engine-core",
    "@flicksend/shared",
    "@flicksend/ui"
  ]
};

export default nextConfig;
