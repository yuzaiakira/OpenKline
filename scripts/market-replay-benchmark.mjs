#!/usr/bin/env node
/**
 * Deterministic Phase 15 event-tape and replay benchmark.
 *
 * This is a Node reference benchmark. It does not claim browser FPS or
 * provider throughput. A 500k run is opt-in because checkpoint snapshots are
 * intentionally defensive and can be memory-heavy on small machines.
 */
import { performance } from "node:perf_hooks";
import {
  MarketReplayController,
  MarketReplayCoordinator,
  createMarketReplayTape,
  parseMarketReplayTape,
  serializeMarketReplayTape,
  validateMarketReplayTape,
} from "../dist/src/index.js";

const source = { id: "phase-15-benchmark", version: "1" };
const instrumentId = "BENCH-USD";
const start = Date.UTC(2026, 0, 1);
const sizes = process.env.OPENKLINE_REPLAY_INCLUDE_500K === "1" ? [1_000, 10_000, 100_000, 500_000] : [1_000, 10_000, 100_000];
let sink = 0;

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function stats(values) {
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
  return stats(values);
}

function candle(time, index) {
  const close = 100 + Math.sin(index / 19) * 2 + index / 10_000;
  return { time, open: close - 0.25, high: close + 0.75, low: close - 0.75, close, volume: 100 + index };
}

function makeEvents(size) {
  const events = [];
  let bookSequence = 1;
  for (let index = 0; index < size; index += 1) {
    const time = start + index * 1_000;
    const bar = candle(time, index);
    if (index === 0) {
      events.push({ id: "book-snapshot-0", kind: "order-book-snapshot", instrumentId, time, revision: 0, sequence: bookSequence, source, snapshot: { version: 1, instrumentId, time, sequence: bookSequence, bids: [{ price: 99.9, quantity: 100 }], asks: [{ price: 100.1, quantity: 100 }], tickSize: 0.1, source } });
      continue;
    }
    if (index % 97 === 0) {
      bookSequence += 1;
      events.push({ id: `book-delta-${index}`, kind: "order-book-delta", instrumentId, time, revision: 0, sequence: bookSequence, source, delta: { version: 1, id: `book-delta-${index}`, instrumentId, time, sequence: bookSequence, previousSequence: bookSequence - 1, quantityMode: "absolute", bids: [{ price: 99.9, quantity: 100 + index % 37 }], asks: [{ price: 100.1, quantity: 100 + index % 31 }], source } });
      continue;
    }
    if (index % 53 === 0) {
      events.push({ id: `candle-open-${index}`, kind: "candle-open", instrumentId, time, revision: 0, source, candle: bar, finality: "opening", intervalMs: 60_000 });
      continue;
    }
    if (index % 53 === 1) {
      const completed = candle(time - 1_000, index - 1);
      events.push({ id: `candle-complete-${index}`, kind: "candle-complete", instrumentId, time, revision: 0, source, candle: completed, finality: "completed", intervalMs: 60_000 });
      continue;
    }
    if (index % 199 === 0) {
      events.push({ id: `session-open-${index}`, kind: "session-boundary", instrumentId, time, revision: 0, source, boundary: "open", sessionId: `session-${Math.floor(index / 199)}`, calendarId: "benchmark-calendar", calendarVersion: "1" });
      continue;
    }
    events.push({ id: `trade-${index}`, kind: "trade", instrumentId, time, revision: 0, source, trade: { id: `trade-${index}`, instrumentId, time, price: bar.close, quantity: 1 + (index % 17) / 10, aggressorSide: index % 7 === 0 ? "unknown" : index % 2 === 0 ? "buy" : "sell", sideQuality: index % 7 === 0 ? "unknown" : "observed", revision: 0, source } });
  }
  return events;
}

function makeController(tape, checkpointInterval) {
  const controller = new MarketReplayController({ tape, checkpointInterval, maxCheckpoints: 16, maxMaterializedTrades: 2_000, maxFootprintCells: 20_000 });
  controller.start();
  return controller;
}

function runSize(size) {
  const eventBuildStart = performance.now();
  const maxEvents = Math.min(500_000, size + 1);
  const tape = createMarketReplayTape({ id: `phase-15-${size}`, events: makeEvents(size), maxEvents });
  const tapeBuildMs = performance.now() - eventBuildStart;
  const samples = size >= 100_000 ? 3 : 5;
  const checkpointInterval = size >= 500_000 ? size + 1 : Math.max(25, Math.floor(size / 8));
  const validation = measure(() => validateMarketReplayTape(tape), samples);
  const construction = measure(() => {
    const controller = makeController(tape, checkpointInterval);
    sink += controller.getState().eligibleEvents;
    controller.dispose();
  }, samples);
  const stepNext = measure(() => {
    const controller = makeController(tape, checkpointInterval);
    controller.stepNextEvent();
    sink += controller.getState().processedEvents;
    controller.dispose();
  }, samples);
  const coldSeek = measure(() => {
    const controller = makeController(tape, checkpointInterval);
    controller.seekToTimestamp(start + Math.floor(size * 0.65) * 1_000);
    sink += controller.getSnapshot().tradeSummary[0]?.totalVolume ?? 0;
    controller.dispose();
  }, samples);
  const warmController = makeController(tape, checkpointInterval);
  warmController.seekToTimestamp(start + Math.floor(size * 0.9) * 1_000);
  const warmSeek = measure(() => {
    warmController.seekToTimestamp(start + Math.floor(size * 0.4) * 1_000);
    sink += warmController.getSnapshot().cvd[0]?.value ?? 0;
    warmController.seekToTimestamp(start + Math.floor(size * 0.9) * 1_000);
  }, Math.max(2, Math.min(samples, 4)));
  const checkpointCount = warmController.getCheckpoints().length;
  warmController.dispose();
  const previous = makeController(tape, checkpointInterval);
  previous.seekToTimestamp(start + Math.floor(size * 0.8) * 1_000);
  const previousStep = measure(() => {
    previous.stepPreviousEvent();
    sink += previous.getState().eventIndex ?? 0;
    previous.stepNextEvent();
  }, Math.max(2, Math.min(samples, 4)));
  previous.dispose();
  const serialized = serializeMarketReplayTape(tape);
  const exportImport = measure(() => {
    const restored = parseMarketReplayTape(serialized, { maxEvents });
    sink += restored.events.length;
  }, Math.max(2, Math.min(samples, 3)));
  const multiController = makeController(tape, checkpointInterval);
  const coordinator = new MarketReplayCoordinator(multiController);
  coordinator.registerPanel({ id: "primary", instrumentId });
  coordinator.registerPanel({ id: "empty", instrumentId: "MISSING" });
  const multiChart = measure(() => {
    multiController.stepNextEvent();
    sink += coordinator.getPanelSnapshot("primary").replay.integrity.complete ? 1 : 0;
  }, Math.max(2, Math.min(samples, 4)));
  coordinator.dispose();
  multiController.dispose();
  if (globalThis.gc) globalThis.gc();
  return {
    events: size,
    tapeBuildMs: Number(tapeBuildMs.toFixed(3)),
    tapeBytes: Buffer.byteLength(serialized),
    checkpointInterval,
    checkpointCount,
    validation,
    controllerConstruction: construction,
    nextEvent: stepNext,
    coldSeek,
    warmCheckpointSeek: warmSeek,
    previousEvent: previousStep,
    exportImport,
    multiChartSynchronization: multiChart,
    heapUsedBytes: process.memoryUsage().heapUsed,
  };
}

const reports = [];
for (const size of sizes) {
  const report = runSize(size);
  reports.push(report);
  console.log(JSON.stringify({ replayBenchmarkProgress: report }));
}
console.log(JSON.stringify({
  benchmark: "phase-15-market-replay",
  node: process.version,
  platform: process.platform,
  include500k: sizes.includes(500_000),
  reports,
  sink,
}, null, 2));
