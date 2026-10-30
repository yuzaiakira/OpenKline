import test from "node:test";
import assert from "node:assert/strict";
import {
  WatchlistModel,
  WatchlistValidationError,
  createStudioWorkspace,
  migrateLegacyWorkspace,
  parseStudioWorkspace,
  parseWatchlistDocument,
  StudioSynchronizationController,
  createPortfolioBacktestWorkspace,
} from "../src/index.js";
import type { WorkspaceDocument } from "../src/workspace.js";

function legacyWorkspace(): WorkspaceDocument {
  return {
    version: 1,
    metadata: { symbol: "BTC-USD", timeframe: "1h" },
    chart: { theme: { background: "#000", text: "#fff", grid: "#111", border: "#222", upCandle: "#0f0", downCandle: "#f00", crosshair: "#aaa", volumeUp: "#0f0", volumeDown: "#f00" }, locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr" },
    panes: [{ id: "main", height: null, minHeight: 120 }],
    series: [],
    indicators: [],
    drawings: { version: 1, drawings: [] },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

test("Studio workspace parser validates layout cardinality and chart isolation", () => {
  const document = createStudioWorkspace({ panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h", workspace: legacyWorkspace() });
  assert.equal(document.layout, "single");
  assert.equal(document.charts[0]?.workspace.metadata?.symbol, "BTC-USD");
  assert.throws(() => parseStudioWorkspace({ ...document, layout: "four-grid" }), /requires 4/);
  assert.throws(() => parseStudioWorkspace({ ...document, charts: [{ ...document.charts[0]!, panelId: "chart-1" }, { ...document.charts[0]!, panelId: "chart-1" }] }), /requires 1/);
});

test("legacy single-chart workspaces migrate without overwriting source data", () => {
  const legacy = legacyWorkspace();
  const migrated = migrateLegacyWorkspace(legacy);
  assert.equal(migrated.id, "studio-default");
  assert.equal(migrated.charts[0]?.panelId, "chart-1");
  assert.equal(migrated.charts[0]?.symbol, "BTC-USD");
  assert.deepEqual(legacy, legacyWorkspace());
});

test("Studio comparison state is optional, validated, and round-trips without changing legacy documents", () => {
  const legacy = createStudioWorkspace({ panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h", workspace: legacyWorkspace() });
  assert.equal("comparison" in legacy, false);
  const comparison = parseStudioWorkspace({
    ...legacy,
    comparison: {
      active: true,
      mode: "indexed",
      baselineTime: 1_000,
      baselineMaxAgeMs: 3_600_000,
      assetIds: ["BTC-USD", "ETH-USD"],
    },
  });
  assert.deepEqual(comparison.comparison, {
    active: true,
    mode: "indexed",
    baselineTime: 1_000,
    baselineMaxAgeMs: 3_600_000,
    assetIds: ["BTC-USD", "ETH-USD"],
  });
  const providerComparison = parseStudioWorkspace({
    ...legacy,
    comparison: {
      active: true,
      mode: "percentage",
      baselineTime: null,
      baselineMaxAgeMs: 0,
      assetIds: ["BTC-USD"],
      dataSource: "binance",
    },
  });
  assert.equal(providerComparison.comparison?.dataSource, "binance");
  assert.throws(() => parseStudioWorkspace({ ...legacy, comparison: { active: true, mode: "indexed", baselineTime: null, baselineMaxAgeMs: 0, assetIds: ["BTC-USD", "BTC-USD"] } }), /duplicate/);
});

test("Studio portfolio configuration is bounded, validated, and excludes market data", () => {
  const portfolio = createPortfolioBacktestWorkspace({
    accountCurrency: "USD",
    initialCapital: 10_000,
    instruments: [{ id: "BTC", symbol: "BTC-USD", quoteCurrency: "USD", timeframe: "1h", strategy: "EMA_TREND", parameters: { period: 5 }, calendar: { id: "UTC-24x7", version: "1" } }],
    positionSizing: { type: "fixed-notional", amount: 1_000 },
    commission: { type: "percent", value: 0.001 },
    slippage: { type: "percent", value: 0 },
  });
  const legacy = createStudioWorkspace({ panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h", workspace: legacyWorkspace() });
  const restored = parseStudioWorkspace({ ...legacy, portfolioBacktest: portfolio });
  assert.equal(restored.portfolioBacktest?.initialCapital, 10_000);
  assert.equal("candles" in (restored.portfolioBacktest?.instruments[0] ?? {}), false);
  assert.throws(() => parseStudioWorkspace({ ...legacy, portfolioBacktest: { ...portfolio, instruments: [{ ...portfolio.instruments[0]!, id: "" }] } }), /portfolio backtest configuration/);
});

test("WatchlistModel supports stable CRUD, ordering, favorites, and round trips", () => {
  let next = 0;
  const model = new WatchlistModel(undefined, (prefix) => `${prefix}-${++next}`);
  const list = model.create("Favorites");
  model.addSymbol(list.id, { id: "btc", displaySymbol: "BTC-USD", name: "Bitcoin", favorite: true });
  model.addSymbol(list.id, { id: "eth", displaySymbol: "ETH-USD", name: "Ether" });
  model.reorderSymbol(list.id, "eth", 0);
  model.setFavorite(list.id, "eth", true);
  assert.deepEqual(model.getDocument().lists[0]?.symbols.map((symbol) => symbol.id), ["eth", "btc"]);
  assert.equal(model.getDocument().lists[0]?.symbols[0]?.favorite, true);
  assert.throws(() => model.addSymbol(list.id, { id: "eth", displaySymbol: "ETH-USD", name: "Duplicate" }), WatchlistValidationError);
  model.removeSymbol(list.id, "btc");
  model.rename(list.id, "Pinned");
  assert.equal(parseWatchlistDocument(model.getDocument()).lists[0]?.name, "Pinned");
  model.delete(list.id);
  assert.equal(model.getDocument().selectedWatchlistId, null);
});

test("Studio synchronization forwards UTC coordinates across irregular charts without loops", () => {
  const calls: Array<{ panel: string; kind: string; value: unknown }> = [];
  const nearest = (times: readonly number[], target: number): number => times.reduce((best, time) => Math.abs(time - target) < Math.abs(best - target) ? time : best, times[0]!);
  let controller: StudioSynchronizationController;
  const makeTarget = (panel: string, times: readonly number[]) => ({
    setCrosshairAtTime(time: number | null): number | null {
      const resolved = time === null ? null : nearest(times, time);
      calls.push({ panel, kind: "crosshair", value: resolved });
      if (panel === "chart-2" && resolved !== null) controller.syncCrosshair(panel, resolved, true);
      return resolved;
    },
    setVisibleTimeRange(range: { from: number; to: number }): void {
      calls.push({ panel, kind: "range", value: range });
    },
  });
  const targets = new Map([
    ["chart-1", makeTarget("chart-1", [1_000, 2_000, 3_500])],
    ["chart-2", makeTarget("chart-2", [900, 1_800, 3_000, 5_000])],
    ["chart-3", makeTarget("chart-3", [800, 1_700, 2_900])],
  ]);
  controller = new StudioSynchronizationController(() => targets);

  controller.syncCrosshair("chart-1", 3_420, true);
  assert.deepEqual(calls.filter((call) => call.kind === "crosshair").map((call) => [call.panel, call.value]), [["chart-2", 3_000], ["chart-3", 2_900]]);
  controller.syncVisibleRange("chart-1", { from: 1_120, to: 3_420 }, true);
  assert.equal(calls.filter((call) => call.kind === "range").length, 2);
  controller.syncCrosshair("chart-1", 3_420, false);
  controller.syncVisibleRange("chart-1", { from: 4_000, to: 2_000 }, true);
  assert.equal(calls.length, 4);
});
