#!/usr/bin/env node
/**
 * Phase 8.10 browser stress: chart interaction, setDatafeed lifecycle, memory samples.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { resolveProfile } from "./phase-8-10/profiles.mjs";

const profile = resolveProfile();
const server = spawn(process.execPath, ["scripts/serve-example.mjs"], { stdio: "ignore" });
let browser;

const managedChromium = chromium.executablePath();
const executablePath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  (existsSync(managedChromium) ? managedChromium : undefined) ??
  (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : managedChromium);

try {
  await waitForServer("http://127.0.0.1:4173/dist/src/index.js");
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({ viewport: { width: 1_200, height: 720 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // Isolated blank document — avoid the vanilla example's pre-mounted chart canvas.
  await page.goto("http://127.0.0.1:4173/examples/vanilla/offline-data.html");
  await page.setContent(`<!doctype html><html><body></body></html>`, { waitUntil: "domcontentloaded" });

  const report = await page.evaluate(async ({ profile }) => {
    const moduleUrl = new URL("/dist/src/index.js", location.href).href;
    const {
      createChart,
      InMemoryDatafeed,
    } = await import(moduleUrl);

    const mulberry = (seed) => {
      let state = seed >>> 0;
      return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    const rand = mulberry(profile.seed);
    const int = (max) => Math.floor(rand() * max);

    const makeCandles = (count, start = Date.UTC(2026, 0, 1), base = 100) =>
      Array.from({ length: count }, (_, index) => {
        const close = base + Math.sin(index / 17) * 4 + index / Math.max(1, count / 20);
        return {
          time: start + index * 60_000,
          open: close - 0.5,
          high: close + 1,
          low: close - 1,
          close,
          volume: 1_000 + index,
        };
      });

    const samples = [];
    const sample = (label, extra = {}) => {
      globalThis.gc?.();
      samples.push({
        label,
        at: performance.now(),
        heap: performance.memory?.usedJSHeapSize ?? null,
        canvases: document.querySelectorAll("canvas").length,
        ...extra,
      });
    };

    const host = document.createElement("div");
    host.style.width = "1100px";
    host.style.height = "600px";
    document.body.appendChild(host);

    let chart = createChart(host, { autoSize: false, width: 1100, height: 600, theme: "dark" });
    const interactionLatencies = [];
    const setDatafeedLatencies = [];
    let orphanFailures = 0;
    let workerOrphans = 0;

    for (const size of profile.candleBases) {
      sample(`before-load-${size}`);
      const history = makeCandles(size);
      const loadStart = performance.now();
      chart.setData(history);
      const loadMs = performance.now() - loadStart;

      for (let round = 0; round < profile.browserInteractionRounds; round += 1) {
        const t0 = performance.now();
        chart.zoom(0.92 + rand() * 0.1, 0.4 + rand() * 0.2);
        chart.pan(int(8) - 3);
        chart.resize(1_000 + int(120), 520 + int(80));
        if (round % 3 === 0) chart.setOptions({ theme: round % 6 === 0 ? "light" : "dark" });
        if (round % 4 === 0) chart.setPriceScaleOptions({ mode: round % 8 === 0 ? "logarithmic" : "linear" });
        const sma = chart.addIndicator("SMA", { id: `stress-sma-${size}-${round}`, period: 8 + int(12) });
        const first = history[Math.floor(history.length * 0.2)];
        const mid = history[Math.floor(history.length * 0.5)];
        const drawing = chart.addDrawing("trend-line", {
          points: [
            { time: first.time, price: first.low },
            { time: mid.time, price: mid.high },
          ],
          style: { color: "#f59e0b", lineWidth: 1 },
        });
        const workspace = chart.serializeWorkspace();
        chart.restoreWorkspace(workspace);
        drawing.remove();
        sma.remove();
        interactionLatencies.push(performance.now() - t0);
      }

      // setDatafeed lifecycle pressure — the Phase 8.9 P0 surface.
      for (let round = 0; round < profile.browserSetDatafeedRounds; round += 1) {
        const t0 = performance.now();
        chart.addIndicator("SMA", { id: `pre-switch-${round}`, period: 10 });
        chart.addIndicator("RSI", { id: `pre-rsi-${round}`, period: 14 });
        let workerId = null;
        try {
          const api = await chart.addScriptIndicatorAsync([
            'indicator("Stress", overlay=True)',
            "value = ta.ema(close, 5)",
            'plot(value, title="EMA")',
          ].join("\n"), {
            id: `pre-worker-${round}`,
          });
          workerId = api.id;
        } catch {
          workerId = null;
        }
        const next = makeCandles(80 + int(40), Date.UTC(2026, 3, 1) + round * 3_600_000, 200 + round);
        const feed = new InMemoryDatafeed({ symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 }, next);
        await chart.setDatafeed(feed, {
          symbol: "BTCUSD",
          timeframe: "1m",
          from: next[0].time,
          to: next[next.length - 1].time + 60_000,
        });
        const indicators = chart.serializeWorkspace().indicators.map((item) => item.id);
        const series = chart.getSeriesIds();
        if (indicators.some((id) => String(id).startsWith("pre-"))) orphanFailures += 1;
        if (series.some((id) => String(id).startsWith("pre-"))) orphanFailures += 1;
        if (workerId !== null && (indicators.includes(workerId) || series.some((id) => String(id).startsWith(`${workerId}:`)))) {
          workerOrphans += 1;
        }
        // Re-add after switch must succeed.
        chart.addIndicator("SMA", { id: `pre-switch-${round}`, period: 10 });
        chart.addIndicator("SMA", { id: `post-${round}`, period: 5 }).remove();
        setDatafeedLatencies.push(performance.now() - t0);
      }

      // Mount/unmount cycle.
      const workspace = chart.serializeWorkspace();
      chart.destroy();
      globalThis.gc?.();
      sample(`after-destroy-${size}`, { loadMs, remainingCanvases: document.querySelectorAll("canvas").length });
      chart = createChart(host, { autoSize: false, width: 1100, height: 600, theme: "dark" });
      chart.restoreWorkspace(workspace);
      chart.setData(makeCandles(Math.min(size, 5_000)));
    }

    // React-like StrictMode double mount/unmount without React dependency.
    for (let index = 0; index < 10; index += 1) {
      const nested = document.createElement("div");
      host.appendChild(nested);
      const first = createChart(nested, { autoSize: false, width: 320, height: 180 });
      first.destroy();
      const second = createChart(nested, { autoSize: false, width: 320, height: 180 });
      second.setData(makeCandles(200));
      second.destroy();
      nested.remove();
    }
    sample("after-strict-double-mount", { remainingCanvases: document.querySelectorAll("canvas").length });

    chart.destroy();
    globalThis.gc?.();
    sample("final", { remainingCanvases: document.querySelectorAll("canvas").length });
    host.remove();

    const percentile = (values, ratio) => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1))];
    };

    return {
      browser: navigator.userAgent,
      profile,
      orphanFailures,
      workerOrphans,
      remainingCanvasCount: document.querySelectorAll("canvas").length,
      interaction: {
        rounds: interactionLatencies.length,
        medianMs: percentile(interactionLatencies, 0.5),
        p95Ms: percentile(interactionLatencies, 0.95),
        maxMs: interactionLatencies.length ? Math.max(...interactionLatencies) : 0,
      },
      setDatafeed: {
        rounds: setDatafeedLatencies.length,
        medianMs: percentile(setDatafeedLatencies, 0.5),
        p95Ms: percentile(setDatafeedLatencies, 0.95),
        maxMs: setDatafeedLatencies.length ? Math.max(...setDatafeedLatencies) : 0,
      },
      samples,
      heapDelta: samples.length >= 2 && samples[0].heap !== null && samples.at(-1).heap !== null
        ? samples.at(-1).heap - samples[0].heap
        : null,
    };
  }, { profile });

  if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join("; ")}`);
  if (report.orphanFailures > 0) throw new Error(`setDatafeed orphaned indicators/series: ${report.orphanFailures}`);
  if (report.remainingCanvasCount !== 0) throw new Error(`canvases remaining: ${report.remainingCanvasCount}`);

  mkdirSync("artifacts/phase-8-10", { recursive: true });
  const out = join("artifacts/phase-8-10", `browser-stress-${profile.name}.json`);
  const payload = { ...report, pageErrors, status: "pass" };
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify(payload, null, 2));
  console.log(`wrote ${out}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

async function waitForServer(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // starting
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
