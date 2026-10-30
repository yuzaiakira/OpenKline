import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";

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
  const page = await browser.newPage({ viewport: { width: 1_200, height: 520 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const example = globalThis.__openklineChart;
    example?.destroy();
    const { createChart } = await import("/dist/src/index.js");
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.length === 0) return 0;
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1))] ?? 0;
    };
    const sizes = [1_000, 10_000, 100_000];
    const scenarios = [
      { id: "plain", mode: null },
      { id: "raw-with-actions", mode: "raw" },
      { id: "split-adjusted", mode: "split-adjusted" },
    ];
    const results = [];
    for (const size of sizes) {
      const candles = Array.from({ length: size }, (_, index) => {
        const close = 100 + Math.sin(index / 23) * 4 + index / size;
        return {
          time: Date.UTC(2026, 0, 1) + index * 60_000,
          open: close - 0.5,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1_000 + index,
        };
      });
      const actionTime = candles[Math.floor(size * 0.6)]?.time;
      const dataset = {
        version: 1,
        instrumentId: "BENCHMARK",
        source: { id: "corporate-actions-chart-benchmark", version: "1" },
        knowledgeCoverage: "known",
        actions: [{
          id: "benchmark-split",
          instrumentId: "BENCHMARK",
          kind: "stock-split",
          effectiveTime: actionTime,
          revision: 1,
          source: { id: "corporate-actions-chart-benchmark", version: "1" },
          newShares: 2,
          oldShares: 1,
        }],
      };
      for (const scenario of scenarios) {
        const host = document.createElement("div");
        host.style.width = "1200px";
        host.style.height = "520px";
        document.body.append(host);
        const chart = createChart(host, { autoSize: false, width: 1200, height: 520 });
        const series = chart.addCandlestickSeries({ id: `benchmark-${scenario.id}` });
        const loadStart = performance.now();
        series.setData(candles);
        if (scenario.mode !== null) chart.setCorporateActions(dataset, { mode: scenario.mode });
        const loadMs = performance.now() - loadStart;
        let nextTime = candles.at(-1).time;
        const last = candles.at(-1);
        const appendSamples = [];
        for (let index = 0; index < (scenario.mode === "split-adjusted" ? 12 : 30); index += 1) {
          nextTime += 60_000;
          const start = performance.now();
          series.update({ ...last, time: nextTime, close: last.close + index / 1000 });
          appendSamples.push(performance.now() - start);
        }
        const correctionSamples = [];
        for (let index = 0; index < 8; index += 1) {
          const start = performance.now();
          series.update({ ...last, time: nextTime, close: last.close + index / 10000 });
          correctionSamples.push(performance.now() - start);
        }
        const displayed = chart.getDisplayedData();
        chart.destroy();
        host.remove();
        results.push({
          candles: size,
          scenario: scenario.id,
          loadMs: Number(loadMs.toFixed(3)),
          appendMedianMs: Number(percentile(appendSamples, 0.5).toFixed(3)),
          appendP95Ms: Number(percentile(appendSamples, 0.95).toFixed(3)),
          correctionMedianMs: Number(percentile(correctionSamples, 0.5).toFixed(3)),
          correctionP95Ms: Number(percentile(correctionSamples, 0.95).toFixed(3)),
          displayedCandles: displayed.length,
          lastDisplayedTime: displayed.at(-1)?.time ?? null,
        });
      }
    }
    globalThis.gc?.();
    return {
      browser: navigator.userAgent,
      results,
      remainingCanvasCount: document.querySelectorAll("canvas").length,
      heapUsedBytes: performance.memory?.usedJSHeapSize ?? null,
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
