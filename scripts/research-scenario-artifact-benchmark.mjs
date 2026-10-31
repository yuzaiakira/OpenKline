import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createMarketReplayTape } from "../dist/src/replay/market-event-tape.js";
import {
  createResearchScenarioArtifact,
  createResearchExecutionSession,
  parseResearchScenarioArtifact,
  restoreResearchScenario,
  serializeResearchScenarioArtifact,
} from "../dist/src/research-execution/index.js";

const instrumentId = "SCENARIO-BENCHMARK";
const venueId = "BENCHMARK-VENUE";
const source = { id: "scenario-benchmark-source", version: "generation-1" };
const sizes = [1_000, 10_000, 100_000];
const sampleCounts = new Map([[1_000, 3], [10_000, 3], [100_000, 2]]);

function now() {
  return performance.now();
}

function gc() {
  if (typeof globalThis.gc === "function") globalThis.gc();
}

function sourceStatus() {
  return { id: "source-status", kind: "source-status", instrumentId, venueId, time: 1_000, revision: 0, source, status: "available", coverage: "complete" };
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

function trade(index) {
  const time = 1_001 + index;
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
      price: 100 + (index % 10),
      quantity: 1,
      aggressorSide: "buy",
      sideQuality: "observed",
      revision: 0,
      source,
    },
  };
}

function makeTape(eventCount) {
  const events = [sourceStatus(), initialBook()];
  for (let index = 0; index < eventCount - 2; index += 1) events.push(trade(index));
  return createMarketReplayTape({ id: `scenario-artifact-benchmark-${eventCount}`, events });
}

function sessionOptions(tape) {
  return {
    scenarioId: `scenario-benchmark-${tape.events.length}`,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    execution: { maxParticipationRate: 1, allowPartialFills: true, passivePolicy: "no-inferred-passive-fill" },
    maxJournalEntries: 64,
    maxDepth: 100,
    checkpoints: { enabled: false },
  };
}

function runSample(eventCount, sampleIndex) {
  gc();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const tapeStart = now();
  let tape = makeTape(eventCount);
  const tapeBuildMs = now() - tapeStart;
  const sessionStart = now();
  let session = createResearchExecutionSession(sessionOptions(tape));
  session.start();
  session.step();
  session.step();
  const decisionCount = Math.max(32, Math.floor((eventCount - 2) / 100));
  const decisionStart = now();
  for (let index = 0; index < decisionCount; index += 1) {
    const order = session.submitOrder({ idempotencyKey: `cancel-${index}`, side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
    session.cancelOrder(order.id, `bounded-cancel-${index}`);
  }
  const decisionMs = now() - decisionStart;
  const continuationScenario = session.exportScenario();
  const continuationArtifact = session.exportScenarioArtifact({ includeExpectedResult: false });
  const processingStart = now();
  for (let index = 2; index < eventCount; index += 1) session.step();
  const processingMs = now() - processingStart;
  assert.equal(session.getSnapshot().state, "completed");
  const artifactStart = now();
  let artifact = session.exportScenarioArtifact();
  const artifactExportMs = now() - artifactStart;
  const serializeStart = now();
  let serialized = serializeResearchScenarioArtifact(artifact);
  const serializationMs = now() - serializeStart;
  const parseStart = now();
  let parsed = parseResearchScenarioArtifact(serialized);
  const validationMs = now() - parseStart;
  let original = session.exportScenario();
  const invalidStart = now();
  let invalidRejected = false;
  try {
    parseResearchScenarioArtifact({ ...artifact, invalidField: true });
  } catch {
    invalidRejected = true;
  }
  const failedValidationMs = now() - invalidStart;
  assert.equal(invalidRejected, true);
  const restoreStart = now();
  let restored = restoreResearchScenario({ artifact: parsed, tape });
  const reconstructionMs = now() - restoreStart;
  assert.equal(restored.status, "verified");
  assert.deepEqual(restored.actual, original);
  assert.equal(restored.actual.decisions.length, decisionCount * 2);
  assert.equal(restored.actual.journalRetention.complete, false);
  const continuationParseStart = now();
  const continuationParsed = parseResearchScenarioArtifact(serializeResearchScenarioArtifact(continuationArtifact));
  const continuationValidationMs = now() - continuationParseStart;
  const continuationRestoreStart = now();
  const continued = restoreResearchScenario({ artifact: continuationParsed, tape });
  const continuationRestoreMs = now() - continuationRestoreStart;
  assert.equal(continued.status, "no-expected-result");
  const continuationSubmitStart = now();
  const continuedOrder = continued.session.submitOrder({
    idempotencyKey: `continued-${eventCount}`,
    side: "buy",
    type: "limit",
    quantity: 1,
    limitPrice: 98,
  });
  const continuedSubmitMs = now() - continuationSubmitStart;
  assert.equal(continuedOrder.status, "pending");
  continued.session.step();
  const continuationReexportStart = now();
  const continuedArtifact = continued.session.exportScenarioArtifact({ includeExpectedResult: false });
  const continuedReexportMs = now() - continuationReexportStart;
  assert.equal(continuedArtifact.decisions.length, decisionCount * 2 + 1);
  const invalidContinuationArtifact = createResearchScenarioArtifact({
    scenario: {
      ...continuationScenario,
      decisions: continuationScenario.decisions.map((decision, index) => index === 0
        ? { ...decision, decisionEventId: "missing-continuation-event" }
        : decision),
    },
    tape,
    frontier: continuationArtifact.replay.frontier,
    options: { includeExpectedResult: false },
  });
  const failedRestoreStart = now();
  let failedRestoreRejected = false;
  try {
    restoreResearchScenario({ artifact: invalidContinuationArtifact, tape });
  } catch {
    failedRestoreRejected = true;
  }
  const failedRestoreDisposalMs = now() - failedRestoreStart;
  assert.equal(failedRestoreRejected, true);
  const tapeEvents = tape.events.length;
  const journalRetention = { ...artifact.journalRetention };
  const artifactBytes = Buffer.byteLength(serialized, "utf8");
  const heapBeforeDisposeBytes = process.memoryUsage().heapUsed;
  restored.session.dispose();
  continued.session.dispose();
  session.dispose();
  restored.session.dispose();
  restored = null;
  session = null;
  original = null;
  parsed = null;
  serialized = null;
  artifact = null;
  tape = null;
  gc();
  const heapAfterDisposeBytes = process.memoryUsage().heapUsed;
  return {
    eventCount,
    sampleRole: sampleIndex === 0 ? "cold" : "warm",
    decisionCount: decisionCount * 2,
    tapeEvents,
    tapeBuildMs,
    sessionAndReplayMs: now() - sessionStart,
    decisionMs,
    processingMs,
    artifactExportMs,
    serializationMs,
    validationMs,
    reconstructionMs,
    failedValidationMs,
    continuationValidationMs,
    continuationRestoreMs,
    continuedSubmitMs,
    continuedReexportMs,
    failedRestoreDisposalMs,
    artifactBytes,
    journalRetention,
    heapBeforeBytes,
    heapBeforeDisposeBytes,
    heapAfterDisposeBytes,
    heapRetainedAfterDisposeBytes: Math.max(0, heapAfterDisposeBytes - heapBeforeBytes),
  };
}

function summarize(samples, key) {
  const values = samples.map((sample) => sample[key]).sort((left, right) => left - right);
  const p95Index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * 0.95) - 1));
  return {
    median: values[Math.floor(values.length / 2)],
    p95: values[p95Index],
    min: values[0],
    max: values.at(-1),
    p95Method: "nearest-rank-ceil",
    p95SampleCount: values.length,
  };
}

const workloads = {};
for (const eventCount of sizes) {
  const samples = [];
  const sampleCount = sampleCounts.get(eventCount) ?? 1;
  for (let index = 0; index < sampleCount; index += 1) samples.push(runSample(eventCount, index));
  workloads[eventCount] = {
    eventCount,
    sampleCount,
    decisionCount: samples[0]?.decisionCount ?? 0,
    artifactBytes: summarize(samples, "artifactBytes"),
    tapeBuildMs: summarize(samples, "tapeBuildMs"),
    decisionMs: summarize(samples, "decisionMs"),
    processingMs: summarize(samples, "processingMs"),
    artifactExportMs: summarize(samples, "artifactExportMs"),
    serializationMs: summarize(samples, "serializationMs"),
    validationMs: summarize(samples, "validationMs"),
    reconstructionMs: summarize(samples, "reconstructionMs"),
    failedValidationMs: summarize(samples, "failedValidationMs"),
    continuationValidationMs: summarize(samples, "continuationValidationMs"),
    continuationRestoreMs: summarize(samples, "continuationRestoreMs"),
    continuedSubmitMs: summarize(samples, "continuedSubmitMs"),
    continuedReexportMs: summarize(samples, "continuedReexportMs"),
    failedRestoreDisposalMs: summarize(samples, "failedRestoreDisposalMs"),
    heapRetainedAfterDisposeBytes: summarize(samples, "heapRetainedAfterDisposeBytes"),
    sampleRoles: samples.map((sample) => sample.sampleRole),
    p95Caveat: sampleCount < 3 ? "p95 is the maximum observed value for this two-sample workload; it is not a stable tail estimate" : "p95 is a nearest-rank estimate over the recorded samples",
    journalRetention: samples[0]?.journalRetention,
  };
}

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
console.log(JSON.stringify({
  schemaVersion: 1,
  gitSha,
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  forcedGc: typeof globalThis.gc === "function",
  workloads,
}, null, 2));
