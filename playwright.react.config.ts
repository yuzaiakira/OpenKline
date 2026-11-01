import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/react-browser",
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
    command: "npm run dev -- --webpack --port 4174",
    cwd: "examples/nextjs-app-router",
    url: "http://127.0.0.1:4174/lifecycle-verification",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      ...process.env,
      OPENKLINE_NEXT_DIST: ".next-playwright",
    },
  },
});
