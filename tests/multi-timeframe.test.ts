import assert from "node:assert/strict";
import test from "node:test";
import {
  CausalTimeframeAggregator,
  aggregateCandlesByTimeframe,
  calculateMultiTimeframeIndicator,
  calculatePreviousTimeframeLevels,
  mapMultiTimeframeIndicatorToSourceTimes,
  mapMultiTimeframeReferenceToSourceTimes,
  parseFixedTimeframe,
  validateTimeframePair,
  type Candle,
} from "../src/index.js";

const minute = 60_000;
const source = (closes: readonly number[], start = 0): Candle[] => closes.map((close, index) => ({
  time: start + index * minute,
  open: close - 1,
  high: close + 1,
  low: close - 2,
  close,
  volume: index + 1,
}));

const extremeSource = (count: number): Candle[] => Array.from({ length: count }, (_, index) => ({
  time: index * minute,
  open: 100 + index,
  high: 3_000 + index,
  low: -1_000 - index,
  close: 2_000 + index,
  volume: 100_000 + index,
}));

test("fixed timeframe parsing is explicit and rejects calendar/session guesses", () => {
  assert.deepEqual(parseFixedTimeframe("5m"), { id: "5m", durationMs: 300_000, unit: "m", amount: 5 });
  assert.deepEqual(validateTimeframePair("5m", "1h").ratio, 12);
  assert.throws(() => parseFixedTimeframe("1W"), /Unsupported fixed timeframe/);
  assert.throws(() => validateTimeframePair("7m", "1h"), /integer multiple/);
});

test("aggregation uses UTC half-open buckets, preserves OHLCV, and never mutates input", () => {
  const input = [...source([10, 11, 12, 13, 14, 15]).slice(1).reverse(), source([10])[0]!, { ...source([10])[0]!, close: 99, open: 98, high: 100, low: 97, volume: 50 }];
  const before = input.map((candle) => ({ ...candle }));
  const result = aggregateCandlesByTimeframe(input, {
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    asOfTime: 6 * minute,
  });
  assert.deepEqual(input, before);
  assert.equal(result.observations.length, 2);
  assert.deepEqual(result.observations[0], {
    bucketStart: 0,
    bucketEnd: 5 * minute,
    availableAt: 5 * minute,
    status: "closed-complete",
    coverage: "complete",
    sourceCount: 5,
    expectedSourceCount: 5,
    missingSourceCount: 0,
    sourceTimes: [0, minute, 2 * minute, 3 * minute, 4 * minute],
    candle: { time: 0, open: 98, high: 100, low: 9, close: 14, volume: 64 },
  });
  assert.equal(result.observations[1]?.status, "forming");
});

test("unknown coverage remains uncertain and complete-only excludes partial buckets", () => {
  const input = source([10, 11, 12, 13, 14]).filter((_, index) => index !== 2);
  const unknown = aggregateCandlesByTimeframe(input, { sourceTimeframe: "1m", targetTimeframe: "5m", asOfTime: 5 * minute });
  assert.equal(unknown.observations[0]?.status, "closed-uncertain");
  assert.equal(unknown.observations[0]?.availableAt, 5 * minute);
  const completeOnly = aggregateCandlesByTimeframe(input, { sourceTimeframe: "1m", targetTimeframe: "5m", coveragePolicy: "fixed-duration", finalityPolicy: "complete-only", asOfTime: 5 * minute });
  assert.equal(completeOnly.observations[0]?.status, "closed-partial");
  assert.equal(completeOnly.observations[0]?.availableAt, null);
});

test("incremental aggregation handles append, out-of-order input, and corrections", () => {
  const aggregator = new CausalTimeframeAggregator({ sourceTimeframe: "1m", targetTimeframe: "5m", coveragePolicy: "fixed-duration", asOfTime: 5 * minute });
  aggregator.setData(source([10, 11, 12]));
  assert.equal(aggregator.getResult().observations[0]?.status, "closed-partial");
  aggregator.update(source([13], 3 * minute)[0]!);
  aggregator.update(source([14], 4 * minute)[0]!);
  assert.equal(aggregator.getResult().observations[0]?.candle.close, 14);
  aggregator.update({ ...source([11], minute)[0]!, close: 30, high: 31 });
  assert.equal(aggregator.getResult().observations[0]?.candle.close, 14);
  assert.equal(aggregator.getResult().observations[0]?.candle.high, 31);
  aggregator.update({ ...source([9], 5 * minute)[0]! });
  assert.equal(aggregator.getResult().observations.length, 1);
  aggregator.setAsOfTime(6 * minute);
  assert.equal(aggregator.getResult().observations.length, 2);
  aggregator.dispose();
  assert.throws(() => aggregator.getResult(), /disposed/);
});

test("causal SMA uses existing registry math and never maps future output values", () => {
  const input = source(Array.from({ length: 15 }, (_, index) => index + 1));
  const result = calculateMultiTimeframeIndicator(input, {
    id: "mtf-sma",
    indicatorId: "SMA",
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    parameters: { period: 2 },
    asOfTime: 10 * minute,
  });
  const output = result.outputs[0]!;
  assert.deepEqual(output.points.map((point) => point.value), [null, 7.5]);
  assert.equal(output.points[1]?.availableAt, 10 * minute);
  const mapped = mapMultiTimeframeIndicatorToSourceTimes(result, input.map((candle) => candle.time), output.id);
  assert.equal(mapped[9]?.value, null);
  assert.equal(mapped[10]?.value, 7.5);
  assert.equal(mapped[14]?.value, null);
});

test("previous timeframe levels expose only the previous completed period", () => {
  const result = calculatePreviousTimeframeLevels(source([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]), {
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    asOfTime: 10 * minute,
  });
  assert.deepEqual(result.points[0]?.levels, {});
  assert.deepEqual(result.points[1]?.levels, { open: 9, high: 15, low: 8, close: 14 });
  const mapped = mapMultiTimeframeReferenceToSourceTimes(result, source([10, 11, 12, 13, 14, 15, 16]).map((candle) => candle.time));
  assert.deepEqual(mapped[4]?.levels, {});
  assert.deepEqual(mapped[5]?.levels, { open: 9, high: 15, low: 8, close: 14 });
});

test("missing volume policy does not invent volume", () => {
  const input = source([10, 11]).map((candle, index) => index === 1 ? (({ volume: _volume, ...rest }) => rest)(candle) : candle);
  const unknown = aggregateCandlesByTimeframe(input, { sourceTimeframe: "1m", targetTimeframe: "2m", missingVolumePolicy: "unknown", coveragePolicy: "fixed-duration", asOfTime: 2 * minute });
  assert.equal(unknown.observations[0]?.candle.volume, undefined);
  const zero = aggregateCandlesByTimeframe(input, { sourceTimeframe: "1m", targetTimeframe: "2m", missingVolumePolicy: "zero", coveragePolicy: "fixed-duration", asOfTime: 2 * minute });
  assert.equal(zero.observations[0]?.candle.volume, 1);
});

test("as-of snapshots exclude future source values and remain seekable", () => {
  const candles = extremeSource(10);
  const aggregator = new CausalTimeframeAggregator({ sourceTimeframe: "1m", targetTimeframe: "5m", coveragePolicy: "fixed-duration", asOfTime: 2 * minute });
  aggregator.setData(candles);

  const beforeFirst = aggregator.getResult(0);
  const halfwayThroughFirst = aggregator.getResult(30_000);
  assert.equal(beforeFirst.observations.length, 0);
  assert.equal(halfwayThroughFirst.observations.length, 0);

  const atTwoMinutes = aggregator.getResult(2 * minute);
  assert.equal(atTwoMinutes.observations.length, 1);
  assert.deepEqual(atTwoMinutes.observations[0], {
    bucketStart: 0,
    bucketEnd: 5 * minute,
    availableAt: null,
    status: "forming",
    coverage: "partial",
    sourceCount: 2,
    expectedSourceCount: 5,
    missingSourceCount: 3,
    sourceTimes: [0, minute],
    candle: { time: 0, open: 100, high: 3_001, low: -1_001, close: 2_001, volume: 200_001 },
  });

  const atFiveMinutes = aggregator.getResult(5 * minute);
  assert.equal(atFiveMinutes.observations.length, 1);
  assert.equal(atFiveMinutes.observations[0]?.status, "closed-complete");
  assert.deepEqual(atFiveMinutes.observations[0]?.sourceTimes, [0, minute, 2 * minute, 3 * minute, 4 * minute]);
  assert.deepEqual(atFiveMinutes.observations[0]?.candle, { time: 0, open: 100, high: 3_004, low: -1_004, close: 2_004, volume: 500_010 });

  const atSixMinutes = aggregator.getResult(6 * minute);
  assert.equal(atSixMinutes.observations.length, 2);
  assert.deepEqual(atSixMinutes.observations[1], {
    bucketStart: 5 * minute,
    bucketEnd: 10 * minute,
    availableAt: null,
    status: "forming",
    coverage: "partial",
    sourceCount: 1,
    expectedSourceCount: 5,
    missingSourceCount: 4,
    sourceTimes: [5 * minute],
    candle: { time: 5 * minute, open: 105, high: 3_005, low: -1_005, close: 2_005, volume: 100_005 },
  });

  const atTenMinutes = aggregator.getResult(10 * minute);
  assert.equal(atTenMinutes.observations.length, 2);
  assert.equal(atTenMinutes.observations[1]?.status, "closed-complete");
  assert.deepEqual(atTenMinutes.observations[1]?.sourceTimes, [5 * minute, 6 * minute, 7 * minute, 8 * minute, 9 * minute]);
  assert.deepEqual(atTenMinutes.observations[1]?.candle, { time: 5 * minute, open: 105, high: 3_009, low: -1_009, close: 2_009, volume: 500_035 });

  // A future correction stays in the backing store but cannot change an old snapshot.
  aggregator.update({ ...candles[4]!, high: 9_000_004, close: 8_000_004, volume: 8_000_004 });
  assert.deepEqual(aggregator.getResult(2 * minute), atTwoMinutes);
  // Seeking forward and backward reuses the same stored history deterministically.
  assert.notDeepEqual(aggregator.getResult(10 * minute), atTenMinutes);
  aggregator.dispose();
});

test("as-of boundaries keep indicator and previous-period APIs causal", () => {
  const candles = extremeSource(15);
  const indicator = calculateMultiTimeframeIndicator(candles, {
    indicatorId: "SMA",
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    parameters: { period: 2 },
    asOfTime: 10 * minute,
  });
  assert.equal(indicator.asOfTime, 10 * minute);
  assert.equal(indicator.observations.length, 2);
  assert.deepEqual(indicator.outputs[0]?.points.map((point) => point.value), [null, 2_006.5]);
  const mappedIndicator = mapMultiTimeframeIndicatorToSourceTimes(indicator, candles.map((candle) => candle.time), indicator.outputs[0]!.id);
  assert.equal(mappedIndicator[9]?.value, null);
  assert.equal(mappedIndicator[10]?.value, 2_006.5);
  assert.equal(mappedIndicator[14]?.value, null);
  assert.equal(mappedIndicator[14]?.availableAt, null);

  const references = calculatePreviousTimeframeLevels(candles, {
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    asOfTime: 10 * minute,
  });
  assert.equal(references.asOfTime, 10 * minute);
  assert.equal(references.points.length, 2);
  assert.deepEqual(references.points[1]?.levels, { open: 100, high: 3_004, low: -1_004, close: 2_004 });
  const mappedReferences = mapMultiTimeframeReferenceToSourceTimes(references, candles.map((candle) => candle.time));
  assert.deepEqual(mappedReferences[10]?.levels, { open: 100, high: 3_004, low: -1_004, close: 2_004 });
  assert.deepEqual(mappedReferences[14]?.levels, {});

  const mutatedFuture = candles.map((candle) => candle.time < 10 * minute
    ? candle
    : { ...candle, open: 900_000 + candle.time, high: 900_001 + candle.time, low: 899_999 + candle.time, close: 900_000 + candle.time, volume: 900_000 });
  const mutatedIndicator = calculateMultiTimeframeIndicator(mutatedFuture, {
    indicatorId: "SMA",
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    parameters: { period: 2 },
    asOfTime: 10 * minute,
  });
  const mutatedReferences = calculatePreviousTimeframeLevels(mutatedFuture, {
    sourceTimeframe: "1m",
    targetTimeframe: "5m",
    coveragePolicy: "fixed-duration",
    asOfTime: 10 * minute,
  });
  assert.deepEqual(mutatedIndicator, indicator);
  assert.deepEqual(mutatedReferences, references);
});

test("fixed-duration coverage treats an in-progress source interval as unavailable", () => {
  const candles = extremeSource(5);
  const atOpening = aggregateCandlesByTimeframe(candles, { sourceTimeframe: "1m", targetTimeframe: "5m", coveragePolicy: "fixed-duration", asOfTime: 0 });
  const atSourceCompletion = aggregateCandlesByTimeframe(candles, { sourceTimeframe: "1m", targetTimeframe: "5m", coveragePolicy: "fixed-duration", asOfTime: minute });
  const atTargetBoundary = aggregateCandlesByTimeframe(candles, { sourceTimeframe: "1m", targetTimeframe: "5m", coveragePolicy: "fixed-duration", asOfTime: 5 * minute });
  assert.equal(atOpening.observations.length, 0);
  assert.deepEqual(atSourceCompletion.observations[0]?.sourceTimes, [0]);
  assert.equal(atSourceCompletion.observations[0]?.status, "forming");
  assert.equal(atTargetBoundary.observations[0]?.status, "closed-complete");
  assert.equal(atTargetBoundary.observations[0]?.availableAt, 5 * minute);
});
