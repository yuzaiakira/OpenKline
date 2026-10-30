#!/usr/bin/env node
/** Measure the real Chart-owned session analytics update path in Chromium. */
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
  const page = await browser.newPage({ viewport: { width: 1_200, height: 640 } });
  await page.goto("http://127.0.0.1:4173/examples/vanilla/index.html");
  const report = await page.evaluate(async () => {
    const { TradingCalendarEngine, createChart } = await import("/dist/src/index.js");
    const percentile = (values, ratio) => {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.length === 0) return 0;
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
    };
    const statistics = (values) => ({
      medianMs: Number(percentile(values, 0.5).toFixed(3)),
      p95Ms: Number(percentile(values, 0.95).toFixed(3)),
      samples: values.length,
    });
    const calendar = new TradingCalendarEngine({
      id: "session-browser-benchmark",
      version: "1",
      timeZone: "America/New_York",
      weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:30", end: "12:00" }, { start: "13:00", end: "16:00" }] })),
      exceptions: [{ date: "2024-07-04", kind: "closed", label: "benchmark holiday" }],
    });
    const minute = 60_000;
    const size = 100_000;
    const slots = [];
    for (const session of calendar.enumerateSessions(Date.UTC(2024, 0, 1), Date.UTC(2026, 0, 1), { maxSessions: 2_000 })) {
      for (const segment of session.segments) {
        for (let timestamp = segment.start; timestamp + minute <= segment.end && slots.length < size; timestamp += minute) slots.push(timestamp);
      }
      if (slots.length >= size) break;
    }
    const candles = slots.map((time, index) => {
      const close = 100 + Math.sin(index / 31) * 3 + index * 0.0005;
      const open = close - Math.cos(index / 17) * 0.35;
      return { time, open, high: Math.max(open, close) + 0.7, low: Math.min(open, close) - 0.7, close, volume: 500 + (index % 97) * 2 };
    });
    const host = document.createElement("div");
    host.style.cssText = "width: 1200px; height: 640px";
    document.body.append(host);
    const chart = createChart(host, { autoSize: false, width: 1200, height: 640, timeZone: "America/New_York" });
    const loadStart = performance.now();
    chart.setData(candles);
    const loadMs = performance.now() - loadStart;
    const indicator = chart.addSessionIndicator({
      id: "browser-benchmark-sma",
      indicatorId: "SMA",
      sourceTimeframe: "1m",
      targetPeriod: "session",
      calendar,
      parameters: { period: 5 },
    });
    const reference = chart.addSessionReference({
      id: "browser-benchmark-reference",
      sourceTimeframe: "1m",
      targetPeriod: "session",
      calendar,
    });
    const last = candles.at(-1);
    if (last === undefined) throw new Error("Benchmark fixture is empty");
    const updateOnlySamples = [];
    let nextTime = last.time;
    for (let index = 0; index < 50; index += 1) {
      nextTime += minute;
      const close = last.close + index / 100;
      const started = performance.now();
      chart.update({ ...last, time: nextTime, close, open: close - 0.2, high: close + 0.4, low: close - 0.4 });
      updateOnlySamples.push(performance.now() - started);
    }
    const querySamples = [];
    for (let index = 0; index < 5; index += 1) {
      nextTime += minute;
      const close = last.close + index / 100;
      const started = performance.now();
      chart.update({ ...last, time: nextTime, close, open: close - 0.2, high: close + 0.4, low: close - 0.4 });
      indicator.getResult();
      reference.getResult();
      querySamples.push(performance.now() - started);
    }
    nextTime += minute;
    const pendingClose = last.close + 0.75;
    chart.update({ ...last, time: nextTime, close: pendingClose, open: pendingClose - 0.2, high: pendingClose + 0.4, low: pendingClose - 0.4 });
    const fullStart = performance.now();
    const snapshot = indicator.getResult();
    const referenceSnapshot = reference.getResult();
    const fullSnapshotMs = performance.now() - fullStart;
    const memoryBeforeDestroy = performance.memory?.usedJSHeapSize ?? null;
    globalThis.gc?.();
    chart.destroy();
    host.remove();
    globalThis.gc?.();
    return {
      browser: navigator.userAgent,
      candles: size,
      generatedSlots: slots.length,
      loadMs: Number(loadMs.toFixed(3)),
      updateOnly: statistics(updateOnlySamples),
      updatePlusLatestQuery: statistics(querySamples),
      updatePlusFullSnapshot: { medianMs: Number(fullSnapshotMs.toFixed(3)), samples: 1 },
      indicatorObservations: snapshot.observations.length,
      indicatorOutputs: snapshot.outputs.length,
      referencePoints: referenceSnapshot.points.length,
      memoryBeforeDestroy,
      memoryAfterDestroy: performance.memory?.usedJSHeapSize ?? null,
      remainingCanvasCount: document.querySelectorAll("canvas").length,
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
