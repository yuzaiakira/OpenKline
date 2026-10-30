#!/usr/bin/env node
/**
 * Phase 14.6 dense OHLCV Canvas2D benchmark. Command counts are collected from
 * the real browser context to distinguish display-only LOD from exact source
 * storage. Heikin-Ashi and volume/histogram remain exact by design.
 */
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
  browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const page = await browser.newPage({ viewport: { width: 920, height: 560 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const module = await import("/dist/src/index.js");
    const sizes = [1_000, 10_000, 100_000];
    const intervalMs = 60_000;
    const start = Date.UTC(2026, 0, 1);
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const createCandles = (count) => Array.from({ length: count }, (_, index) => {
      const close = 100 + Math.sin(index / 23) * 4 + index / count;
      return { time: start + index * intervalMs, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + (index % 10_000) };
    });
    const createVolume = (candles) => candles.map((candle, index) => ({ time: candle.time, value: candle.volume ?? index + 1, color: index % 2 === 0 ? "#22c55e" : "#ef4444" }));
    const cases = [
      { id: "candlestick", add: (chart) => chart.addCandlestickSeries({ id: "bench-candlestick" }), data: (candles) => candles },
      { id: "ohlc", add: (chart) => chart.addOhlcSeries({ id: "bench-ohlc" }), data: (candles) => candles },
      { id: "hollow-candlestick", add: (chart) => chart.addHollowCandlestickSeries({ id: "bench-hollow" }), data: (candles) => candles },
      { id: "heikin-ashi", add: (chart) => chart.addHeikinAshiSeries({ id: "bench-heikin" }), data: (candles) => candles },
      { id: "volume", add: (chart) => chart.addVolumeSeries({ id: "bench-volume" }), data: (candles) => createVolume(candles) },
      { id: "histogram", add: (chart) => chart.addHistogramSeries({ id: "bench-histogram" }), data: (candles) => createVolume(candles) },
    ];
    const contextPrototype = CanvasRenderingContext2D.prototype;
    const originalFillRect = contextPrototype.fillRect;
    const originalStroke = contextPrototype.stroke;
    let fillRectCalls = 0;
    let strokeCalls = 0;
    contextPrototype.fillRect = function(...args) {
      fillRectCalls += 1;
      return originalFillRect.apply(this, args);
    };
    contextPrototype.stroke = function(...args) {
      strokeCalls += 1;
      return originalStroke.apply(this, args);
    };
    const results = [];
    for (const size of sizes) {
      const candles = createCandles(size);
      for (const benchmarkCase of cases) {
        const root = document.createElement("div");
        root.style.cssText = "width: 920px; height: 560px; position: absolute; left: -10000px; top: 0";
        document.body.append(root);
        const chart = module.createChart(root, { width: 920, height: 560, autoSize: false, timeZone: "UTC", pricePrecision: 2 });
        const series = benchmarkCase.add(chart);
        series.setData(benchmarkCase.data(candles));
        chart.fitContent();
        await nextFrame();
        fillRectCalls = 0;
        strokeCalls = 0;
        const started = performance.now();
        chart.fitContent();
        await nextFrame();
        const fitFrameMs = performance.now() - started;
        const fitCounts = { fillRect: fillRectCalls, stroke: strokeCalls };
        fillRectCalls = 0;
        strokeCalls = 0;
        const navigationStarted = performance.now();
        chart.pan(1);
        chart.zoom(0.99, 0.5);
        await nextFrame();
        const navigationMs = performance.now() - navigationStarted;
        const navigationCounts = { fillRect: fillRectCalls, stroke: strokeCalls };
        const sourceLength = benchmarkCase.id === "volume" || benchmarkCase.id === "histogram"
          ? chart.getSeriesInfo().find((item) => item.id === `bench-${benchmarkCase.id}`)?.dataLength ?? size
          : chart.getData().length;
        const canvasBeforeDestroy = root.querySelectorAll("canvas").length;
        chart.destroy();
        const canvasAfterDestroy = root.querySelectorAll("canvas").length;
        root.remove();
        results.push({ size, series: benchmarkCase.id, sourceLength, fitFrameMs: Number(fitFrameMs.toFixed(3)), navigationMs: Number(navigationMs.toFixed(3)), fitCounts, navigationCounts, canvasBeforeDestroy, canvasAfterDestroy });
      }
    }
    contextPrototype.fillRect = originalFillRect;
    contextPrototype.stroke = originalStroke;
    return {
      browser: navigator.userAgent,
      viewport: { width: 920, height: 560 },
      results,
      notes: [
        "Candlestick, OHLC, and hollow-candlestick dense display commands use first-open/last-close/high-low per pixel column.",
        "Heikin-Ashi is intentionally exact because its open depends on the prior derived bar.",
        "Volume and histogram points retain their own point semantics and are intentionally not passed through candle aggregation.",
        "Command counts include grid/background drawing; they are comparative observations, not universal FPS thresholds.",
      ],
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
