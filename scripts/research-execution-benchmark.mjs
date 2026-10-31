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

function sourceStatus(id = "source-status", time = 1_000) {
  return { id, kind: "source-status", instrumentId, venueId, time, revision: 0, source, status: "available", coverage: "complete" };
}

function initialBook(id = "book-0", time = 1_000) {
  return {
    id,
    kind: "order-book-snapshot",
    instrumentId,
    venueId,
    time,
    sequence: 1,
    revision: 0,
    source,
    snapshot: {
      version: 1,
      instrumentId,
      venueId,
      time,
      sequence: 1,
      bids: [{ price: 99, quantity: 1_000_000 }],
      asks: [{ price: 101, quantity: 1_000_000 }],
      tickSize: 1,
      source,
    },
  };
}

function tradeEvent(index, time = 1_001 + index, price = 100 + (index % 10)) {
  return {
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
      price,
      quantity: 1,
      aggressorSide: "buy",
      sideQuality: "observed",
      revision: 0,
      source,
    },
  };
}

function bookDelta(index, sequence) {
  const time = 1_001 + index;
  return {
    id: `book-delta-${index}`,
    kind: "order-book-delta",
    instrumentId,
    venueId,
    time,
    sequence,
    revision: 0,
    source,
    delta: {
      version: 1,
      id: `book-delta-${index}`,
      instrumentId,
      venueId,
      time,
      sequence,
      previousSequence: sequence - 1,
      quantityMode: "absolute",
      bids: [{ price: 99, quantity: 1_000_000 - (index % 100) }],
      asks: [{ price: 101, quantity: 1_000_000 - (index % 100) }],
      source,
    },
  };
}

function makeTape(eventCount, mode = "trades") {
  const events = [sourceStatus(), initialBook()];
  for (let index = 0; index < eventCount - 2; index += 1) {
    events.push(mode === "book-heavy" ? bookDelta(index, index + 2) : tradeEvent(index));
  }
  return createMarketReplayTape({ id: `research-benchmark-${mode}-${eventCount}`, events });
}

function makeCorrectnessTape() {
  const events = [sourceStatus("correctness-status"), { ...initialBook("correctness-book"), snapshot: { ...initialBook("correctness-book").snapshot, asks: [{ price: 101, quantity: 1 }] } }];
  for (let index = 0; index < 12; index += 1) events.push(tradeEvent(index, 1_001 + index, 100));
  return createMarketReplayTape({ id: "research-correctness-14", events });
}

function options(tape, scenarioId, maxJournalEntries = 10_000) {
  return {
    scenarioId,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    maxJournalEntries,
  };
}

function eventCounts(tape) {
  return Object.fromEntries([...new Set(tape.events.map((event) => event.kind))].sort().map((kind) => [kind, tape.events.filter((event) => event.kind === kind).length]));
}

function runScenario({ eventCount, tape, tapeBuildMs, mode, subscriberCount = 0, sampleIndex = 0 }) {
  gc();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const constructionStart = now();
  const parityMode = mode === "headless" || mode === "one-subscriber" || mode === "multi-subscriber";
  const scenarioId = parityMode ? `benchmark-parity-${eventCount}-${sampleIndex}` : `benchmark-${mode}-${eventCount}-${sampleIndex}`;
  let session = createResearchExecutionSession(options(tape, scenarioId));
  const constructionMs = now() - constructionStart;
  let notifications = 0;
  const unsubscribers = Array.from({ length: subscriberCount }, () => session.subscribe(() => { notifications += 1; }));

  session.start();
  session.step();
  session.step();
  const submissionStart = now();
  const initialOrder = session.submitOrder({ idempotencyKey: "benchmark-buy", side: "buy", type: "market", quantity: 1 });
  const submissionMs = now() - submissionStart;
  assert.equal(initialOrder.status, "pending");

  const decisionCount = mode === "decision-heavy" ? Math.max(1, Math.floor((eventCount - 2) / 100)) : 0;
  const decisionStride = decisionCount === 0 ? Number.POSITIVE_INFINITY : Math.max(1, Math.floor((eventCount - 2) / decisionCount));
  let decisionSubmissionMs = 0;
  let decisionCancellationMs = 0;
  const processingStart = now();
  for (let index = 2; index < eventCount; index += 1) {
    if (mode === "decision-heavy" && (index - 2) % decisionStride === 0) {
      const decisionStart = now();
      const pending = session.submitOrder({ idempotencyKey: `decision-${index}`, side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
      decisionSubmissionMs += now() - decisionStart;
      const cancelStart = now();
      session.cancelOrder(pending.id);
      decisionCancellationMs += now() - cancelStart;
    }
    session.step();
  }
  const processingMs = now() - processingStart;
  let completedSnapshot = session.getSnapshot();
  assert.equal(completedSnapshot.fills.length, 1);
  assert.equal(completedSnapshot.fills[0]?.simulated, true);
  const completedExport = session.exportScenario();

  const snapshotStart = now();
  let snapshotCursorChecksum = 0;
  for (let index = 0; index < 25; index += 1) snapshotCursorChecksum += session.getSnapshot().cursor.eventIndex ?? -1;
  const fullSnapshotReadMs = now() - snapshotStart;
  assert.equal(snapshotCursorChecksum, 25 * (eventCount - 1));

  const reference = new ReferenceExecutionLedger(1_000_000);
  const firstFill = completedSnapshot.fills[0];
  assert(firstFill !== undefined);
  reference.apply({ side: firstFill.side, price: firstFill.executionPrice, quantity: firstFill.quantity, fee: firstFill.fee });
  assert.equal(completedSnapshot.ledger.cash, reference.snapshot().cash);
  assert.equal(completedSnapshot.ledger.position?.costBasis, reference.snapshot().costBasis);

  const middleTimestamp = 1_001 + Math.floor((eventCount - 3) / 2);
  const seekStart = now();
  session.seekToTimestamp(middleTimestamp);
  const middle = session.getSnapshot();
  session.seekToTimestamp(1_000 + eventCount);
  const reconstructed = session.getSnapshot();
  const seekReconstructionMs = now() - seekStart;
  assert.ok(middle.cursor.eventIndex !== null && middle.cursor.eventIndex < eventCount - 1);
  assert.deepEqual(session.exportScenario(), completedExport);
  assert.deepEqual(reconstructed.fills, completedSnapshot.fills);

  const serializationStart = now();
  const serialized = JSON.stringify(completedExport);
  const serializationMs = now() - serializationStart;
  assert(serialized.length > 0);

  gc();
  const heapBeforeDisposeBytes = process.memoryUsage().heapUsed;
  const disposeStart = now();
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  session.dispose();
  session.dispose();
  const disposalMs = now() - disposeStart;
  session = null;
  completedSnapshot = null;
  gc();
  const heapAfterDisposeBytes = process.memoryUsage().heapUsed;
  return {
    mode,
    eventCount,
    eventCounts: eventCounts(tape),
    subscriberCount,
    notifications,
    decisionCount,
    tapeFingerprint: tape.fingerprint,
    tapeBuildMs,
    constructionMs,
    submissionMs,
    decisionSubmissionMs,
    decisionCancellationMs,
    processingMs,
    processingMsPerEvent: processingMs / Math.max(1, eventCount - 2),
    fullSnapshotReadMs,
    seekReconstructionMs,
    serializationMs,
    serializedBytes: Buffer.byteLength(serialized),
    disposalMs,
    heapBeforeBytes,
    heapBeforeDisposeBytes,
    heapAfterDisposeBytes,
    heapRetainedAfterDisposeBytes: Math.max(0, heapAfterDisposeBytes - heapBeforeBytes),
    forcedGc: typeof globalThis.gc === "function",
    exportForParity: completedExport,
  };
}

function runCorrectnessSample(sampleIndex) {
  gc();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const tape = makeCorrectnessTape();
  const constructionStart = now();
  const session = createResearchExecutionSession({ ...options(tape, `benchmark-correctness-${sampleIndex}`, 4), scenarioId: `benchmark-correctness-${sampleIndex}` });
  const constructionMs = now() - constructionStart;
  session.start();
  session.step();
  session.step();
  const partial = session.submitOrder({ idempotencyKey: "partial", side: "buy", type: "market", quantity: 2 });
  const processingStart = now();
  session.step();
  const firstEventProcessingMs = now() - processingStart;
  const cancellationStart = now();
  session.cancelOrder(partial.id);
  for (let index = 0; index < 5; index += 1) {
    const pending = session.submitOrder({ idempotencyKey: `cancel-${index}`, side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
    session.cancelOrder(pending.id);
  }
  const cancellationMs = now() - cancellationStart;
  const remainingProcessingStart = now();
  for (let index = 3; index < 14; index += 1) session.step();
  const processingMs = firstEventProcessingMs + (now() - remainingProcessingStart);
  const beforeSeek = session.exportScenario();
  assert.equal(beforeSeek.fills.length, 1);
  assert.equal(beforeSeek.orders.find((order) => order.id === partial.id)?.status, "cancelled");
  assert.equal(beforeSeek.journalRetention.retainedEntries, 4);
  assert.ok(beforeSeek.journalRetention.evictedEntries > 0);
  const reference = new ReferenceExecutionLedger(1_000_000);
  reference.apply({ side: "buy", price: 101, quantity: 1, fee: 1 });
  assert.equal(beforeSeek.ledger.cash, reference.snapshot().cash);
  assert.equal(beforeSeek.ledger.position?.costBasis, reference.snapshot().costBasis);
  const seekStart = now();
  session.seekToEvent("correctness-book");
  session.seekToTimestamp(2_000);
  const afterSeek = session.exportScenario();
  const seekMs = now() - seekStart;
  assert.deepEqual(afterSeek.orders, beforeSeek.orders);
  assert.deepEqual(afterSeek.fills, beforeSeek.fills);
  assert.deepEqual(afterSeek.ledger, beforeSeek.ledger);
  assert.deepEqual(afterSeek.journal, beforeSeek.journal);
  assert.deepEqual(afterSeek.diagnostics, beforeSeek.diagnostics);
  const serializedBytes = Buffer.byteLength(JSON.stringify(afterSeek));
  gc();
  const heapBeforeDisposeBytes = process.memoryUsage().heapUsed;
  session.dispose();
  gc();
  const heapAfterDisposeBytes = process.memoryUsage().heapUsed;
  return {
    eventCount: 14,
    eventCounts: eventCounts(tape),
    constructionMs,
    processingMs,
    cancellationMs,
    seekReconstructionMs: seekMs,
    serializedBytes,
    journalEntries: afterSeek.journalRetention.retainedEntries,
    journalEvictions: afterSeek.journalRetention.evictedEntries,
    heapBeforeBytes,
    heapBeforeDisposeBytes,
    heapAfterDisposeBytes,
    heapRetainedAfterDisposeBytes: Math.max(0, heapAfterDisposeBytes - heapBeforeBytes),
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
  return { median: percentile(values, 0.5), p95: percentile(values, 0.95), min: Math.min(...values), max: Math.max(...values) };
}

function summarizeScenario(samples) {
  const keys = [
    "tapeBuildMs", "constructionMs", "submissionMs", "decisionSubmissionMs", "decisionCancellationMs", "processingMs", "processingMsPerEvent",
    "fullSnapshotReadMs", "seekReconstructionMs", "serializationMs", "serializedBytes", "disposalMs", "heapBeforeBytes", "heapBeforeDisposeBytes",
    "heapAfterDisposeBytes", "heapRetainedAfterDisposeBytes", "notifications", "decisionCount",
  ];
  return Object.fromEntries(keys.map((key) => [key, summarize(samples, key)]));
}

function summarizeCorrectness(samples) {
  return Object.fromEntries([
    "constructionMs", "processingMs", "cancellationMs", "seekReconstructionMs", "serializedBytes", "journalEntries", "journalEvictions",
    "heapBeforeBytes", "heapBeforeDisposeBytes", "heapAfterDisposeBytes", "heapRetainedAfterDisposeBytes",
  ].map((key) => [key, summarize(samples, key)]));
}

function stripParity(sample) {
  const { exportForParity: _exportForParity, ...metrics } = sample;
  return metrics;
}

function runWorkload(eventCount) {
  const sampleCount = eventCount === 100_000 ? 3 : 5;
  const scenarioSamples = { headless: [], oneSubscriber: [], multiSubscriber: [], decisionHeavy: [], bookHeavy: [] };
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const build = (mode = "trades") => {
      const tapeStart = now();
      const tape = makeTape(eventCount, mode);
      return { tape, tapeBuildMs: now() - tapeStart };
    };
    const headlessTape = build();
    const oneSubscriberTape = build();
    const multiSubscriberTape = build();
    const decisionTape = build();
    const bookHeavyTape = build("book-heavy");
    const headless = runScenario({ eventCount, ...headlessTape, mode: "headless", sampleIndex });
    const oneSubscriber = runScenario({ eventCount, ...oneSubscriberTape, mode: "one-subscriber", subscriberCount: 1, sampleIndex });
    const multiSubscriber = runScenario({ eventCount, ...multiSubscriberTape, mode: "multi-subscriber", subscriberCount: 4, sampleIndex });
    assert.deepEqual(oneSubscriber.exportForParity, headless.exportForParity);
    assert.deepEqual(multiSubscriber.exportForParity, headless.exportForParity);
    scenarioSamples.headless.push(stripParity(headless));
    scenarioSamples.oneSubscriber.push(stripParity(oneSubscriber));
    scenarioSamples.multiSubscriber.push(stripParity(multiSubscriber));
    scenarioSamples.decisionHeavy.push(stripParity(runScenario({ eventCount, ...decisionTape, mode: "decision-heavy", sampleIndex })));
    scenarioSamples.bookHeavy.push(stripParity(runScenario({ eventCount, ...bookHeavyTape, mode: "book-heavy", sampleIndex })));
  }
  return {
    eventCount,
    sampleCount,
    eventCounts: scenarioSamples.headless[0]?.eventCounts ?? {},
    profiles: Object.fromEntries(Object.entries(scenarioSamples).map(([name, samples]) => [name, { samples, metrics: summarizeScenario(samples) }])),
    parity: { oneSubscriberMatchesHeadless: true, multiSubscriberMatchesHeadless: true },
  };
}

let gitSha = "unknown";
try {
  gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
} catch {
  // The benchmark remains useful in a source archive without Git metadata.
}

const correctnessSamples = Array.from({ length: 7 }, (_, index) => runCorrectnessSample(index));
const workloads = Object.fromEntries(sizes.map((eventCount) => [eventCount, runWorkload(eventCount)]));

console.log(JSON.stringify({
  schemaVersion: 4,
  gitSha,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  forcedGc: typeof globalThis.gc === "function",
  profiles: {
    headless: "zero replay observers; emit fast path must not materialize a snapshot",
    oneSubscriber: "one observer; preserves the existing snapshot delivery contract",
    multiSubscriber: "four observers; parity verifies shared causal state and notification fan-out",
    decisionHeavy: "headless replay with deterministic limit-order submit/cancel decisions",
    bookHeavy: "headless replay with one synchronized Level-2 delta per event",
    fullSnapshotReads: "25 explicit getSnapshot calls after each completed workload",
    correctnessMicrobenchmark14: "fixed 14-event corrective scenario; independent of 1k/10k/100k workload summaries",
  },
  correctnessMicrobenchmark14: {
    eventCount: 14,
    sampleCount: correctnessSamples.length,
    eventCounts: correctnessSamples[0]?.eventCounts ?? {},
    samples: correctnessSamples,
    metrics: summarizeCorrectness(correctnessSamples),
  },
  workloads,
}, null, 2));
