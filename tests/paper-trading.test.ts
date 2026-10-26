import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeterministicPaperMarketStream,
  createPaperTradingAccount,
  PaperTradingMarketEventError,
  PaperTradingOrderError,
  parsePaperTradingDocument,
  restorePaperTradingAccount,
  serializePaperTradingDocument,
  type PaperClock,
  type PaperMarketEvent,
  type PaperTradingAccountOptions,
} from "../src/index.js";

function fixture() {
  let now = 1_700_000_000_000;
  const clock: PaperClock = { now: () => now };
  const options: PaperTradingAccountOptions = {
    id: "paper-btc",
    displayName: "BTC simulated account",
    symbol: "BTCUSD",
    currency: "USD",
    initialBalance: 1_000,
    execution: { commission: { type: "percent", value: 0 }, slippage: { type: "percent", value: 0 }, maxQuoteAgeMs: 1_000, allowFractionalQuantity: true },
    clock,
  };
  const event = (id: string, time: number, price: number, sourceSequence: number, mode: PaperMarketEvent["mode"] = "simulated"): PaperMarketEvent => ({ id, symbol: "BTCUSD", time, price, source: "fixture", quoteStatus: "fresh", mode, sourceSequence });
  return { clock, options, event, advance: (milliseconds: number) => { now += milliseconds; } };
}

test("paper account fills market orders only on the next eligible fresh event", () => {
  const f = fixture();
  const account = createPaperTradingAccount(f.options);
  assert.equal(account.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1)).accepted, true);
  const buy = account.submitOrder({ idempotencyKey: "buy-1", side: "buy", type: "market", quantity: 2 });
  assert.equal(buy.status, "pending");
  assert.equal(account.getSnapshot().reservedCash, 200);
  f.advance(1_000);
  const fill = account.processMarketEvent(f.event("m-2", 1_700_000_001_000, 110, 2));
  assert.equal(fill.fills[0]?.status, "filled");
  assert.equal(account.getSnapshot().cash, 780);
  assert.equal(account.getSnapshot().position?.quantity, 2);
  assert.equal(account.getSnapshot().position?.averageEntryPrice, 110);

  const sell = account.submitOrder({ idempotencyKey: "sell-1", side: "sell", type: "market", quantity: 1, reason: "take profit" });
  assert.equal(sell.status, "pending");
  f.advance(1_000);
  account.processMarketEvent(f.event("m-3", 1_700_000_002_000, 130, 3));
  const snapshot = account.getSnapshot();
  assert.equal(snapshot.cash, 910);
  assert.equal(snapshot.position?.quantity, 1);
  assert.equal(snapshot.realizedPnl, 20);
  assert.equal(account.getTrades().length, 1);
  assert.equal(account.getTrades()[0]?.entryOrderId, buy.id);
  assert.equal(account.getTrades()[0]?.exitOrderId, sell.id);
});

test("paper account is idempotent and rejects stale, duplicate, out-of-order, and replay events", () => {
  const f = fixture();
  const account = createPaperTradingAccount(f.options);
  account.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1));
  const first = account.submitOrder({ idempotencyKey: "same", side: "buy", type: "market", quantity: 1 });
  assert.equal(account.submitOrder({ idempotencyKey: "same", side: "buy", type: "market", quantity: 1 }).id, first.id);
  assert.throws(() => account.submitOrder({ idempotencyKey: "same", side: "buy", type: "market", quantity: 2 }), (error: unknown) => error instanceof PaperTradingOrderError && error.code === "IDEMPOTENCY_CONFLICT");
  assert.equal(account.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1)).ignoredReason, "DUPLICATE_EVENT");
  assert.equal(account.processMarketEvent(f.event("m-old", 1_699_999_999_000, 99, 0)).ignoredReason, "OUT_OF_ORDER_TIMESTAMP");
  assert.equal(account.processMarketEvent(f.event("m-replay", 1_700_000_001_000, 101, 2, "replay")).ignoredReason, "REPLAY_ISOLATION");
  f.advance(2_000);
  assert.equal(account.processMarketEvent({ ...f.event("m-stale", 1_700_000_002_000, 102, 2), quoteStatus: "stale" }).ignoredReason, "STALE_QUOTE");
  assert.equal(account.getOrders()[0]?.status, "pending");
});

test("paper account state round-trips and does not auto-fill from restored history", () => {
  const f = fixture();
  const account = createPaperTradingAccount(f.options);
  account.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1));
  account.submitOrder({ idempotencyKey: "pending", side: "buy", type: "market", quantity: 1 });
  const document = parsePaperTradingDocument(JSON.parse(serializePaperTradingDocument(account.exportState())));
  const restored = restorePaperTradingAccount(f.options, document);
  assert.equal(restored.getSnapshot().reservedCash, 100);
  assert.equal(restored.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1)).ignoredReason, "DUPLICATE_EVENT");
  f.advance(1_000);
  assert.equal(restored.processMarketEvent(f.event("m-2", 1_700_000_001_000, 105, 2)).fills.length, 1);
  assert.equal(restored.getSnapshot().position?.averageEntryPrice, 105);
});

test("deterministic market stream reconnects without replaying events", () => {
  const f = fixture();
  const stream = createDeterministicPaperMarketStream({ symbol: "BTCUSD", initialPrice: 100, startTime: 1_700_000_000_000, stepMs: 1_000, intervalMs: 1_000, seed: 7, clock: f.clock });
  const events: PaperMarketEvent[] = [];
  stream.subscribe((event) => events.push(event));
  const first = stream.step();
  stream.disconnect();
  assert.throws(() => stream.step());
  stream.reconnect();
  const second = stream.step();
  assert.equal(first.sourceSequence, 1);
  assert.equal(second.sourceSequence, 2);
  assert.equal(events.length, 2);
  stream.dispose();
  assert.equal(stream.getStatus().state, "disposed");
});

test("invalid market events fail closed", () => {
  const f = fixture();
  const account = createPaperTradingAccount(f.options);
  assert.throws(() => account.processMarketEvent({ ...f.event("bad", 1_700_000_000_000, -1, 1) }), PaperTradingMarketEventError);
});

test("risk limits reject oversized orders, loss breaches, and manual halts", () => {
  const f = fixture();
  const account = createPaperTradingAccount({ ...f.options, risk: { maxOrderQuantity: 1, maxSessionLoss: 10 } });
  account.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1));
  assert.throws(() => account.submitOrder({ idempotencyKey: "too-large", side: "buy", type: "market", quantity: 2 }), (error: unknown) => error instanceof PaperTradingOrderError && error.code === "MAX_ORDER_QUANTITY");
  const buy = account.submitOrder({ idempotencyKey: "buy", side: "buy", type: "market", quantity: 1 });
  f.advance(1_000);
  account.processMarketEvent(f.event("m-2", 1_700_000_001_000, 100, 2));
  const sell = account.submitOrder({ idempotencyKey: "sell", side: "sell", type: "market", quantity: 1 });
  f.advance(1_000);
  account.processMarketEvent(f.event("m-3", 1_700_000_002_000, 80, 3));
  assert.equal(account.getOrders().find((order) => order.id === sell.id)?.status, "filled");
  assert.throws(() => account.submitOrder({ idempotencyKey: "after-loss", side: "buy", type: "market", quantity: 1 }), (error: unknown) => error instanceof PaperTradingOrderError && error.code === "MAX_SESSION_LOSS");

  account.setRiskHalt(true, "operator stop");
  assert.equal(account.getSnapshot().tradingHalted, true);
  assert.throws(() => account.submitOrder({ idempotencyKey: "halted", side: "buy", type: "market", quantity: 1 }), (error: unknown) => error instanceof PaperTradingOrderError && error.code === "RISK_HALTED");
  account.setRiskHalt(false);
  assert.equal(account.getStatus().tradingHalted, false);
  assert.equal(buy.status, "pending");
});

test("drawdown risk limit is evaluated against the account high-water mark", () => {
  const f = fixture();
  const account = createPaperTradingAccount({ ...f.options, risk: { maxDrawdownPercent: 0.05 } });
  account.processMarketEvent(f.event("m-1", 1_700_000_000_000, 100, 1));
  account.submitOrder({ idempotencyKey: "buy", side: "buy", type: "market", quantity: 1 });
  f.advance(1_000);
  account.processMarketEvent(f.event("m-2", 1_700_000_001_000, 100, 2));
  f.advance(1_000);
  account.processMarketEvent(f.event("m-3", 1_700_000_002_000, 50, 3));
  assert.equal(account.getSnapshot().drawdownPercent, -0.05);
  assert.throws(() => account.submitOrder({ idempotencyKey: "drawdown", side: "buy", type: "market", quantity: 1 }), (error: unknown) => error instanceof PaperTradingOrderError && error.code === "MAX_DRAWDOWN");
});
