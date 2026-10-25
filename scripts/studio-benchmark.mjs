import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const port = 4174;
const baseURL = `http://127.0.0.1:${port}`;
const projectDirectory = fileURLToPath(new URL("../examples/nextjs-app-router/", import.meta.url));
const nextBinary = fileURLToPath(new URL("../examples/nextjs-app-router/node_modules/next/dist/bin/next", import.meta.url));
const server = spawn(process.execPath, [nextBinary, "dev", "--webpack", "--port", String(port)], {
  cwd: projectDirectory,
  stdio: "ignore",
});
let browser;

try {
  await waitForServer(`${baseURL}/lifecycle-verification`);
  browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({ viewport: { width: 1_440, height: 900 } });
  await page.goto(`${baseURL}/`);
  const results = [];
  for (const layout of ["single", "two-horizontal", "two-vertical", "four-grid"]) {
    const startedAt = await page.evaluate(() => performance.now());
    await page.getByLabel("Chart layout").selectOption(layout);
    const expectedPanels = layout === "single" ? 1 : layout === "four-grid" ? 4 : 2;
    await page.locator("[data-panel-id]").nth(expectedPanels - 1).waitFor();
    await page.waitForTimeout(250);
    results.push(await page.evaluate(({ layout: measuredLayout, startedAt: measuredStart, expected }) => ({
      layout: measuredLayout,
      transitionMs: Number((performance.now() - measuredStart).toFixed(3)),
      panelCount: document.querySelectorAll("[data-panel-id]").length,
      visibleCanvasCount: [...document.querySelectorAll("canvas")].filter((canvas) => canvas.getBoundingClientRect().width > 0 && canvas.getBoundingClientRect().height > 0).length,
      expectedPanels: expected,
    }), { layout, startedAt, expected: expectedPanels }));
  }
  await page.getByLabel("Chart layout").selectOption("single");
  await page.locator('[data-panel-id="chart-1"]').waitFor();
  const cleanup = await page.evaluate(() => ({ remainingCanvasCount: document.querySelectorAll("canvas").length, userAgent: navigator.userAgent }));
  console.log(JSON.stringify({ browser: cleanup.userAgent, results, cleanup }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Next.js is still compiling the route.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
