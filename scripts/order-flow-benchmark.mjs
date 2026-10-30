#!/usr/bin/env node
/**
 * Deterministic Phase 14 Node benchmark.
 *
 * This measures provider-neutral trade aggregation and Level-2 reconstruction
 * only. Canvas2D frame timing belongs to order-flow-browser-benchmark.mjs.
 */
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  CumulativeVolumeDeltaCalculator,
  FootprintCalculator,
  MarketTradeStore,
  OrderBookController,
  calculateCumulativeVolumeDelta,
  calculateFootprint,
  calculateOrderBookDepthMetrics,
  calculateTradeFlow,
} from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const intervalMs = 60_000;
const source = { id: "phase-14-node-benchmark", version: "1" };
const samplesFor = (size) => size >= 100_000 ? 3 : 5;
let sink = 0;

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function summarize(values) {
  return {
    samples: values.length,
    medianMs: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
    minMs: Number(Math.min(...values).toFixed(3)),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

function measure(action, samples) {
  action();
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    action(index);
    values.push(performance.now() - started);
  }
  return summarize(values);
}

function createTrades(size) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: size }, (_, index) => ({
    id: `trade-${index}`,
    instrumentId: "BENCH-USD",
    time: start + index * intervalMs,
    price: 100 + (index % 400) * 0.5 + Math.sin(index / 17) * 0.1,
    quantity: 1 + (index % 17) / 10,
    aggressorSide: index % 2 === 0 ? "buy" : "sell",
    sideQuality: "observed",
    revision: 0,
    source,
  }));
}

function createDepthDeltas(size) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: size }, (_, index) => ({
    version: 1,
    id: `delta-${index}`,
    instrumentId: "BENCH-USD",
    time: start + index * intervalMs,
    sequence: index + 2,
    previousSequence: index + 1,
    quantityMode: "absolute",
    bids: [{ price: 99 - (index % 100) * 0.01, quantity: 100 + (index % 41) }],
    asks: [{ price: 101 + (index % 100) * 0.01, quantity: 90 + (index % 37) }],
    source: { id: "phase-14-depth-benchmark", version: "1" },
  }));
}

function createSnapshot() {
  return {
    version: 1,
    instrumentId: "BENCH-USD",
    time: Date.UTC(2026, 0, 1),
    sequence: 1,
    bids: Array.from({ length: 100 }, (_, index) => ({ price: 99 - index * 0.01, quantity: 100 + index })),
    asks: Array.from({ length: 100 }, (_, index) => ({ price: 101 + index * 0.01, quantity: 90 + index })),
    tickSize: 0.01,
    source: { id: "phase-14-depth-benchmark", version: "1" },
  };
}

function runTrades(size) {
  const trades = createTrades(size);
  const from = trades[0]?.time;
  const to = (trades.at(-1)?.time ?? 0) + intervalMs;
  if (from === undefined) throw new Error(`Trade fixture ${size} is empty`);
  const samples = samplesFor(size);
  const options = { from, to, intervalMs, sourceCoverage: "complete" };
  const tradeFlow = measure(() => {
    const result = calculateTradeFlow(trades, options);
    if (result.tradeCount !== size || result.coverage !== "complete-known-side") throw new Error(`Trade-flow integrity mismatch at ${size}`);
    sink += result.delta;
  }, samples);
  const cvd = measure(() => {
    const result = calculateCumulativeVolumeDelta(trades, options);
    if (result.tradeCount !== size || result.currentValue === null) throw new Error(`CVD integrity mismatch at ${size}`);
    sink += result.currentValue;
  }, samples);
  const footprint = measure(() => {
    const result = calculateFootprint(trades, { ...options, tickSize: 0.5, offTickPolicy: "round", maxBuckets: 100_000, maxCells: 200_000 });
    if (result.tradeCount !== size || result.buckets.length === 0) throw new Error(`Footprint integrity mismatch at ${size}`);
    sink += result.totalDelta;
  }, samples);
  const storeIngest = measure(() => {
    const store = new MarketTradeStore({ maxTrades: size + 10 });
    store.setData(trades);
    const latest = store.getAll().at(-1);
    if (latest?.id !== `trade-${size - 1}`) throw new Error(`Trade-store ordering mismatch at ${size}`);
    store.dispose();
  }, Math.max(2, Math.min(samples, 3)));
  const store = new MarketTradeStore({ maxTrades: size + 10 });
  store.setData(trades);
  const correctionIndex = Math.floor(size / 2);
  const correction = trades[correctionIndex];
  if (correction === undefined) throw new Error(`Trade correction fixture ${size} is missing`);
  const correctionResult = measure((index) => {
    const result = store.update({ ...correction, revision: index === undefined ? 1 : index + 2, quantity: correction.quantity + 0.25 });
    if (result !== "revised") throw new Error(`Trade correction was not accepted at ${size}`);
    sink += store.get(correction.id)?.quantity ?? 0;
  }, samples);
  const asOfTime = trades[Math.floor(size * 0.6)]?.time ?? to;
  const asOf = measure(() => {
    const result = store.getRange(from, to, asOfTime);
    if (result.some((trade) => trade.time > asOfTime)) throw new Error(`Trade as-of leak at ${size}`);
    sink += result.length;
  }, samples);
  const calculator = new CumulativeVolumeDeltaCalculator(options);
  calculator.setData(trades);
  const footprintCalculator = new FootprintCalculator({ ...options, tickSize: 0.5, offTickPolicy: "round", maxBuckets: 100_000, maxCells: 200_000 });
  footprintCalculator.setData(trades);
  const disposeStarted = performance.now();
  calculator.dispose();
  footprintCalculator.dispose();
  store.dispose();
  return {
    size,
    intervalMs,
    measurements: { tradeFlow, cvd, footprint, storeIngest, correctionResult, asOf },
    integrity: { expectedTrades: size, asOfTime, sourceCoverage: "complete" },
    disposalMs: Number((performance.now() - disposeStarted).toFixed(3)),
  };
}

function runDepth(size) {
  const deltas = createDepthDeltas(size);
  const snapshot = createSnapshot();
  const samples = samplesFor(size);
  const apply = measure(() => {
    const controller = new OrderBookController({ instrumentId: "BENCH-USD", maxDepth: 200, maxHistory: Math.min(size + 10, 100_000), source: snapshot.source });
    controller.applySnapshot(snapshot);
    for (const delta of deltas) {
      const result = controller.applyDelta(delta);
      if (result.kind !== "applied") throw new Error(`Depth delta ${result.kind} at ${size}`);
    }
    const state = controller.getState(20);
    const metrics = calculateOrderBookDepthMetrics(state, { topN: 20 });
    if (state.status !== "live" || state.lastSequence !== size + 1 || metrics.quality !== "available") throw new Error(`Depth integrity mismatch at ${size}`);
    sink += metrics.imbalance ?? 0;
    controller.dispose();
  }, samples);
  const controller = new OrderBookController({ instrumentId: "BENCH-USD", maxDepth: 200, maxHistory: Math.min(size + 10, 100_000), source: snapshot.source });
  controller.applySnapshot(snapshot);
  const recoveryStarted = performance.now();
  const gapResult = controller.applyDelta({ ...deltas[1], sequence: 4, previousSequence: 3 });
  const recoveryMs = performance.now() - recoveryStarted;
  if (gapResult.kind !== "stale" || controller.getState().status !== "stale") throw new Error(`Depth gap did not become stale at ${size}`);
  const disposeStarted = performance.now();
  controller.dispose();
  return {
    size,
    measurements: { apply, recoveryMs: Number(recoveryMs.toFixed(3)) },
    integrity: { expectedDeltas: size, finalSequence: size + 1, gapStatus: "stale" },
    disposalMs: Number((performance.now() - disposeStarted).toFixed(3)),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model ?? "unknown" },
  sizes,
  tradeRuns: sizes.map(runTrades),
  orderBookRuns: sizes.map(runDepth),
  notes: [
    "Node analytics and lifecycle measurements only; Canvas2D frame timing is reported separately by benchmark:order-flow:browser.",
    "All trades, snapshots, and deltas are deterministic local fixtures; no exchange or vendor data is used.",
    "Median/p95 values are workload evidence for this environment, not universal performance claims.",
    `sink=${sink.toFixed(3)}`,
  ],
};
console.log(JSON.stringify(report, null, 2));
