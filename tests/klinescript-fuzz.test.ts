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
    `indicator("x")\nplot(${"(".repeat(5_000)}close${")".repeat(5_000)})`,
    `indicator("x")\nplot(${"not ".repeat(5_000)}close)`,
    `indicator("x")\nvalue = ${"1 + ".repeat(160)}1\nplot(value)`,
    "indicator(\"x\")\nplot(close.constructor.name)",
    "indicator(\"x\")\nplot(close[1.5])",
    "indicator(\"x\")\nplot(close[999999])",
    "indicator(\"x\")\nvalue = 1e9999\nplot(close)",
    `indicator("x")\nplot(close)\n${"value = close\n".repeat(300)}`,
  ];
  for (const source of seeds) {
    assert.doesNotThrow(() => compileKlineScript(source));
    const result = compileKlineScript(source);
    if (source.includes("constructor") || source.includes("globalThis") || source.includes("eval")) assert.equal(result.success, false);
  }
});

test("compiler applies source, token, and AST complexity limits with diagnostics", () => {
  const oversized = compileKlineScript(`indicator("x")\nplot(close)\n${"# padding\n".repeat(8_000)}`);
  assert.equal(oversized.success, false);
  assert.equal(oversized.diagnostics.some((diagnostic) => diagnostic.code === "KS1001"), true);

  const tokenBounded = compileKlineScript("indicator(\"x\")\nplot(close)", { maxTokens: 2 });
  assert.equal(tokenBounded.success, false);
  assert.equal(tokenBounded.diagnostics.some((diagnostic) => diagnostic.code === "KS1002"), true);

  const astBounded = compileKlineScript(`indicator("x")\nplot(${"1 + ".repeat(32)}1)`, { maxAstNodes: 4 });
  assert.equal(astBounded.success, false);
  assert.equal(astBounded.diagnostics.some((diagnostic) => diagnostic.code === "KS3004"), true);
});

test("runtime converts invalid financial input into a structured failure", () => {
  const result = compileKlineScript('indicator("Input")\nplot(close)');
  assert.equal(result.success, true);
  if (!result.success) return;
  const invalid: Candle[] = [{ time: 1, open: 2, high: 1, low: 0, close: 2 }];
  assert.throws(() => result.program.execute(invalid), (error: unknown) => error instanceof KlineScriptRuntimeError && error.code === "RUNTIME_INPUT");
});
