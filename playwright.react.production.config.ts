import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/react-browser",
  testMatch: /portfolio-backtesting\.spec\.ts/,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? "artifacts/playwright-results-react-production",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4175",
    headless: true,
  },
  projects: [{
    name: "chromium-production",
    use: {
      browserName: "chromium",
      launchOptions: {
        executablePath: "/usr/bin/chromium",
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
      },
    },
  }],
  webServer: {
    command: "npm run start -- --port 4175",
    cwd: "examples/nextjs-app-router",
    url: "http://127.0.0.1:4175/lifecycle-verification",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
