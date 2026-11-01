import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { createMarketReplayTape } from "../dist/src/replay/market-event-tape.js";
import { compareResearchScenarios, createResearchExecutionSession } from "../dist/src/research-execution/index.js";

const instrumentId = "PHASE-16-3-BENCHMARK";
const venueId = "PHASE-16-3-VENUE";
const source = { id: "phase-16-3-source", version: "generation-1" };
const sizes = [1_000, 10_000, 100_000];
const sampleCounts = new Map([[1_000, 3], [10_000, 3], [100_000, 2]]);

function now() { return performance.now(); }
function gc() { if (typeof globalThis.gc === "function") globalThis.gc(); }

function makeTape(eventCount) {
  const events = [
    { id: "source-status", kind: "source-status", instrumentId, venueId, time: 1_000, revision: 0, source, status: "available", coverage: "complete" },
    {
      id: "book-0", kind: "order-book-snapshot", instrumentId, venueId, time: 1_000, sequence: 1, revision: 0, source,
      snapshot: { version: 1, instrumentId, venueId, time: 1_000, sequence: 1, bids: [{ price: 99, quantity: 1_000_000 }], asks: [{ price: 101, quantity: 1_000_000 }], tickSize: 1, source },
    },
  ];
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
      trade: { id: `trade-${index}`, instrumentId, venueId, time, price: 101, quantity: 1, aggressorSide: "buy", sideQuality: "observed", revision: 0, source },
    });
  }
  return createMarketReplayTape({ id: `phase-16-3-comparison-${eventCount}`, events });
}

function createArtifact(tape) {
  const session = createResearchExecutionSession({
    scenarioId: `phase-16-3-baseline-${tape.events.length}`,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    checkpoints: { enabled: false },
  });
  try {
    session.start();
    session.step();
    session.step();
    session.submitOrder({ idempotencyKey: "benchmark-buy", side: "buy", type: "market", quantity: 1 });
    for (let index = 2; index < tape.events.length; index += 1) session.step();
    assert.equal(session.getSnapshot().state, "completed");
    return session.exportScenarioArtifact();
  } finally {
    session.dispose();
  }
}

function runSample(eventCount, sampleIndex) {
  gc();
  const heapBeforeBytes = process.memoryUsage().heapUsed;
  const tapeStart = now();
  let tape = makeTape(eventCount);
  const tapeBuildMs = now() - tapeStart;
  const artifactStart = now();
  let artifact = createArtifact(tape);
  const artifactBuildMs = now() - artifactStart;
  const comparisonStart = now();
  let result = compareResearchScenarios({
    baseline: { artifact, tape },
    candidates: [
      { candidateId: "fee-sensitivity", patch: { commission: { type: "fixed", value: 5 } } },
      { candidateId: "participation-sensitivity", patch: { execution: { maxParticipationRate: 0.5 } } },
    ],
    maxScenarios: 8,
    maxEligibleEventVisits: 1_000_000,
    maxSerializedResultBytes: 8 * 1024 * 1024,
    maxResultRecords: 1_000,
    maxDiagnostics: 100,
    checkpoints: { enabled: false },
  });
  const comparisonMs = now() - comparisonStart;
  assert.equal(result.baseline?.evidence.fingerprint.length, 16);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates.every((candidate) => candidate.error === null), true);
  assert.equal(result.processedEligibleEventVisits, eventCount * 3);
  const resultBytes = Buffer.byteLength(JSON.stringify(result), "utf8");
  const status = result.status;
  result = null;
  artifact = null;
  tape = null;
  gc();
  const heapAfterReleaseBytes = process.memoryUsage().heapUsed;
  return {
    eventCount,
    sampleRole: sampleIndex === 0 ? "cold" : "warm",
    scenarioCount: 3,
    processedEligibleEventVisits: eventCount * 3,
    tapeBuildMs,
    artifactBuildMs,
    comparisonMs,
    resultBytes,
    status,
    heapBeforeBytes,
    heapAfterReleaseBytes,
    heapRetainedAfterReleaseBytes: Math.max(0, heapAfterReleaseBytes - heapBeforeBytes),
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
    sampleCount: values.length,
    p95Method: "nearest-rank-ceil",
  };
}

const workloads = {};
for (const eventCount of sizes) {
  const samples = [];
  for (let index = 0; index < (sampleCounts.get(eventCount) ?? 1); index += 1) samples.push(runSample(eventCount, index));
  workloads[eventCount] = {
    eventCount,
    scenarioCount: 3,
    sampleCount: samples.length,
    tapeBuildMs: summarize(samples, "tapeBuildMs"),
    artifactBuildMs: summarize(samples, "artifactBuildMs"),
    comparisonMs: summarize(samples, "comparisonMs"),
    resultBytes: summarize(samples, "resultBytes"),
    heapRetainedAfterReleaseBytes: summarize(samples, "heapRetainedAfterReleaseBytes"),
    processedEligibleEventVisits: samples[0]?.processedEligibleEventVisits ?? 0,
    statuses: samples.map((sample) => sample.status),
    p95Caveat: samples.length < 3 ? "p95 is the maximum observed value for this two-sample workload" : "nearest-rank p95 over the recorded samples",
  };
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
  workloadPolicy: "three sequential scenarios: baseline plus two assumption patches; checkpoints disabled; result summaries bounded",
  resourcePolicy: { maxScenarios: 8, maxEligibleEventVisits: 1_000_000, maxSerializedResultBytes: 8 * 1024 * 1024 },
  workloads,
}, null, 2));
