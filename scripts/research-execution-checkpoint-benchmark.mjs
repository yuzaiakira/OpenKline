import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createMarketReplayTape } from "../dist/src/replay/market-event-tape.js";
import { createResearchExecutionSession } from "../dist/src/research-execution/index.js";

const source = { id: "phase-16-2-benchmark", version: "generation-1" };
const instrumentId = "PHASE-16-2";
const venueId = "PHASE-16-2-VENUE";
const sizes = [1_000, 10_000, 100_000];
const sampleCounts = new Map([[1_000, 3], [10_000, 3], [100_000, 2]]);

function now() { return performance.now(); }
function gc() { if (typeof globalThis.gc === "function") globalThis.gc(); }

function makeTape(eventCount, mode) {
  const events = [
    { id: "source-status", kind: "source-status", instrumentId, venueId, time: 1_000, revision: 0, source, status: "available", coverage: "complete" },
    {
      id: "book-0", kind: "order-book-snapshot", instrumentId, venueId, time: 1_000, sequence: 1, revision: 0, source,
      snapshot: { version: 1, instrumentId, venueId, time: 1_000, sequence: 1, bids: [{ price: 99, quantity: 1_000_000 }], asks: [{ price: 101, quantity: 1_000_000 }], tickSize: 1, source },
    },
  ];
  for (let index = 0; index < eventCount - 2; index += 1) {
    const time = 1_001 + index;
    if (mode === "book-heavy") {
      const sequence = index + 2;
      events.push({
        id: `book-delta-${index}`, kind: "order-book-delta", instrumentId, venueId, time, sequence, revision: 0, source,
        delta: { version: 1, id: `book-delta-${index}`, instrumentId, venueId, time, sequence, previousSequence: sequence - 1, quantityMode: "absolute", bids: [{ price: 99, quantity: 1_000_000 - index % 100 }], asks: [{ price: 101, quantity: 1_000_000 - index % 100 }], source },
      });
    } else {
      events.push({
        id: `trade-${index}`, kind: "trade", instrumentId, venueId, time, revision: 0, source,
        trade: { id: `trade-${index}`, instrumentId, venueId, time, price: 100 + index % 10, quantity: 1, aggressorSide: "buy", sideQuality: "observed", revision: 0, source },
      });
    }
  }
  return createMarketReplayTape({ id: `phase-16-2-${mode}-${eventCount}`, events });
}

function sessionOptions(tape, enabled, eventCount) {
  return {
    scenarioId: `phase-16-2-${eventCount}`,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    maxJournalEntries: 64,
    checkpoints: { enabled, interval: Math.max(50, Math.floor(eventCount / 20)), maxCheckpoints: 24, memoryBudgetBytes: 128 * 1024 * 1024 },
  };
}

function runSession(tape, eventCount, mode, enabled) {
  gc();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const session = createResearchExecutionSession(sessionOptions(tape, enabled, eventCount));
  const runtime = session;
  session.start();
  session.step();
  session.step();
  session.submitOrder({ idempotencyKey: "initial-buy", side: "buy", type: "market", quantity: 1 });
  const decisionStride = Math.max(1, Math.floor((eventCount - 2) / 100));
  const processingStart = now();
  for (let index = 2; index < eventCount; index += 1) {
    if (mode === "decision-heavy" && (index - 2) % decisionStride === 0) {
      const order = session.submitOrder({ idempotencyKey: `decision-${index}`, side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
      session.cancelOrder(order.id, "benchmark-cancel");
    }
    session.step();
  }
  const processingMs = now() - processingStart;
  const completed = session.exportScenario();
  const middleTimestamp = 1_001 + Math.floor((eventCount - 3) / 2);
  const endTimestamp = 1_000 + eventCount;
  const backwardStart = now();
  session.seekToTimestamp(middleTimestamp);
  const coldBackwardSeekMs = now() - backwardStart;
  const forwardStart = now();
  session.seekToTimestamp(endTimestamp);
  const forwardSeekMs = now() - forwardStart;
  let warmBackwardTotalMs = 0;
  let warmForwardTotalMs = 0;
  for (let index = 0; index < 3; index += 1) {
    const warmBackwardStart = now();
    session.seekToTimestamp(middleTimestamp);
    warmBackwardTotalMs += now() - warmBackwardStart;
    const warmForwardStart = now();
    session.seekToTimestamp(endTimestamp);
    warmForwardTotalMs += now() - warmForwardStart;
  }
  assert.deepEqual(session.exportScenario().orders, completed.orders);
  assert.deepEqual(session.exportScenario().fills, completed.fills);
  assert.deepEqual(session.exportScenario().ledger, completed.ledger);
  const checkpointDiagnostics = enabled && typeof runtime.getResearchCheckpointRuntimeDiagnostics === "function"
    ? runtime.getResearchCheckpointRuntimeDiagnostics()
    : null;
  const heapBeforeDisposeBytes = process.memoryUsage().heapUsed;
  session.dispose();
  session.dispose();
  gc();
  const heapAfterDisposeBytes = process.memoryUsage().heapUsed;
  return {
    enabled,
    eventCount,
    mode,
    processingMs,
    coldBackwardSeekMs,
    forwardSeekMs,
    warmBackwardSeekMs: warmBackwardTotalMs / 3,
    warmForwardSeekMs: warmForwardTotalMs / 3,
    checkpointDiagnostics,
    heapBeforeBytes,
    heapBeforeDisposeBytes,
    heapAfterDisposeBytes,
    heapRetainedAfterDisposeBytes: Math.max(0, heapAfterDisposeBytes - heapBeforeBytes),
  };
}

function summarize(samples, key) {
  const values = samples.map((sample) => sample[key]).sort((left, right) => left - right);
  const p95Index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * 0.95) - 1));
  return { median: values[Math.floor(values.length / 2)], p95: values[p95Index], min: values[0], max: values.at(-1), sampleCount: values.length };
}

const workloads = {};
for (const eventCount of sizes) {
  for (const mode of ["ordinary", "decision-heavy", "book-heavy"]) {
    const enabled = [];
    const disabled = [];
    for (let sample = 0; sample < (sampleCounts.get(eventCount) ?? 1); sample += 1) {
      const tape = makeTape(eventCount, mode === "book-heavy" ? "book-heavy" : "trades");
      enabled.push(runSession(tape, eventCount, mode, true));
      disabled.push(runSession(tape, eventCount, mode, false));
      assert.deepEqual(enabled.at(-1)?.eventCount, disabled.at(-1)?.eventCount);
    }
    const key = `${eventCount}:${mode}`;
    const enabledSeek = summarize(enabled, "coldBackwardSeekMs");
    const disabledSeek = summarize(disabled, "coldBackwardSeekMs");
    workloads[key] = {
      eventCount,
      mode,
      sampleCount: enabled.length,
      enabled: {
        processingMs: summarize(enabled, "processingMs"),
        coldBackwardSeekMs: enabledSeek,
        forwardSeekMs: summarize(enabled, "forwardSeekMs"),
        warmBackwardSeekMs: summarize(enabled, "warmBackwardSeekMs"),
        warmForwardSeekMs: summarize(enabled, "warmForwardSeekMs"),
        heapRetainedAfterDisposeBytes: summarize(enabled, "heapRetainedAfterDisposeBytes"),
        checkpointCaptureTimeMs: summarize(enabled.map((sample) => ({ value: sample.checkpointDiagnostics?.captureTimeMs ?? 0 })), "value"),
        checkpointEstimatedBytes: summarize(enabled.map((sample) => ({ value: sample.checkpointDiagnostics?.estimatedRetainedBytes ?? 0 })), "value"),
        checkpointRetained: summarize(enabled.map((sample) => ({ value: sample.checkpointDiagnostics?.retainedCheckpoints ?? 0 })), "value"),
        checkpointEvictions: summarize(enabled.map((sample) => ({ value: sample.checkpointDiagnostics?.evictions ?? 0 })), "value"),
      },
      disabled: {
        processingMs: summarize(disabled, "processingMs"),
        coldBackwardSeekMs: disabledSeek,
        forwardSeekMs: summarize(disabled, "forwardSeekMs"),
        heapRetainedAfterDisposeBytes: summarize(disabled, "heapRetainedAfterDisposeBytes"),
      },
      coldBackwardSpeedup: disabledSeek.median / enabledSeek.median,
      p95Caveat: enabled.length < 3 ? "p95 is weak because the sample count is below three" : "nearest-rank p95 over the recorded samples",
    };
  }
}

let gitSha = "unknown";
try { gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
console.log(JSON.stringify({
  schemaVersion: 1,
  gitSha,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  forcedGc: typeof globalThis.gc === "function",
  checkpointPolicy: "internal bounded state copies; approximate retained bytes; no measured heap-bound claim",
  workloads,
}, null, 2));
