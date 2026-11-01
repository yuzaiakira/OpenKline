import { resolve } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local Playwright uses the loopback address while Next's dev server starts
  // from localhost. Allow only these development origins for HMR verification.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Allow an alternate dist directory when a pre-existing root-owned `.next`
  // cache blocks local Playwright verification.
  distDir: process.env.OPENKLINE_NEXT_DIST ?? ".next",
  transpilePackages: ["@openkline/react", "openkline"],
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      openkline: resolve(process.cwd(), "../../dist/src/index.js"),
      // Internal-only Widget entry for Phase 16.4.3 fixtures — not a published export.
      "openkline/widget-internal": resolve(process.cwd(), "../../dist/src/widget/index.js"),
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
