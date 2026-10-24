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
    const chart = globalThis.__openklineChart;
    const candles = Array.from({ length: 100_000 }, (_, index) => {
      const close = 100 + Math.sin(index / 23) * 4 + index / 100_000;
      return {
        time: Date.UTC(2026, 0, 1) + index * 60_000,
        open: close - 0.5,
        high: close + 1,
        low: close - 1,
        close,
        volume: 1_000 + index,
      };
    });
    chart.setData(candles);
    const totals = { visibleData: 0, renderer: 0, drawings: 0, updateSeries: 0, collectionUpdate: 0, storeUpdate: 0, timeCount: 0, getTimes: 0, invalidate: 0, indicators: 0 };
    const counts = { visibleData: 0, renderer: 0, drawings: 0, updateSeries: 0, collectionUpdate: 0, storeUpdate: 0, timeCount: 0, getTimes: 0, invalidate: 0, indicators: 0 };
    const timed = (name, original) => function (...args) {
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        totals[name] += performance.now() - start;
        counts[name] += 1;
      }
    };
    const model = chart.model;
    model.getVisibleData = timed("visibleData", model.getVisibleData);
    model.updateSeries = timed("updateSeries", model.updateSeries);
    model.collection.update = timed("collectionUpdate", model.collection.update);
    model.collection.getTimePointCount = timed("timeCount", model.collection.getTimePointCount);
    model.collection.getTimePoints = timed("getTimes", model.collection.getTimePoints);
    model.collection.invalidateTimes = timed("invalidate", model.collection.invalidateTimes);
    for (const series of model.collection.series.values()) {
      series.store.update = timed("storeUpdate", series.store.update);
    }
    chart.renderer.render = timed("renderer", chart.renderer.render);
    chart.drawingEngine.getRenderItems = timed("drawings", chart.drawingEngine.getRenderItems);
    for (const state of chart.indicators.values()) {
      state.instance.update = timed("indicators", state.instance.update);
    }

    let time = candles[candles.length - 1].time;
    for (let index = 0; index < 30; index += 1) {
      time += 60_000;
      chart.update({ ...candles[candles.length - 1], time, close: candles[candles.length - 1].close + index / 1_000 });
    }
    chart.destroy();
    return { totals, counts };
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
