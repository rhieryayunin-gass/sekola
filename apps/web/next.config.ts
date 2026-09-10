import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel packages the build through its adapter; Docker needs standalone.
  output: process.env.VERCEL === "1" ? undefined : "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  outputFileTracingIncludes: {
    // pnpm's conditional SWC helper exports also require the ESM runtime files.
    "/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/**/*"],
  },
  poweredByHeader: false,
};

export default nextConfig;
