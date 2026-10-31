import assert from "node:assert/strict";
import test from "node:test";
import { createMarketReplayTape, type MarketReplayEvent } from "../src/replay/market-event-tape.js";
import { createResearchExecutionSession, ResearchExecutionLifecycleError } from "../src/research-execution/index.js";
import { ReferenceExecutionLedger } from "../src/research-execution/reference.js";
import type { ResearchExecutionOptions, ResearchSnapshot } from "../src/research-execution/types.js";

const source = { id: "research-fixture", version: "generation-1" } as const;
const instrumentId = "TEST";
const venueId = "VENUE";

function sourceStatus(id: string, time: number, status: "available" | "partial" | "stale" | "unavailable" = "available", coverage: "complete" | "partial" | "unknown" | "unavailable" = "complete", receiveTime?: number): MarketReplayEvent {
  return { id, kind: "source-status", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), revision: 0, source, status, coverage };
}

function book(id: string, time: number, sequence: number, bidPrice = 99, askPrice = 101, bidQuantity = 10, askQuantity = 10, receiveTime?: number): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, bids: [{ price: bidPrice, quantity: bidQuantity }], asks: [{ price: askPrice, quantity: askQuantity }], tickSize: 1, source };
  return { id, kind: "order-book-snapshot", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, revision: 0, source, snapshot };
}

function gapDelta(id: string, time: number, sequence: number, previousSequence: number): MarketReplayEvent {
  const delta = { version: 1 as const, id, instrumentId, venueId, time, sequence, previousSequence, quantityMode: "absolute" as const, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], source };
  return { id, kind: "order-book-delta", instrumentId, venueId, time, sequence, revision: 0, source, delta };
}

function trade(id: string, time: number, price = 100, quantity = 1, revision = 0, receiveTime?: number, tradeId = id): MarketReplayEvent {
  const value = { id: tradeId, instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), price, quantity, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision, source };
  return { id, kind: "trade", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), revision, source, trade: value };
}

function candle(id: string, time: number, close: number, receiveTime?: number): MarketReplayEvent {
  const value = { time, open: close, high: close, low: close, close, volume: 1 };
  return { id, kind: "candle-complete", instrumentId, venueId, time, ...(receiveTime === undefined ? {} : { receiveTime }), revision: 0, source, candle: value, finality: "completed" };
}

function split(id: string, time: number): MarketReplayEvent {
  const action = { id, instrumentId, kind: "stock-split" as const, effectiveTime: time, newShares: 2, oldShares: 1, revision: 1, source };
  return { id: `event-${id}`, kind: "corporate-action-effective", instrumentId, venueId, time, revision: 0, source, action };
}

function dividend(id: string, effectiveTime: number, paymentTime: number): { readonly effective: MarketReplayEvent; readonly payment: MarketReplayEvent } {
  const action = { id, instrumentId, kind: "cash-dividend" as const, effectiveTime, exDividendTime: effectiveTime, paymentTime, amountPerShare: 1, currency: "USD", revision: 1, source };
  return {
    effective: { id: `event-${id}-effective`, kind: "corporate-action-effective", instrumentId, venueId, time: effectiveTime, revision: 0, source, action },
    payment: { id: `event-${id}-payment`, kind: "corporate-action-payment", instrumentId, venueId, time: paymentTime, revision: 0, source, action },
  };
}

function baseTape(extra: readonly MarketReplayEvent[] = []): ReturnType<typeof createMarketReplayTape> {
  return createMarketReplayTape({ id: "research-tape", events: [sourceStatus("status", 1_000), book("book-1", 1_000, 1), trade("trade-1", 1_001), candle("candle-1", 1_002, 100), trade("trade-2", 1_003, 102), ...extra] });
}

function options(tape: ReturnType<typeof createMarketReplayTape>, overrides: Partial<ResearchExecutionOptions> = {}): ResearchExecutionOptions {
  return {
    scenarioId: "fixture-scenario",
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

function finish(session: ReturnType<typeof createResearchExecutionSession>): ResearchSnapshot {
  for (let index = 0; index < 100 && session.getSnapshot().state !== "completed"; index += 1) session.step();
  return session.getSnapshot();
}

test("market buy uses only a later eligible displayed ask and matches the independent ledger", () => {
  const session = createResearchExecutionSession(options(baseTape()));
  atBook(session);
  const order = session.submitOrder({ idempotencyKey: "buy-1", side: "buy", type: "market", quantity: 2 });
  assert.equal(order.status, "pending");
  assert.equal(session.getSnapshot().fills.length, 0, "submission event is never reused as a fill event");
  session.step();
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.orders[0]?.status, "fully-simulated");
  assert.equal(snapshot.fills[0]?.executionPrice, 101);
  assert.equal(snapshot.fills[0]?.simulated, true);
  assert.equal(snapshot.ledger.position?.quantity, 2);
  const reference = new ReferenceExecutionLedger(1_000);
  reference.apply({ side: "buy", price: 101, quantity: 2, fee: 1 });
  assert.equal(snapshot.ledger.cash, reference.snapshot().cash);
  assert.equal(snapshot.ledger.position?.costBasis, reference.snapshot().costBasis);
  assert.equal(snapshot.ledger.totalFees, reference.snapshot().totalFees);
});

test("long-only sell updates realized P&L and rejects an unavailable position", () => {
  const session = createResearchExecutionSession(options(baseTape()));
  atBook(session);
  session.submitOrder({ idempotencyKey: "buy", side: "buy", type: "market", quantity: 1 });
  session.step();
  session.step();
  const sell = session.submitOrder({ idempotencyKey: "sell", side: "sell", type: "market", quantity: 1 });
  assert.equal(sell.status, "pending");
  session.step();
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.orders.find((order) => order.idempotencyKey === "sell")?.status, "fully-simulated");
  assert.equal(snapshot.ledger.position, null);
  assert.equal(snapshot.ledger.realizedPnl, -4, "gross -2 plus two fixed fees");
  const rejected = createResearchExecutionSession(options(baseTape()));
  atBook(rejected);
  assert.equal(rejected.submitOrder({ idempotencyKey: "sell-empty", side: "sell", type: "market", quantity: 1 }).status, "rejected");
});

test("missing, stale, crossed, and gapped liquidity never fabricate a fill", () => {
  const missingTape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), trade("trade", 1_001)] });
  const missing = createResearchExecutionSession(options(missingTape));
  missing.start();
  missing.step();
  const missingOrder = missing.submitOrder({ idempotencyKey: "missing", side: "buy", type: "market", quantity: 1 });
  assert.equal(missingOrder.status, "pending");
  assert.equal(finish(missing).orders[0]?.status, "indeterminate");
  const stale = createResearchExecutionSession(options(baseTape(), { maxQuoteAgeMs: 0 }));
  atBook(stale);
  stale.submitOrder({ idempotencyKey: "stale", side: "buy", type: "market", quantity: 1 });
  stale.step();
  assert.equal(stale.getSnapshot().fills.length, 0);
  assert.ok(stale.getSnapshot().diagnostics.quality.includes("stale"));
  const lockedTape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("locked", 1_000, 1, 101, 101), trade("trade", 1_001)] });
  const locked = createResearchExecutionSession(options(lockedTape));
  atBook(locked);
  locked.submitOrder({ idempotencyKey: "locked", side: "buy", type: "market", quantity: 1 });
  locked.step();
  assert.equal(locked.getSnapshot().fills.length, 0);
  assert.ok(locked.getSnapshot().diagnostics.quality.includes("locked"));
  const gapTape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1), gapDelta("gap", 1_001, 3, 1), book("recovery", 1_002, 4), trade("trade", 1_003)] });
  const gap = createResearchExecutionSession(options(gapTape));
  atBook(gap);
  gap.submitOrder({ idempotencyKey: "gap", side: "buy", type: "market", quantity: 1 });
  gap.step();
  assert.equal(gap.getSnapshot().fills.length, 0);
  assert.ok(gap.getSnapshot().diagnostics.quality.includes("sequence-gap"));
  gap.step();
  assert.equal(gap.getSnapshot().fills.length, 1, "a later synchronized recovery may become eligible");
});

test("partial displayed depth is explicit and never exceeds the observed liquidity budget", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book-1", 1_000, 1, 99, 101, 10, 1), trade("trade", 1_001), candle("between-books", 1_002, 100), book("book-2", 1_003, 2, 99, 101, 10, 3)] });
  const session = createResearchExecutionSession(options(tape));
  atBook(session);
  session.submitOrder({ idempotencyKey: "partial", side: "buy", type: "market", quantity: 3 });
  session.step();
  assert.equal(session.getSnapshot().fills[0]?.quantity, 1);
  assert.equal(session.getSnapshot().orders[0]?.status, "partially-simulated");
  session.step();
  assert.equal(session.getSnapshot().fills.length, 1, "a displayed level cannot be consumed again without a new book event");
  session.step();
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.fills.reduce((total, fill) => total + fill.quantity, 0), 3);
  assert.equal(snapshot.orders[0]?.status, "fully-simulated");
});

test("passive price touches preserve uncertainty while explicit scenarios remain labelled hypothetical", () => {
  const tape = baseTape();
  const conservative = createResearchExecutionSession(options(tape));
  atBook(conservative);
  conservative.submitOrder({ idempotencyKey: "passive", side: "buy", type: "limit", quantity: 1, limitPrice: 100 });
  conservative.step();
  assert.equal(conservative.getSnapshot().fills.length, 0);
  assert.ok(conservative.getSnapshot().journal.some((entry) => entry.transition === "passive-eligibility-indeterminate"));
  assert.equal(finish(conservative).orders[0]?.status, "indeterminate");
  const explicit = createResearchExecutionSession(options(tape, { execution: { maxParticipationRate: 1, allowPartialFills: true, passivePolicy: "explicit-scenario", scenarioBias: "conservative" } }));
  atBook(explicit);
  explicit.submitOrder({ idempotencyKey: "passive-scenario", side: "buy", type: "limit", quantity: 1, limitPrice: 100 });
  explicit.step();
  const snapshot = explicit.getSnapshot();
  assert.equal(snapshot.fills[0]?.simulated, true);
  assert.equal(snapshot.fills[0]?.scenarioBias, "conservative");
  assert.equal(snapshot.fills[0]?.quality.status, "indeterminate");
});

test("latency delays eligibility and duplicate idempotency keys are deterministic", () => {
  const session = createResearchExecutionSession(options(baseTape(), { latency: { type: "fixed", delayMs: 2 } }));
  atBook(session);
  const first = session.submitOrder({ idempotencyKey: "same", side: "buy", type: "market", quantity: 1 });
  assert.deepEqual(session.submitOrder({ idempotencyKey: "same", side: "buy", type: "market", quantity: 1 }), first);
  assert.throws(() => session.submitOrder({ idempotencyKey: "same", side: "buy", type: "market", quantity: 2 }), /IDEMPOTENCY_CONFLICT/);
  session.step();
  assert.equal(session.getSnapshot().fills.length, 0);
  session.step();
  assert.equal(session.getSnapshot().fills.length, 1);
});

test("precision, risk, cancellation, and disposal fail closed", () => {
  const session = createResearchExecutionSession(options(baseTape(), { precision: { tickSize: 0.5, quantityStep: 1, minimumQuantity: 1, tickPolicy: "reject", quantityPolicy: "reject" } }));
  atBook(session);
  assert.throws(() => session.submitOrder({ idempotencyKey: "bad-quantity", side: "buy", type: "market", quantity: 0.5 }), /QUANTITY_PRECISION/);
  const cancelled = session.submitOrder({ idempotencyKey: "cancel", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  assert.equal(session.cancelOrder(cancelled.id).status, "cancelled");
  const poor = createResearchExecutionSession(options(baseTape(), { initialCapital: 50 }));
  atBook(poor);
  assert.equal(poor.submitOrder({ idempotencyKey: "poor", side: "buy", type: "limit", quantity: 1, limitPrice: 101 }).status, "rejected");
  session.dispose();
  assert.throws(() => session.submitOrder({ idempotencyKey: "disposed", side: "buy", type: "market", quantity: 1 }), ResearchExecutionLifecycleError);
});

test("splits preserve aggregate cost and dividends pay only after causal entitlement", () => {
  const payment = dividend("dividend", 1_004, 1_005);
  const tape = baseTape([split("split", 1_003), payment.effective, payment.payment]);
  const session = createResearchExecutionSession(options(tape));
  atBook(session);
  session.submitOrder({ idempotencyKey: "buy", side: "buy", type: "market", quantity: 1 });
  for (let index = 0; index < 10 && session.getSnapshot().ledger.position?.quantity !== 2; index += 1) session.step();
  let snapshot = session.getSnapshot();
  assert.equal(snapshot.ledger.position?.quantity, 2);
  assert.equal(snapshot.ledger.position?.costBasis, 101);
  assert.equal(snapshot.ledger.position?.averageEntryPrice, 50.5);
  assert.equal(snapshot.ledger.cash, 898);
  for (let index = 0; index < 10 && snapshot.ledger.cash !== 900; index += 1) {
    session.step();
    snapshot = session.getSnapshot();
  }
  snapshot = session.getSnapshot();
  assert.equal(snapshot.ledger.cash, 900, "two post-split shares receive one unit each at payment");
  assert.equal(snapshot.ledger.position?.quantity, 2);
});

test("backward and forward seeking reconstruct the complete scenario deterministically", () => {
  const tape = baseTape();
  const session = createResearchExecutionSession(options(tape));
  atBook(session);
  session.submitOrder({ idempotencyKey: "replay-buy", side: "buy", type: "market", quantity: 1 });
  finish(session);
  const completed = session.exportScenario();
  session.seekToEvent("status");
  assert.equal(session.getSnapshot().orders[0]?.status, "pending");
  session.seekToTimestamp(2_000);
  const reconstructed = session.exportScenario();
  assert.deepEqual(reconstructed.orders, completed.orders);
  assert.deepEqual(reconstructed.fills, completed.fills);
  assert.deepEqual(reconstructed.ledger, completed.ledger);
  assert.deepEqual(reconstructed.journal, completed.journal);
});

test("future event mutations cannot affect a result at the current causal frontier", () => {
  const first = createResearchExecutionSession(options(baseTape(), { scenarioId: "frontier" }));
  const mutatedTape = baseTape([trade("future-extra", 9_999, 9_999, 100)]);
  const second = createResearchExecutionSession(options(mutatedTape, { scenarioId: "frontier" }));
  atBook(first);
  atBook(second);
  const firstOrder = first.submitOrder({ idempotencyKey: "frontier-buy", side: "buy", type: "market", quantity: 1 });
  const secondOrder = second.submitOrder({ idempotencyKey: "frontier-buy", side: "buy", type: "market", quantity: 1 });
  assert.deepEqual(firstOrder, secondOrder);
  assert.deepEqual(first.getSnapshot().orders, second.getSnapshot().orders);
  assert.deepEqual(first.getSnapshot().fills, second.getSnapshot().fills);
  assert.deepEqual(first.getSnapshot().ledger, second.getSnapshot().ledger);
});

test("source generations and corrected trades remain distinct observations", () => {
  const sourceTwo = { id: "research-fixture", version: "generation-2" } as const;
  const events: MarketReplayEvent[] = [
    trade("trade-a0", 1_000, 100, 1, 0, undefined, "provider-trade"),
    { ...trade("trade-b0", 1_001, 100, 2, 0, undefined, "provider-trade"), source: sourceTwo, trade: { ...(trade("trade-b0", 1_001, 100, 2, 0, undefined, "provider-trade") as Extract<MarketReplayEvent, { kind: "trade" }>).trade, source: sourceTwo } } as MarketReplayEvent,
    trade("trade-a1", 1_002, 101, 3, 1, undefined, "provider-trade"),
  ];
  const session = createResearchExecutionSession(options(createMarketReplayTape({ events })));
  finish(session);
  assert.equal(session.getSnapshot().diagnostics.observedTradeCount, 2);
  assert.ok(session.getSnapshot().diagnostics.warnings.some((warning) => warning.includes("correction")));
});

test("receive-time replay with missing future receipt cannot fabricate eligibility", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000, "available", "complete", 1_000), book("book", 1_000, 1, 99, 101, 10, 10, 1_000), trade("missing-receive", 1_001)] });
  const session = createResearchExecutionSession(options(tape, { clockPolicy: "receive-time" }));
  atBook(session);
  session.submitOrder({ idempotencyKey: "receive", side: "buy", type: "market", quantity: 1 });
  const snapshot = finish(session);
  assert.equal(snapshot.fills.length, 0);
  assert.equal(snapshot.orders[0]?.status, "indeterminate");
});
