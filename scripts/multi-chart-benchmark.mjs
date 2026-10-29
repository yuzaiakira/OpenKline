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
  const scenarios = [
    { name: "single-100k", counts: [100_000] },
    { name: "dual-10k", counts: [10_000, 10_000] },
    { name: "dual-100k", counts: [100_000, 100_000] },
  ];
  const reports = [];
  for (const scenario of scenarios) {
    const report = await page.evaluate(async ({ counts, name }) => {
      const moduleUrl = "/dist/src/index.js";
      const module = await import(moduleUrl);
      const roots = counts.map(() => {
        const root = document.createElement("div");
        root.style.cssText = "display:inline-block; width: 680px; height: 420px";
        document.body.append(root);
        return root;
      });
      const charts = roots.map((root) => module.createChart(root, { width: 680, height: 420 }));
      const data = counts.map((count, chartIndex) => Array.from({ length: count }, (_, index) => {
        const close = 100 + chartIndex * 5 + Math.sin(index / 23) * 4 + index / count;
        return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + index };
      }));
      const loadStart = performance.now();
      charts.forEach((chart, index) => {
        const series = chart.addCandlestickSeries({ id: `price-${index}` });
        series.setData(data[index]);
      });
      const loadMs = performance.now() - loadStart;
      const controller = new module.ChartSynchronizationController({ crosshair: true, visibleRange: true });
      charts.forEach((chart, index) => controller.addChart(`chart-${index}`, chart));
      const percentile = (values, ratio) => {
        const sorted = [...values].sort((left, right) => left - right);
        return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
      };
      const statistics = (values) => ({
        medianMs: Number(percentile(values, 0.5).toFixed(3)),
        p95Ms: Number(percentile(values, 0.95).toFixed(3)),
      });
      // The chart schedules its render before this probe schedules its callback,
      // so one rAF measures the next visual frame without adding an artificial
      // extra frame of latency.
      const nextVisualFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const measureVisual = async (action, count = 30) => {
        for (let index = 0; index < 3; index += 1) {
          action(index, true);
          await nextVisualFrame();
        }
        const values = [];
        for (let index = 0; index < count; index += 1) {
          const started = performance.now();
          action(index, false);
          await nextVisualFrame();
          values.push(performance.now() - started);
        }
        return statistics(values);
      };
      const crosshairSamples = [];
      const rangeSamples = [];
      const visualScenarios = {};
      const first = charts[0];
      const second = charts[1];
      if (first !== undefined && second !== undefined) {
        const sourceTimes = data[0];
        for (let index = 0; index < 100; index += 1) {
          const time = sourceTimes[Math.floor(sourceTimes.length * (index + 1) / 101)]?.time ?? sourceTimes[0].time;
          const started = performance.now();
          first.setCrosshairAtTime(time);
          crosshairSamples.push(performance.now() - started);
          const rangeStarted = performance.now();
          first.setVisibleTimeRange({ from: sourceTimes[Math.max(0, index)].time, to: sourceTimes[Math.min(sourceTimes.length - 1, index + Math.floor(sourceTimes.length / 2))].time });
          rangeSamples.push(performance.now() - rangeStarted);
        }
        await nextVisualFrame();
        visualScenarios.visibleRange = await measureVisual((index) => {
          first.setVisibleTimeRange({
            from: sourceTimes[Math.min(sourceTimes.length - 1, index * 100)]?.time ?? sourceTimes[0].time,
            to: sourceTimes[Math.min(sourceTimes.length - 1, index * 100 + Math.floor(sourceTimes.length / 2))]?.time ?? sourceTimes.at(-1).time,
          });
        });
        visualScenarios.pan = await measureVisual(() => first.pan(1));
        visualScenarios.zoom = await measureVisual((index) => first.zoom(index % 2 === 0 ? 1.015 : 0.985, 0.5));
        visualScenarios.rapidAlternating = await measureVisual((index) => charts[index % 2].pan(index % 2 === 0 ? 1 : -1));
        visualScenarios.realtimeDuringNavigation = await measureVisual((index) => {
          first.pan(1);
          const previous = data[0].at(-1);
          if (previous !== undefined) {
            first.update({ ...previous, time: previous.time + (index + 1) * 60_000, close: previous.close + index / 100 });
          }
        });
      }
      const mountSamples = [];
      for (let round = 0; round < 10; round += 1) {
        const started = performance.now();
        const temporaryRoots = [0, 1].map(() => {
          const root = document.createElement("div");
          root.style.cssText = "width: 320px; height: 240px";
          document.body.append(root);
          return root;
        });
        const temporaryCharts = temporaryRoots.map((root, index) => {
          const chart = module.createChart(root, { width: 320, height: 240 });
          const series = chart.addCandlestickSeries({ id: `temporary-${round}-${index}` });
          series.setData(data[index]?.slice(0, Math.min(1_000, data[index].length)) ?? []);
          return chart;
        });
        temporaryCharts.forEach((chart) => chart.destroy());
        temporaryRoots.forEach((root) => root.remove());
        mountSamples.push(performance.now() - started);
      }
      const memoryBeforeDestroy = performance.memory?.usedJSHeapSize ?? null;
      controller.destroy();
      charts.forEach((chart) => chart.destroy());
      roots.forEach((root) => root.remove());
      globalThis.gc?.();
      return {
        name,
        browser: navigator.userAgent,
        candles: counts,
        loadMs: Number(loadMs.toFixed(3)),
        crosshair: statistics(crosshairSamples),
        visibleRangeState: statistics(rangeSamples),
        visualScenarios,
        mountMedianMs: Number(percentile(mountSamples, 0.5).toFixed(3)),
        mountP95Ms: Number(percentile(mountSamples, 0.95).toFixed(3)),
        heapBeforeDestroy: memoryBeforeDestroy,
        heapAfterDestroy: performance.memory?.usedJSHeapSize ?? null,
        remainingOwnedCanvases: roots.reduce((total, root) => total + root.querySelectorAll("canvas").length, 0),
      };
    }, scenario);
    reports.push(report);
    console.log(JSON.stringify({ multiChartProgress: report }));
  }
  console.log(JSON.stringify({ browser: reports[0]?.browser ?? "unknown", reports }, null, 2));
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
