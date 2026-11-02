/**
 * Phase 16.5.4 Studio restore heap-retainer investigation.
 *
 * Controlled Chromium experiments that separate application resource counts
 * from performance.memory variability. Uses CDP garbage collection and optional
 * heap snapshots written under artifacts/ (gitignored).
 *
 * Not a CI timing/memory gate.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { cpus, freemem, totalmem } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const port = 4177;
const baseURL = `http://127.0.0.1:${port}`;
const projectDirectory = fileURLToPath(new URL("../examples/nextjs-app-router/", import.meta.url));
const artifactDirectory = fileURLToPath(new URL("../artifacts/studio-heap-retainers/", import.meta.url));
const cycles = Number(process.env.OPENKLINE_HEAP_RETAINER_CYCLES ?? 20);
const settleMs = Number(process.env.OPENKLINE_HEAP_RETAINER_SETTLE_MS ?? 250);
const captureSnapshots = process.env.OPENKLINE_HEAP_SNAPSHOTS === "1";
const npmBinary = "npm";

mkdirSync(artifactDirectory, { recursive: true });

const build = spawn(npmBinary, ["run", "build"], {
  cwd: projectDirectory,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OPENKLINE_NEXT_DIST: ".next-heap-bench" },
});
const buildStatus = await waitForChild(build, 180_000, "Next production build");
if (buildStatus !== 0) throw new Error(`Next production build failed with status ${buildStatus}`);

const server = spawn(npmBinary, ["run", "start", "--", "--port", String(port)], {
  cwd: projectDirectory,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, OPENKLINE_NEXT_DIST: ".next-heap-bench" },
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

  const environment = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpuModel: cpus()[0]?.model ?? "unknown",
    cpuCount: cpus().length,
    totalMemMb: Number((totalmem() / 1_048_576).toFixed(1)),
    freeMemMb: Number((freemem() / 1_048_576).toFixed(1)),
    buildMode: "next-production",
    cycles,
    settleMs,
    gcPolicy: "CDP HeapProfiler.collectGarbage + Memory.forciblyCollectGarbage + optional page gc(); then performance.memory",
    captureSnapshots,
  };

  const sharedContextOptions = { viewport: { width: 1_440, height: 900 } };

  const restoreExperiment = await runInContext(browser, sharedContextOptions, async (page, cdp) => {
    await prepareStudio(page);
    const workspaceId = await seedFourPanelWorkspace(page);
    const points = [];
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      await page.getByRole("button", { name: "New", exact: true }).first().click();
      await expectPanelCount(page, 1);
      await settle(page, settleMs);
      const afterNew = await measureCheckpoint(page, cdp, `restore-cycle-${cycle}-after-new`);
      await page.getByLabel("Workspace", { exact: true }).selectOption(workspaceId);
      await page.locator('[data-workspace-restore-panels="4"]').waitFor();
      await expectPanelCount(page, 4);
      await settle(page, settleMs);
      const afterRestore = await measureCheckpoint(page, cdp, `restore-cycle-${cycle}-after-restore`);
      points.push({ cycle, afterNew, afterRestore });
    }
    if (captureSnapshots) {
      await captureHeapSnapshot(cdp, join(artifactDirectory, `after-${cycles}-restore-cycles.heapsnapshot`));
    }
    return {
      name: "repeated-workspace-restoration",
      workspaceId,
      points,
      slopeAfterNewMbPerCycle: slope(points.map((point) => point.afterNew.heapUsedMb)),
      slopeAfterRestoreMbPerCycle: slope(points.map((point) => point.afterRestore.heapUsedMb)),
    };
  });

  const idleExperiment = await runInContext(browser, sharedContextOptions, async (page, cdp) => {
    await prepareStudio(page);
    await page.getByLabel("Chart layout").selectOption("single");
    await expectPanelCount(page, 1);
    const points = [];
    for (let cycle = 1; cycle <= cycles; cycle += 1) {
      await settle(page, settleMs);
      // Mirror restore-experiment GC/read intensity without workspace replacement.
      points.push({ cycle, idle: await measureCheckpoint(page, cdp, `idle-cycle-${cycle}`) });
    }
    return {
      name: "idle-control",
      points,
      slopeMbPerCycle: slope(points.map((point) => point.idle.heapUsedMb)),
    };
  });

  const replacementExperiment = await runInContext(browser, sharedContextOptions, async (page, cdp) => {
    await prepareStudio(page);
    const workspaceId = await seedFourPanelWorkspace(page);
    const points = [];
    for (let cycle = 1; cycle <= Math.min(cycles, 12); cycle += 1) {
      await page.getByRole("button", { name: "New", exact: true }).first().click();
      await expectPanelCount(page, 1);
      await settle(page, settleMs);
      const empty = await measureCheckpoint(page, cdp, `replace-${cycle}-empty`);
      await page.getByLabel("Workspace", { exact: true }).selectOption(workspaceId);
      await page.locator('[data-workspace-restore-panels="4"]').waitFor();
      await expectPanelCount(page, 4);
      await settle(page, settleMs);
      const populated = await measureCheckpoint(page, cdp, `replace-${cycle}-populated`);
      await page.getByRole("button", { name: "New", exact: true }).first().click();
      await expectPanelCount(page, 1);
      await settle(page, settleMs);
      const emptyAgain = await measureCheckpoint(page, cdp, `replace-${cycle}-empty-again`);
      points.push({ cycle, empty, populated, emptyAgain });
    }
    return {
      name: "workspace-replacement",
      points,
      slopeEmptyMbPerCycle: slope(points.map((point) => point.emptyAgain.heapUsedMb)),
    };
  });

  const panelLifecycleExperiment = await runInContext(browser, sharedContextOptions, async (page, cdp) => {
    await prepareStudio(page);
    const points = [];
    for (let cycle = 1; cycle <= Math.min(cycles, 12); cycle += 1) {
      await page.getByLabel("Chart layout").selectOption("four-grid");
      await expectPanelCount(page, 4);
      await settle(page, settleMs);
      const four = await measureCheckpoint(page, cdp, `panel-${cycle}-four`);
      await page.getByLabel("Chart layout").selectOption("single");
      await expectPanelCount(page, 1);
      await settle(page, settleMs);
      const one = await measureCheckpoint(page, cdp, `panel-${cycle}-one`);
      points.push({ cycle, four, one });
    }
    return {
      name: "panel-lifecycle",
      points,
      slopeSingleMbPerCycle: slope(points.map((point) => point.one.heapUsedMb)),
    };
  });

  const freshContextExperiment = await runInContext(browser, sharedContextOptions, async (page, cdp) => {
    await prepareStudio(page);
    const workspaceId = await seedFourPanelWorkspace(page);
    await page.getByRole("button", { name: "New", exact: true }).first().click();
    await expectPanelCount(page, 1);
    await page.getByLabel("Workspace", { exact: true }).selectOption(workspaceId);
    await page.locator('[data-workspace-restore-panels="4"]').waitFor();
    await settle(page, settleMs);
    return {
      name: "fresh-context-single-restore",
      checkpoint: await measureCheckpoint(page, cdp, "fresh-context-after-one-restore"),
    };
  });

  const teardownExperiment = await runInContext(browser, sharedContextOptions, async (page, cdp) => {
    await prepareStudio(page);
    await seedFourPanelWorkspace(page);
    await settle(page, settleMs);
    const before = await measureCheckpoint(page, cdp, "teardown-before");
    await page.goto("about:blank");
    await settle(page, settleMs);
    const after = await measureCheckpoint(page, cdp, "teardown-after-blank");
    return { name: "full-studio-teardown", before, after };
  });

  const methodologyNotes = {
    priorPhaseMeasurement: {
      description: "Phase 16.5.3 heapBefore was taken after New (1 panel) and heapAfter after restore (4 panels) with a single optional page gc() and no CDP forced GC or settle delay.",
      implication: "Per-cycle delta (~2.7 MB) includes expected multi-panel construction cost. The climbing heapBefore series (~+1.3 MB/cycle at 1-panel checkpoints) is the suspicious signal under investigation.",
    },
    instrumentation: {
      diagnostics: "window.__openklineStudioDiagnostics enabled via addInitScript",
      heapApi: "performance.memory.usedJSHeapSize after CDP GC",
      snapshots: captureSnapshots ? "written under artifacts/studio-heap-retainers" : "disabled (set OPENKLINE_HEAP_SNAPSHOTS=1)",
    },
  };

  const report = {
    environment: {
      ...environment,
      browser: restoreExperiment.browser,
    },
    methodologyNotes,
    experiments: {
      restore: restoreExperiment.result,
      idle: idleExperiment.result,
      replacement: replacementExperiment.result,
      panelLifecycle: panelLifecycleExperiment.result,
      freshContext: freshContextExperiment.result,
      teardown: teardownExperiment.result,
    },
    interpretation: interpret({
      restore: restoreExperiment.result,
      idle: idleExperiment.result,
      replacement: replacementExperiment.result,
      panelLifecycle: panelLifecycleExperiment.result,
    }),
  };

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const reportPath = join(artifactDirectory, `phase-16-5-4-heap-retainer-summary-${stamp}.json`);
  const latestPath = join(artifactDirectory, "phase-16-5-4-heap-retainer-summary-latest.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ ...report, artifactPath: reportPath, latestPath }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}

function interpret({ restore, idle, replacement, panelLifecycle }) {
  const restoreSlope = restore.slopeAfterNewMbPerCycle;
  const idleSlope = idle.slopeMbPerCycle;
  const resourceStable = restore.points.every((point) => (
    point.afterNew.diagnostics.syncChartIds.length === point.afterNew.diagnostics.panelIds.length
    && point.afterNew.diagnostics.snapshotKeys.every((key) => point.afterNew.diagnostics.panelIds.includes(key))
    && point.afterNew.diagnostics.strategyResultCount === 0
    && point.afterNew.diagnostics.archivedPanelCount === 0
    && point.afterRestore.diagnostics.syncChartIds.length === 4
  ));
  const classifications = [];
  if (resourceStable) {
    classifications.push({
      label: "VERIFIED CLEANUP BEHAVIOR",
      detail: "Sync ids, snapshot keys, strategy caches, and archived panels return to ownership baselines after New/restore cycles.",
    });
  }
  if (Math.abs(idleSlope) >= Math.abs(restoreSlope) * 0.5 && Math.abs(restoreSlope) > 0.05) {
    classifications.push({
      label: "TRANSIENT ALLOCATION / GC VARIABILITY OR BROWSER BASELINE GROWTH",
      detail: `Idle-control slope (${idleSlope.toFixed(3)} MB/cycle) is comparable to restore after-New slope (${restoreSlope.toFixed(3)} MB/cycle), so climbing heap is not uniquely explained by workspace restore retainers.`,
    });
  } else if (restoreSlope > 0.2 && resourceStable) {
    classifications.push({
      label: "SUSPICIOUS BUT UNPROVEN RETENTION",
      detail: `After-New heap still slopes upward (${restoreSlope.toFixed(3)} MB/cycle) while ownership counts remain correct; no verified application retainer path from diagnostics.`,
    });
  } else if (restoreSlope <= 0.2) {
    classifications.push({
      label: "EXPECTED PERSISTENT STATE OR CACHE / STABILIZED HEAP",
      detail: `After-New heap slope is small (${restoreSlope.toFixed(3)} MB/cycle) under CDP forced GC.`,
    });
  }
  classifications.push({
    label: "PANEL LIFECYCLE / REPLACEMENT",
    detail: `Layout single-panel slope ${panelLifecycle.slopeSingleMbPerCycle.toFixed(3)} MB/cycle; replacement empty slope ${replacement.slopeEmptyMbPerCycle.toFixed(3)} MB/cycle.`,
  });
  return {
    restoreSlopeAfterNewMbPerCycle: restoreSlope,
    idleSlopeMbPerCycle: idleSlope,
    resourceStable,
    classifications,
  };
}

async function runInContext(browser, options, run) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => {
    window.__OPENKLINE_ENABLE_STUDIO_DIAGNOSTICS__ = true;
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const cdp = await context.newCDPSession(page);
  await cdp.send("HeapProfiler.enable").catch(() => undefined);
  try {
    const result = await run(page, cdp);
    const browserAgent = await page.evaluate(() => navigator.userAgent);
    return { result, browser: browserAgent };
  } finally {
    await context.close();
  }
}

async function prepareStudio(page) {
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.locator("[data-panel-id]").first().waitFor();
}

async function seedFourPanelWorkspace(page) {
  await page.getByLabel("Chart layout").selectOption("four-grid");
  await expectPanelCount(page, 4);
  await page.getByLabel("Sync crosshair").check();
  await page.getByLabel("Sync visible range").check();
  await page.getByLabel("Workspace name").fill("Heap Retainer Desk");
  await page.getByRole("button", { name: "Save As", exact: true }).click();
  await page.getByText(/saved locally/).waitFor();
  return page.getByLabel("Workspace", { exact: true }).inputValue();
}

async function measureCheckpoint(page, cdp, label) {
  await forceGc(page, cdp);
  const heap = await page.evaluate(() => {
    const memory = performance.memory;
    return memory === undefined ? null : {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
    };
  });
  const diagnostics = await page.evaluate(() => {
    const read = window.__openklineStudioDiagnostics;
    if (typeof read !== "function") {
      return {
        panelIds: [...document.querySelectorAll("[data-panel-id]")].map((node) => node.getAttribute("data-panel-id") ?? ""),
        syncChartIds: [],
        snapshotKeys: [],
        archivedPanelCount: -1,
        strategyResultCount: -1,
        appliedStrategyParameterCount: -1,
        pendingRestore: false,
        canvasCount: document.querySelectorAll("canvas").length,
        diagnosticsAvailable: false,
      };
    }
    return { ...read(), diagnosticsAvailable: true };
  });
  let domCounters = null;
  try {
    domCounters = await cdp.send("Memory.getDOMCounters");
  } catch {
    domCounters = null;
  }
  return {
    label,
    heapUsedMb: heap === null ? null : Number((heap.usedJSHeapSize / 1_048_576).toFixed(3)),
    heapTotalMb: heap === null ? null : Number((heap.totalJSHeapSize / 1_048_576).toFixed(3)),
    heap,
    diagnostics,
    domCounters,
  };
}

async function forceGc(page, cdp) {
  for (let index = 0; index < 3; index += 1) {
    try { await cdp.send("HeapProfiler.collectGarbage"); } catch { /* optional */ }
    try { await cdp.send("Memory.forciblyCollectGarbage"); } catch { /* optional */ }
    await page.evaluate(() => { globalThis.gc?.(); });
    await page.waitForTimeout(50);
  }
}

async function captureHeapSnapshot(cdp, path) {
  const chunks = [];
  const onChunk = (event) => { chunks.push(event.chunk); };
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, captureNumericValue: true });
    writeFileSync(path, chunks.join(""));
  } finally {
    cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  }
}

async function expectPanelCount(page, count) {
  await page.locator("[data-panel-id]").nth(count - 1).waitFor();
  const actual = await page.locator("[data-panel-id]").count();
  if (actual !== count) throw new Error(`Expected ${count} panels, observed ${actual}`);
}

async function settle(page, ms) {
  await page.waitForTimeout(ms);
}

function slope(values) {
  const points = values.filter((value) => typeof value === "number");
  if (points.length < 2) return 0;
  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let index = 0; index < n; index += 1) {
    const x = index + 1;
    const y = points[index];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;
  return Number(((n * sumXY - sumX * sumY) / denominator).toFixed(4));
}

async function waitForServer(url, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // waiting
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
