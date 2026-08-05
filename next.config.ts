import type { NextConfig } from "next";
import { readFileSync } from "fs";
import path from "path";

const packageJson = JSON.parse(
  readFileSync(path.join(__dirname, "package.json"), "utf8"),
) as { version?: string };

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  env: {
    NEXT_PUBLIC_NEUD_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_NEUD_BUILD_LABEL:
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEUD_BUILD_LABEL ??
      (process.env.NODE_ENV === "production" ? "production" : "local-dev"),
  },
  async headers() {
    return [
      {
        source: "/displays/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
        ],
      },
    ];
  },
};

export default nextConfig;
