import assert from "node:assert/strict";
import test from "node:test";
import {
  MarketTradeStore,
  OrderFlowValidationError,
  TradingCalendarEngine,
  calculateCumulativeVolumeDelta,
  calculateFootprint,
  calculateTradeFlow,
  createIllustrativeWeekdayCalendar,
  getTimeAndSales,
  type MarketTrade,
} from "../src/index.js";

const source = { id: "fixture-flow", version: "1.0.0", kind: "offline" };
const makeTrade = (id: string, time: number, price: number, quantity: number, side: MarketTrade["aggressorSide"], revision = 0, sideQuality: MarketTrade["sideQuality"] = side === "unknown" ? "unknown" : "observed"): MarketTrade => ({
  id,
  instrumentId: "TEST/USD",
  venueId: "fixture",
  time,
  price,
  quantity,
  aggressorSide: side,
  sideQuality,
  revision,
  source,
});

test("trade flow separates buy, sell, unknown, and estimated volume without candle inference", () => {
  const trades = [
    makeTrade("buy", 1_000, 100, 2, "buy"),
    makeTrade("sell", 2_000, 100, 1, "sell"),
    makeTrade("unknown", 3_000, 100, 3, "unknown"),
    makeTrade("estimated", 4_000, 100, 4, "buy", 0, "estimated"),
  ];
  const observed = calculateTradeFlow(trades, { from: 1_000, to: 5_000, sourceCoverage: "partial" });
  assert.equal(observed.buyVolume, 2);
  assert.equal(observed.sellVolume, 1);
  assert.equal(observed.unknownSideVolume, 7);
  assert.equal(observed.delta, 1);
  assert.equal(observed.coverage, "partial-known-side");
  const estimated = calculateTradeFlow(trades, { from: 1_000, to: 5_000, includeEstimated: true, sourceCoverage: "complete" });
  assert.equal(estimated.buyVolume, 6);
  assert.equal(estimated.unknownSideVolume, 3);
  assert.equal(estimated.delta, 5);
});

test("corrections and duplicate IDs are counted once and as-of excludes future prints", () => {
  const store = new MarketTradeStore({ maxTrades: 20 });
  store.setData([
    makeTrade("t1", 1_000, 100, 2, "buy"),
    makeTrade("t2", 2_000, 100, 5, "sell"),
  ]);
  store.update(makeTrade("t2", 2_000, 100, 3, "sell", 1));
  store.update(makeTrade("t2", 2_000, 100, 3, "sell", 1));
  store.update(makeTrade("t3", 3_000, 100, 7, "buy"));
  const result = calculateTradeFlow(store.getAll(), { from: 0, to: 4_000, asOfTime: 2_000, sourceCoverage: "complete" });
  assert.equal(result.tradeCount, 2);
  assert.equal(result.buyVolume, 2);
  assert.equal(result.sellVolume, 3);
  assert.equal(result.delta, -1);
});

test("Footprint aggregates actual trade prices, cells, bar delta, and explicit tick policies", () => {
  const result = calculateFootprint([
    makeTrade("b1", 1_000, 100, 2, "buy"),
    makeTrade("s1", 2_000, 100, 1, "sell"),
    makeTrade("u1", 3_000, 100.5, 4, "unknown"),
    makeTrade("b2", 61_000, 101, 3, "buy"),
  ], { from: 1_000, to: 120_000, intervalMs: 60_000, tickSize: 0.5, sourceCoverage: "partial" });
  assert.equal(result.buckets.length, 2);
  assert.equal(result.buckets[0]?.delta, 1);
  assert.equal(result.buckets[0]?.cells.length, 2);
  assert.deepEqual(result.buckets[0]?.cells.map((cell) => [cell.price, cell.buyVolume, cell.sellVolume, cell.unknownSideVolume]), [[100, 2, 1, 0], [100.5, 0, 0, 4]]);
  assert.equal(result.totalUnknownSideVolume, 4);
  assert.throws(() => calculateFootprint([makeTrade("off", 1_000, 100.2, 1, "buy")], { from: 0, to: 2_000, tickSize: 0.5 }), OrderFlowValidationError);
  const rounded = calculateFootprint([makeTrade("round", 1_000, 100.2, 1, "buy")], { from: 0, to: 2_000, tickSize: 0.5, offTickPolicy: "round" });
  assert.equal(rounded.buckets[0]?.cells[0]?.price, 100);
});

test("Footprint enforces one bounded cell budget across all buckets", () => {
  const trades = Array.from({ length: 1_000 }, (_, index) => makeTrade(
    `cell-${index}`,
    1_000 + index * 60_000,
    100 + index * 0.5,
    1,
    index % 2 === 0 ? "buy" : "sell",
  ));
  const result = calculateFootprint(trades, {
    from: 1_000,
    to: 1_000 + trades.length * 60_000,
    intervalMs: 60_000,
    tickSize: 0.5,
    maxCells: trades.length,
    sourceCoverage: "complete",
  });
  assert.equal(result.tradeCount, trades.length);
  assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.cells.length, 0), trades.length);
  assert.throws(() => calculateFootprint(trades, {
    from: 1_000,
    to: 1_000 + trades.length * 60_000,
    intervalMs: 60_000,
    tickSize: 0.5,
    maxCells: trades.length - 1,
    sourceCoverage: "complete",
  }), OrderFlowValidationError);
});

test("CVD is continuous or resets only at real calendar sessions", () => {
  const calendar = new TradingCalendarEngine(createIllustrativeWeekdayCalendar());
  const sessions = calendar.enumerateSessions(Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 7));
  assert.ok(sessions.length >= 2);
  const first = sessions[0]!;
  const second = sessions[1]!;
  const trades = [
    makeTrade("a", first.start + 1_000, 100, 2, "buy"),
    makeTrade("b", first.start + 2_000, 100, 1, "sell"),
    makeTrade("c", second.start + 1_000, 100, 4, "sell"),
  ];
  const continuous = calculateCumulativeVolumeDelta(trades, { from: first.start, to: second.end, intervalMs: 60_000, reset: "continuous", sourceCoverage: "complete" });
  assert.equal(continuous.currentValue, -3);
  const session = calculateCumulativeVolumeDelta(trades, { from: first.start, to: second.end, intervalMs: 60_000, reset: "session", calendar, sourceCoverage: "complete" });
  assert.equal(session.observations.some((item) => item.reset), true);
  assert.equal(session.currentValue, -4);
  assert.throws(() => calculateCumulativeVolumeDelta(trades, { from: first.start, to: second.end, reset: "session" }), OrderFlowValidationError);
});

test("Time and Sales is bounded, stable, and replay/as-of safe", () => {
  const trades = [makeTrade("a", 1_000, 100, 1, "buy"), makeTrade("b", 2_000, 101, 1, "sell"), makeTrade("c", 3_000, 102, 1, "unknown")];
  assert.deepEqual(getTimeAndSales(trades, { from: 0, to: 4_000, asOfTime: 2_000, limit: 10 }).map((item) => item.id), ["a", "b"]);
  assert.deepEqual(getTimeAndSales(trades, { from: 0, to: 4_000, limit: 1 }).map((item) => item.id), ["c"]);
});

