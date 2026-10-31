import assert from "node:assert/strict";
import test from "node:test";
import { createMarketReplayTape, type MarketReplayEvent } from "../src/replay/market-event-tape.js";
import { createResearchExecutionSession, ResearchExecutionOrderError, ResearchExecutionValidationError } from "../src/research-execution/index.js";
import type { ResearchExecutionOptions, ResearchSnapshot } from "../src/research-execution/types.js";

const source: { readonly id: string; readonly version: string } = { id: "research-correctness", version: "generation-1" };
const instrumentId = "CORRECTNESS";
const venueId = "VENUE";

function sourceStatus(id: string, time: number): MarketReplayEvent {
  return { id, kind: "source-status", instrumentId, venueId, time, revision: 0, source, status: "available", coverage: "complete" };
}

function book(id: string, time: number, sequence: number, bidPrice = 99, askPrice = 101, bidQuantity = 10, askQuantity = 10): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId, venueId, time, sequence, bids: [{ price: bidPrice, quantity: bidQuantity }], asks: [{ price: askPrice, quantity: askQuantity }], tickSize: 1, source };
  return { id, kind: "order-book-snapshot", instrumentId, venueId, time, sequence, revision: 0, source, snapshot };
}

function trade(id: string, time: number): MarketReplayEvent {
  const value = { id, instrumentId, venueId, time, price: 100, quantity: 1, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source };
  return { id, kind: "trade", instrumentId, venueId, time, revision: 0, source, trade: value };
}

function sessionBoundary(id: string, time: number, boundary: "open" | "close" | "break-start" | "break-end", sessionId = "session-1"): MarketReplayEvent {
  return { id, kind: "session-boundary", instrumentId, venueId, time, revision: 0, source, boundary, sessionId, calendarId: "calendar", calendarVersion: "v1" };
}

function dividendEvent(id: string, time: number, phase: "effective" | "payment", actionSource = source): MarketReplayEvent {
  const action = { id, instrumentId, kind: "cash-dividend" as const, effectiveTime: phase === "effective" ? time : time - 2, exDividendTime: phase === "effective" ? time : time - 2, paymentTime: phase === "payment" ? time : time + 2, amountPerShare: 1, currency: "USD", revision: 1, source: actionSource };
  return { id: `${id}-${phase}-${actionSource.version}`, kind: `corporate-action-${phase}` as "corporate-action-effective" | "corporate-action-payment", instrumentId, venueId, time, revision: 0, source: actionSource, action } as MarketReplayEvent;
}

function splitEvent(id: string, time: number, actionSource = source): MarketReplayEvent {
  const action = { id, instrumentId, kind: "stock-split" as const, effectiveTime: time, newShares: 2, oldShares: 1, revision: 1, source: actionSource };
  return { id: `${id}-effective-${actionSource.version}`, kind: "corporate-action-effective", instrumentId, venueId, time, revision: 0, source: actionSource, action };
}

function assertLedgerInvariants(snapshot: ResearchSnapshot): void {
  const ledger = snapshot.ledger;
  assert.ok(Number.isFinite(ledger.cash) && ledger.cash >= -1e-10);
  assert.ok(Number.isFinite(ledger.reservedCash) && ledger.reservedCash >= -1e-10);
  assert.ok(Number.isFinite(ledger.availableCash) && ledger.availableCash >= -1e-10);
  assert.ok(Number.isFinite(ledger.reservedPositionQuantity) && ledger.reservedPositionQuantity >= -1e-10);
  if (ledger.position === null) assert.ok(ledger.reservedPositionQuantity <= 1e-10);
  else assert.ok(ledger.reservedPositionQuantity <= ledger.position.quantity + 1e-10);
}

function options(tape: ReturnType<typeof createMarketReplayTape>): ResearchExecutionOptions {
  return {
    scenarioId: "cancellation-reproducer",
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    execution: { maxParticipationRate: 1, allowPartialFills: true, passivePolicy: "no-inferred-passive-fill" },
  };
}

test("snapshot reads stay defensive across cache hits", () => {
  const session = createResearchExecutionSession(options(createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1), trade("trade", 1_001)] })));
  session.start();
  session.step();
  const first = session.getSnapshot();
  const second = session.getSnapshot();
  assert.notStrictEqual(first, second);
  assert.notStrictEqual(first.orders, second.orders);
  assert.equal(first.orders.length, 0);
  (first.journal as unknown as Array<ResearchSnapshot["journal"][number]>).length = 0;
  assert.equal(session.getSnapshot().journal.length, second.journal.length);
  assert.deepEqual(session.getSnapshot(), second);
  session.dispose();
  session.dispose();
});

test("cancellation survives backward and forward replay with exact financial parity", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1), trade("later-trade", 1_001), trade("latest-trade", 1_002)] });
  const session = createResearchExecutionSession(options(tape));
  session.start();
  session.step();
  session.step();
  const order = session.submitOrder({ idempotencyKey: "cancel-me", side: "buy", type: "limit", quantity: 1, limitPrice: 102 });
  session.cancelOrder(order.id);
  assert.equal(session.getSnapshot().fills.length, 0);
  const original = session.exportScenario();
  assert.deepEqual(original.decisions.map((decision) => decision.decisionType), ["submit-order", "cancel-order"]);
  assert.equal(original.decisions[1]?.orderId, order.id);
  assert.equal(original.ledger.reservedCash, 0);
  session.seekToEvent("book");
  session.seekToTimestamp(2_000);
  assert.equal(session.getSnapshot().fills.length, 0, "cancelled order must not become executable after reconstruction");
  const reconstructed = session.exportScenario();
  assert.equal(reconstructed.orders[0]?.status, "cancelled");
  assert.equal(reconstructed.ledger.reservedCash, 0);
  assert.deepEqual(reconstructed.orders, original.orders);
  assert.deepEqual(reconstructed.fills, original.fills);
  assert.deepEqual(reconstructed.ledger, original.ledger);
  assert.deepEqual(reconstructed.journal, original.journal);
});

test("pending-order capacity includes the candidate and releases exactly once", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1), trade("trade-1", 1_001), trade("trade-2", 1_002)] });
  const session = createResearchExecutionSession({ ...options(tape), risk: { maxPendingOrders: 1 } });
  session.start();
  session.step();
  session.step();
  const first = session.submitOrder({ idempotencyKey: "first", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  assert.equal(first.status, "pending");
  const reservedAfterFirst = session.getSnapshot().ledger.reservedCash;
  const second = session.submitOrder({ idempotencyKey: "second", side: "buy", type: "limit", quantity: 1, limitPrice: 97 });
  assert.equal(second.status, "rejected");
  assert.equal(second.reason, "MAX_PENDING_ORDERS");
  assert.equal(session.getOrders().filter((order) => order.status === "pending" || order.status === "partially-simulated").length, 1);
  assert.equal(session.getSnapshot().ledger.reservedCash, reservedAfterFirst);
  assertLedgerInvariants(session.getSnapshot());
  session.cancelOrder(first.id);
  assert.equal(session.getSnapshot().ledger.reservedCash, 0);
  const third = session.submitOrder({ idempotencyKey: "third", side: "buy", type: "limit", quantity: 1, limitPrice: 97 });
  assert.equal(third.status, "pending");
  assertLedgerInvariants(session.getSnapshot());
});

test("pending capacity handles same-cursor decisions, partials, and terminal orders", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1, 99, 101, 10, 1), trade("trade-1", 1_001), trade("trade-2", 1_002)] });
  const session = createResearchExecutionSession({ ...options(tape), risk: { maxPendingOrders: 2 } });
  session.start();
  session.step();
  session.step();
  const first = session.submitOrder({ idempotencyKey: "one", side: "buy", type: "limit", quantity: 2, limitPrice: 102 });
  const second = session.submitOrder({ idempotencyKey: "two", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  const third = session.submitOrder({ idempotencyKey: "three", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  assert.equal(first.status, "pending");
  assert.equal(second.status, "pending");
  assert.equal(third.status, "rejected");
  assert.equal(third.reason, "MAX_PENDING_ORDERS");
  session.step();
  assert.equal(session.getOrders().find((order) => order.id === first.id)?.status, "partially-simulated");
  assert.equal(session.getOrders().filter((order) => order.status === "pending" || order.status === "partially-simulated").length, 2);
  session.cancelOrder(second.id);
  session.cancelOrder(first.id);
  assertLedgerInvariants(session.getSnapshot());

  const terminal = createResearchExecutionSession({ ...options(tape), risk: { maxPendingOrders: 1 } });
  terminal.start();
  terminal.step();
  terminal.step();
  const filled = terminal.submitOrder({ idempotencyKey: "filled", side: "buy", type: "market", quantity: 1 });
  terminal.step();
  assert.equal(terminal.getOrders().find((order) => order.id === filled.id)?.status, "fully-simulated");
  assert.equal(terminal.submitOrder({ idempotencyKey: "after-fill", side: "buy", type: "limit", quantity: 1, limitPrice: 98 }).status, "pending");
});

test("same-cursor decisions are ordered and future scenario edits are rejected", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1), trade("trade-1", 1_001), trade("trade-2", 1_002)] });
  const session = createResearchExecutionSession(options(tape));
  session.start();
  session.step();
  session.step();
  const cancelled = session.submitOrder({ idempotencyKey: "same-cursor-cancel", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  session.cancelOrder(cancelled.id);
  const surviving = session.submitOrder({ idempotencyKey: "same-cursor-live", side: "buy", type: "limit", quantity: 1, limitPrice: 102 });
  const decisions = session.exportScenario().decisions;
  assert.deepEqual(decisions.map((decision) => [decision.decisionType, decision.decisionOrdinal]), [["submit-order", 1], ["cancel-order", 2], ["submit-order", 3]]);
  session.seekToEvent("book");
  assert.throws(() => session.submitOrder({ idempotencyKey: "ambiguous-future", side: "buy", type: "limit", quantity: 1, limitPrice: 98 }), (error: unknown) => error instanceof ResearchExecutionOrderError && error.code === "FUTURE_DECISIONS");
  session.seekToTimestamp(2_000);
  assert.equal(session.getOrders().find((order) => order.id === cancelled.id)?.status, "cancelled");
  assert.equal(session.getOrders().find((order) => order.id === surviving.id)?.status, "fully-simulated");
});

test("bounded journals retain unique deterministic identities and honest completeness metadata", () => {
  const events: MarketReplayEvent[] = [sourceStatus("status", 1_000), book("book", 1_000, 1)];
  for (let index = 1; index <= 12; index += 1) events.push(trade(`trade-${index}`, 1_000 + index));
  const tape = createMarketReplayTape({ events });
  const session = createResearchExecutionSession({ ...options(tape), maxJournalEntries: 4 });
  session.start();
  session.step();
  session.step();
  for (let index = 0; index < 10; index += 1) {
    const order = session.submitOrder({ idempotencyKey: `journal-${index}`, side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
    session.cancelOrder(order.id);
    if (index < 9) session.step();
  }
  const original = session.exportScenario();
  const ids = original.journal.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(original.journal.length, 4);
  const sequenceNumbers = ids.map((id) => Number(id.slice(id.lastIndexOf("-journal-") + 9)));
  assert.deepEqual(sequenceNumbers, [...sequenceNumbers].sort((left, right) => left - right));
  assert.ok(original.journalRetention.totalEmittedEntries > 10);
  assert.ok(original.journalRetention.evictedEntries > 0);
  assert.equal(original.journalRetention.complete, false);
  session.seekToEvent("book");
  session.seekToTimestamp(2_000);
  const reconstructed = session.exportScenario();
  assert.deepEqual(reconstructed.journal, original.journal);
  assert.deepEqual(reconstructed.journalRetention, original.journalRetention);
  assert.equal(new Set(reconstructed.journal.map((entry) => entry.id)).size, reconstructed.journal.length);
});

test("multi-order cash and position reservations remain finite and parity-safe", () => {
  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1, 99, 101, 10, 10), trade("trade-1", 1_001), trade("trade-2", 1_002), trade("trade-3", 1_003)] });
  const cash = createResearchExecutionSession(options(tape));
  cash.start();
  cash.step();
  cash.step();
  const cashFirst = cash.submitOrder({ idempotencyKey: "cash-first", side: "buy", type: "limit", quantity: 9, limitPrice: 100 });
  const cashSecond = cash.submitOrder({ idempotencyKey: "cash-second", side: "buy", type: "limit", quantity: 2, limitPrice: 100 });
  assert.equal(cashFirst.status, "pending");
  assert.equal(cashSecond.status, "rejected");
  assert.equal(cashSecond.reason, "INSUFFICIENT_FUNDS");
  assertLedgerInvariants(cash.getSnapshot());
  cash.cancelOrder(cashFirst.id);
  assert.equal(cash.getSnapshot().ledger.reservedCash, 0);

  const position = createResearchExecutionSession(options(tape));
  position.start();
  position.step();
  position.step();
  position.submitOrder({ idempotencyKey: "position-buy", side: "buy", type: "market", quantity: 2 });
  position.step();
  const sellFirst = position.submitOrder({ idempotencyKey: "sell-first", side: "sell", type: "limit", quantity: 2, limitPrice: 100 });
  const sellSecond = position.submitOrder({ idempotencyKey: "sell-second", side: "sell", type: "limit", quantity: 1, limitPrice: 100 });
  assert.equal(sellFirst.status, "pending");
  assert.equal(sellSecond.status, "rejected");
  assert.equal(sellSecond.reason, "INSUFFICIENT_POSITION");
  assertLedgerInvariants(position.getSnapshot());
  position.cancelOrder(sellFirst.id);
  assertLedgerInvariants(position.getSnapshot());
});

test("corporate actions require unambiguous source identity and keep dividend entitlements fixed", () => {
  const sourceTwo = { id: source.id, version: "generation-2" } as const;
  const ambiguousTape = createMarketReplayTape({ events: [dividendEvent("same-action", 1_003, "effective", source), dividendEvent("same-action", 1_003, "effective", sourceTwo)] });
  assert.throws(() => createResearchExecutionSession(options(ambiguousTape)), (error: unknown) => error instanceof ResearchExecutionValidationError && error.message.includes("AMBIGUOUS_CORPORATE_ACTION_SOURCE"));

  const tape = createMarketReplayTape({ events: [sourceStatus("status", 1_000), book("book", 1_000, 1), trade("trade", 1_001), dividendEvent("dividend", 1_002, "effective"), splitEvent("split", 1_003), dividendEvent("dividend", 1_004, "payment")] });
  const session = createResearchExecutionSession(options(tape));
  session.start();
  session.step();
  session.step();
  session.submitOrder({ idempotencyKey: "dividend-buy", side: "buy", type: "market", quantity: 1 });
  session.step();
  for (let index = 0; index < 10 && session.getSnapshot().cursor.eventId !== "dividend-payment-generation-1"; index += 1) session.step();
  const snapshot = session.getSnapshot();
  assert.equal(snapshot.ledger.position?.quantity, 2);
  assert.equal(snapshot.ledger.cash, 899, "one share entitlement fixed at ex-dividend time is paid once after the split");
  assertLedgerInvariants(snapshot);
});

test("closed session boundaries fail closed without stale-book fills", () => {
  const tape = createMarketReplayTape({ events: [sessionBoundary("open", 999, "open"), sourceStatus("status", 1_000), book("book", 1_000, 1), sessionBoundary("close", 1_001, "close"), trade("closed-trade", 1_002), sessionBoundary("reopen", 1_003, "open", "session-2"), trade("open-trade", 1_004)] });
  const session = createResearchExecutionSession(options(tape));
  session.start();
  session.step();
  session.step();
  session.step();
  const order = session.submitOrder({ idempotencyKey: "session-order", side: "buy", type: "market", quantity: 1 });
  session.step();
  session.step();
  assert.equal(session.getOrders().find((candidate) => candidate.id === order.id)?.status, "pending");
  assert.equal(session.getSnapshot().fills.length, 0);
  assert.ok(session.getSnapshot().diagnostics.quality.includes("indeterminate"));
  session.step();
  session.step();
  assert.equal(session.getSnapshot().fills.length, 1);
});
