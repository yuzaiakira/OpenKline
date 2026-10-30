import assert from "node:assert/strict";
import test from "node:test";
import {
  AnchoredVwapCalculator,
  calculateAnchoredVwap,
  calculateEstimatedVolumeProfile,
  VolumeAnalyticsValidationError,
  type Candle,
} from "../src/index.js";

const candles: Candle[] = [
  { time: 1_000, open: 9, high: 12, low: 8, close: 10, volume: 10 },
  { time: 2_000, open: 19, high: 22, low: 18, close: 20, volume: 20 },
  { time: 3_000, open: 29, high: 32, low: 28, close: 30, volume: 0 },
  { time: 4_000, open: 39, high: 42, low: 38, close: 40 },
];

test("Anchored VWAP uses an inclusive anchor and typical-price weighting", () => {
  const result = calculateAnchoredVwap(candles, { anchorTime: 2_000 });
  assert.deepEqual(result.points, [
    { time: 2_000, value: 20, cumulativeVolume: 20 },
    { time: 3_000, value: 20, cumulativeVolume: 20 },
    { time: 4_000, value: 20, cumulativeVolume: 20 },
  ]);
  assert.equal(result.currentValue, 20);
  assert.equal(result.eligibleCandleCount, 3);
  assert.equal(result.volumeCandleCount, 1);
});

test("Anchored VWAP supports close price, sparse input, corrections, and anchors between candles", () => {
  const result = calculateAnchoredVwap(candles, { anchorTime: 1_500, priceSource: "close" });
  assert.equal(result.points[0]?.value, 20);
  assert.equal(result.totalEligibleVolume, 20);

  const calculator = new AnchoredVwapCalculator({ anchorTime: 1_000, priceSource: "close" });
  calculator.setData(candles);
  assert.ok(Math.abs((calculator.getResult().currentValue ?? 0) - 16.666666666666668) < 1e-12);
  calculator.update({ ...candles[1]!, close: 24, open: 23, high: 25, low: 22 });
  assert.equal(calculator.getResult().currentValue, (10 * 10 + 24 * 20) / 30);
  calculator.setOptions({ anchorTime: 9_000, priceSource: "close" });
  assert.deepEqual(calculator.getResult().points, []);
  calculator.dispose();
  assert.throws(() => calculator.getResult(), VolumeAnalyticsValidationError);
});

test("Anchored VWAP never emits non-finite values for finite extreme prices", () => {
  const result = calculateAnchoredVwap([
    { time: 1, open: Number.MAX_VALUE, high: Number.MAX_VALUE, low: Number.MAX_VALUE, close: Number.MAX_VALUE, volume: Number.MAX_VALUE },
    { time: 2, open: Number.MAX_VALUE, high: Number.MAX_VALUE, low: Number.MAX_VALUE, close: Number.MAX_VALUE, volume: Number.MAX_VALUE },
  ], { anchorTime: 1, priceSource: "close" });
  assert.ok(result.points.every((point) => point.value === null || Number.isFinite(point.value)));
  assert.ok(result.points.every((point) => Number.isFinite(point.cumulativeVolume)));
});

test("close-price Estimated Volume Profile has deterministic POC and value area", () => {
  const result = calculateEstimatedVolumeProfile([
    { time: 1, open: 1, high: 10, low: 0, close: 2, volume: 10 },
    { time: 2, open: 7, high: 10, low: 2, close: 8, volume: 20 },
    { time: 3, open: 4, high: 6, low: 3, close: 5, volume: 100 },
  ], { from: 1, to: 4, binCount: 2, allocation: "close", valueAreaPercentage: 0.7, priceBounds: { min: 0, max: 10 } });
  assert.equal(result.status, "ready");
  assert.equal(result.totalEligibleVolume, 130);
  assert.deepEqual(result.bins.map((bin) => bin.estimatedVolume), [10, 120]);
  assert.deepEqual(result.pointOfControl, { index: 1, price: 7.5, estimatedVolume: 120 });
  assert.equal(result.valueArea?.percentageAchieved, 120 / 130);
  assert.equal(result.valueArea?.low, 5);
  assert.equal(result.valueArea?.high, 10);
});

test("range-uniform profile conserves volume and breaks POC ties toward lower prices", () => {
  const result = calculateEstimatedVolumeProfile([
    { time: 1, open: 5, high: 10, low: 0, close: 5, volume: 10 },
    { time: 2, open: 5, high: 10, low: 0, close: 5, volume: 10 },
  ], { from: 1, to: 3, binCount: 2, allocation: "range-uniform", priceBounds: { min: 0, max: 10 } });
  assert.deepEqual(result.bins.map((bin) => bin.estimatedVolume), [10, 10]);
  assert.equal(result.pointOfControl?.index, 0);
  assert.equal(result.totalEligibleVolume, result.bins.reduce((sum, bin) => sum + bin.estimatedVolume, 0));
  assert.equal(result.valueArea?.percentageAchieved, 1);
});

test("profile distinguishes empty, missing-volume, and invalid configuration states", () => {
  const empty = calculateEstimatedVolumeProfile(candles, { from: 9_000, to: 10_000, binCount: 4 });
  assert.equal(empty.status, "empty");
  assert.equal(empty.priceBounds, null);
  const missing = calculateEstimatedVolumeProfile(candles.slice(2), { from: 3_000, to: 5_000, binCount: 4 });
  assert.equal(missing.status, "empty");
  assert.equal(missing.eligibleCandleCount, 2);
  assert.equal(missing.volumeCandleCount, 0);
  assert.throws(() => calculateEstimatedVolumeProfile(candles, { from: 2, to: 2 }), VolumeAnalyticsValidationError);
  assert.throws(() => calculateEstimatedVolumeProfile(candles, { from: 1, to: 2, binCount: 0 }), VolumeAnalyticsValidationError);
  assert.throws(() => calculateEstimatedVolumeProfile(candles, { from: 1, to: 2, valueAreaPercentage: 1.1 }), VolumeAnalyticsValidationError);
});

test("duplicate timestamps use the latest correction without changing causal ordering", () => {
  const result = calculateAnchoredVwap([
    candles[1]!,
    { ...candles[1]!, close: 24, open: 23, high: 25, low: 22 },
    candles[0]!,
  ], { anchorTime: 1_000, priceSource: "close" });
  assert.deepEqual(result.points.map((point) => point.time), [1_000, 2_000]);
  assert.equal(result.currentValue, (10 * 10 + 24 * 20) / 30);
});
