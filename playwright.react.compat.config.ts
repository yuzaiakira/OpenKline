import { defineConfig, devices } from "@playwright/test";

/**
 * Studio cross-browser compatibility lane.
 *
 * Uses the same production Next.js server as playwright.react.config.ts to avoid
 * `next dev` HMR races. Host-native WebKit requires ICU74/flite; when those are
 * missing, mark WebKit projects failed/blocked rather than substituting Chromium.
 *
 * Prefer PLAYWRIGHT_BROWSERS_PATH pointing at a complete Playwright browser cache
 * (for example ~/.cache/ms-playwright) when the sandbox cache is incomplete.
 */
export default defineConfig({
  testDir: "tests/react-browser",
  testIgnore: "**/visual-regression-review.spec.ts",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "artifacts/playwright-results-react-compat",
  timeout: 45_000,
  expect: { timeout: 12_000 },
  use: {
    baseURL: "http://127.0.0.1:4175",
    headless: true,
  },
  projects: [
    {
      name: "studio-chromium",
      use: {
        browserName: "chromium",
        launchOptions: {
          executablePath: "/usr/bin/chromium",
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        },
      },
    },
    {
      name: "studio-firefox",
      use: { browserName: "firefox" },
    },
    {
      name: "studio-webkit",
      use: { browserName: "webkit" },
    },
    {
      name: "studio-mobile-chrome",
      use: {
        ...devices["Pixel 7"],
        browserName: "chromium",
        launchOptions: {
          executablePath: "/usr/bin/chromium",
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
        },
      },
    },
    {
      name: "studio-mobile-safari",
      use: { ...devices["iPhone 13"], browserName: "webkit" },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- --port 4175",
    cwd: "examples/nextjs-app-router",
    url: "http://127.0.0.1:4175/lifecycle-verification",
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      OPENKLINE_NEXT_DIST: ".next-playwright-compat",
    },
  },
});
