import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createMarketReplayTape } from "../dist/src/replay/market-event-tape.js";
import { createResearchExecutionSession } from "../dist/src/research-execution/index.js";
import { ReferenceExecutionLedger } from "../dist/src/research-execution/reference.js";

const source = { id: "research-benchmark", version: "generation-1" };
const instrumentId = "BENCH";
const venueId = "BENCH-VENUE";
const sizes = [1_000, 10_000, 100_000];

function now() {
  return performance.now();
}

function gc() {
  if (typeof globalThis.gc === "function") globalThis.gc();
}

function sourceStatus() {
  return {
    id: "source-status",
    kind: "source-status",
    instrumentId,
    venueId,
    time: 1_000,
    revision: 0,
    source,
    status: "available",
    coverage: "complete",
  };
}

function initialBook() {
  return {
    id: "book-0",
    kind: "order-book-snapshot",
    instrumentId,
    venueId,
    time: 1_000,
    sequence: 1,
    revision: 0,
    source,
    snapshot: {
      version: 1,
      instrumentId,
      venueId,
      time: 1_000,
      sequence: 1,
      bids: [{ price: 99, quantity: 1_000_000 }],
      asks: [{ price: 101, quantity: 1_000_000 }],
      tickSize: 1,
      source,
    },
  };
}

function makeTape(eventCount) {
  const events = [sourceStatus(), initialBook()];
  for (let index = 0; index < eventCount - 2; index += 1) {
    const time = 1_001 + index;
    events.push({
      id: `trade-${index}`,
      kind: "trade",
      instrumentId,
      venueId,
      time,
      revision: 0,
      source,
      trade: {
        id: `trade-${index}`,
        instrumentId,
        venueId,
        time,
        price: 100 + (index % 10),
        quantity: 1,
        aggressorSide: "buy",
        sideQuality: "observed",
        revision: 0,
        source,
      },
    });
  }
  return createMarketReplayTape({ id: `research-benchmark-${eventCount}`, events });
}

function makeCorrectnessTape() {
  const events = [sourceStatus(), { ...initialBook(), id: "correctness-book", snapshot: { ...initialBook().snapshot, asks: [{ price: 101, quantity: 1 }] } }];
  for (let index = 0; index < 12; index += 1) {
    const time = 1_001 + index;
    events.push({
      id: `correctness-trade-${index}`,
      kind: "trade",
      instrumentId,
      venueId,
      time,
      revision: 0,
      source,
      trade: {
        id: `correctness-trade-${index}`,
        instrumentId,
        venueId,
        time,
        price: 100,
        quantity: 1,
        aggressorSide: "buy",
        sideQuality: "observed",
        revision: 0,
        source,
      },
    });
  }
  return createMarketReplayTape({ id: "research-correctness-scenario", events });
}

function options(tape) {
  return {
    scenarioId: `benchmark-${tape.id}`,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    maxJournalEntries: 10_000,
  };
}

function runCorrectnessScenario() {
  gc();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const tape = makeCorrectnessTape();
  const constructionStart = now();
  const session = createResearchExecutionSession({ ...options(tape), scenarioId: "benchmark-correctness", maxJournalEntries: 4 });
  const constructionMs = now() - constructionStart;
  session.start();
  session.step();
  session.step();
  const decisionStart = now();
  const partial = session.submitOrder({ idempotencyKey: "partial", side: "buy", type: "market", quantity: 2 });
  const submissionMs = now() - decisionStart;
  const processingStart = now();
  session.step();
  const processingMs = now() - processingStart;
  const cancelStart = now();
  session.cancelOrder(partial.id);
  for (let index = 0; index < 5; index += 1) {
    const pending = session.submitOrder({ idempotencyKey: `cancel-${index}`, side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
    session.cancelOrder(pending.id);
  }
  const cancellationMs = now() - cancelStart;
  const beforeSeek = session.exportScenario();
  assert.equal(beforeSeek.fills.length, 1);
  assert.equal(beforeSeek.orders.find((order) => order.id === partial.id)?.status, "cancelled");
  assert.ok(beforeSeek.journalRetention.evictedEntries > 0);
  const reference = new ReferenceExecutionLedger(1_000_000);
  reference.apply({ side: "buy", price: 101, quantity: 1, fee: 1 });
  assert.equal(beforeSeek.ledger.cash, reference.snapshot().cash);
  assert.equal(beforeSeek.ledger.position?.costBasis, reference.snapshot().costBasis);

  const seekStart = now();
  session.seekToEvent("correctness-book");
  session.seekToTimestamp(2_000);
  const seekMs = now() - seekStart;
  const afterSeek = session.exportScenario();
  assert.deepEqual(afterSeek.orders, beforeSeek.orders);
  assert.deepEqual(afterSeek.fills, beforeSeek.fills);
  assert.deepEqual(afterSeek.ledger, beforeSeek.ledger);
  assert.deepEqual(afterSeek.journal, beforeSeek.journal);
  assert.deepEqual(afterSeek.journalRetention, beforeSeek.journalRetention);

  const journalEntries = afterSeek.journalRetention.retainedEntries;
  const journalEvictions = afterSeek.journalRetention.evictedEntries;
  gc();
  const heapBeforeDisposeBytes = process.memoryUsage().heapUsed;
  session.dispose();
  gc();
  const heapAfterDisposeBytes = process.memoryUsage().heapUsed;
  return { constructionMs, processingMs, submissionMs, cancellationMs, seekMs, journalEntries, journalEvictions, heapBeforeBytes, heapBeforeDisposeBytes, heapAfterDisposeBytes, heapRetainedAfterDisposeBytes: Math.max(0, heapAfterDisposeBytes - heapBeforeBytes) };
}

function runSample(eventCount) {
  gc();
  const heapBefore = process.memoryUsage().heapUsed;
  const tapeStart = now();
  let tape = makeTape(eventCount);
  const tapeBuildMs = now() - tapeStart;

  const constructionStart = now();
  let session = createResearchExecutionSession(options(tape));
  const constructionMs = now() - constructionStart;

  const submitStart = now();
  session.start();
  session.step();
  session.step();
  const order = session.submitOrder({ idempotencyKey: "benchmark-buy", side: "buy", type: "market", quantity: 1 });
  const submissionMs = now() - submitStart;
  assert.equal(order.status, "pending");

  const processingStart = now();
  while (session.getSnapshot().state !== "completed") session.step();
  const processingMs = now() - processingStart;
  const completed = session.getSnapshot();
  assert.equal(completed.fills.length, 1);
  assert.equal(completed.fills[0]?.simulated, true);

  const reference = new ReferenceExecutionLedger(1_000_000);
  const firstFill = completed.fills[0];
  assert(firstFill !== undefined);
  reference.apply({ side: firstFill.side, price: firstFill.executionPrice, quantity: firstFill.quantity, fee: firstFill.fee });
  const referenceSnapshot = reference.snapshot();
  assert.equal(completed.ledger.cash, referenceSnapshot.cash);
  assert.equal(completed.ledger.position?.costBasis, referenceSnapshot.costBasis);

  const middleTimestamp = 1_001 + Math.floor((eventCount - 3) / 2);
  const seekStart = now();
  session.seekToTimestamp(middleTimestamp);
  const mid = session.getSnapshot();
  session.seekToTimestamp(1_000 + eventCount);
  const reconstructed = session.getSnapshot();
  const seekMs = now() - seekStart;
  assert.equal(mid.orders[0]?.status, "fully-simulated");
  assert.equal(reconstructed.ledger.cash, completed.ledger.cash);
  assert.deepEqual(reconstructed.fills, completed.fills);

  const serializeStart = now();
  const serialized = JSON.stringify(session.exportScenario());
  const serializationMs = now() - serializeStart;
  assert(serialized.length > 0);

  gc();
  const heapBeforeDispose = process.memoryUsage().heapUsed;
  const disposeStart = now();
  session.dispose();
  const disposalMs = now() - disposeStart;
  session = null;
  tape = null;
  gc();
  const heapAfterDispose = process.memoryUsage().heapUsed;
  const correctnessScenario = runCorrectnessScenario();

  return {
    eventCount,
    tapeBuildMs,
    constructionMs,
    submissionMs,
    processingMs,
    processingMsPerEvent: processingMs / Math.max(1, eventCount - 2),
    seekMs,
    serializationMs,
    serializedBytes: Buffer.byteLength(serialized),
    heapBeforeBytes: heapBefore,
    heapBeforeDisposeBytes: heapBeforeDispose,
    heapAfterDisposeBytes: heapAfterDispose,
    heapRetainedAfterDisposeBytes: Math.max(0, heapAfterDispose - heapBefore),
    forcedGc: typeof globalThis.gc === "function",
    correctnessScenario,
  };
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.max(0, Math.ceil(ordered.length * fraction) - 1));
  return ordered[index] ?? 0;
}

function summarize(samples, key) {
  const values = samples.map((sample) => sample[key]);
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

const samplesBySize = {};
for (const eventCount of sizes) {
  const sampleCount = eventCount === 100_000 ? 3 : 5;
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) samples.push(runSample(eventCount));
  samplesBySize[eventCount] = {
    sampleCount,
    samples,
    metrics: Object.fromEntries([
      "tapeBuildMs",
      "constructionMs",
      "submissionMs",
      "processingMs",
      "processingMsPerEvent",
      "seekMs",
      "serializationMs",
      "serializedBytes",
      "heapBeforeBytes",
      "heapBeforeDisposeBytes",
      "heapAfterDisposeBytes",
      "heapRetainedAfterDisposeBytes",
      "correctnessScenario.constructionMs",
      "correctnessScenario.processingMs",
      "correctnessScenario.submissionMs",
      "correctnessScenario.cancellationMs",
      "correctnessScenario.seekMs",
      "correctnessScenario.journalEntries",
      "correctnessScenario.journalEvictions",
      "correctnessScenario.heapBeforeBytes",
      "correctnessScenario.heapBeforeDisposeBytes",
      "correctnessScenario.heapAfterDisposeBytes",
      "correctnessScenario.heapRetainedAfterDisposeBytes",
    ].map((key) => {
      const values = key.startsWith("correctnessScenario.")
        ? samples.map((sample) => sample.correctnessScenario[key.slice("correctnessScenario.".length)])
        : samples.map((sample) => sample[key]);
      return [key, { median: percentile(values, 0.5), p95: percentile(values, 0.95), min: Math.min(...values), max: Math.max(...values) }];
    })),
  };
}

let gitSha = "unknown";
try {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // The benchmark remains useful in a source archive without Git metadata.
}

console.log(JSON.stringify({
  schemaVersion: 2,
  gitSha,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  forcedGc: typeof globalThis.gc === "function",
  workloads: samplesBySize,
}, null, 2));
