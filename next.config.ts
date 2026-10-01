import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb"
    }
  }
};

export default nextConfig;
