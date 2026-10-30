import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryMarketTradeDatafeed,
  MarketTradeStore,
  MarketTradeValidationError,
  normalizeMarketTrade,
  type MarketTrade,
} from "../src/index.js";

const source = { id: "fixture-trades", version: "1.0.0", kind: "offline" };
const trade = (id: string, time: number, quantity: number, aggressorSide: MarketTrade["aggressorSide"], revision = 0): MarketTrade => ({
  id,
  instrumentId: "TEST/USD",
  venueId: "fixture",
  time,
  price: 100 + time / 1_000,
  quantity,
  aggressorSide,
  sideQuality: aggressorSide === "unknown" ? "unknown" : "observed",
  revision,
  source,
});

test("market trades validate explicit unknown aggression and source provenance", () => {
  const normalized = normalizeMarketTrade(trade("t1", 1_000, 2, "unknown"));
  assert.equal(normalized.aggressorSide, "unknown");
  assert.equal(normalized.sideQuality, "unknown");
  assert.deepEqual(normalized.source, source);
  assert.throws(() => normalizeMarketTrade({ ...normalized, aggressorSide: "unknown", sideQuality: "observed" }), MarketTradeValidationError);
  assert.throws(() => normalizeMarketTrade({ ...normalized, quantity: -1 }), MarketTradeValidationError);
  assert.throws(() => normalizeMarketTrade({ ...normalized, time: 1.5 }), MarketTradeValidationError);
});

test("trade store deduplicates stable IDs, accepts higher revisions, sorts out of order, and bounds memory", () => {
  const store = new MarketTradeStore({ maxTrades: 3 });
  assert.equal(store.update(trade("t3", 3_000, 3, "sell")), "inserted");
  assert.equal(store.update(trade("t1", 1_000, 1, "buy")), "inserted");
  assert.equal(store.update(trade("t2", 2_000, 2, "buy")), "inserted");
  assert.equal(store.update(trade("t2", 2_000, 2, "buy")), "duplicate");
  assert.equal(store.update(trade("t2", 2_000, 4, "sell", 1)), "revised");
  assert.equal(store.update(trade("t4", 4_000, 4, "unknown")), "inserted");
  assert.deepEqual(store.getAll().map((item) => item.id), ["t2", "t3", "t4"]);
  assert.equal(store.get("t2")?.quantity, 4);
  assert.equal(store.getRange(2_000, 4_000).length, 3);
  assert.equal(store.getDataset({ complete: true }).coverage.unknownSideVolume, 4);
  store.dispose();
  assert.throws(() => store.getAll(), /disposed/);
});

test("trade range queries stay ordered and only clone the selected indexed slice", () => {
  const store = new MarketTradeStore({ maxTrades: 10 });
  store.update(trade("late", 4_000, 4, "sell"));
  store.update(trade("early", 1_000, 1, "buy"));
  store.update(trade("middle", 2_000, 2, "sell"));
  assert.deepEqual(store.getRange(1_000, 2_000).map((item) => item.id), ["early", "middle"]);
  assert.deepEqual(store.getRange(1_000, 4_000, 2_000).map((item) => item.id), ["early", "middle"]);
  const selected = store.getRange(2_000, 2_000);
  assert.notEqual(selected[0]?.source, store.get("middle")?.source);
  selected[0] = { ...selected[0]!, quantity: 99 };
  assert.equal(store.get("middle")?.quantity, 2);
  store.update(trade("middle", 2_000, 3, "buy", 1));
  assert.equal(store.getRange(2_000, 2_000)[0]?.quantity, 3);
  store.dispose();
});

test("in-memory trade feed filters bounded historical queries and cleans live subscriptions", async () => {
  const feed = new InMemoryMarketTradeDatafeed([
    trade("t1", 1_000, 1, "buy"),
    trade("t2", 2_000, 2, "sell"),
  ]);
  const received: MarketTrade[] = [];
  const unsubscribe = feed.subscribeTrades?.({ instrumentId: "TEST/USD", venueId: "fixture", onTrade: (item) => received.push(item) });
  assert.deepEqual((await feed.getTrades({ instrumentId: "TEST/USD", from: 1_000, to: 2_000, limit: 1 })).map((item) => item.id), ["t2"]);
  feed.emit(trade("t3", 3_000, 3, "unknown"));
  unsubscribe?.();
  feed.emit(trade("t4", 4_000, 4, "buy"));
  assert.deepEqual(received.map((item) => item.id), ["t3"]);
  feed.dispose();
});
