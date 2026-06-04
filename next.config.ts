import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingRoot: process.cwd(),
  allowedDevOrigins: ["100.122.128.11"],
  async redirects() {
    return [
      {
        source: "/manuscripts/new",
        destination: "/my-articles/new",
        permanent: false,
      },
      {
        source: "/manuscripts/:path*",
        destination: "/my-articles/:path*",
        permanent: false,
      },
      {
        source: "/manuscripts",
        destination: "/my-articles",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
