import assert from "node:assert/strict";
import test from "node:test";
import { createMarketReplayTape, type MarketReplayEvent, type MarketReplayTape } from "../src/replay/market-event-tape.js";
import {
  compareResearchScenarios,
  ResearchScenarioComparisonError,
  type ResearchScenarioComparisonResult,
} from "../src/research-execution/index.js";
import { createResearchExecutionSession } from "../src/research-execution/index.js";
import type { ResearchExecutionOptions, ResearchScenarioArtifact } from "../src/research-execution/types.js";

const source = { id: "comparison-source", version: "generation-1" } as const;
const instrumentId = "COMPARE";
const venueId = "VENUE";

function sourceStatus(id: string, time: number): MarketReplayEvent {
  return { id, kind: "source-status", instrumentId, venueId, time, revision: 0, source, status: "available", coverage: "complete" };
}

function book(id: string, time: number): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId, venueId, time, sequence: 1, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], tickSize: 1, source };
  return { id, kind: "order-book-snapshot", instrumentId, venueId, time, sequence: 1, revision: 0, source, snapshot };
}

function trade(id: string, time: number): MarketReplayEvent {
  const value = { id, instrumentId, venueId, time, price: 101, quantity: 2, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source };
  return { id, kind: "trade", instrumentId, venueId, time, revision: 0, source, trade: value };
}

function createTape(id = "comparison-tape"): MarketReplayTape {
  return createMarketReplayTape({ id, events: [sourceStatus("status", 1_000), book("book", 1_001), trade("trade-1", 1_002), trade("trade-2", 1_003)] });
}

function createOptions(tape: MarketReplayTape, scenarioId: string, commission = 1): ResearchExecutionOptions {
  return {
    scenarioId,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000,
    currency: "USD",
    commission: { type: "fixed", value: commission },
    slippage: { type: "fixed", value: 0 },
  };
}

function createArtifact(tape: MarketReplayTape, scenarioId: string, withOrder: boolean): ResearchScenarioArtifact {
  const session = createResearchExecutionSession(createOptions(tape, scenarioId));
  try {
    session.start();
    session.step();
    session.step();
    if (withOrder) session.submitOrder({ idempotencyKey: `${scenarioId}-buy`, side: "buy", type: "market", quantity: 1 });
    for (let index = 0; index < 16 && session.getSnapshot().state !== "completed"; index += 1) session.step();
    assert.equal(session.getSnapshot().state, "completed");
    return session.exportScenarioArtifact();
  } finally {
    session.dispose();
  }
}

function findCandidate(result: ResearchScenarioComparisonResult, candidateId: string) {
  const candidate = result.candidates.find((value) => value.candidateId === candidateId);
  assert.ok(candidate);
  return candidate;
}

test("comparison keeps the baseline isolated and reports controlled fee sensitivity", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", true);
  const before = JSON.stringify(baseline);
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "higher-fee", patch: { commission: { type: "fixed", value: 5 } } }],
  });
  const candidate = findCandidate(result, "higher-fee");
  assert.ok(result.baseline);
  assert.equal(candidate.compatibility, "identical-decision-history");
  assert.ok(candidate.scenario);
  assert.equal(candidate.scenario.metrics.totalFees - result.baseline.metrics.totalFees, 4);
  assert.equal(candidate.differences?.totalFees.delta, 4);
  assert.equal(JSON.stringify(baseline), before, "comparison must not mutate the baseline artifact");
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(candidate), true);
});

test("different decision histories remain descriptive and are not ranked", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", true);
  const different = createArtifact(tape, "different-scenario", false);
  const result = compareResearchScenarios({ baseline: { artifact: baseline, tape }, candidates: [{ candidateId: "different", artifact: different }] });
  const candidate = findCandidate(result, "different");
  assert.equal(candidate.compatibility, "decision-history-different");
  assert.equal(candidate.differences?.mode, "descriptive-different-history");
  assert.equal(candidate.error, null);
});

test("latency patches that would rewrite durable decision metadata fail closed", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", true);
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "delayed", patch: { latency: { type: "fixed", delayMs: 500 } } }],
  });
  const candidate = findCandidate(result, "delayed");
  assert.equal(candidate.status, "incompatible");
  assert.equal(candidate.error?.code, "ResearchExecutionValidationError");
  assert.equal(candidate.scenario, null);
});

test("incompatible artifact tape identity is isolated to its candidate", () => {
  const tape = createTape();
  const otherTape = createTape("other-tape");
  const baseline = createArtifact(tape, "comparison-scenario", false);
  const incompatible = createArtifact(otherTape, "other-scenario", false);
  const result = compareResearchScenarios({ baseline: { artifact: baseline, tape }, candidates: [{ candidateId: "other-tape", artifact: incompatible }] });
  const candidate = findCandidate(result, "other-tape");
  assert.equal(candidate.compatibility, "not-evaluated");
  assert.equal(candidate.status, "incompatible");
  assert.equal(candidate.error?.code, "TAPE_MISMATCH");
});

test("event-visit budget rejects before constructing comparison sessions", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", false);
  assert.throws(
    () => compareResearchScenarios({ baseline: { artifact: baseline, tape }, candidates: [], maxEligibleEventVisits: 3 }),
    (error: unknown) => error instanceof ResearchScenarioComparisonError && error.code === "EVENT_VISIT_LIMIT",
  );
});

test("checkpoint diagnostics do not change comparison evidence", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", true);
  const disabled = compareResearchScenarios({ baseline: { artifact: baseline, tape }, candidates: [] });
  const enabled = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [],
    checkpoints: { enabled: true, interval: 1, maxCheckpoints: 8, memoryBudgetBytes: 2_000_000 },
  });
  assert.equal(enabled.baseline?.evidence.fingerprint, disabled.baseline?.evidence.fingerprint);
  assert.equal(enabled.comparisonFingerprint, disabled.comparisonFingerprint);
});

test("cancellation is explicit and leaves no session in the result", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", false);
  const controller = new AbortController();
  controller.abort();
  assert.throws(
    () => compareResearchScenarios({ baseline: { artifact: baseline, tape }, candidates: [], signal: controller.signal }),
    (error: unknown) => error instanceof ResearchScenarioComparisonError && error.code === "CANCELLED",
  );
});
