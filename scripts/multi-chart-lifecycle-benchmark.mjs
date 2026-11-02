/**
 * Phase 16.5.3 core Chart multi-panel lifecycle benchmark (1 / 2 / 4 panels).
 *
 * Extends the vanilla multi-chart harness with equal-workload scaling,
 * workspace serialize/restore timing, sync fan-out cost, and dispose cycles.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import { chromium } from "@playwright/test";

const barCount = Number(process.env.OPENKLINE_MULTI_CHART_BARS ?? 10_000);
const drawingCount = Number(process.env.OPENKLINE_MULTI_CHART_DRAWINGS ?? 8);
const iterations = Number(process.env.OPENKLINE_MULTI_CHART_ITERS ?? 40);
const disposeCycles = Number(process.env.OPENKLINE_MULTI_CHART_DISPOSE_CYCLES ?? 10);
const panelCounts = [1, 2, 4];

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

  const reports = [];
  for (const panelCount of panelCounts) {
    const report = await page.evaluate(async ({ panelCount: count, barCount: bars, drawingCount: drawings, iterations: samples, disposeCycles: cycles }) => {
      const module = await import("/dist/src/index.js");
      const percentile = (values, ratio) => {
        const sorted = [...values].sort((left, right) => left - right);
        return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
      };
      const statistics = (values) => ({
        sampleCount: values.length,
        minMs: Number((Math.min(...values)).toFixed(3)),
        maxMs: Number((Math.max(...values)).toFixed(3)),
        medianMs: Number(percentile(values, 0.5).toFixed(3)),
        p95Ms: Number(percentile(values, 0.95).toFixed(3)),
      });
      const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const buildCandles = (chartIndex) => Array.from({ length: bars }, (_, index) => {
        const close = 100 + chartIndex * 5 + Math.sin(index / 23) * 4 + index / bars;
        return {
          time: Date.UTC(2026, 0, 1) + index * 60_000,
          open: close - 0.5,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1_000 + index,
        };
      });

      const roots = Array.from({ length: count }, () => {
        const root = document.createElement("div");
        root.style.cssText = "display:inline-block;width:680px;height:420px";
        document.body.append(root);
        return root;
      });
      const loadStarted = performance.now();
      const charts = roots.map((root, index) => {
        const chart = module.createChart(root, { width: 680, height: 420 });
        const series = chart.addCandlestickSeries({ id: `price-${index}` });
        const candles = buildCandles(index);
        series.setData(candles);
        for (let drawingIndex = 0; drawingIndex < drawings; drawingIndex += 1) {
          const candle = candles[Math.floor((drawingIndex + 1) * candles.length / (drawings + 1))];
          chart.addDrawing("horizontal-line", {
            id: `hl-${index}-${drawingIndex}`,
            points: [{ time: candle.time, price: candle.close }],
            style: { color: "#ef4444", lineWidth: 1, locked: false, visible: true },
          });
        }
        return { chart, candles };
      });
      await nextFrame();
      const loadMs = performance.now() - loadStarted;

      const controller = new module.ChartSynchronizationController({ crosshair: true, visibleRange: true });
      charts.forEach(({ chart }, index) => controller.addChart(`chart-${index}`, chart));

      const crosshairSamples = [];
      const rangeSamples = [];
      const serializeSamples = [];
      const restoreSamples = [];
      const first = charts[0];
      for (let index = 0; index < samples; index += 1) {
        const candle = first.candles[Math.floor(first.candles.length * ((index + 1) / (samples + 1)))];
        const crosshairStarted = performance.now();
        first.chart.setCrosshairAtTime(candle.time);
        crosshairSamples.push(performance.now() - crosshairStarted);
        const from = first.candles[Math.max(0, index)].time;
        const to = first.candles[Math.min(first.candles.length - 1, index + Math.floor(first.candles.length / 3))].time;
        const rangeStarted = performance.now();
        first.chart.setVisibleTimeRange({ from, to });
        rangeSamples.push(performance.now() - rangeStarted);
      }
      await nextFrame();

      for (let index = 0; index < Math.min(20, samples); index += 1) {
        const serializeStarted = performance.now();
        const documents = charts.map(({ chart }) => chart.serializeWorkspace());
        serializeSamples.push(performance.now() - serializeStarted);
        const restoreStarted = performance.now();
        charts.forEach(({ chart }, chartIndex) => chart.restoreWorkspace(documents[chartIndex]));
        restoreSamples.push(performance.now() - restoreStarted);
      }
      await nextFrame();

      const heapBeforeDispose = performance.memory?.usedJSHeapSize ?? null;
      const registrationBefore = controller.getChartIds().length;
      controller.destroy();
      charts.forEach(({ chart }) => chart.destroy());
      roots.forEach((root) => root.remove());
      globalThis.gc?.();
      const heapAfterDispose = performance.memory?.usedJSHeapSize ?? null;

      const mountSamples = [];
      let leakedRegistrations = 0;
      for (let cycle = 0; cycle < cycles; cycle += 1) {
        const started = performance.now();
        const temporaryRoots = Array.from({ length: count }, () => {
          const root = document.createElement("div");
          root.style.cssText = "width:320px;height:240px";
          document.body.append(root);
          return root;
        });
        const temporaryController = new module.ChartSynchronizationController({ crosshair: true, visibleRange: true });
        const temporaryCharts = temporaryRoots.map((root, index) => {
          const chart = module.createChart(root, { width: 320, height: 240 });
          chart.addCandlestickSeries({ id: `tmp-${cycle}-${index}` }).setData(buildCandles(index).slice(0, Math.min(1_000, bars)));
          temporaryController.addChart(`tmp-${index}`, chart);
          return chart;
        });
        temporaryCharts[0]?.setCrosshairAtTime(buildCandles(0)[10]?.time ?? null);
        temporaryController.destroy();
        temporaryCharts.forEach((chart) => chart.destroy());
        temporaryRoots.forEach((root) => root.remove());
        if (temporaryController.getChartIds().length !== 0) leakedRegistrations += 1;
        mountSamples.push(performance.now() - started);
      }
      globalThis.gc?.();

      return {
        panelCount: count,
        barsPerPanel: bars,
        drawingsPerPanel: drawings,
        loadMs: Number(loadMs.toFixed(3)),
        registrationBeforeDestroy: registrationBefore,
        crosshair: statistics(crosshairSamples),
        visibleRange: statistics(rangeSamples),
        serializeWorkspace: statistics(serializeSamples),
        restoreWorkspace: statistics(restoreSamples),
        disposeCycle: statistics(mountSamples),
        leakedRegistrationCycles: leakedRegistrations,
        heapBeforeDispose,
        heapAfterDispose,
        remainingOwnedCanvases: roots.reduce((total, root) => total + root.querySelectorAll("canvas").length, 0),
      };
    }, { panelCount, barCount, drawingCount, iterations, disposeCycles });
    reports.push(report);
    console.log(JSON.stringify({ multiChartLifecycleProgress: report }));
  }

  console.log(JSON.stringify({
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpuModel: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemMb: Number((totalmem() / 1_048_576).toFixed(1)),
      freeMemMb: Number((freemem() / 1_048_576).toFixed(1)),
      browser: await page.evaluate(() => navigator.userAgent),
      buildMode: "dist ESM via serve-example",
      warmUpPolicy: "none beyond first visual frame after load",
      gcPolicy: "optional globalThis.gc after dispose when exposed",
      timingMethod: "performance.now()",
      barCount,
      drawingCount,
      iterations,
      disposeCycles,
    },
    reports,
  }, null, 2));
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
