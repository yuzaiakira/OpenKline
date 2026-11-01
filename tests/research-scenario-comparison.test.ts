import assert from "node:assert/strict";
import test from "node:test";
import { createMarketReplayTape, type MarketReplayEvent, type MarketReplayTape } from "../src/replay/market-event-tape.js";
import {
  compareResearchScenarios,
  ResearchScenarioComparisonError,
  type ResearchScenarioComparisonResult,
  type ResearchScenarioAssumptionPatch,
} from "../src/research-execution/index.js";
import { createResearchExecutionSession } from "../src/research-execution/index.js";
import type { ResearchExecutionOptions, ResearchScenarioArtifact } from "../src/research-execution/types.js";

const source = { id: "comparison-source", version: "generation-1" } as const;
const instrumentId = "COMPARE";
const venueId = "VENUE";

function sourceStatus(id: string, time: number): MarketReplayEvent {
  return { id, kind: "source-status", instrumentId, venueId, time, revision: 0, source, status: "available", coverage: "complete" };
}

function book(id: string, time: number, sequence = 1): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId, venueId, time, sequence, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], tickSize: 1, source };
  return { id, kind: "order-book-snapshot", instrumentId, venueId, time, sequence, revision: 0, source, snapshot };
}

function trade(id: string, time: number): MarketReplayEvent {
  const value = { id, instrumentId, venueId, time, price: 101, quantity: 2, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source };
  return { id, kind: "trade", instrumentId, venueId, time, revision: 0, source, trade: value };
}

function createTape(id = "comparison-tape"): MarketReplayTape {
  return createMarketReplayTape({ id, events: [sourceStatus("status", 1_000), book("book", 1_001), trade("trade-1", 1_002), trade("trade-2", 1_003)] });
}

function createOptions(tape: MarketReplayTape, scenarioId: string, commission = 1, overrides: Partial<ResearchExecutionOptions> = {}): ResearchExecutionOptions {
  return {
    scenarioId,
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000,
    currency: "USD",
    commission: { type: "fixed", value: commission },
    slippage: { type: "fixed", value: 0 },
    ...overrides,
  };
}

function createArtifact(tape: MarketReplayTape, scenarioId: string, withOrder: boolean, overrides: Partial<ResearchExecutionOptions> = {}): ResearchScenarioArtifact {
  const session = createResearchExecutionSession(createOptions(tape, scenarioId, 1, overrides));
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

test("same decision history with different currencies keeps monetary deltas not-comparable", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "same-history", true, { currency: "USD" });
  const candidateArtifact = createArtifact(tape, "same-history", true, { currency: "EUR" });
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "eur", artifact: candidateArtifact }],
  });
  const candidate = findCandidate(result, "eur");
  const reason = "Accounting currency mismatch: baseline USD, candidate EUR; no FX conversion is configured";
  assert.equal(result.status, "verified", "causal reconstruction remains independently verified");
  assert.equal(candidate.compatibility, "identical-decision-history");
  assert.equal(candidate.status, "verified");
  assert.deepEqual(candidate.differences?.monetaryUnits, { baselineCurrency: "USD", candidateCurrency: "EUR", comparable: false });
  for (const delta of [
    candidate.differences?.realizedPnl,
    candidate.differences?.unrealizedPnl,
    candidate.differences?.equity,
    candidate.differences?.drawdown,
    candidate.differences?.totalFees,
    candidate.differences?.marketValue,
    candidate.differences?.modeledExecution.feeAmount,
  ]) {
    assert.equal(delta?.status, "not-comparable");
    assert.equal(delta?.delta, null);
    assert.equal(delta?.reason, reason);
  }
  assert.equal(candidate.differences?.simulatedQuantity.status, "available");
  assert.equal(candidate.differences?.fillCount.status, "available");
  assert.equal(candidate.differences?.drawdownPercent.status, "available");
});

test("same-currency monetary deltas remain available and expose initial capital", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "capital-history", true, { currency: "USD", initialCapital: 1_000 });
  const candidateArtifact = createArtifact(tape, "capital-history", true, { currency: "USD", initialCapital: 2_000 });
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "larger-capital", artifact: candidateArtifact }],
  });
  const candidate = findCandidate(result, "larger-capital");
  assert.equal(candidate.compatibility, "identical-decision-history");
  assert.equal(candidate.differences?.monetaryUnits.comparable, true);
  assert.equal(candidate.scenario?.metrics.initialCapital, 2_000);
  assert.equal(candidate.differences?.equity.status, "available");
  assert.equal(candidate.differences?.equity.delta, 1_000);
  assert.equal(candidate.differences?.totalFees.status, "available");
});

test("precision-policy differences preserve valid nonmonetary comparisons", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "precision-history", true);
  const candidateArtifact = createArtifact(tape, "precision-history", true, {
    precision: { tickSize: 1, quantityStep: 1, minimumQuantity: 1, tickPolicy: "round", quantityPolicy: "round" },
  });
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "rounded", artifact: candidateArtifact }],
  });
  const candidate = findCandidate(result, "rounded");
  assert.equal(candidate.compatibility, "identical-decision-history");
  assert.equal(candidate.status, "verified");
  assert.equal(candidate.differences?.simulatedQuantity.status, "available");
  assert.equal(candidate.differences?.fillCount.status, "available");
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

test("mid-reconstruction cancellation returns an explicit incomplete result", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", true);
  const controller = new AbortController();
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "candidate", patch: { commission: { type: "fixed", value: 2 } } }],
    signal: controller.signal,
    onProgress: (progress) => {
      if (progress.phase === "restoring" && progress.processedEligibleEventVisits >= 2) controller.abort();
    },
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.baseline, null);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.warnings.some((warning) => warning.toLowerCase().includes("cancel")), true);
  assert.equal(JSON.stringify(result).includes("session"), false);
});

test("unsupported assumption patch fields are rejected before reconstruction", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", false);
  assert.throws(
    () => compareResearchScenarios({
      baseline: { artifact: baseline, tape },
      candidates: [{
        candidateId: "unsupported",
        patch: { execution: { unsupportedField: true } } as unknown as ResearchScenarioAssumptionPatch,
      }],
    }),
    (error: unknown) => error instanceof ResearchScenarioComparisonError && error.code === "INVALID_INPUT",
  );
});

test("repeated plans are deterministic and canonicalize candidate ordering", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "comparison-scenario", true);
  const first = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [
      { candidateId: "slippage", patch: { slippage: { type: "fixed", value: 2 } } },
      { candidateId: "commission", patch: { commission: { type: "fixed", value: 5 } } },
    ],
  });
  const second = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [
      { candidateId: "commission", patch: { commission: { type: "fixed", value: 5 } } },
      { candidateId: "slippage", patch: { slippage: { type: "fixed", value: 2 } } },
    ],
  });
  assert.equal(first.comparisonFingerprint, second.comparisonFingerprint);
  assert.deepEqual(first.candidates.map((candidate) => candidate.candidateId), ["commission", "slippage"]);
  assert.equal(JSON.stringify(first).includes("session"), false);
});

test("indeterminate valuation stays explicit and is not presented as a numeric delta", () => {
  const tape = createMarketReplayTape({
    id: "indeterminate-comparison-tape",
    events: [
      sourceStatus("status", 1_000),
      book("book-1", 1_001, 1),
      book("book-2", 1_002, 2),
      trade("trade-1", 1_002),
      sourceStatus("status-2", 1_003),
    ],
  });
  const baseline = createArtifact(tape, "indeterminate-scenario", true, { maxQuoteAgeMs: 0 });
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "fee", patch: { commission: { type: "fixed", value: 2 } } }],
  });
  assert.ok(result.baseline);
  assert.equal(result.baseline.evaluationStatus, "indeterminate");
  assert.equal(result.baseline.metrics.valuation, "partial");
  assert.equal(result.baseline.metrics.equity === null, false, "the mark may be present while its quality is partial");
  const candidate = findCandidate(result, "fee");
  assert.equal(candidate.status, "indeterminate");
  assert.equal(candidate.differences?.equity.status, "unknown");
  assert.equal(candidate.differences?.equity.delta, null);
});

test("currency mismatch takes precedence over an indeterminate valuation", () => {
  const tape = createMarketReplayTape({
    id: "indeterminate-currency-tape",
    events: [
      sourceStatus("status", 1_000),
      book("book-1", 1_001, 1),
      book("book-2", 1_002, 2),
      trade("trade-1", 1_002),
      sourceStatus("status-2", 1_003),
    ],
  });
  const baseline = createArtifact(tape, "indeterminate-same-history", true, { currency: "USD", maxQuoteAgeMs: 0 });
  const candidateArtifact = createArtifact(tape, "indeterminate-same-history", true, { currency: "EUR", maxQuoteAgeMs: 0 });
  const result = compareResearchScenarios({
    baseline: { artifact: baseline, tape },
    candidates: [{ candidateId: "eur", artifact: candidateArtifact }],
  });
  const candidate = findCandidate(result, "eur");
  assert.equal(candidate.scenario?.evaluationStatus, "indeterminate");
  assert.equal(candidate.differences?.equity.status, "not-comparable");
  assert.equal(candidate.differences?.equity.delta, null);
  assert.match(candidate.differences?.equity.reason ?? "", /baseline USD, candidate EUR/);
});

test("result-size budget rejects an oversized serialized comparison", () => {
  const tape = createTape();
  const baseline = createArtifact(tape, "size-limited", true);
  const baselineBytes = Buffer.byteLength(JSON.stringify(baseline), "utf8");
  assert.throws(
    () => compareResearchScenarios({ baseline: { artifact: baseline, tape }, candidates: [], maxSerializedResultBytes: baselineBytes + 1 }),
    (error: unknown) => error instanceof ResearchScenarioComparisonError && error.code === "RESULT_SIZE_LIMIT",
  );
});
