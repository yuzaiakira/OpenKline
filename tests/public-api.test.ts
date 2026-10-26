import assert from "node:assert/strict";
import test from "node:test";
import * as api from "../src/index.js";

const candles = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 95, close: 105, volume: 10 },
  { time: 1_700_000_060_000, open: 105, high: 112, low: 102, close: 108, volume: 12 },
] as const;

test("root public API exposes the documented framework-independent contracts", async () => {
  for (const name of [
    "Chart", "createChart", "InMemoryDatafeed", "IndicatorRegistry", "DrawingEngine",
    "PluginRegistry", "compileKlineScript", "ReplayEngine", "createBacktest",
    "createOptimizationWorker", "createScreenerWorker", "createPaperTradingAccount",
  ]) assert.equal(typeof api[name as keyof typeof api], "function", `${name} must remain a runtime export`);

  const store = new api.CandleStore();
  store.setData(candles);
  store.update({ ...candles[1], close: 109 });
  assert.equal(store.getAll()[1]?.close, 109);

  const feed = new api.InMemoryDatafeed({ symbol: "PUBLIC", timezone: "UTC", pricePrecision: 2 }, candles);
  assert.deepEqual(await feed.resolveSymbol("PUBLIC"), { symbol: "PUBLIC", timezone: "UTC", pricePrecision: 2 });
  assert.equal((await feed.getBars({ symbol: "PUBLIC", timeframe: "1m", from: 0, to: Number.MAX_SAFE_INTEGER })).length, 2);

  const registry = api.createDefaultIndicatorRegistry();
  const indicator = registry.create("SMA", { period: 2 });
  indicator.setInput(candles);
  assert.equal(indicator.getResult().outputs.length > 0, true);
  indicator.dispose();

  const drawings = new api.DrawingEngine();
  const drawing = drawings.create("horizontal-line", { points: [{ time: candles[0].time, price: 104 }] });
  assert.equal(drawings.get(drawing.id).points.length, 1);
  drawings.dispose();

  const plugins = new api.PluginRegistry({
    registerIndicator: () => () => undefined,
    registerDrawingTool: () => () => undefined,
    registerOverlay: () => () => undefined,
    subscribe: () => () => undefined,
  });
  const handle = plugins.install({ metadata: { id: "public.test", name: "Public test", version: "1.0.0", apiVersion: 1 }, setup: () => undefined });
  handle.dispose();
  plugins.dispose();

  const compiled = api.compileKlineScript('indicator("Public API")\nplot(close)');
  assert.equal(compiled.success, true);
  const replay = new api.ReplayEngine({ source: candles });
  replay.start();
  replay.stepForward();
  assert.equal(replay.getStatus().currentIndex, 1);
  replay.dispose();
});

test("versioned worker and serialized contracts remain public and explicit", () => {
  assert.equal(api.OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, 1);
  assert.equal(api.KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, 1);
  assert.equal(api.OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, 1);
  assert.equal(api.OPENKLINE_WORKSPACE_VERSION, 1);
  assert.equal(typeof api.serializeBacktestResult, "function");
  assert.equal(typeof api.parseWorkspace, "function");
});
