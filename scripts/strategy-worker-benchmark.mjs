import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const server = spawn(process.execPath, ["scripts/serve-example.mjs"], { stdio: "ignore" });
let browser;

try {
  await waitForServer("http://127.0.0.1:4173/dist/src/index.js");
  browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const { createBacktestWorker, serializeBacktestResult } = await import(new URL("/dist/src/index.js", location.origin).href);
    const makeCandles = (size) => Array.from({ length: size }, (_, index) => {
      const close = 100 + Math.sin(index / 23) * 3 + index / size;
      return {
        time: Date.UTC(2026, 0, 1) + index * 60_000,
        open: close - 0.35,
        high: close + 0.8,
        low: close - 0.8,
        close,
        volume: 1_000 + index,
      };
    });
    const base = {
      strategy: "EMA_TREND",
      parameters: { period: 20 },
      initialCapital: 100_000,
      positionSizing: { type: "fixed-quantity", quantity: 1 },
      commission: { type: "fixed", value: 0 },
      slippage: { type: "fixed", value: 0 },
    };
    const sizes = [1_000, 10_000, 100_000];
    const measurements = [];
    for (const size of sizes) {
      const candles = makeCandles(size);
      const progressAt = [];
      const session = createBacktestWorker({ ...base, candles });
      const unsubscribe = session.subscribe((status) => {
        if (status.progress !== undefined && progressAt.length < 3) progressAt.push({ processedBars: status.progress.processedBars, at: performance.now() });
      });
      const startedAt = performance.now();
      const result = await session.run();
      const firstProgressAt = progressAt[0]?.at ?? performance.now();
      const completedAt = performance.now();
      const firstJson = serializeBacktestResult(result);
      const repeatStartedAt = performance.now();
      const repeat = await session.run();
      const repeatCompletedAt = performance.now();
      measurements.push({
        candles: size,
        firstRunMs: Number((completedAt - startedAt).toFixed(3)),
        firstProgressMs: Number((firstProgressAt - startedAt).toFixed(3)),
        repeatRunMs: Number((repeatCompletedAt - repeatStartedAt).toFixed(3)),
        deterministicExport: firstJson === serializeBacktestResult(repeat),
        resultBytes: firstJson.length,
        statusAfterRun: session.getStatus().state,
      });
      unsubscribe();
      session.dispose();
    }
    const cancellationSession = createBacktestWorker({ ...base, candles: makeCandles(500_000) });
    const cancellationStartedAt = performance.now();
    const cancellationPromise = cancellationSession.run();
    await new Promise((resolve) => setTimeout(resolve, 0));
    cancellationSession.cancel();
    let cancellationCode = "completed";
    try {
      await cancellationPromise;
    } catch (error) {
      cancellationCode = error?.code ?? String(error);
    }
    const cancellationMs = performance.now() - cancellationStartedAt;
    const cancellationState = cancellationSession.getStatus().state;
    cancellationSession.dispose();
    globalThis.gc?.();
    return {
      userAgent: navigator.userAgent,
      generatedAt: new Date().toISOString(),
      measurements,
      cancellation: { code: cancellationCode, elapsedMs: Number(cancellationMs.toFixed(3)), state: cancellationState },
      usedHeapBytes: performance.memory?.usedJSHeapSize ?? null,
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
      // The static server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
