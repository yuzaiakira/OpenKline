import assert from "node:assert/strict";
import test from "node:test";
import { compileKlineScript, getKlineScriptIncrementalPlan } from "../src/klinescript/compiler.js";
import { createKlineScriptWorkerHandler } from "../src/klinescript/worker-handler.js";
import type { KlineScriptWorkerResponse } from "../src/klinescript/worker-protocol.js";
import { executeKlineScriptIncremental } from "../src/klinescript/incremental.js";
import type { KlineScriptExecutionResult } from "../src/klinescript/runtime.js";
import type { Candle } from "../src/types.js";

function candle(close: number, index: number, withVolume = true): Candle {
  return {
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    ...(withVolume ? { volume: index + 1 } : {}),
  };
}

test("pointwise KlineScript append execution matches the full interpreter", () => {
  const source = [
    'indicator("Pointwise")',
    'plot(close + 1, title="Plus")',
    "plot(volume)",
    "hline(100)",
  ].join("\n");
  const compiled = compileKlineScript(source);
  assert.equal(compiled.success, true);
  if (!compiled.success) return;
  const plan = getKlineScriptIncrementalPlan(compiled.program);
  assert.equal(plan?.kind, "pointwise-append");
  const initial = [candle(10, 0), candle(11, 1, false)];
  const next = [...initial, candle(12, 2)];
  const previous = compiled.program.execute(initial);
  const expected = compiled.program.execute(next);
  const incremental = executeKlineScriptIncremental(plan, next, previous, {});
  assert.ok(incremental);
  assert.deepEqual(incremental?.indicatorId, expected.indicatorId);
  assert.deepEqual(incremental?.parameters, expected.parameters);
  assert.deepEqual(incremental?.outputs, expected.outputs);
});

test("unsupported history, parameters, and technical functions fall back safely", () => {
  const cases = [
    'indicator("EMA")\nperiod = input.int("Period", default=3, min=1)\nplot(ta.ema(close, period))',
    'indicator("History")\nplot(close[1])',
    'indicator("Assignment")\nvalue = close + 1\nplot(value)',
  ];
  for (const source of cases) {
    const compiled = compileKlineScript(source);
    assert.equal(compiled.success, true);
    if (!compiled.success) continue;
    assert.equal(getKlineScriptIncrementalPlan(compiled.program), undefined);
  }
});

test("worker session uses the incremental candidate only for appends and full fallback for corrections", () => {
  const source = 'indicator("Close")\nplot(close)';
  const responses: KlineScriptWorkerResponse[] = [];
  const handle = createKlineScriptWorkerHandler((response) => responses.push(response));
  const initial = [candle(10, 0), candle(11, 1)];
  handle({ protocol: 1, type: "update-input", requestId: "initial", generation: 0, sessionId: "s", source, input: initial });
  const first = responses.at(-1);
  assert.equal(first?.type, "update-input-result");
  if (first?.type !== "update-input-result") return;
  handle({ protocol: 1, type: "update-input", requestId: "append", generation: 0, sessionId: "s", source, candle: candle(12, 2) });
  const appended = responses.at(-1);
  assert.equal(appended?.type, "update-input-result");
  if (appended?.type !== "update-input-result") return;
  assert.equal(appended.result.operations, 1);
  const correction = { ...candle(11, 1), close: 20, high: 22 };
  handle({ protocol: 1, type: "update-input", requestId: "correction", generation: 0, sessionId: "s", source, candle: correction });
  const corrected = responses.at(-1);
  assert.equal(corrected?.type, "update-input-result");
  if (corrected?.type !== "update-input-result") return;
  assert.ok(corrected.result.operations > appended.result.operations);
  const expected = compileKlineScript(source);
  assert.equal(expected.success, true);
  if (!expected.success) return;
  const full = expected.program.execute([initial[0]!, correction, candle(12, 2)]);
  assert.deepEqual(corrected.result.outputs, full.outputs);
});

test("deterministic randomized prefixes remain equal to full execution", () => {
  const source = 'indicator("Arithmetic")\nplot((close * 2 - open) / 3)';
  const compiled = compileKlineScript(source);
  assert.equal(compiled.success, true);
  if (!compiled.success) return;
  const plan = getKlineScriptIncrementalPlan(compiled.program);
  let history: Candle[] = [candle(100, 0)];
  let previous = compiled.program.execute(history);
  let seed = 0x12345678;
  for (let index = 1; index < 40; index += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const close = 80 + (seed % 10_000) / 100;
    const next = candle(close, index);
    history = [...history, next];
    const expected: KlineScriptExecutionResult = compiled.program.execute(history);
    const incremental = executeKlineScriptIncremental(plan, history, previous, {});
    assert.deepEqual(incremental?.outputs, expected.outputs, `prefix ${index}`);
    previous = incremental ?? expected;
  }
});
