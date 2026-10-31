import assert from "node:assert/strict";
import test from "node:test";
import { createMarketReplayTape, type MarketReplayEvent } from "../src/replay/market-event-tape.js";
import {
  createResearchScenarioArtifact,
  createResearchExecutionSession,
  parseResearchScenarioArtifact,
  ResearchScenarioArtifactValidationError,
  ResearchScenarioRestoreError,
  restoreResearchScenario,
  serializeResearchScenarioArtifact,
} from "../src/research-execution/index.js";
import type { ResearchExecutionOptions, ResearchScenarioArtifact, ResearchScenarioFrontier } from "../src/research-execution/types.js";

const source = { id: "artifact-fixture", version: "generation-1" } as const;
const instrumentId = "ARTIFACT";
const venueId = "VENUE";

function sourceStatus(id: string, time: number, receiveTime?: number): MarketReplayEvent {
  return { id, kind: "source-status", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), revision: 0, source, status: "available", coverage: "complete" };
}

function book(id: string, time: number, sequence: number, askQuantity = 10, receiveTime?: number): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: askQuantity }], tickSize: 1, source };
  return { id, kind: "order-book-snapshot", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, revision: 0, source, snapshot };
}

function trade(id: string, time: number, price = 100, receiveTime?: number): MarketReplayEvent {
  const value = { id, instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), price, quantity: 1, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source };
  return { id, kind: "trade", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), revision: 0, source, trade: value };
}

function split(id: string, time: number): MarketReplayEvent {
  const action = { id, instrumentId, kind: "stock-split" as const, effectiveTime: time, newShares: 2, oldShares: 1, revision: 1, source };
  return { id: `${id}-event`, kind: "corporate-action-effective", instrumentId, venueId, time, revision: 0, source, action };
}

function dividend(id: string, effectiveTime: number, paymentTime: number): { readonly effective: MarketReplayEvent; readonly payment: MarketReplayEvent } {
  const action = { id, instrumentId, kind: "cash-dividend" as const, effectiveTime, exDividendTime: effectiveTime, paymentTime, amountPerShare: 1, currency: "USD", revision: 1, source };
  return {
    effective: { id: `${id}-effective`, kind: "corporate-action-effective", instrumentId, venueId, time: effectiveTime, revision: 0, source, action },
    payment: { id: `${id}-payment`, kind: "corporate-action-payment", instrumentId, venueId, time: paymentTime, revision: 0, source, action },
  };
}

function baseTape(extra: readonly MarketReplayEvent[] = []): ReturnType<typeof createMarketReplayTape> {
  return createMarketReplayTape({ id: "scenario-artifact-tape", events: [sourceStatus("status", 1_000), book("book", 1_000, 1), trade("trade-1", 1_001), trade("trade-2", 1_002), ...extra] });
}

function options(tape: ReturnType<typeof createMarketReplayTape>, overrides: Partial<ResearchExecutionOptions> = {}): ResearchExecutionOptions {
  return {
    scenarioId: "artifact-scenario",
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    ...overrides,
  };
}

function atBook(session: ReturnType<typeof createResearchExecutionSession>): void {
  session.start();
  session.step();
  session.step();
}

function finish(session: ReturnType<typeof createResearchExecutionSession>): void {
  for (let index = 0; index < 100 && session.getSnapshot().state !== "completed"; index += 1) session.step();
}

function completeBuySellScenario(): { readonly tape: ReturnType<typeof createMarketReplayTape>; readonly session: ReturnType<typeof createResearchExecutionSession> } {
  const tape = baseTape();
  const session = createResearchExecutionSession(options(tape));
  atBook(session);
  session.submitOrder({ idempotencyKey: "buy", side: "buy", type: "market", quantity: 1 });
  session.step();
  session.step();
  session.submitOrder({ idempotencyKey: "sell", side: "sell", type: "market", quantity: 1 });
  session.step();
  assert.equal(session.getSnapshot().state, "completed");
  return { tape, session };
}

test("scenario artifact round-trips decisions and reconstructs complete financial state", () => {
  const { tape, session } = completeBuySellScenario();
  const original = session.exportScenario();
  const artifact = session.exportScenarioArtifact();
  assert.equal(artifact.artifactType, "openkline-research-scenario");
  assert.equal("orders" in artifact, false, "derived orders must not be stored in the artifact");
  assert.equal("fills" in artifact, false, "derived fills must not be stored in the artifact");
  assert.equal("ledger" in artifact, false, "derived ledger must not be stored in the artifact");
  const serialized = serializeResearchScenarioArtifact(artifact);
  const parsed = parseResearchScenarioArtifact(serialized);
  const restored = restoreResearchScenario({ artifact: parsed, tape });
  assert.equal(restored.status, "verified");
  assert.deepEqual(restored.actual, original);
  assert.deepEqual(restored.actual.orders, original.orders);
  assert.deepEqual(restored.actual.fills, original.fills);
  assert.deepEqual(restored.actual.ledger, original.ledger);
  assert.deepEqual(restored.actual.decisions, original.decisions);
  restored.session.dispose();
  session.dispose();
});

test("partial fill, cancellation, limit decisions, and bounded presentation journals restore without trusting results", () => {
  const tape = createMarketReplayTape({ id: "partial-artifact-tape", events: [sourceStatus("status", 1_000), book("book", 1_000, 1, 1), trade("trade-1", 1_001), trade("trade-2", 1_002)] });
  const session = createResearchExecutionSession({ ...options(tape), maxJournalEntries: 4 });
  atBook(session);
  const partial = session.submitOrder({ idempotencyKey: "partial", side: "buy", type: "market", quantity: 2 });
  session.step();
  assert.equal(session.getSnapshot().orders.find((order) => order.id === partial.id)?.status, "partially-simulated");
  session.cancelOrder(partial.id, "bounded-cancel");
  const limit = session.submitOrder({ idempotencyKey: "limit", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  session.cancelOrder(limit.id, "limit-cancel");
  const original = session.exportScenario();
  const artifact = session.exportScenarioArtifact();
  assert.equal(artifact.journalRetention.complete, false);
  assert.equal(artifact.decisionHistory.complete, true);
  const restored = restoreResearchScenario({ artifact, tape });
  assert.equal(restored.status, "verified");
  assert.deepEqual(restored.actual.orders, original.orders);
  assert.deepEqual(restored.actual.fills, original.fills);
  assert.deepEqual(restored.actual.ledger, original.ledger);
  assert.deepEqual(restored.actual.journalRetention, original.journalRetention);
  restored.session.dispose();
  session.dispose();
});

test("same-cursor decisions, idempotency, rejected orders, and incomplete decisions are classified deterministically", () => {
  const tape = baseTape();
  const poor = createResearchExecutionSession(options(tape, { initialCapital: 50 }));
  atBook(poor);
  const rejected = poor.submitOrder({ idempotencyKey: "insufficient-funds", side: "buy", type: "limit", quantity: 1, limitPrice: 101 });
  assert.equal(rejected.status, "rejected");
  poor.dispose();
  const session = createResearchExecutionSession(options(tape));
  atBook(session);
  const cancelled = session.submitOrder({ idempotencyKey: "same-cursor", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  assert.deepEqual(session.submitOrder({ idempotencyKey: "same-cursor", side: "buy", type: "limit", quantity: 1, limitPrice: 98 }), cancelled);
  session.cancelOrder(cancelled.id, "same-cursor-cancel");
  const artifact = session.exportScenarioArtifact();
  const restored = restoreResearchScenario({ artifact, tape });
  assert.equal(restored.status, "verified");
  assert.deepEqual(restored.actual.orders, session.exportScenario().orders);
  restored.session.dispose();
  session.dispose();

  const incomplete = { ...artifact, decisionHistory: { ...artifact.decisionHistory, complete: false } } as ResearchScenarioArtifact;
  assert.throws(() => restoreResearchScenario({ artifact: incomplete, tape }), ResearchScenarioArtifactValidationError);
});

test("corporate-action, source-isolated and non-complete frontiers round-trip", () => {
  const payment = dividend("dividend", 1_003, 1_004);
  const tape = baseTape([split("split", 1_003), payment.effective, payment.payment]);
  const session = createResearchExecutionSession(options(tape));
  atBook(session);
  session.submitOrder({ idempotencyKey: "corporate-buy", side: "buy", type: "market", quantity: 1 });
  finish(session);
  const complete = session.exportScenarioArtifact();
  const restored = restoreResearchScenario({ artifact: complete, tape });
  assert.equal(restored.status, "verified");
  assert.deepEqual(restored.actual.ledger, session.exportScenario().ledger);
  restored.session.dispose();

  session.seekToEvent("book");
  assert.throws(() => session.exportScenarioArtifact(), ResearchScenarioArtifactValidationError, "future decisions must not be exported as a valid frontier");
  session.dispose();
});

test("tampered expected results are reported as mismatches and never injected", () => {
  const { tape, session } = completeBuySellScenario();
  const scenario = session.exportScenario();
  const snapshot = session.getSnapshot();
  if (snapshot.state !== "completed") throw new Error(`fixture did not complete: ${snapshot.state}`);
  const frontier: ResearchScenarioFrontier = { ...snapshot.cursor, state: snapshot.state };
  const fakeScenario = { ...scenario, orders: [], fills: [], ledger: { ...scenario.ledger, cash: 123 } };
  const artifact = createResearchScenarioArtifact({ scenario: fakeScenario, tape, frontier });
  const restored = restoreResearchScenario({ artifact, tape });
  assert.equal(restored.status, "mismatch");
  assert.notDeepEqual(restored.actual.ledger, fakeScenario.ledger, "imported derived ledger must not overwrite recomputed state");
  restored.session.dispose();
  session.dispose();
});

test("artifact validation rejects malformed, hostile, oversized, and non-finite inputs", () => {
  const { tape, session } = completeBuySellScenario();
  const artifact = session.exportScenarioArtifact();
  const unknown = { ...artifact, unknownField: true };
  assert.throws(() => parseResearchScenarioArtifact(unknown), /UNKNOWN_FIELD/);
  const tampered = { ...artifact, tape: { ...artifact.tape, fingerprint: "0000000000000000" } };
  assert.throws(() => parseResearchScenarioArtifact(tampered), /INVALID_INTEGRITY/);
  const nonFinite = { ...artifact, assumptions: { ...artifact.assumptions, initialCapital: Number.NaN } };
  assert.throws(() => parseResearchScenarioArtifact(nonFinite), /INVALID_NUMBER/);
  const oversized = { ...artifact, scenarioId: "x".repeat(257) };
  assert.throws(() => parseResearchScenarioArtifact(oversized), /SIZE_LIMIT/);
  const hugeDecisions = { ...artifact, decisions: new Array(100_001).fill(artifact.decisions[0]) };
  assert.throws(() => parseResearchScenarioArtifact(hugeDecisions), /SIZE_LIMIT/);
  const cyclic: Record<string, unknown> = { ...artifact };
  cyclic.self = cyclic;
  assert.throws(() => parseResearchScenarioArtifact(cyclic), /CYCLIC_VALUE/);
  const polluted: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  Object.assign(polluted, artifact);
  Object.defineProperty(polluted, "__proto__", { value: {}, enumerable: true });
  assert.throws(() => parseResearchScenarioArtifact(polluted), /prototype-pollution/);
  assert.throws(() => parseResearchScenarioArtifact(JSON.stringify({ ...artifact, schemaVersion: 99 })), /UNSUPPORTED_VERSION/);
  const mismatchedTape = createMarketReplayTape({ id: tape.id, events: [sourceStatus("different", 1_000), book("book", 1_000, 1), trade("trade-1", 1_001), trade("trade-2", 1_002)] });
  assert.throws(() => restoreResearchScenario({ artifact, tape: mismatchedTape }), ResearchScenarioRestoreError);
  session.dispose();
});

test("receive-time artifacts fail closed when the bound tape lacks receipt history", () => {
  const tape = createMarketReplayTape({ id: "receive-time-artifact", events: [sourceStatus("status", 1_000, 1_000), book("book", 1_000, 1, 10, 1_000), trade("missing-receive", 1_001)] });
  const session = createResearchExecutionSession(options(tape, { scenarioId: "receive-time", clockPolicy: "receive-time" }));
  atBook(session);
  session.submitOrder({ idempotencyKey: "receive-order", side: "buy", type: "market", quantity: 1 });
  finish(session);
  const artifact = session.exportScenarioArtifact();
  assert.throws(() => restoreResearchScenario({ artifact, tape }), (error: unknown) => error instanceof ResearchScenarioRestoreError && error.code === "RECEIVE_TIME_UNAVAILABLE");
  session.dispose();
});
