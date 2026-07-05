import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": [
      "./dist/**/*",
      "./.release/**/*",
      "./.git/**/*",
      "./.next/cache/**/*",
    ],
  },
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
