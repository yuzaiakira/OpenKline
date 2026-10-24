import { resolve } from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@openkline/react", "openkline"],
  outputFileTracingRoot: resolve(process.cwd(), "../.."),
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      openkline: resolve(process.cwd(), "../../dist/src/index.js"),
    };
    return config;
  },
};

export default nextConfig;
