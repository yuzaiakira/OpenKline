import { defineConfig } from "@playwright/test";

/**
 * React/Studio browser verification uses a production Next.js server.
 * Shared `next dev` + multi-worker webpack contention previously caused
 * intermittent Object Tree / navigation detach failures under default parallel
 * execution. Production serves a stable build without HMR races while preserving
 * default Playwright worker parallelism.
 */
export default defineConfig({
  testDir: "tests/react-browser",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "artifacts/playwright-results",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
  },
  projects: [{
    name: "chromium",
    use: {
      browserName: "chromium",
      launchOptions: {
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
    },
  }],
  webServer: {
    command: "npm run build && npm run start -- --port 4174",
    cwd: "examples/nextjs-app-router",
    url: "http://127.0.0.1:4174/lifecycle-verification",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      OPENKLINE_NEXT_DIST: ".next-playwright",
    },
  },
});
