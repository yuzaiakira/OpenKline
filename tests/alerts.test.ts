import assert from "node:assert/strict";
import test from "node:test";
import {
  AlertEngine,
  AlertLifecycleError,
  AlertValidationError,
  parseAlertDefinitions,
  type AlertDefinition,
  type AlertEvaluationInput,
} from "../src/alerts/index.js";
import type { Candle } from "../src/types.js";

const candle = (time: number, close: number): Candle => ({
  time,
  open: close,
  high: close + 1,
  low: close - 1,
  close,
});

const evaluate = (engine: AlertEngine, time: number, close: number, options: Omit<AlertEvaluationInput, "candle"> = {}) =>
  engine.evaluate({ candle: candle(time, close), ...options });

const priceAlert = (overrides: Partial<AlertDefinition> = {}): AlertDefinition => ({
  id: "price-alert",
  name: "Price alert",
  condition: { type: "price-cross-above", value: 10 },
  ...overrides,
});

test("price conditions use strict comparisons and deterministic crossing", () => {
  const engine = new AlertEngine();
  engine.add(priceAlert({ id: "above", condition: { type: "price-above", value: 10 }, frequency: "every-event" }));
  engine.add(priceAlert({ id: "cross", condition: { type: "price-cross-above", value: 10 } }));

  assert.equal(evaluate(engine, 1, 10).length, 0, "equality is not above");
  assert.equal(evaluate(engine, 2, 11).map((event) => event.alertId).join(","), "above,cross");
  assert.equal(evaluate(engine, 3, 12).map((event) => event.alertId).join(","), "above");
  assert.equal(evaluate(engine, 4, 10).length, 0);
  assert.equal(evaluate(engine, 5, 9).length, 0, "crossing below does not trigger a cross-above rule");
  assert.equal(evaluate(engine, 6, 11).map((event) => event.alertId).join(","), "above,cross");
});

test("seed, corrections, duplicate updates, and out-of-order events never notify", () => {
  const engine = new AlertEngine();
  engine.add(priceAlert());
  const diagnostics: string[] = [];
  engine.subscribeDiagnostics((diagnostic) => diagnostics.push(diagnostic.message));

  assert.equal(evaluate(engine, 1, 9, { sourceEvent: "seed" }).length, 0);
  assert.equal(evaluate(engine, 2, 11).length, 1);
  assert.equal(evaluate(engine, 2, 12, { sourceEvent: "correction" }).length, 0);
  assert.equal(evaluate(engine, 1, 12).length, 0);
  assert.deepEqual(diagnostics, []);
  assert.equal(engine.historyFor().length, 1);
});

test("frequencies, confirmation, cooldown, and independent alert status are enforced", () => {
  const engine = new AlertEngine();
  engine.add(priceAlert({ id: "once", condition: { type: "price-above", value: 10 }, frequency: "once" }));
  engine.add(priceAlert({ id: "bar", condition: { type: "price-above", value: 10 }, frequency: "once-per-bar" }));
  engine.add(priceAlert({ id: "confirmed", condition: { type: "price-above", value: 10 }, frequency: "once-per-confirmed-bar" }));
  engine.add(priceAlert({ id: "cooldown", condition: { type: "price-above", value: 10 }, frequency: "every-event", cooldownMs: 20 }));

  assert.equal(evaluate(engine, 10, 11, { isFinal: false }).filter((event) => event.alertId === "confirmed").length, 0);
  assert.equal(evaluate(engine, 20, 12, { isFinal: true }).map((event) => event.alertId).join(","), "bar,confirmed");
  assert.equal(evaluate(engine, 30, 12, { isFinal: true }).map((event) => event.alertId).join(","), "bar,confirmed,cooldown");
  assert.equal(engine.getStatus("once").triggeredCount, 1);
  assert.equal(engine.getStatus("confirmed").triggeredCount, 2);
});

test("indicator and script outputs support thresholds, pairs, boolean values, and time validation", () => {
  const engine = new AlertEngine();
  engine.add({ id: "indicator", name: "Indicator", condition: { type: "indicator-cross-above", indicatorId: "rsi", outputId: "value", value: 50 } });
  engine.add({ id: "pair", name: "Pair", condition: { type: "indicator-output-cross-above", left: { indicatorId: "fast", outputId: "value" }, right: { indicatorId: "slow", outputId: "value" } } });
  engine.add({ id: "script", name: "Script", condition: { type: "script-above", scriptId: "signal", outputId: "value", value: 0 } });
  engine.add({ id: "boolean", name: "Boolean", condition: { type: "script-true", scriptId: "signal", outputId: "ready" } });

  const outputs = (time: number, rsi: number, fast: number, slow: number, script: number, ready: boolean) => [
    { sourceId: "rsi", outputId: "value", value: rsi, time },
    { sourceId: "fast", outputId: "value", value: fast, time },
    { sourceId: "slow", outputId: "value", value: slow, time },
    { sourceId: "signal", outputId: "value", value: script, time },
    { sourceId: "signal", outputId: "ready", value: ready, time },
  ];

  assert.equal(evaluate(engine, 1, 1, { outputs: outputs(1, 49, 1, 2, -1, false) }).length, 0);
  const events = evaluate(engine, 2, 2, { outputs: outputs(2, 51, 3, 2, 1, true) });
  assert.deepEqual(events.map((event) => event.alertId), ["indicator", "pair", "script", "boolean"]);
  const diagnostics: string[] = [];
  engine.subscribeDiagnostics((diagnostic) => diagnostics.push(diagnostic.message));
  assert.equal(evaluate(engine, 3, 3, { outputs: [{ sourceId: "rsi", outputId: "value", value: 52, time: 99 }] }).length, 0);
  assert.match(diagnostics.join(" "), /output is unavailable/);
});

test("drawing conditions use the selected horizontal line field", () => {
  const engine = new AlertEngine();
  engine.add({ id: "drawing", name: "Line", condition: { type: "drawing-horizontal-cross-above", drawingId: "level", field: "close" } });
  const drawings = [{ id: "level", type: "horizontal-line", points: [{ time: 0, price: 10 }], style: {}, zIndex: 0 }] as const;
  assert.equal(evaluate(engine, 1, 9, { drawings }).length, 0);
  assert.equal(evaluate(engine, 2, 11, { drawings }).length, 1);
});

test("live and replay runtime state are isolated and replay events are marked simulated", () => {
  const engine = new AlertEngine();
  engine.add(priceAlert({ condition: { type: "price-cross-above", value: 10 }, frequency: "every-event" }));
  evaluate(engine, 1, 9, { mode: "live" });
  evaluate(engine, 1, 9, { mode: "replay" });
  assert.equal(evaluate(engine, 2, 11, { mode: "replay" })[0]?.simulated, true);
  assert.equal(evaluate(engine, 2, 11, { mode: "live" }).length, 1);
  assert.equal(engine.historyFor("replay").length, 1);
  engine.reset("replay", true);
  assert.equal(engine.historyFor("replay").length, 0);
  assert.equal(engine.historyFor("live").length, 1);
});

test("definitions are serializable, validated, and lifecycle APIs are safe", () => {
  const engine = new AlertEngine();
  const definition = priceAlert({ id: "persisted", name: " Persisted " });
  const api = engine.add(definition);
  assert.equal(api.getDefinition().name, "Persisted");
  const document = engine.exportDefinitions();
  assert.deepEqual(parseAlertDefinitions(JSON.parse(JSON.stringify(document))), document);
  assert.throws(() => parseAlertDefinitions({ version: 1, alerts: [definition, definition] }), AlertValidationError);
  api.update({ name: "Updated" });
  assert.equal(api.getDefinition().name, "Updated");
  api.remove();
  assert.throws(() => api.getDefinition(), AlertValidationError);
  engine.dispose();
  assert.throws(() => engine.list(), AlertLifecycleError);
});
