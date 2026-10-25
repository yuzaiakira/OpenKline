import assert from "node:assert/strict";
import test from "node:test";
import { compileKlineScript, KlineScriptRuntimeError, type Candle } from "../src/index.js";

test("bounded malformed-source seeds never escape compiler diagnostics", () => {
  const seeds = [
    "",
    'indicator("unterminated)',
    "indicator(\"x\")\nπ = close",
    "indicator(\"x\")\nplot(close[--1])",
    "indicator(\"x\")\nplot(close.constructor)",
    "indicator(\"x\")\nplot(globalThis)",
    "indicator(\"x\")\nplot(eval(close))",
    `indicator("x")\nvalue = ${"1 + ".repeat(160)}1\nplot(value)`,
  ];
  for (const source of seeds) {
    assert.doesNotThrow(() => compileKlineScript(source));
    const result = compileKlineScript(source);
    if (source.includes("constructor") || source.includes("globalThis") || source.includes("eval")) assert.equal(result.success, false);
  }
});

test("runtime converts invalid financial input into a structured failure", () => {
  const result = compileKlineScript('indicator("Input")\nplot(close)');
  assert.equal(result.success, true);
  if (!result.success) return;
  const invalid: Candle[] = [{ time: 1, open: 2, high: 1, low: 0, close: 2 }];
  assert.throws(() => result.program.execute(invalid), (error: unknown) => error instanceof KlineScriptRuntimeError && error.code === "RUNTIME_INPUT");
});
