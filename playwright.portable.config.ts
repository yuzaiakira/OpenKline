import { defineConfig, devices } from "@playwright/test";

/**
 * Cross-browser configuration for a trusted machine with Playwright-managed
 * browsers installed. It intentionally contains no host-specific executable
 * path or fallback to a system Firefox/WebKit/Safari binary.
 */
export default defineConfig({
  testDir: "tests/browser",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"], browserName: "chromium" } },
    { name: "mobile-safari", use: { ...devices["iPhone 13"], browserName: "webkit" } },
  ],
  webServer: {
    command: "node scripts/serve-example.mjs",
    url: "http://127.0.0.1:4173/examples/vanilla/index.html",
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
