import { performance } from "node:perf_hooks";
import { analyzeParameterSensitivity, runOptimization, runWalkForward } from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const repeatCount = 3;
const searchSpace = [
  { name: "fastPeriod", type: "integer-range", start: 5, end: 15, step: 5 },
  { name: "slowPeriod", type: "integer-range", start: 20, end: 40, step: 10 },
];
const base = {
  strategy: "EMA_CROSSOVER",
  searchSpace,
  objective: "net-profit",
  initialCapital: 100_000,
  positionSizing: { type: "fixed-quantity", quantity: 1 },
  commission: { type: "fixed", value: 0 },
  slippage: { type: "fixed", value: 0 },
  limits: { maxCandidates: 32 },
};

function makeCandles(size) {
  return Array.from({ length: size }, (_, index) => {
    const close = 100 + Math.sin(index / 23) * 4 + Math.cos(index / 71) * 2 + index / size;
    return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.35, high: close + 0.8, low: close - 0.8, close, volume: 1_000 + index };
  });
}

function heapMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.ceil((ordered.length - 1) * fraction))] ?? null;
}

function runGrid(candles) {
  const startedAt = performance.now();
  const result = runOptimization({ ...base, candles });
  return { elapsedMs: Number((performance.now() - startedAt).toFixed(3)), evaluated: result.counts.evaluated, available: result.rankedCandidates.filter((candidate) => candidate.objective.available).length, fingerprint: result.datasetFingerprint, jobId: result.jobId };
}

const measurements = [];
for (const size of sizes) {
  const candles = makeCandles(size);
  const beforeMb = heapMb();
  const runs = Array.from({ length: repeatCount }, () => runGrid(candles));
  const afterMb = heapMb();
  measurements.push({ candles: size, beforeMb, afterMb, heapDeltaMb: Number((afterMb - beforeMb).toFixed(2)), runs, medianMs: Number(percentile(runs.map((run) => run.elapsedMs), 0.5).toFixed(3)), p95Ms: Number(percentile(runs.map((run) => run.elapsedMs), 0.95).toFixed(3)) });
}

const wfaCandles = makeCandles(1_000);
const wfaRuns = [];
for (let repeat = 0; repeat < repeatCount; repeat += 1) {
  const startedAt = performance.now();
  const report = runWalkForward({ ...base, candles: wfaCandles, limits: { maxCandidates: 16 }, split: { mode: "anchored", trainingWindowLength: 200, testWindowLength: 100, stepSize: 100, gapBars: 2, warmupBars: 30 } });
  wfaRuns.push({ elapsedMs: Number((performance.now() - startedAt).toFixed(3)), folds: report.folds.length, evaluatedFolds: report.aggregate.evaluatedFoldCount, analysisId: report.analysisId });
}

const sensitivityStartedAt = performance.now();
const sensitivity = analyzeParameterSensitivity({ ...base, candles: wfaCandles, selectedParameters: { fastPeriod: 10, slowPeriod: 30 }, objective: "net-profit", limits: { maxCandidates: 16 } });
const sensitivityMs = performance.now() - sensitivityStartedAt;

console.log(JSON.stringify({
  node: process.version,
  generatedAt: new Date().toISOString(),
  repeatCount,
  candidateCount: 9,
  measurements,
  walkForward: { runs: wfaRuns, medianMs: Number(percentile(wfaRuns.map((run) => run.elapsedMs), 0.5).toFixed(3)), p95Ms: Number(percentile(wfaRuns.map((run) => run.elapsedMs), 0.95).toFixed(3)) },
  sensitivity: { elapsedMs: Number(sensitivityMs.toFixed(3)), neighborCount: sensitivity.neighborCount, stable: sensitivity.stable },
  notes: ["Node reference-engine measurements; not a browser FPS or Worker throughput claim", "The 100k run uses compact candidate summaries and no retained full BacktestResult payloads", "Heap values are process observations and are not leak-proof limits"],
}, null, 2));
