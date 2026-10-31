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
    ].map((key) => [key, summarize(samples, key)])),
  };
}

let gitSha = "unknown";
try {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // The benchmark remains useful in a source archive without Git metadata.
}

console.log(JSON.stringify({
  schemaVersion: 1,
  gitSha,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  forcedGc: typeof globalThis.gc === "function",
  workloads: samplesBySize,
}, null, 2));
