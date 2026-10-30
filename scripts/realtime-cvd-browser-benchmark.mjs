#!/usr/bin/env node
/**
 * Phase 14.6 realtime CVD benchmark.
 *
 * The workload separates calculator mutation, latest-point access, chart
 * series synchronization, Canvas2D commit, and full public snapshots. It also
 * runs one historical correction so the incremental and rebuild paths are
 * visible in the same report.
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
  const page = await browser.newPage({ viewport: { width: 920, height: 560 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const module = await import("/dist/src/index.js");
    const { ChartModel } = await import("/dist/src/core/chart-model.js");
    const { CanvasRenderer } = await import("/dist/src/renderer/canvas-renderer.js");
    const sizes = { candles: 100_000, initialTrades: 100_000, appendTrades: 100, intervalMs: 60_000 };
    const start = Date.UTC(2026, 0, 1);
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.length === 0) return 0;
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    };
    const statistics = (values) => ({
      samples: values.length,
      medianMs: Number(percentile(values, 0.5).toFixed(3)),
      p95Ms: Number(percentile(values, 0.95).toFixed(3)),
      maxMs: Number(Math.max(0, ...values).toFixed(3)),
    });
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const createCandles = (count) => Array.from({ length: count }, (_, index) => {
      const close = 100 + Math.sin(index / 23) * 4 + index / count;
      return { time: start + index * sizes.intervalMs, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + (index % 10_000) };
    });
    const createTrades = (count) => Array.from({ length: count }, (_, index) => ({
      id: `phase-14-6-cvd-${index}`,
      instrumentId: "PHASE-14-6/USD",
      time: start + index * sizes.intervalMs,
      price: 100 + (index % 400) * 0.5 + Math.sin(index / 17) * 0.1,
      quantity: 1 + (index % 17) / 10,
      aggressorSide: index % 2 === 0 ? "buy" : "sell",
      sideQuality: "observed",
      revision: 0,
      source: { id: "phase-14-6-browser", version: "1" },
    }));
    const candles = createCandles(sizes.candles);
    const trades = createTrades(sizes.initialTrades);
    const appendedTrades = Array.from({ length: sizes.appendTrades }, (_, index) => ({
      ...trades.at(-1),
      id: `phase-14-6-live-${index}`,
      time: trades.at(-1).time + (index + 1) * sizes.intervalMs,
      revision: 0,
    }));

    const calculatorSamples = { update: [], latest: [], result: [] };
    const chartSamples = { updateCall: [], visualLatency: [], renderer: [], modelUpdate: [], modelSetData: [], calculate: [] };
    const counters = { incrementalRefresh: 0, fullRefresh: 0, calculateCvd: 0, updateSeries: 0, setSeriesData: 0, rendererFrames: 0 };
    const wrapMeasured = (prototype, name, samples, counterName) => {
      const original = prototype[name];
      if (typeof original !== "function") throw new Error(`Benchmark method is unavailable: ${name}`);
      prototype[name] = function(...args) {
        const started = performance.now();
        try {
          return original.apply(this, args);
        } finally {
          samples.push(performance.now() - started);
          if (counterName !== undefined) counters[counterName] += 1;
        }
      };
    };
    const wrapCounted = (prototype, name, counterName) => {
      const original = prototype[name];
      if (typeof original !== "function") throw new Error(`Benchmark method is unavailable: ${name}`);
      prototype[name] = function(...args) {
        counters[counterName] += 1;
        return original.apply(this, args);
      };
    };

    wrapMeasured(module.CumulativeVolumeDeltaCalculator.prototype, "update", calculatorSamples.update);
    wrapMeasured(module.CumulativeVolumeDeltaCalculator.prototype, "getLatestObservation", calculatorSamples.latest);
    wrapMeasured(module.CumulativeVolumeDeltaCalculator.prototype, "getResult", calculatorSamples.result);
    wrapMeasured(ChartModel.prototype, "updateSeries", chartSamples.modelUpdate, "updateSeries");
    wrapMeasured(ChartModel.prototype, "setSeriesData", chartSamples.modelSetData, "setSeriesData");
    wrapMeasured(CanvasRenderer.prototype, "render", chartSamples.renderer, "rendererFrames");
    wrapCounted(module.Chart.prototype, "refreshCvdSeriesIncremental", "incrementalRefresh");
    wrapCounted(module.Chart.prototype, "refreshCvdSeries", "fullRefresh");
    wrapMeasured(module.Chart.prototype, "calculateCvdResult", chartSamples.calculate, "calculateCvd");

    const liveOptions = { from: start, to: Number.MAX_SAFE_INTEGER, intervalMs: sizes.intervalMs, sourceCoverage: "complete" };
    const calculator = new module.CumulativeVolumeDeltaCalculator(liveOptions, trades);
    calculator.getResult();
    for (const trade of appendedTrades) {
      calculator.update(trade);
      calculator.getLatestObservation();
    }
    const calculatorAppendUpdateSamples = [...calculatorSamples.update];
    const calculatorLatestSamples = [...calculatorSamples.latest];
    const calculatorFullSnapshotSamples = [];
    for (let index = 0; index < 5; index += 1) {
      const snapshotStarted = performance.now();
      calculator.getResult();
      calculatorFullSnapshotSamples.push(performance.now() - snapshotStarted);
    }

    const root = document.createElement("div");
    root.style.cssText = "width: 920px; height: 560px; position: absolute; left: -10000px; top: 0";
    document.body.append(root);
    const chart = module.createChart(root, { width: 920, height: 560, autoSize: false, timeZone: "UTC", pricePrecision: 2 });
    const price = chart.addCandlestickSeries({ id: "phase-14-6-price" });
    price.setData(candles);
    chart.fitContent();
    chart.setMarketTrades(trades);
    chart.setCvdOptions({ visible: true, intervalMs: sizes.intervalMs, pane: "new", sourceCoverage: "complete" });
    await nextFrame();
    calculatorSamples.update.length = 0;
    calculatorSamples.latest.length = 0;
    calculatorSamples.result.length = 0;
    chartSamples.updateCall.length = 0;
    chartSamples.visualLatency.length = 0;
    chartSamples.renderer.length = 0;
    chartSamples.modelUpdate.length = 0;
    chartSamples.modelSetData.length = 0;
    chartSamples.calculate.length = 0;
    counters.incrementalRefresh = 0;
    counters.fullRefresh = 0;
    counters.calculateCvd = 0;
    counters.updateSeries = 0;
    counters.setSeriesData = 0;
    counters.rendererFrames = 0;

    for (const trade of appendedTrades) {
      const started = performance.now();
      chart.updateMarketTrade(trade);
      chartSamples.updateCall.push(performance.now() - started);
      await new Promise((resolve) => requestAnimationFrame(() => {
        chartSamples.visualLatency.push(performance.now() - started);
        resolve();
      }));
    }

    const correctionBase = trades[Math.floor(trades.length / 2)];
    const correction = { ...correctionBase, quantity: correctionBase.quantity + 2, aggressorSide: "sell", revision: 1 };
    const correctionStarted = performance.now();
    chart.updateMarketTrade(correction);
    const correctionCallMs = performance.now() - correctionStarted;
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const correctionVisualMs = performance.now() - correctionStarted;
    const allTrades = chart.getMarketTrades();
    const rangeFrom = Math.min(candles[0].time, allTrades[0].time);
    const rangeTo = Math.max(candles.at(-1).time, allTrades.at(-1).time) + 1;
    const expectedAfterCorrection = module.calculateCumulativeVolumeDelta(allTrades, {
      from: rangeFrom,
      to: rangeTo,
      intervalMs: sizes.intervalMs,
      sourceCoverage: "complete",
    });
    const actualAfterCorrection = chart.getCvdResult();
    const chartFullSnapshotSamples = [];
    for (let index = 0; index < 5; index += 1) {
      const snapshotStarted = performance.now();
      chart.getCvdResult();
      chartFullSnapshotSamples.push(performance.now() - snapshotStarted);
    }
    const memoryBeforeDestroy = performance.memory?.usedJSHeapSize ?? null;
    const canvasBeforeDestroy = root.querySelectorAll("canvas").length;
    chart.destroy();
    calculator.dispose();
    globalThis.gc?.();
    const memoryAfterDestroy = performance.memory?.usedJSHeapSize ?? null;
    const canvasAfterDestroy = root.querySelectorAll("canvas").length;
    root.remove();
    return {
      browser: navigator.userAgent,
      devicePixelRatio: window.devicePixelRatio,
      workload: sizes,
      calculator: {
        update: statistics(calculatorAppendUpdateSamples),
        latestObservation: statistics(calculatorLatestSamples),
        fullResultSnapshot: statistics(calculatorFullSnapshotSamples),
      },
      chart: {
        updateCall: statistics(chartSamples.updateCall),
        eventToVisualFrame: statistics(chartSamples.visualLatency),
        rendererCommit: statistics(chartSamples.renderer),
        modelUpdateSeries: statistics(chartSamples.modelUpdate),
        modelSetSeriesData: statistics(chartSamples.modelSetData),
        calculateCvd: statistics(chartSamples.calculate),
        counters: { ...counters },
      },
      fullPublicSnapshot: statistics(chartFullSnapshotSamples),
      correction: {
        callMs: Number(correctionCallMs.toFixed(3)),
        eventToVisualFrameMs: Number(correctionVisualMs.toFixed(3)),
        fullRefresh: counters.fullRefresh,
        setSeriesData: counters.setSeriesData,
        parity: JSON.stringify(actualAfterCorrection) === JSON.stringify(expectedAfterCorrection),
      },
      cleanup: {
        heapBeforeDestroy: memoryBeforeDestroy,
        heapAfterDestroy: memoryAfterDestroy,
        canvasBeforeDestroy,
        canvasAfterDestroy,
      },
      notes: [
        "Calculator measurements use one 100,000-trade open-frontier instance and 100 strictly chronological appends.",
        "Chart append measurements reset counters after the initial full CVD load; the correction is historical and uses the deterministic rebuild path.",
        "Canvas2D and heap values are local system-Chromium observations, not cross-device guarantees.",
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
