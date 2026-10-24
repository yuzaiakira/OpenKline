import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 15_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  },
  webServer: {
    command: "node scripts/serve-example.mjs",
    url: "http://127.0.0.1:4173/examples/vanilla/index.html",
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
