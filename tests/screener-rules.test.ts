import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateScreenerRuleSet,
  validateScreenerRuleSet,
  ScreenerRuleValidationError,
  type Candle,
  type ScreenerRuleSet,
} from "../src/index.js";

function candles(): Candle[] {
  const closes = [10, 10, 11, 12, 11, 13, 14, 15, 14, 16, 17, 18];
  return closes.map((close, index) => ({ time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.25, high: close + 1, low: close - 1, close, volume: 100 + index * 10 }));
}

function set(root: ScreenerRuleSet["root"]): ScreenerRuleSet {
  return { version: 1, id: "test", name: "Test rules", root };
}

test("rule validation is versioned, bounded, and validates indicator metadata without eval", () => {
  const valid = validateScreenerRuleSet(set({ type: "indicator-threshold", reference: { indicatorId: "sma", parameters: { period: 3 }, output: "value" }, operator: ">", value: 10 }));
  assert.equal(valid.root.type, "indicator-threshold");
  assert.throws(() => validateScreenerRuleSet(set({ type: "indicator-threshold", reference: { indicatorId: "SMA", parameters: { period: 0 }, output: "value" }, operator: ">", value: 10 })), ScreenerRuleValidationError);
  assert.throws(() => validateScreenerRuleSet(set({ type: "group", operator: "and", children: [] })), ScreenerRuleValidationError);
  assert.throws(() => validateScreenerRuleSet(set({ type: "group", operator: "and", children: [{ type: "call", source: "globalThis.process.exit()" } as never] })), ScreenerRuleValidationError);
});

test("price, volume, percentage, prior-range, and crossing rules use completed bars", () => {
  const input = candles();
  assert.equal(evaluateScreenerRuleSet(set({ type: "price-threshold", field: "close", operator: ">", value: 15 }), input).state, "matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "price-change", lookback: 3, operator: ">", value: 10 }), input).state, "matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "price-relative", field: "close", reference: "previous-high", operator: ">=" }), input).state, "matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "volume", mode: "relative", lookback: 3, operator: ">", value: 1 }), input).state, "matched");
  const crossing = evaluateScreenerRuleSet(set({ type: "price-cross", field: "close", direction: "above", value: 15 }), input, { index: 9 });
  assert.equal(crossing.state, "matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "price-cross", field: "close", direction: "above", value: 15 }), input, { index: 8 }).state, "not-matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "price-threshold", field: "close", operator: ">", value: 1 }), input, { latestFinality: "developing" }).state, "unavailable");
});

test("indicator references reuse the registry and support threshold, crossover, and previous-channel breakout", () => {
  const input = candles();
  const sma = { indicatorId: "SMA", parameters: { period: 3 }, output: "value" } as const;
  assert.equal(evaluateScreenerRuleSet(set({ type: "indicator-threshold", reference: sma, operator: ">", value: 14 }), input).state, "matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "indicator-cross", left: { kind: "price", field: "close" }, right: { kind: "indicator", reference: sma }, direction: "above" }), input, { index: 5 }).state, "matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "indicator-breakout", field: "close", channel: { indicatorId: "DONCHIAN_CHANNELS", parameters: { period: 3 }, output: "upper" }, direction: "above" }), input).state, "not-matched");
  assert.equal(evaluateScreenerRuleSet(set({ type: "indicator-threshold", reference: sma, operator: ">", value: 100 }), input, { index: 0 }).diagnostics[0]?.code, "insufficient-warmup");
});

test("compound rules propagate unavailable values and preserve historical cutoffs", () => {
  const input = candles();
  const root: ScreenerRuleSet["root"] = {
    type: "group",
    operator: "and",
    children: [
      { type: "price-threshold", field: "close", operator: ">", value: 10 },
      { type: "indicator-threshold", reference: { indicatorId: "SMA", parameters: { period: 20 }, output: "value" }, operator: ">", value: 0 },
    ],
  };
  assert.equal(evaluateScreenerRuleSet(set(root), input, { index: 5 }).state, "unavailable");
  const future = [...input, { ...input[input.length - 1]!, time: input[input.length - 1]!.time + 60_000, close: 1, open: 1, high: 2, low: 0 }];
  assert.deepEqual(evaluateScreenerRuleSet(set({ type: "price-threshold", field: "close", operator: ">", value: 12 }), input, { index: 5 }), evaluateScreenerRuleSet(set({ type: "price-threshold", field: "close", operator: ">", value: 12 }), future, { index: 5 }));
  assert.equal(evaluateScreenerRuleSet(set({ type: "not", child: { type: "indicator-threshold", reference: { indicatorId: "SMA", parameters: { period: 20 }, output: "value" }, operator: ">", value: 0 } }), input, { index: 0 }).state, "unavailable");
});

test("missing volume and invalid history are explicit unavailable states", () => {
  const input = candles();
  const noVolume = input.map(({ volume: _volume, ...candle }) => candle);
  assert.equal(evaluateScreenerRuleSet(set({ type: "volume", mode: "threshold", operator: ">", value: 1 }), noVolume).diagnostics[0]?.code, "missing-volume");
  const invalid = [...input]; invalid[3] = { ...invalid[3]!, high: 0 };
  assert.equal(evaluateScreenerRuleSet(set({ type: "price-threshold", field: "close", operator: ">", value: 1 }), invalid, { index: 5 }).diagnostics[0]?.code, "invalid-candle");
});

