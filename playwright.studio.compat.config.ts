import { defineConfig, devices } from "@playwright/test";

/**
 * Optional Studio-only compatibility lane. It intentionally uses only
 * Playwright-managed browser names and is independent from the standalone
 * library matrix in playwright.portable.config.ts.
 */
export default defineConfig({
  testDir: "tests/react-browser",
  testIgnore: "**/visual-regression-review.spec.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4174",
    headless: true,
  },
  projects: [
    { name: "studio-chromium", use: { browserName: "chromium" } },
    { name: "studio-firefox", use: { browserName: "firefox" } },
    { name: "studio-webkit", use: { browserName: "webkit" } },
    { name: "studio-mobile-chrome", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "studio-mobile-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "npm run dev -- --webpack --port 4174",
    cwd: "examples/nextjs-app-router",
    url: "http://127.0.0.1:4174/lifecycle-verification",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
