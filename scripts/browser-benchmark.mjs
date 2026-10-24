import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const server = spawn(process.execPath, ["scripts/serve-example.mjs"], { stdio: "ignore" });
let browser;

try {
  await waitForServer("http://127.0.0.1:4173/examples/vanilla/index.html");
  browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({ viewport: { width: 1_200, height: 520 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const chart = globalThis.__openklineChart;
    const sizes = [1_000, 10_000, 100_000];
    const results = [];
    const memorySamples = [];
    globalThis.gc?.();
    const memoryBefore = performance.memory?.usedJSHeapSize ?? null;
    for (const size of sizes) {
      let candles = Array.from({ length: size }, (_, index) => {
        const close = 100 + Math.sin(index / 23) * 4 + index / size;
        return {
          time: 1_700_000_000_000 + index * 60_000,
          open: close - 0.5,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1_000 + index,
        };
      });
      const loadStart = performance.now();
      chart.setData(candles);
      const loadMs = performance.now() - loadStart;

      const navigationStart = performance.now();
      for (let index = 0; index < 10; index += 1) {
        chart.zoom(0.9, 0.5);
        chart.pan(3);
      }
      const navigationMs = performance.now() - navigationStart;

      const updateStart = performance.now();
      const last = candles[candles.length - 1];
      for (let index = 0; index < 100; index += 1) {
        chart.update({ ...last, close: last.close + index / 1_000 });
      }
      const updateMs = performance.now() - updateStart;
      const frameStart = performance.now();
      let frameCount = 0;
      await new Promise((resolve) => {
        const renderFrame = () => {
          chart.update({ ...last, close: last.close + frameCount / 10_000 });
          frameCount += 1;
          if (frameCount >= 30) {
            resolve();
          } else {
            requestAnimationFrame(renderFrame);
          }
        };
        requestAnimationFrame(renderFrame);
      });
      const frameElapsedMs = performance.now() - frameStart;
      results.push({
        candles: size,
        loadMs: Number(loadMs.toFixed(3)),
        navigationMs: Number(navigationMs.toFixed(3)),
        updateMs: Number(updateMs.toFixed(3)),
        updateFrameMs: Number((updateMs / 100).toFixed(3)),
        rafFrameMs: Number((frameElapsedMs / frameCount).toFixed(3)),
        rafFps: Number((frameCount / (frameElapsedMs / 1_000)).toFixed(2)),
      });
      memorySamples.push({
        candles: size,
        usedAfterUpdate: performance.memory?.usedJSHeapSize ?? null,
      });
      candles = [];
    }
    const memoryBeforeDestroy = performance.memory?.usedJSHeapSize ?? null;
    globalThis.gc?.();
    chart.destroy();
    globalThis.gc?.();
    return {
      browser: navigator.userAgent,
      memory: performance.memory === undefined
        ? null
        : {
            usedBefore: memoryBefore,
            usedBeforeDestroy: memoryBeforeDestroy,
            usedAfterDestroy: performance.memory.usedJSHeapSize,
            samples: memorySamples,
          },
      remainingCanvasCount: document.querySelectorAll("canvas").length,
      results,
    };
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function waitForServer(url) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
