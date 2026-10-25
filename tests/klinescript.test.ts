import assert from "node:assert/strict";
import test from "node:test";
import {
  compileKlineScript,
  createDefaultIndicatorRegistry,
  KlineScriptRuntimeError,
  type Candle,
} from "../src/index.js";

function candles(closes: readonly number[]): Candle[] {
  return closes.map((close, index) => ({
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    ...(index % 2 === 0 ? { volume: 10 } : {}),
  }));
}

test("KlineScript compiles the documented EMA grammar and exposes immutable metadata", () => {
  const result = compileKlineScript([
    'indicator("My EMA", overlay=True)',
    'period = input.int("Period", default=3, min=1, max=20)',
    'value = ta.ema(close, period)',
    'plot(value, title="EMA", color="#8B5CF6", width=2)',
  ].join("\n"));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.program.metadata.name, "My EMA");
  assert.equal(result.program.metadata.inputs[0]?.defaultValue, 3);
  assert.equal(result.program.metadata.outputs[0]?.color, "#8B5CF6");
  assert.throws(() => {
    (result.program.metadata.inputs as unknown as Array<{ name: string }>)[0]!.name = "changed";
  }, TypeError);
});

test("compiler reports stable source spans for forbidden symbols and calls", () => {
  const result = compileKlineScript([
    'indicator("Bad")',
    "value = ta.unknown(close, 3)",
    "plot(eval(value))",
  ].join("\n"));
  assert.equal(result.success, false);
  if (result.success) return;
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "KS3066"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "KS3063"), true);
  assert.equal(result.diagnostics.find((diagnostic) => diagnostic.code === "KS3066")?.span.start.line, 2);
});

test("runtime preserves warm-up and historical indexing semantics", () => {
  const result = compileKlineScript([
    'indicator("Previous close")',
    "previous = close[1]",
    'plot(previous, title="Previous")',
  ].join("\n"));
  assert.equal(result.success, true);
  if (!result.success) return;
  const execution = result.program.execute(candles([10, 11, 12]));
  assert.deepEqual(execution.outputs[0]?.points.map((point) => point.value), [null, 10, 11]);
});

test("script EMA matches the native EMA calculation", () => {
  const result = compileKlineScript([
    'indicator("EMA")',
    'period = input.int("Period", default=3, min=1)',
    "value = ta.ema(close, period)",
    "plot(value)",
  ].join("\n"));
  assert.equal(result.success, true);
  if (!result.success) return;
  const input = candles([1, 2, 3, 4, 5]);
  const script = result.program.execute(input).outputs[0]?.points.map((point) => point.value);
  const nativeRegistry = createDefaultIndicatorRegistry();
  const native = nativeRegistry.create("EMA", { period: 3 });
  native.setInput(input);
  assert.deepEqual(script, native.getResult().outputs[0]?.points.map((point) => point.value));
});

test("script SMA, RSI, and ATR match native indicator fixtures", () => {
  const result = compileKlineScript([
    'indicator("Native parity")',
    'sma = ta.sma(close, 3)',
    'rsi = ta.rsi(close, 3)',
    'atr = ta.atr(3)',
    'plot(sma, title="SMA")',
    'plot(rsi, title="RSI")',
    'plot(atr, title="ATR")',
  ].join("\n"));
  assert.equal(result.success, true);
  if (!result.success) return;
  const input = candles([10, 12, 11, 14, 13, 15, 14]);
  const script = result.program.execute(input).outputs.map((output) => output.points.map((point) => point.value));
  const registry = createDefaultIndicatorRegistry();
  const expected = [
    ["SMA", { period: 3 }],
    ["RSI", { period: 3 }],
    ["ATR", { period: 3 }],
  ] as const;
  expected.forEach(([id, parameters], index) => {
    const native = registry.create(id, parameters);
    native.setInput(input);
    assert.deepEqual(script[index], native.getResult().outputs[0]?.points.map((point) => point.value), id);
  });
});

test("script inputs, MACD projections, hline outputs, and correction recompute work", () => {
  const result = compileKlineScript([
    'indicator("Oscillator", overlay=False)',
    'period = input.int("Period", default=3, min=1)',
    'macd = ta.macd(close, 2, 3, period)',
    'plot(macd.macd, title="MACD")',
    'plot(macd.signal, title="Signal")',
    'hline(0, color="#999999")',
  ].join("\n"));
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.program.metadata.overlay, false);
  assert.equal(result.program.metadata.outputs.length, 3);
  const definition = result.program.createIndicatorDefinition();
  const registry = createDefaultIndicatorRegistry();
  registry.register(definition);
  const instance = registry.create(result.program.id, { period: 2 });
  const input = candles([10, 11, 12, 13, 14]);
  instance.setInput(input);
  assert.equal(instance.getResult().outputs[2]?.points[4]?.value, 0);
  const before = instance.getResult().outputs[0]?.points[4]?.value;
  instance.update({ ...input[2]!, close: 100, high: 101 });
  assert.notEqual(instance.getResult().outputs[0]?.points[4]?.value, before);
});

test("runtime enforces cancellation and operation budgets", () => {
  const result = compileKlineScript([
    'indicator("Budget")',
    "value = ta.sma(close, 2)",
    "plot(value)",
  ].join("\n"));
  assert.equal(result.success, true);
  if (!result.success) return;
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => result.program.execute(candles([1, 2]), {}, { signal: controller.signal }), (error: unknown) => error instanceof KlineScriptRuntimeError && error.code === "RUNTIME_CANCELLED");
  assert.throws(() => result.program.execute(candles([1, 2, 3]), {}, { maxOperations: 1 }), (error: unknown) => error instanceof KlineScriptRuntimeError && error.code === "RUNTIME_BUDGET");
  assert.throws(() => result.program.execute(candles([1, 2, 3]), {}, { maxOperationsPerBar: 0 }), (error: unknown) => error instanceof KlineScriptRuntimeError && error.code === "RUNTIME_BUDGET");
});
