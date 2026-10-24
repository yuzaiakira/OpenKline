import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultIndicatorRegistry,
  IndicatorLifecycleError,
  IndicatorValidationError,
  type Candle,
  type IndicatorDefinition,
} from "../src/index.js";

const registry = createDefaultIndicatorRegistry();

function candles(closes: readonly number[], volume = 10): Candle[] {
  return closes.map((close, index) => ({
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.25,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  }));
}

function values(indicatorId: string, parameters: Record<string, unknown>, input: readonly Candle[], outputId = "value"): (number | null)[] {
  const result = registry.create(indicatorId, parameters);
  result.setInput(input);
  return result.getResult().outputs.find((output) => output.id === outputId)?.points.map((point) => point.value) ?? [];
}

test("SMA and EMA use explicit warm-up values and deterministic reference results", () => {
  const input = candles([1, 2, 3, 4, 5]);
  assert.deepEqual(values("SMA", { period: 3 }, input), [null, null, 2, 3, 4]);
  assert.deepEqual(values("EMA", { period: 3 }, input), [null, null, 2, 3, 4]);
});

test("RSI, ATR, and stochastic handle zero denominators and warm-up", () => {
  assert.deepEqual(values("RSI", { period: 3 }, candles([1, 2, 3, 2, 2, 4])), [null, null, null, 66.66666666666666, 66.66666666666666, 86.66666666666667]);

  const input = candles([10, 11, 10]);
  input[1] = { ...input[1]!, high: 14, low: 9 };
  input[2] = { ...input[2]!, high: 12, low: 8 };
  assert.deepEqual(values("ATR", { period: 2 }, input), [null, 3.5, 3.75]);
  assert.deepEqual(values("STOCHASTIC", { kPeriod: 2, dPeriod: 2 }, candles([10, 11, 10]), "k"), [null, 66.66666666666666, 33.33333333333333]);
});

test("MACD and Bollinger Bands expose multiple aligned output series", () => {
  const input = candles(Array.from({ length: 8 }, (_, index) => index + 1));
  const macd = registry.create("MACD", { fastPeriod: 3, slowPeriod: 5, signalPeriod: 2 });
  macd.setInput(input);
  const macdResult = macd.getResult();
  assert.deepEqual(macdResult.outputs.map((output) => output.id), ["macd", "signal", "histogram"]);
  assert.equal(macdResult.outputs[0]?.points[3]?.value, null);
  assert.notEqual(macdResult.outputs[0]?.points[4]?.value, null);
  assert.equal(macdResult.outputs[1]?.points[4]?.value, null);
  assert.notEqual(macdResult.outputs[1]?.points[5]?.value, null);
  assert.equal(macdResult.outputs[2]?.points.length, input.length);

  const bands = registry.create("BOLLINGER_BANDS", { period: 3, standardDeviations: 1 });
  bands.setInput(input.slice(0, 3));
  const bandValues = bands.getResult().outputs.map((output) => output.points[2]?.value);
  assert.equal(bandValues[0], 2);
  assert.equal(bandValues[1], 2 + Math.sqrt(2 / 3));
  assert.equal(bandValues[2], 2 - Math.sqrt(2 / 3));
});

test("VWAP requires explicit session semantics and resets only when requested", () => {
  const first = Date.UTC(2026, 0, 1, 23, 0);
  const input: Candle[] = [
    { time: first, open: 9, high: 11, low: 9, close: 10, volume: 10 },
    { time: first + 30 * 60 * 1_000, open: 19, high: 21, low: 19, close: 20, volume: 10 },
    { time: Date.UTC(2026, 0, 2, 1, 0), open: 29, high: 31, low: 29, close: 30, volume: 10 },
    { time: Date.UTC(2026, 0, 2, 2, 0), open: 39, high: 41, low: 39, close: 40 },
  ];
  assert.throws(() => registry.create("VWAP", {}), IndicatorValidationError);
  assert.deepEqual(values("VWAP", { session: "none" }, input), [10, 15, 20, null]);
  assert.deepEqual(values("VWAP", { session: "utc-day" }, input), [10, 15, 30, null]);
});

test("indicator updates support append optimization and correction recalculation", () => {
  const input = candles([1, 2, 3, 4]);
  const incremental = registry.create("SMA", { period: 3 });
  incremental.setInput(input);
  incremental.update({ ...candles([5])[0]!, time: input[3]!.time + 60_000 });

  const full = registry.create("SMA", { period: 3 });
  full.setInput(candles([1, 2, 3, 4, 5]));
  assert.deepEqual(incremental.getResult(), full.getResult());

  incremental.update({ ...input[1]!, open: 19.75, high: 21, low: 19, close: 20 });
  const corrected = registry.create("SMA", { period: 3 });
  corrected.setInput(candles([1, 20, 3, 4, 5]));
  assert.deepEqual(incremental.getResult(), corrected.getResult());
});

test("registry supports independent custom indicators and disposal", () => {
  const custom: IndicatorDefinition<{ multiplier: number }> = {
    metadata: {
      id: "DOUBLE_CLOSE",
      name: "Double Close",
      version: 1,
      description: "Test custom indicator.",
      parameters: [{ name: "multiplier", type: "number", required: true }],
      outputs: [{ id: "value", title: "Value", kind: "line" }],
    },
    validateParameters: (parameters) => {
      if (typeof parameters !== "object" || parameters === null || typeof (parameters as { multiplier?: unknown }).multiplier !== "number") {
        throw new IndicatorValidationError("multiplier is required");
      }
      return { multiplier: (parameters as { multiplier: number }).multiplier };
    },
    calculate: (input, parameters) => ({
      indicatorId: "DOUBLE_CLOSE",
      parameters,
      outputs: [{
        id: "value",
        title: "Value",
        kind: "line",
        points: input.map((candle) => ({ time: candle.time, value: candle.close * parameters.multiplier })),
      }],
    }),
  };
  const customRegistry = createDefaultIndicatorRegistry();
  customRegistry.register(custom);
  const first = customRegistry.create("DOUBLE_CLOSE", { multiplier: 2 });
  const second = customRegistry.create("DOUBLE_CLOSE", { multiplier: 3 });
  first.setInput(candles([2]));
  second.setInput(candles([2]));
  assert.equal(first.getResult().outputs[0]?.points[0]?.value, 4);
  assert.equal(second.getResult().outputs[0]?.points[0]?.value, 6);
  first.dispose();
  assert.throws(() => first.getResult(), IndicatorLifecycleError);
  assert.equal(customRegistry.unregister("DOUBLE_CLOSE"), true);
});
