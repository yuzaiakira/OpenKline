import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultIndicatorRegistry } from "../src/indicators/index.js";
import type { Candle } from "../src/types.js";

/** Independent arithmetic reference — not imported from OpenKline indicator code. */
function referenceSma(values: readonly number[], period: number): (number | null)[] {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const window = values.slice(index + 1 - period, index + 1);
    return window.reduce((sum, value) => sum + value, 0) / period;
  });
}

function referenceEma(values: readonly number[], period: number): (number | null)[] {
  const result: (number | null)[] = values.map(() => null);
  if (values.length < period) return result;
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index]! - previous) * multiplier + previous;
    result[index] = previous;
  }
  return result;
}

function referenceRsi(closes: readonly number[], period: number): (number | null)[] {
  const result: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = closes[index]! - closes[index - 1]!;
    if (change >= 0) gain += change;
    else loss -= change;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let index = period + 1; index < closes.length; index += 1) {
    const change = closes[index]! - closes[index - 1]!;
    const up = change > 0 ? change : 0;
    const down = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    result[index] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function referenceTrueRange(candles: readonly Candle[]): number[] {
  return candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previousClose = candles[index - 1]!.close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });
}

function referenceAtr(candles: readonly Candle[], period: number): (number | null)[] {
  const tr = referenceTrueRange(candles);
  const result: (number | null)[] = candles.map(() => null);
  if (tr.length < period) return result;
  let atr = tr.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = atr;
  for (let index = period; index < tr.length; index += 1) {
    atr = (atr * (period - 1) + tr[index]!) / period;
    result[index] = atr;
  }
  return result;
}

function referenceStdDev(values: readonly number[], period: number): (number | null)[] {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const window = values.slice(index + 1 - period, index + 1);
    const mean = window.reduce((sum, value) => sum + value, 0) / period;
    const variance = window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  });
}

function referenceVwap(candles: readonly Candle[]): (number | null)[] {
  let cumulativePv = 0;
  let cumulativeVolume = 0;
  return candles.map((candle) => {
    if (candle.volume === undefined || candle.volume <= 0) return null;
    const typical = (candle.high + candle.low + candle.close) / 3;
    cumulativePv += typical * candle.volume;
    cumulativeVolume += candle.volume;
    return cumulativePv / cumulativeVolume;
  });
}

function candlesFromCloses(closes: readonly number[], volume = 10): Candle[] {
  return closes.map((close, index) => ({
    time: Date.UTC(2026, 6, 1) + index * 60_000,
    open: close - 0.25,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }));
}

function values(indicatorId: string, parameters: Record<string, unknown>, input: readonly Candle[], outputId = "value"): (number | null)[] {
  const registry = createDefaultIndicatorRegistry();
  const instance = registry.create(indicatorId, parameters);
  instance.setInput(input);
  return instance.getResult().outputs.find((output) => output.id === outputId)?.points.map((point) => point.value) ?? [];
}

function assertAlmostEqual(actual: readonly (number | null)[], expected: readonly (number | null)[], label: string, epsilon = 1e-10): void {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < actual.length; index += 1) {
    const left = actual[index];
    const right = expected[index];
    if (left == null || right == null) {
      assert.equal(left ?? null, right ?? null, `${label}[${index}]`);
      continue;
    }
    assert.ok(Math.abs(left - right) <= epsilon, `${label}[${index}] actual=${left} expected=${right}`);
  }
}

test("SMA/EMA match independent reference arithmetic", () => {
  const closes = [1, 2, 3, 4, 5, 6, 7, 8];
  const input = candlesFromCloses(closes);
  assertAlmostEqual(values("SMA", { period: 4 }, input), referenceSma(closes, 4), "SMA");
  assertAlmostEqual(values("EMA", { period: 4 }, input), referenceEma(closes, 4), "EMA");
});

test("RSI and ATR match independent reference arithmetic", () => {
  const closes = [10, 11, 12, 11, 13, 14, 13, 15, 16, 15];
  const input = candlesFromCloses(closes);
  assertAlmostEqual(values("RSI", { period: 3 }, input), referenceRsi(closes, 3), "RSI");
  assertAlmostEqual(values("ATR", { period: 3 }, input), referenceAtr(input, 3), "ATR");
});

test("Bollinger Bands and VWAP match independent reference arithmetic", () => {
  const closes = [2, 4, 6, 8, 10, 12, 14, 16];
  const input = candlesFromCloses(closes, 5);
  const middle = referenceSma(closes, 3);
  const deviation = referenceStdDev(closes, 3);
  const upper = middle.map((value, index) => (value === null || deviation[index] === null ? null : value + deviation[index]!));
  const lower = middle.map((value, index) => (value === null || deviation[index] === null ? null : value - deviation[index]!));

  const registry = createDefaultIndicatorRegistry();
  const bands = registry.create("BOLLINGER_BANDS", { period: 3, standardDeviations: 1 });
  bands.setInput(input);
  const outputs = Object.fromEntries(bands.getResult().outputs.map((output) => [output.id, output.points.map((point) => point.value)]));
  assertAlmostEqual(outputs.middle ?? [], middle, "BB middle");
  assertAlmostEqual(outputs.upper ?? [], upper, "BB upper");
  assertAlmostEqual(outputs.lower ?? [], lower, "BB lower");

  assertAlmostEqual(values("VWAP", { session: "none" }, input), referenceVwap(input), "VWAP");
});

test("MACD histogram equals macd minus signal with independent EMA legs", () => {
  const closes = Array.from({ length: 20 }, (_, index) => 100 + Math.sin(index / 3) * 5 + index * 0.1);
  const input = candlesFromCloses(closes);
  const fast = referenceEma(closes, 3);
  const slow = referenceEma(closes, 7);
  const macdLine = fast.map((value, index) => (value === null || slow[index] === null ? null : value - slow[index]!));
  const macdSeed = macdLine.map((value) => (value === null ? Number.NaN : value));
  // Signal is EMA of MACD once enough non-null MACD values exist; compare OpenKline outputs internally for consistency.
  const registry = createDefaultIndicatorRegistry();
  const macd = registry.create("MACD", { fastPeriod: 3, slowPeriod: 7, signalPeriod: 3 });
  macd.setInput(input);
  const result = macd.getResult();
  const line = result.outputs.find((output) => output.id === "macd")!.points.map((point) => point.value);
  const signal = result.outputs.find((output) => output.id === "signal")!.points.map((point) => point.value);
  const histogram = result.outputs.find((output) => output.id === "histogram")!.points.map((point) => point.value);
  assertAlmostEqual(line, macdLine, "MACD line");
  for (let index = 0; index < histogram.length; index += 1) {
    const expected = line[index] === null || signal[index] === null ? null : line[index]! - signal[index]!;
    assert.equal(histogram[index], expected, `histogram[${index}]`);
  }
  void macdSeed;
});

test("presentation-independent indicator inputs survive series-style extreme values", () => {
  const extremes: Candle[] = [
    { time: 1_000, open: 0, high: 0, low: 0, close: 0, volume: 0 },
    { time: 2_000, open: 1e9, high: 1e9 + 1, low: 1e9 - 1, close: 1e9, volume: 1 },
    { time: 3_000, open: 1e-8, high: 2e-8, low: 5e-9, close: 1.5e-8, volume: 2 },
    { time: 5_000, open: 10, high: 12, low: 9, close: 11, volume: 3 },
  ];
  const registry = createDefaultIndicatorRegistry();
  const sma = registry.create("SMA", { period: 2 });
  sma.setInput(extremes);
  const before = extremes.map((candle) => ({ ...candle }));
  sma.update({ time: 5_000, open: 10, high: 13, low: 9, close: 12, volume: 3 });
  assert.deepEqual(extremes, before, "indicator update must not mutate caller-owned candle objects");
  const result = sma.getResult().outputs[0]!.points.map((point) => point.value);
  assert.equal(result[0], null);
  assert.ok(Number.isFinite(result[1]));
  assert.ok(Number.isFinite(result[2]));
  assert.ok(Number.isFinite(result[3]));
});
