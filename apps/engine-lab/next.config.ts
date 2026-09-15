import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  reactStrictMode: true,
  transpilePackages: [
    "@flicksend/database",
    "@flicksend/engine-core",
    "@flicksend/shared",
    "@flicksend/ui"
  ],
  async headers() {
    return [
      {
        source: "/invite/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }]
      }
    ];
  }
};

export default nextConfig;
