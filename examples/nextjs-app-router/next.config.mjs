import { resolve } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Local Playwright uses the loopback address while Next's dev server starts
  // from localhost. Allow only these development origins for HMR verification.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  transpilePackages: ["@openkline/react", "openkline"],
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      openkline: resolve(process.cwd(), "../../dist/src/index.js"),
    };
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".js", ".ts", ".tsx"],
    };
    return config;
  },
};

export default nextConfig;
