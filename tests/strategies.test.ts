import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultStrategyRegistry,
  StrategyCancellationError,
  StrategyLifecycleError,
  StrategyRegistry,
  StrategyValidationError,
  type Candle,
  type StrategyDefinition,
} from "../src/index.js";

function candles(closes: readonly number[]): Candle[] {
  return closes.map((close, index) => ({
    time: 1_800_000_000_000 + index * 60_000,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume: 100,
  }));
}

const prefixProbe: StrategyDefinition = {
  metadata: {
    id: "PREFIX_PROBE",
    name: "Prefix Probe",
    version: 1,
    description: "Emits a signal when the current close exceeds the previous close.",
    parameters: [],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (parameters) => {
    if (parameters !== undefined && parameters !== null && (typeof parameters !== "object" || Array.isArray(parameters))) {
      throw new StrategyValidationError("Prefix Probe accepts no parameters");
    }
    return {};
  },
  createEvaluator: () => ({
    evaluateBar: (context) => context.previousCandle !== null && context.candle.close > context.previousCandle.close
      ? [{ action: "enter-long", reason: "current close exceeded the previous completed close", value: context.candle.close }]
      : [],
  }),
};

test("StrategyRegistry validates metadata, isolates instances, and exposes defensive metadata", () => {
  const registry = new StrategyRegistry();
  registry.register(prefixProbe);
  assert.equal(registry.has("prefix_probe"), true);
  assert.deepEqual(registry.getMetadata("PREFIX_PROBE").requiredInputs, ["ohlcv"]);
  assert.throws(() => registry.register(prefixProbe), StrategyValidationError);
  const first = registry.create("PREFIX_PROBE", {});
  const second = registry.create("PREFIX_PROBE", {});
  const metadata = registry.getMetadata("PREFIX_PROBE");
  (metadata.requiredInputs as string[]).push("volume");
  assert.deepEqual(registry.getMetadata("PREFIX_PROBE").requiredInputs, ["ohlcv"]);
  assert.deepEqual(first.evaluate(candles([1, 2, 1])).signals.map((signal) => signal.action), ["enter-long"]);
  assert.deepEqual(second.evaluate(candles([2, 1, 3])).signals.map((signal) => signal.index), [2]);
  first.dispose();
  assert.throws(() => first.evaluate(candles([1])), StrategyLifecycleError);
});

test("strategy evaluation exposes only the historical prefix and separates signal from execution time", () => {
  const registry = new StrategyRegistry();
  registry.register(prefixProbe);
  const input = candles([10, 11, 9, 12]);
  const prefix = registry.create("PREFIX_PROBE", {}).evaluate(input.slice(0, 3));
  const full = registry.create("PREFIX_PROBE", {}).evaluate(input);
  assert.deepEqual(full.signals.slice(0, prefix.signals.length), prefix.signals);
  assert.deepEqual(full.signals.map((signal) => ({ index: signal.index, time: signal.time })), [
    { index: 1, time: input[1]!.time },
    { index: 3, time: input[3]!.time },
  ]);
  assert.equal(full.signals[0]?.time, input[1]!.time, "the signal is timestamped at the completed bar, not a future fill");
});

test("strategy evaluation validates candles, progress cadence, cancellation, and signal values", () => {
  const registry = new StrategyRegistry();
  registry.register(prefixProbe);
  const progress: number[] = [];
  const result = registry.create("PREFIX_PROBE", {}).evaluate(candles([1, 2, 3, 2, 4]), {
    progressInterval: 2,
    onProgress: (value) => progress.push(value.processedBars),
  });
  assert.deepEqual(progress, [2, 4, 5]);
  assert.equal(result.signals[0]?.id, "PREFIX_PROBE:1:0");
  assert.equal(result.signals[0]?.value, 2);
  assert.throws(() => registry.create("PREFIX_PROBE", {}).evaluate(candles([1]), { progressInterval: 0 }), StrategyValidationError);
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => registry.create("PREFIX_PROBE", {}).evaluate(candles([1, 2]), { signal: controller.signal }), StrategyCancellationError);
  assert.throws(() => registry.create("PREFIX_PROBE", {}).evaluate([{ ...candles([1])[0]!, close: Number.NaN }]), /Invalid candle/);
});

test("built-in strategies use real indicator outputs and preserve a causal prefix", () => {
  const registry = createDefaultStrategyRegistry();
  assert.deepEqual(registry.listMetadata().map((metadata) => metadata.id), [
    "EMA_CROSSOVER",
    "RSI_REVERSAL",
    "DONCHIAN_BREAKOUT",
    "EMA_TREND",
  ]);
  assert.throws(() => registry.create("EMA_CROSSOVER", { fastPeriod: 5, slowPeriod: 3 }), StrategyValidationError);

  const input = candles([10, 9, 8, 7, 8, 10, 12, 11, 9, 8, 10]);
  const crossover = registry.create("EMA_CROSSOVER", { fastPeriod: 2, slowPeriod: 4 }).evaluate(input);
  const prefix = registry.create("EMA_CROSSOVER", { fastPeriod: 2, slowPeriod: 4 }).evaluate(input.slice(0, 8));
  assert.ok(crossover.signals.length > 0);
  assert.deepEqual(crossover.signals.filter((signal) => signal.index < 8), prefix.signals);
  assert.ok(crossover.signals.every((signal) => signal.time === input[signal.index]!.time));

  const trend = registry.create("EMA_TREND", { period: 3 }).evaluate(input);
  assert.ok(trend.signals.some((signal) => signal.action === "enter-long"));
  const breakout = registry.create("DONCHIAN_BREAKOUT", { period: 3 }).evaluate(input);
  assert.ok(breakout.signals.every((signal) => signal.reason.includes("previous 3-bar")));
  const rsi = registry.create("RSI_REVERSAL", { period: 3, oversold: 35, overbought: 65 }).evaluate(input);
  assert.ok(rsi.signals.every((signal) => signal.value !== undefined));
});

test("causal history views preserve legacy array consumers without exposing future bars", () => {
  let retained: readonly Candle[] | null = null;
  const observed: Array<{ length: number; first: number; last: number; reduced: number; future: unknown; isArray: boolean }> = [];
  const definition: StrategyDefinition = {
    metadata: {
      id: "HISTORY_VIEW_PROBE",
      name: "History View Probe",
      version: 1,
      description: "Exercises array-compatible causal history access.",
      parameters: [],
      requiredInputs: ["ohlcv"],
    },
    validateParameters: () => ({}),
    createEvaluator: () => ({
      evaluateBar: (context) => {
        retained ??= context.history;
        const mapped = context.history.map((candle) => candle.close);
        const reduced = context.history.reduce((total, candle) => total + candle.close, 0);
        observed.push({
          length: context.history.length,
          first: context.history[0]?.close ?? -1,
          last: mapped.at(-1) ?? -1,
          reduced,
          future: context.history[context.index + 1],
          isArray: Array.isArray(context.history),
        });
        return [];
      },
    }),
  };
  const input = candles([10, 11, 12]);
  const registry = new StrategyRegistry();
  registry.register(definition);
  registry.create("HISTORY_VIEW_PROBE", {}).evaluate(input);
  assert.deepEqual(observed, [
    { length: 1, first: 10, last: 10, reduced: 10, future: undefined, isArray: true },
    { length: 2, first: 10, last: 11, reduced: 21, future: undefined, isArray: true },
    { length: 3, first: 10, last: 12, reduced: 33, future: undefined, isArray: true },
  ]);
  const retainedHistory = retained as unknown as readonly Candle[];
  assert.equal(retainedHistory.length, 1);
  assert.equal(retainedHistory[1], undefined);
  assert.deepEqual(retainedHistory.slice().map((candle) => candle.close), [10]);
});

test("large causal history evaluation remains deterministic without prefix-copy growth", () => {
  const registry = new StrategyRegistry();
  registry.register(prefixProbe);
  const input = candles(Array.from({ length: 10_000 }, (_, index) => index + 1));
  const first = registry.create("PREFIX_PROBE", {}).evaluate(input);
  const second = registry.create("PREFIX_PROBE", {}).evaluate(input);
  assert.equal(first.signals.length, 9_999);
  assert.deepEqual(first.signals, second.signals);
});
