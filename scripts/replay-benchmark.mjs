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
    const { compileKlineScript, createChart } = await import("/dist/src/index.js");
    const median = (values) => percentile(values, 0.5);
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.length === 0) return 0;
      const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
      return sorted[index] ?? 0;
    };
    const sizes = [1_000, 10_000, 100_000];
    const scenarios = ["one-indicator", "multiple-indicators", "klinescript"];
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

      for (const scenario of scenarios) {
        const container = document.createElement("div");
        container.style.width = "1200px";
        container.style.height = "520px";
        document.body.append(container);
        const chart = createChart(container, { theme: "dark", width: 1_200, height: 520, timeZone: "UTC" });
        const price = chart.addCandlestickSeries({ id: "price" });
        const trend = chart.addLineSeries({ id: "trend" });
        const volume = chart.addVolumeSeries({ id: "volume" });
        price.setData(candles);
        trend.setData(candles.map((candle) => ({ time: candle.time, value: candle.close })));
        volume.setData(candles.map((candle) => ({ time: candle.time, value: candle.volume ?? 0 })));
        if (scenario === "one-indicator") {
          chart.addIndicator("EMA", { id: "ema", parameters: { period: 14 }, pane: "main" });
        } else if (scenario === "multiple-indicators") {
          chart.addIndicator("EMA", { id: "ema", parameters: { period: 14 }, pane: "main" });
          chart.addIndicator("RSI", { id: "rsi", parameters: { period: 14 }, pane: "new" });
          chart.addIndicator("BOLLINGER_BANDS", { id: "bands", parameters: { period: 20, standardDeviations: 2 }, pane: "main" });
        } else {
          const compiled = compileKlineScript([
            'indicator("Replay EMA")',
            'value = ta.ema(close, 14)',
            'plot(value, title="Replay EMA")',
          ].join("\n"));
          if (!compiled.success) throw new Error("Replay benchmark KlineScript failed to compile");
          chart.addScriptIndicator(compiled.program, { id: "script", pane: "main" });
        }

        const startIndex = Math.floor(size * 0.4);
        const stepSamples = [];
        const seekSamples = [];
        const replay = chart.createReplay({ source: candles, startAt: candles[startIndex].time, speed: 100 });
        const startAt = performance.now();
        replay.start();
        const startMs = performance.now() - startAt;
        for (let index = 0; index < 10; index += 1) {
          const sampleStart = performance.now();
          replay.stepForward();
          stepSamples.push(performance.now() - sampleStart);
        }
        for (const target of [Math.floor(size * 0.7), Math.floor(size * 0.2), Math.floor(size * 0.8), startIndex]) {
          const sampleStart = performance.now();
          replay.seekToBar(target);
          seekSamples.push(performance.now() - sampleStart);
        }
        replay.stepBackward();
        const playbackStart = performance.now();
        replay.play();
        await new Promise((resolve) => window.setTimeout(resolve, 35));
        replay.pause();
        const playbackMs = performance.now() - playbackStart;
        const exitStart = performance.now();
        replay.exit();
        const exitMs = performance.now() - exitStart;
        const restoredLength = chart.getData().length;
        replay.dispose();
        const beforeDestroyHeap = performance.memory?.usedJSHeapSize ?? null;
        const canvasBeforeDestroy = container.querySelectorAll("canvas").length;
        const destroyStart = performance.now();
        chart.destroy();
        const destroyMs = performance.now() - destroyStart;
        globalThis.gc?.();
        results.push({
          candles: size,
          scenario,
          startMs: Number(startMs.toFixed(3)),
          stepMedianMs: Number(median(stepSamples).toFixed(3)),
          stepP95Ms: Number(percentile(stepSamples, 0.95).toFixed(3)),
          seekMedianMs: Number(median(seekSamples).toFixed(3)),
          seekP95Ms: Number(percentile(seekSamples, 0.95).toFixed(3)),
          playbackMs: Number(playbackMs.toFixed(3)),
          exitMs: Number(exitMs.toFixed(3)),
          destroyMs: Number(destroyMs.toFixed(3)),
          restoredLength,
          canvasBeforeDestroy,
          canvasAfterDestroy: container.querySelectorAll("canvas").length,
          heapBeforeDestroy: beforeDestroyHeap,
        });
        container.remove();
      }
      globalThis.gc?.();
    }
    return { browser: navigator.userAgent, results };
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
