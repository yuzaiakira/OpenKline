import assert from "node:assert/strict";
import test from "node:test";
import {
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
