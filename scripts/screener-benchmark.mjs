import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  createDeterministicScreenerUniverse,
  DeterministicScreenerMarketDataProvider,
  runScreenerSnapshot,
  ScreenerWatchSession,
} from "../dist/src/index.js";

const sizes = [10, 100, 500, 1_000];
const barsPerInstrument = 240;
const repeatCount = 3;
const watchStepCount = 5;
const evaluationTime = Date.UTC(2026, 0, 1);
const ruleSet = {
  version: 1,
  id: "screener-benchmark-close-positive",
  name: "Close is positive",
  root: { type: "price-threshold", field: "close", operator: ">", value: 0 },
};

function heapMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil((ordered.length - 1) * fraction))] ?? null;
}

function summarize(values) {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
  };
}

async function measureSnapshot(instrumentCount) {
  const universe = createDeterministicScreenerUniverse(instrumentCount);
  const provider = new DeterministicScreenerMarketDataProvider({ symbolCount: instrumentCount, barsPerInstrument, pageSize: 1_000 });
  const runs = [];
  let result = null;
  for (let repeat = 0; repeat < repeatCount; repeat += 1) {
    const startedAt = performance.now();
    result = await runScreenerSnapshot({
      provider,
      universe,
      ruleSet,
      timeframe: "1h",
      evaluationTime,
      jobId: `benchmark-${instrumentCount}-${repeat + 1}`,
      limits: { maxPageSize: 1_000, maxConcurrency: 8 },
    });
    runs.push(Number((performance.now() - startedAt).toFixed(3)));
  }
  if (result === null || result.counts.matched !== instrumentCount || result.results.length !== instrumentCount) throw new Error(`Screener benchmark invariant failed for ${instrumentCount} instruments`);
  return { runs, ...summarize(runs), matched: result.counts.matched, unavailable: result.counts.unavailable };
}

async function measureWatch(instrumentCount) {
  const universe = createDeterministicScreenerUniverse(instrumentCount);
  const provider = new DeterministicScreenerMarketDataProvider({ symbolCount: instrumentCount, barsPerInstrument, pageSize: 1_000 });
  const startRuns = [];
  const stepRuns = [];
  let updates = 0;
  for (let repeat = 0; repeat < repeatCount; repeat += 1) {
    updates = 0;
    const session = new ScreenerWatchSession({
      provider,
      universe,
      ruleSet,
      timeframe: "1h",
      limits: { maxPageSize: 1_000, maxConcurrency: 8 },
      onUpdate: () => { updates += 1; },
    });
    const startAt = performance.now();
    const snapshot = await session.start();
    startRuns.push(Number((performance.now() - startAt).toFixed(3)));
    if (snapshot.results.length !== instrumentCount) throw new Error(`Screener watch invariant failed for ${instrumentCount} instruments`);
    for (let step = 0; step < watchStepCount; step += 1) {
      const stepAt = performance.now();
      provider.step();
      stepRuns.push(Number((performance.now() - stepAt).toFixed(3)));
    }
    session.dispose();
  }
  if (updates !== instrumentCount * watchStepCount) throw new Error(`Screener watch update invariant failed for ${instrumentCount} instruments`);
  return { start: summarize(startRuns), step: summarize(stepRuns), updates };
}

const measurements = [];
for (const instrumentCount of sizes) {
  const beforeMb = heapMb();
  const snapshot = await measureSnapshot(instrumentCount);
  const afterSnapshotMb = heapMb();
  const watch = await measureWatch(instrumentCount);
  const afterDisposeMb = heapMb();
  measurements.push({ instrumentCount, barsPerInstrument, beforeMb, afterSnapshotMb, afterDisposeMb, heapDeltaMb: Number((afterDisposeMb - beforeMb).toFixed(2)), snapshot, watch });
}

console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  cpuCount: os.cpus().length,
  generatedAt: new Date().toISOString(),
  repeatCount,
  watchStepCount,
  evaluationTime,
  measurements,
  notes: [
    "Deterministic Node reference-provider measurements; not browser FPS, Worker throughput, vendor latency, or a capacity guarantee",
    "Snapshot and watch results are checked for complete matching output before timings are reported",
    "Heap values are process observations after an optional exposed-GC opportunity, not leak-proof limits",
    "Browser and physical-device benchmark gates are separate and remain unverified",
  ],
}, null, 2));
