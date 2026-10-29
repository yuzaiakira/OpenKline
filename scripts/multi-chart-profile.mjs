import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const tracePath = process.env.OPENKLINE_MULTI_CHART_TRACE
  ?? "/tmp/openkline-phase-8-12-1-multi-chart-trace.zip";
const server = spawn(process.execPath, ["scripts/serve-example.mjs"], { stdio: "ignore" });
let browser;
let context;

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
  context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const profile = await page.evaluate(async () => {
    const module = await import("/dist/src/index.js");
    const roots = [0, 1].map(() => {
      const root = document.createElement("div");
      root.style.cssText = "display:inline-block; width: 680px; height: 420px";
      document.body.append(root);
      return root;
    });
    const charts = roots.map((root) => module.createChart(root, {
      width: 680,
      height: 420,
      interaction: { crosshair: true },
    }));
    const data = [0, 1].map((chartIndex) => Array.from({ length: 100_000 }, (_, index) => {
      const close = 100 + chartIndex * 5 + Math.sin(index / 23) * 4 + index / 100_000;
      return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_000 + index };
    }));
    charts.forEach((chart, index) => {
      const series = chart.addCandlestickSeries({ id: `profile-${index}` });
      series.setData(data[index]);
    });
    const controller = new module.ChartSynchronizationController({ crosshair: false, visibleRange: false });
    controller.addChart("first", charts[0]);
    controller.addChart("second", charts[1]);
    const sourceTimes = data[0].map((item) => item.time);
    const sample = (label, action, count = 30) => {
      for (let index = 0; index < 5; index += 1) action(index, true);
      const values = [];
      for (let index = 0; index < count; index += 1) {
        const started = performance.now();
        action(index, false);
        values.push(performance.now() - started);
      }
      const sorted = [...values].sort((left, right) => left - right);
      const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
      return {
        label,
        medianMs: Number(percentile(0.5).toFixed(3)),
        p95Ms: Number(percentile(0.95).toFixed(3)),
        worstMs: Number(Math.max(...values).toFixed(3)),
      };
    };
    const crosshairTime = (index) => sourceTimes[10_000 + index * 2_000] ?? sourceTimes[0];
    const range = (index) => ({
      from: sourceTimes[index * 1_000] ?? sourceTimes[0],
      to: sourceTimes[50_000 + index * 1_000] ?? sourceTimes.at(-1),
    });
    const reports = [];
    reports.push(sample("source-crosshair-only", (index) => charts[0].setCrosshairAtTime(crosshairTime(index))));
    reports.push(sample("target-crosshair-only", (index) => charts[1].setCrosshairAtTime(crosshairTime(index + 1))));
    controller.setCrosshairEnabled(true);
    reports.push(sample("controller-crosshair-target", (index) => controller.syncCrosshair("first", crosshairTime(index + 2))));
    reports.push(sample("linked-crosshair", (index) => charts[0].setCrosshairAtTime(crosshairTime(index + 3))));

    controller.setCrosshairEnabled(false);
    reports.push(sample("source-visible-range-only", (index) => charts[0].setVisibleTimeRange(range(index))));
    reports.push(sample("target-visible-range-only", (index) => charts[1].setVisibleTimeRange(range(index + 1))));
    controller.setVisibleRangeEnabled(true);
    reports.push(sample("controller-visible-range-target", (index) => controller.syncVisibleRange("first", range(index + 2))));
    reports.push(sample("linked-visible-range", (index) => charts[0].setVisibleTimeRange(range(index + 3))));

    controller.setCrosshairEnabled(true);
    reports.push(sample("rapid-alternating-crosshair", (index) => {
      charts[index % 2].setCrosshairAtTime(crosshairTime(index + 4));
    }));

    const final = {
      browser: navigator.userAgent,
      reports,
      memoryBeforeDestroy: performance.memory?.usedJSHeapSize ?? null,
    };
    controller.destroy();
    charts.forEach((chart) => chart.destroy());
    const remainingOwnedCanvases = roots.reduce((total, root) => total + root.querySelectorAll("canvas").length, 0);
    roots.forEach((root) => root.remove());
    globalThis.gc?.();
    return {
      ...final,
      memoryAfterDestroy: performance.memory?.usedJSHeapSize ?? null,
      remainingOwnedCanvases,
    };
  });
  console.log(JSON.stringify({ tracePath, ...profile }, null, 2));
} finally {
  await context?.tracing.stop({ path: tracePath }).catch(() => undefined);
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
