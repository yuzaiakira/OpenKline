#!/usr/bin/env node
/**
 * Phase 14 Canvas2D benchmark. This is intentionally a real browser workload:
 * the report records the browser user agent, frame timing, visual update
 * latency, heap visibility, and post-destroy canvas count.
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
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({ viewport: { width: 1_440, height: 900 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const module = await import("/dist/src/index.js");
    const workerStats = { created: 0, terminated: 0 };
    const NativeWorker = globalThis.Worker;
    if (typeof NativeWorker === "function") {
      globalThis.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          workerStats.created += 1;
        }
        terminate() {
          workerStats.terminated += 1;
          return super.terminate();
        }
      };
    }
    const sizes = [1_000, 10_000, 100_000];
    const scenarios = ["plain", "cvd", "footprint", "depth", "combined"];
    const intervalMs = 60_000;
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.length === 0) return 0;
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    };
    const statistics = (values) => ({
      samples: values.length,
      medianMs: Number(percentile(values, 0.5).toFixed(3)),
      p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    });
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const createCandles = (size) => Array.from({ length: size }, (_, index) => {
      const close = 100 + Math.sin(index / 23) * 4 + index / size;
      return { time: Date.UTC(2026, 0, 1) + index * intervalMs, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + (index % 10_000) };
    });
    const createTrades = (size) => Array.from({ length: size }, (_, index) => ({
      id: `browser-trade-${index}`,
      instrumentId: "BROWSER-BENCH-USD",
      time: Date.UTC(2026, 0, 1) + index * intervalMs,
      price: 100 + (index % 400) * 0.5 + Math.sin(index / 17) * 0.1,
      quantity: 1 + (index % 17) / 10,
      aggressorSide: index % 2 === 0 ? "buy" : "sell",
      sideQuality: "observed",
      revision: 0,
      source: { id: "phase-14-browser-benchmark", version: "1" },
    }));
    const createDepth = (size) => Array.from({ length: size }, (_, index) => ({
      version: 1,
      id: `browser-delta-${index}`,
      instrumentId: "BROWSER-BENCH-USD",
      time: Date.UTC(2026, 0, 1) + index * intervalMs,
      sequence: index + 2,
      previousSequence: index + 1,
      quantityMode: "absolute",
      bids: [{ price: 99 - (index % 100) * 0.01, quantity: 100 + (index % 41) }],
      asks: [{ price: 101 + (index % 100) * 0.01, quantity: 90 + (index % 37) }],
      source: { id: "phase-14-browser-depth", version: "1" },
    }));
    const createSnapshot = () => ({
      version: 1,
      instrumentId: "BROWSER-BENCH-USD",
      time: Date.UTC(2026, 0, 1),
      sequence: 1,
      bids: Array.from({ length: 100 }, (_, index) => ({ price: 99 - index * 0.01, quantity: 100 + index })),
      asks: Array.from({ length: 100 }, (_, index) => ({ price: 101 + index * 0.01, quantity: 90 + index })),
      tickSize: 0.01,
      source: { id: "phase-14-browser-depth", version: "1" },
    });
    const measureVisual = async (action, count = 20) => {
      for (let index = 0; index < 2; index += 1) { action(index, true); await nextFrame(); }
      const latency = [];
      const frameIntervals = [];
      let previousFrame = null;
      for (let index = 0; index < count; index += 1) {
        const started = performance.now();
        action(index, false);
        await new Promise((resolve) => requestAnimationFrame(() => {
          const frameAt = performance.now();
          if (previousFrame !== null) frameIntervals.push(frameAt - previousFrame);
          previousFrame = frameAt;
          latency.push(frameAt - started);
          resolve();
        }));
      }
      return { latency: statistics(latency), frameInterval: statistics(frameIntervals), fps: frameIntervals.length === 0 ? null : Number((1_000 / (frameIntervals.reduce((sum, value) => sum + value, 0) / frameIntervals.length)).toFixed(2)) };
    };
    const results = [];
    for (const size of sizes) {
      const candles = createCandles(size);
      const trades = createTrades(size);
      const depth = createDepth(size);
      for (const scenario of scenarios) {
        const root = document.createElement("div");
        root.style.cssText = "width: 920px; height: 560px; position: absolute; left: -10000px; top: 0";
        document.body.append(root);
        const chart = module.createChart(root, { width: 920, height: 560, autoSize: false, timeZone: "UTC", pricePrecision: 2 });
        const workersBefore = workerStats.created - workerStats.terminated;
        const workersCreatedBefore = workerStats.created;
        const price = chart.addCandlestickSeries({ id: `benchmark-price-${size}-${scenario}` });
        price.setData(candles);
        chart.fitContent();
        const loadStarted = performance.now();
        let orderBookIngestMs = null;
        let orderBookFinalSequence = null;
        if (scenario !== "plain") chart.setMarketTrades(trades);
        if (scenario === "depth" || scenario === "combined") {
          // Ingest the complete L2 workload without asking Canvas2D to redraw
          // a heatmap for every historical delta. The display is enabled only
          // after the state machine has reached its final live state.
          chart.setDepthOptions({ visible: false, showHeatmap: false, maxLevels: 20, maxHistory: 128 });
          const snapshot = createSnapshot();
          const controller = new module.OrderBookController({ instrumentId: snapshot.instrumentId, maxDepth: 200, maxHistory: Math.min(size + 10, 100_000), source: snapshot.source });
          const orderBookStarted = performance.now();
          controller.applySnapshot(snapshot);
          for (const delta of depth) controller.applyDelta(delta);
          const finalSnapshot = controller.getSnapshot(200);
          const finalState = controller.getState(200);
          controller.dispose();
          orderBookIngestMs = performance.now() - orderBookStarted;
          orderBookFinalSequence = finalState.lastSequence;
          if (finalSnapshot === null) throw new Error(`Browser depth reconstruction returned no snapshot for ${size}`);
          chart.setOrderBookSnapshot(finalSnapshot);
          chart.setDepthOptions({ visible: true, showHeatmap: true });
        }
        if (scenario === "cvd" || scenario === "combined") chart.setCvdOptions({ visible: true, intervalMs, pane: "new", sourceCoverage: "complete" });
        if (scenario === "footprint" || scenario === "combined") chart.setFootprintOptions({ visible: true, intervalMs, tickSize: 0.5, offTickPolicy: "round", maxCells: 20_000 });
        await nextFrame();
        const loadMs = performance.now() - loadStarted;
        const visualSamples = size >= 100_000 ? 5 : 20;
        const realtimeSamples = size >= 100_000 ? 3 : 10;
        const navigation = await measureVisual((index) => {
          chart.pan(index % 2 === 0 ? 1 : -1);
          chart.zoom(index % 2 === 0 ? 1.01 : 0.99, 0.5);
        }, visualSamples);
        const realtime = await measureVisual((index) => {
          const base = trades.at(-1);
          if (base !== undefined && scenario !== "plain") {
            chart.updateMarketTrade({ ...base, id: `browser-live-${index}`, time: base.time + (index + 1) * intervalMs, revision: 0 });
            if (scenario === "depth" || scenario === "combined") {
              const liveDelta = depth.at(-1);
              if (liveDelta !== undefined) chart.applyOrderBookDelta({ ...liveDelta, id: `browser-live-depth-${index}`, sequence: size + 2 + index, previousSequence: size + 1 + index, time: liveDelta.time + (index + 1) * intervalMs });
            }
          }
          else if (candles.at(-1) !== undefined) chart.update({ ...candles.at(-1), time: candles.at(-1).time + (index + 1) * intervalMs });
        }, realtimeSamples);
        const memoryBeforeDestroy = performance.memory?.usedJSHeapSize ?? null;
        const canvasBeforeDestroy = root.querySelectorAll("canvas").length;
        const workerCountBeforeDestroy = workerStats.created - workerStats.terminated;
        chart.destroy();
        globalThis.gc?.();
        const memoryAfterDestroy = performance.memory?.usedJSHeapSize ?? null;
        const canvasAfterDestroy = root.querySelectorAll("canvas").length;
        const workerCountAfterDestroy = workerStats.created - workerStats.terminated;
        root.remove();
        results.push({ size, scenario, samples: { navigation: visualSamples, realtime: realtimeSamples }, loadMs: Number(loadMs.toFixed(3)), orderBookIngestMs: orderBookIngestMs === null ? null : Number(orderBookIngestMs.toFixed(3)), orderBookFinalSequence, navigation, realtime, heapBeforeDestroy: memoryBeforeDestroy, heapAfterDestroy: memoryAfterDestroy, canvasBeforeDestroy, canvasAfterDestroy, workerCountBeforeDestroy, workerCountAfterDestroy, workersCreated: workerStats.created - workersCreatedBefore, workersActiveAtScenarioStart: workersBefore });
      }
    }
    return {
      browser: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      results,
      notes: [
        "Real Canvas2D chart instances were used; each scenario was destroyed before the next one.",
        "FPS and heap values are browser/workload-specific and are not device compatibility claims.",
        "The depth scenarios reconstruct the complete requested delta count in an OrderBookController, attach its final snapshot to the chart, and apply live deltas during the visual phase.",
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
