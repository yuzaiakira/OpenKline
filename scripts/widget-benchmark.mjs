import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const server = spawn(process.execPath, ["scripts/serve-example.mjs"], { stdio: "ignore" });
let browser;

try {
  await waitForServer("http://127.0.0.1:4173/examples/vanilla/index.html");
  const managedChromium = chromium.executablePath();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? (existsSync(managedChromium) ? managedChromium : undefined)
    ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : managedChromium);
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({ viewport: { width: 1_200, height: 700 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const { createOpenKlineWidget } = await import("/dist/src/widget/index.js");
    const sizes = [1_000, 10_000, 100_000];
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.length === 0) return 0;
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    };
    const statistics = (values) => ({
      medianMs: Number(percentile(values, 0.5).toFixed(3)),
      p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    });
    const nextVisualFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const measureVisual = async (action, count = 20) => {
      for (let index = 0; index < 3; index += 1) {
        action(index);
        await nextVisualFrame();
      }
      const samples = [];
      for (let index = 0; index < count; index += 1) {
        const started = performance.now();
        action(index);
        await nextVisualFrame();
        samples.push(performance.now() - started);
      }
      return { ...statistics(samples), fpsMedian: Number((1_000 / Math.max(0.001, percentile(samples, 0.5))).toFixed(2)) };
    };
    const makeCandles = (size, offset = 0) => Array.from({ length: size }, (_, index) => {
      const close = 100 + offset + Math.sin(index / 23) * 4 + index / size;
      return {
        time: Date.UTC(2026, 0, 1) + index * 60_000,
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000 + index,
      };
    });
    const results = [];
    const styleCountBefore = document.querySelectorAll("style[data-openkline-widget-style]").length;
    const canvasCountBefore = document.querySelectorAll("canvas").length;
    for (const size of sizes) {
      const host = document.createElement("div");
      host.style.cssText = "width: 1000px; height: 560px";
      document.body.append(host);
      const candles = makeCandles(size);
      const createStart = performance.now();
      const widget = createOpenKlineWidget({
        container: host,
        data: candles,
        dataIdentity: { symbol: `BENCH-${size}`, timeframe: "1m" },
        chartOptions: { autoSize: true },
      });
      const createMs = performance.now() - createStart;
      const chart = widget.getChart();
      const replacement = makeCandles(size, 10);
      const replaceStart = performance.now();
      widget.setData(replacement, { symbol: `REPLACED-${size}`, timeframe: "1m" });
      const replaceMs = performance.now() - replaceStart;
      const visible = await measureVisual(() => chart.pan(1));
      const zoom = await measureVisual((index) => chart.zoom(index % 2 === 0 ? 1.01 : 0.99, 0.5));
      const feed = {
        async resolveSymbol(symbol) { return { symbol, timezone: "UTC", pricePrecision: 2 }; },
        async getBars() { return replacement; },
        subscribeBars() { return () => undefined; },
      };
      const transitionStart = performance.now();
      await widget.setDatafeed(feed, { symbol: `FEED-${size}`, timeframe: "5m", from: 0, to: Number.MAX_SAFE_INTEGER });
      await widget.setSymbol(`FEED-NEXT-${size}`);
      await widget.setTimeframe("15m");
      const transitionMs = performance.now() - transitionStart;
      const beforeDestroy = widget.getDiagnostics();
      const memoryBeforeDestroy = performance.memory?.usedJSHeapSize ?? null;
      const destroyStart = performance.now();
      widget.destroy();
      const destroyMs = performance.now() - destroyStart;
      const afterDestroy = widget.getDiagnostics();
      results.push({
        candles: size,
        createMs: Number(createMs.toFixed(3)),
        replaceMs: Number(replaceMs.toFixed(3)),
        pan: visible,
        zoom,
        datafeedTransitionMs: Number(transitionMs.toFixed(3)),
        destroyMs: Number(destroyMs.toFixed(3)),
        memoryBeforeDestroy,
        beforeDestroy,
        afterDestroy,
        remainingWidgetCanvases: host.querySelectorAll("canvas").length,
        remainingDocumentCanvases: document.querySelectorAll("canvas").length,
        styleCountAfterDestroy: document.querySelectorAll("style[data-openkline-widget-style]").length,
      });
      host.remove();
    }
    const mountSamples = [];
    for (let round = 0; round < 10; round += 1) {
      const host = document.createElement("div");
      host.style.cssText = "width: 360px; height: 300px";
      document.body.append(host);
      const started = performance.now();
      const widget = createOpenKlineWidget({ container: host, data: makeCandles(1_000), dataIdentity: { symbol: `MOUNT-${round}`, timeframe: "1m" } });
      widget.destroy();
      host.remove();
      mountSamples.push(performance.now() - started);
    }
    globalThis.gc?.();
    return {
      browser: navigator.userAgent,
      styleCountBefore,
      styleCountAfter: document.querySelectorAll("style[data-openkline-widget-style]").length,
      canvasCountBefore,
      repeatedMountUnmount: { rounds: mountSamples.length, ...statistics(mountSamples) },
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
