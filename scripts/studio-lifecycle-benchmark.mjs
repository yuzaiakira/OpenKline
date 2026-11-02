/**
 * Phase 16.5.3 Studio multi-chart lifecycle & restore benchmark.
 *
 * Measures supported Studio layouts (1 / 2 / 4 panels), layout cycling,
 * workspace save/restore readiness, and Chromium heap trend observations.
 * Uses a production Next server (same pattern as playwright.react.config.ts)
 * so HMR compile races are not measured as product latency.
 *
 * Results are observational baselines — not CI timing gates.
 */
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const port = 4176;
const baseURL = `http://127.0.0.1:${port}`;
const projectDirectory = fileURLToPath(new URL("../examples/nextjs-app-router/", import.meta.url));
const npmBinary = process.env.npm_node_execpath ? "npm" : "npm";
const layoutCycles = Number(process.env.OPENKLINE_STUDIO_LIFECYCLE_CYCLES ?? 6);
const restoreIterations = Number(process.env.OPENKLINE_STUDIO_RESTORE_ITERS ?? 5);

const build = spawn(npmBinary, ["run", "build"], {
  cwd: projectDirectory,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OPENKLINE_NEXT_DIST: ".next-lifecycle-bench" },
});
const buildStatus = await waitForChild(build, 180_000, "Next production build");
if (buildStatus !== 0) throw new Error(`Next production build failed with status ${buildStatus}`);

const server = spawn(npmBinary, ["run", "start", "--", "--port", String(port)], {
  cwd: projectDirectory,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OPENKLINE_NEXT_DIST: ".next-lifecycle-bench" },
});
let browser;

try {
  await waitForServer(`${baseURL}/lifecycle-verification`, 180_000);
  const managedChromium = chromium.executablePath();
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ?? (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined)
    ?? (existsSync(managedChromium) ? managedChromium : undefined);
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--js-flags=--expose-gc"],
  });
  const page = await browser.newPage({ viewport: { width: 1_440, height: 900 } });
  page.setDefaultTimeout(60_000);
  await page.goto(`${baseURL}/`);
  await page.locator("[data-panel-id]").first().waitFor();

  const environment = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemMb: Number((totalmem() / 1_048_576).toFixed(1)),
    freeMemMb: Number((freemem() / 1_048_576).toFixed(1)),
    browser: await page.evaluate(() => navigator.userAgent),
    buildMode: "next-production",
    warmUpPolicy: "one discarded layout pass before sampled transitions",
    gcPolicy: "performance.memory after optional globalThis.gc when --js-flags=--expose-gc",
    timingMethod: "performance.now()",
    layoutCycles,
    restoreIterations,
  };

  const layouts = [
    { id: "single", panels: 1 },
    { id: "two-horizontal", panels: 2 },
    { id: "four-grid", panels: 4 },
  ];

  for (const layout of layouts) {
    await page.getByLabel("Chart layout").selectOption(layout.id);
    await page.locator("[data-panel-id]").nth(layout.panels - 1).waitFor();
  }
  await page.getByLabel("Chart layout").selectOption("single");
  await page.locator('[data-panel-id="chart-1"]').waitFor();

  const layoutSamples = {};
  for (const layout of layouts) {
    const samples = [];
    for (let index = 0; index < Math.max(4, layoutCycles); index += 1) {
      await page.getByLabel("Chart layout").selectOption("single");
      await page.locator("[data-panel-id]").first().waitFor();
      const started = await page.evaluate(() => performance.now());
      await page.getByLabel("Chart layout").selectOption(layout.id);
      await page.locator("[data-panel-id]").nth(layout.panels - 1).waitFor();
      await page.locator("canvas").nth(layout.panels - 1).waitFor();
      const elapsed = await page.evaluate((mark) => Number((performance.now() - mark).toFixed(3)), started);
      samples.push(elapsed);
    }
    layoutSamples[layout.id] = {
      panelCount: layout.panels,
      samplesMs: samples,
      ...summarize(samples),
      finalVisiblePanels: await page.locator("[data-panel-id]").count(),
      finalVisibleCanvases: await page.locator("canvas").evaluateAll((nodes) => nodes.filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      }).length),
    };
  }

  await page.getByLabel("Chart layout").selectOption("four-grid");
  await page.locator("[data-panel-id]").nth(3).waitFor();
  await page.getByLabel("Sync crosshair").check();
  await page.getByLabel("Sync visible range").check();
  await page.getByLabel("Workspace name").fill("Lifecycle Bench Desk");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await page.getByText(/saved locally/).waitFor();
  const savedWorkspaceId = await page.getByLabel("Workspace", { exact: true }).inputValue();

  const saveSamples = [];
  for (let index = 0; index < restoreIterations; index += 1) {
    const started = await page.evaluate(() => performance.now());
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByText(/saved locally/).waitFor();
    saveSamples.push(await page.evaluate((mark) => Number((performance.now() - mark).toFixed(3)), started));
  }

  const restoreSamples = [];
  const heapTrend = [];
  for (let index = 0; index < restoreIterations; index += 1) {
    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await page.locator("[data-panel-id]").first().waitFor();
    await expectPanelCount(page, 1);
    const heapBefore = await readHeap(page);
    const started = await page.evaluate(() => performance.now());
    await page.getByLabel("Workspace", { exact: true }).selectOption(savedWorkspaceId);
    await page.locator("[data-panel-id]").nth(3).waitFor();
    await page.locator('[data-workspace-restore-panels="4"]').waitFor();
    const elapsed = await page.evaluate((mark) => Number((performance.now() - mark).toFixed(3)), started);
    restoreSamples.push(elapsed);
    const heapAfter = await readHeap(page);
    heapTrend.push({
      cycle: index + 1,
      heapBeforeMb: heapBefore,
      heapAfterMb: heapAfter,
      deltaMb: heapBefore === null || heapAfter === null ? null : Number((heapAfter - heapBefore).toFixed(2)),
      panelCount: await page.locator("[data-panel-id]").count(),
      canvasCount: await page.locator("canvas").count(),
    });
  }

  const disposalSamples = [];
  for (let index = 0; index < layoutCycles; index += 1) {
    const started = await page.evaluate(() => performance.now());
    await page.getByLabel("Chart layout").selectOption("four-grid");
    await page.locator("[data-panel-id]").nth(3).waitFor();
    await page.getByLabel("Chart layout").selectOption("single");
    await expectPanelCount(page, 1);
    disposalSamples.push(await page.evaluate((mark) => Number((performance.now() - mark).toFixed(3)), started));
  }

  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.getByLabel("Chart layout").selectOption("four-grid");
  await page.locator("[data-panel-id]").nth(3).waitFor();
  await page.getByLabel("Active chart panel").selectOption("chart-2");
  await page.getByLabel("Active chart panel").selectOption("chart-4");
  await page.getByLabel("Active chart panel").selectOption("chart-1");

  const documentStats = await page.evaluate(() => {
    const raw = window.localStorage.getItem("openkline-studio-workspaces-v1");
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    const current = parsed.workspaces.find((item) => item.id === parsed.currentId) ?? parsed.workspaces[0];
    return {
      collectionBytes: raw.length,
      workspaceCount: parsed.workspaces.length,
      panelCount: current?.charts?.length ?? null,
      drawingCount: (current?.charts ?? []).reduce((total, chart) => total + (chart.workspace?.drawings?.drawings?.length ?? 0), 0),
      indicatorCount: (current?.charts ?? []).reduce((total, chart) => total + (chart.workspace?.indicators?.length ?? 0), 0),
    };
  });

  const report = {
    environment,
    workload: {
      layouts: "single / two-horizontal / four-grid (Studio-supported; 8-panel unsupported)",
      barsPerPanel: "deterministic Studio seed (~120 candles default)",
      drawings: documentStats?.drawingCount ?? 0,
      indicators: documentStats?.indicatorCount ?? null,
      replay: "idle",
      synchronization: "crosshair + visible-range enabled for restore cycles",
    },
    layoutTransitions: layoutSamples,
    save: summarize(saveSamples),
    restore: summarize(restoreSamples),
    layoutDisposeCycle: summarize(disposalSamples),
    memory: {
      classification: "Chromium performance.memory observational trend only; not a leak proof",
      heapTrend,
      finalHeapMb: await readHeap(page),
    },
    documentStats,
    pageErrors,
  };
  console.log(JSON.stringify(report, null, 2));
  if (pageErrors.length > 0) process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

function summarize(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (ratio) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
  return {
    sampleCount: values.length,
    minMs: Number((sorted[0] ?? 0).toFixed(3)),
    maxMs: Number((sorted.at(-1) ?? 0).toFixed(3)),
    medianMs: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
  };
}

async function expectPanelCount(page, count) {
  await page.locator("[data-panel-id]").nth(count - 1).waitFor();
  const actual = await page.locator("[data-panel-id]").count();
  if (actual !== count) throw new Error(`Expected ${count} panels, observed ${actual}`);
}

async function readHeap(page) {
  return page.evaluate(() => {
    globalThis.gc?.();
    return performance.memory === undefined ? null : Number((performance.memory.usedJSHeapSize / 1_048_576).toFixed(2));
  });
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Next.js is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function waitForChild(child, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}
