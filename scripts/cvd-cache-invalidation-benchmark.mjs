#!/usr/bin/env node
/** Node-side CVD cache and correction benchmark for Phase 14.6. */
import { performance } from "node:perf_hooks";
import { CumulativeVolumeDeltaCalculator, calculateCumulativeVolumeDelta } from "../dist/src/index.js";

const size = 100_000;
const intervalMs = 60_000;
const start = Date.UTC(2026, 0, 1);
const source = { id: "phase-14-6-node", version: "1" };
const trades = Array.from({ length: size }, (_, index) => ({
  id: `phase-14-6-node-${index}`,
  instrumentId: "PHASE-14-6/USD",
  time: start + index * intervalMs,
  price: 100 + (index % 400) * 0.5,
  quantity: 1 + (index % 17) / 10,
  aggressorSide: index % 2 === 0 ? "buy" : "sell",
  sideQuality: "observed",
  revision: 0,
  source,
}));
const appendTrades = Array.from({ length: 100 }, (_, index) => ({
  ...trades.at(-1),
  id: `phase-14-6-node-live-${index}`,
  time: trades.at(-1).time + (index + 1) * intervalMs,
  revision: 0,
}));
const options = { from: start, to: Number.MAX_SAFE_INTEGER, intervalMs, sourceCoverage: "complete" };
const percentile = (values, ratio) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
};
const statistics = (values) => ({
  samples: values.length,
  medianMs: Number(percentile(values, 0.5).toFixed(3)),
  p95Ms: Number(percentile(values, 0.95).toFixed(3)),
  maxMs: Number(Math.max(0, ...values).toFixed(3)),
});

const calculator = new CumulativeVolumeDeltaCalculator(options, trades);
calculator.getResult();
const updates = [];
const latest = [];
for (const trade of appendTrades) {
  let started = performance.now();
  calculator.update(trade);
  updates.push(performance.now() - started);
  started = performance.now();
  calculator.getLatestObservation();
  latest.push(performance.now() - started);
}
const correction = { ...trades[Math.floor(size / 2)], quantity: trades[Math.floor(size / 2)].quantity + 2, aggressorSide: "sell", revision: 1 };
const correctionStarted = performance.now();
calculator.update(correction);
const correctionUpdateMs = performance.now() - correctionStarted;
const snapshotStarted = performance.now();
const actual = calculator.getResult();
const snapshotMs = performance.now() - snapshotStarted;
const expectedTrades = [...trades, ...appendTrades, correction];
const expected = calculateCumulativeVolumeDelta(expectedTrades, options);
calculator.dispose();
console.log(JSON.stringify({
  workload: { initialTrades: size, appendTrades: appendTrades.length, intervalMs },
  appendUpdate: statistics(updates),
  latestObservation: statistics(latest),
  correction: { updateMs: Number(correctionUpdateMs.toFixed(3)), fullSnapshotMs: Number(snapshotMs.toFixed(3)), parity: JSON.stringify(actual) === JSON.stringify(expected) },
  notes: [
    "The append path mutates the cached latest bucket without cloning the complete observation array.",
    "The historical correction invalidates the cache and is compared with the independent full calculation.",
    "These are Node calculation timings, not browser rendering or universal performance claims.",
  ],
}, null, 2));
