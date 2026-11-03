import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudioIndicatorCatalog,
  createDefaultIndicatorRegistry,
  createStudioWorkspaceBaseline,
  filterStudioIndicatorCatalog,
  listStudioIndicatorCategories,
  parseStudioWorkspace,
  resolveStudioWorkspaceSaveStatus,
  studioIndicatorDefaultPane,
  studioWorkspaceContentFingerprint,
  type WorkspaceDocument,
} from "../src/index.js";

const SUPPORTED = [
  "SMA", "EMA", "RSI", "MACD", "BOLLINGER_BANDS", "ATR", "STOCHASTIC", "VWAP",
  "ROC", "CCI", "WILLIAMS_R", "OBV", "MFI", "ADX", "DONCHIAN_CHANNELS", "KELTNER_CHANNELS",
] as const;

function chartWorkspace(indicators: WorkspaceDocument["indicators"] = []): WorkspaceDocument {
  return {
    version: 1,
    metadata: { symbol: "BTC-USD", timeframe: "1h" },
    chart: {
      theme: {
        background: "#000", text: "#fff", grid: "#111", border: "#222",
        upCandle: "#0f0", downCandle: "#f00", crosshair: "#aaa", volumeUp: "#0f0", volumeDown: "#f00",
      },
      locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr",
    },
    panes: [{ id: "main", height: null, minHeight: 120 }, ...(indicators.some((item) => item.paneId !== "main") ? [{ id: "pane-2", height: 180, minHeight: 80 }] : [])],
    series: [],
    indicators,
    drawings: { version: 1, drawings: [] },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

test("buildStudioIndicatorCatalog discovers grounded registry metadata in supported order", () => {
  const registry = createDefaultIndicatorRegistry();
  const catalog = buildStudioIndicatorCatalog(registry, [...SUPPORTED, "NOT_A_REAL_INDICATOR", "sma"]);
  assert.equal(catalog.length, SUPPORTED.length);
  assert.deepEqual(catalog.map((entry) => entry.id), [...SUPPORTED]);
  const sma = catalog.find((entry) => entry.id === "SMA");
  assert.ok(sma);
  assert.equal(sma.name, "Simple Moving Average");
  assert.match(sma.description, /arithmetic mean/i);
  assert.equal(sma.category, "custom");
  assert.equal(sma.overlay, true);
  assert.match(sma.searchableText, /sma/);
  const roc = catalog.find((entry) => entry.id === "ROC");
  assert.ok(roc);
  assert.equal(roc.category, "momentum");
});

test("filterStudioIndicatorCatalog searches id, name, description, and category", () => {
  const catalog = buildStudioIndicatorCatalog(createDefaultIndicatorRegistry(), SUPPORTED);
  assert.equal(filterStudioIndicatorCatalog(catalog, { query: "" }).length, catalog.length);
  assert.equal(filterStudioIndicatorCatalog(catalog, { query: "   " }).length, catalog.length);
  const rsi = filterStudioIndicatorCatalog(catalog, { query: "relative strength" });
  assert.equal(rsi.length, 1);
  assert.equal(rsi[0]?.id, "RSI");
  const byId = filterStudioIndicatorCatalog(catalog, { query: "obv" });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.id, "OBV");
  const empty = filterStudioIndicatorCatalog(catalog, { query: "zzz-no-match" });
  assert.equal(empty.length, 0);
  const volume = filterStudioIndicatorCatalog(catalog, { category: "volume" });
  assert.ok(volume.every((entry) => entry.category === "volume"));
  assert.ok(volume.length >= 2);
  const favorites = filterStudioIndicatorCatalog(catalog, { favoritesOnly: true, favoriteIds: ["sma", "RSI"] });
  assert.deepEqual(favorites.map((entry) => entry.id), ["SMA", "RSI"]);
});

test("listStudioIndicatorCategories prefixes all and preserves grounded categories", () => {
  const catalog = buildStudioIndicatorCatalog(createDefaultIndicatorRegistry(), SUPPORTED);
  const categories = listStudioIndicatorCategories(catalog);
  assert.equal(categories[0], "all");
  assert.ok(categories.includes("custom"));
  assert.ok(categories.includes("momentum"));
  assert.ok(categories.includes("volume"));
});

test("studioIndicatorDefaultPane maps overlays to main and oscillators to new", () => {
  const catalog = buildStudioIndicatorCatalog(createDefaultIndicatorRegistry(), ["SMA", "RSI", "MACD"]);
  const sma = catalog.find((entry) => entry.id === "SMA")!;
  const rsi = catalog.find((entry) => entry.id === "RSI")!;
  assert.equal(studioIndicatorDefaultPane(sma), "main");
  assert.equal(studioIndicatorDefaultPane(rsi), "new");
  assert.equal(studioIndicatorDefaultPane({ id: "VWAP", overlay: false }), "main");
});

test("workspace fingerprint observes panel-local indicator add, param change, and remove", () => {
  const empty = parseStudioWorkspace({
    version: 1,
    id: "desk",
    name: "Desk",
    layout: "two-horizontal",
    charts: [
      { panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h", workspace: chartWorkspace() },
      { panelId: "chart-2", symbol: "ETH-USD", timeframe: "4h", workspace: chartWorkspace() },
    ],
    synchronization: { crosshair: false, visibleRange: false, symbol: false, timeframe: false },
    watchlists: { version: 1, selectedWatchlistId: null, lists: [] },
  });
  const withSma = {
    ...empty,
    charts: [
      {
        ...empty.charts[0]!,
        workspace: chartWorkspace([{
          id: "studio-sma-1",
          indicatorId: "SMA",
          paneId: "main",
          parameters: { period: 20 },
          outputStyles: {},
        }]),
      },
      empty.charts[1]!,
    ],
  };
  const withPeriod = {
    ...withSma,
    charts: [
      {
        ...withSma.charts[0]!,
        workspace: chartWorkspace([{
          id: "studio-sma-1",
          indicatorId: "SMA",
          paneId: "main",
          parameters: { period: 50 },
          outputStyles: {},
        }]),
      },
      withSma.charts[1]!,
    ],
  };
  const withPanelB = {
    ...withPeriod,
    charts: [
      withPeriod.charts[0]!,
      {
        ...withPeriod.charts[1]!,
        workspace: chartWorkspace([{
          id: "studio-rsi-1",
          indicatorId: "RSI",
          paneId: "pane-2",
          parameters: { period: 14 },
          outputStyles: {},
        }]),
      },
    ],
  };
  const removed = {
    ...withPanelB,
    charts: [
      { ...withPanelB.charts[0]!, workspace: chartWorkspace() },
      withPanelB.charts[1]!,
    ],
  };

  const emptyFp = studioWorkspaceContentFingerprint(empty);
  const smaFp = studioWorkspaceContentFingerprint(withSma);
  const periodFp = studioWorkspaceContentFingerprint(withPeriod);
  const panelBFp = studioWorkspaceContentFingerprint(withPanelB);
  const removedFp = studioWorkspaceContentFingerprint(removed);

  assert.notEqual(emptyFp, smaFp);
  assert.notEqual(smaFp, periodFp);
  assert.notEqual(periodFp, panelBFp);
  assert.notEqual(panelBFp, removedFp);

  const baseline = createStudioWorkspaceBaseline(withSma);
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: smaFp,
  }), "saved");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: periodFp,
  }), "unsaved-changes");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: removedFp,
  }), "unsaved-changes");
});

test("unsupported catalog ids are skipped without inventing definitions", () => {
  const registry = createDefaultIndicatorRegistry();
  const catalog = buildStudioIndicatorCatalog(registry, ["SMA", "FABRICATED_OSCILLATOR", "EMA"]);
  assert.deepEqual(catalog.map((entry) => entry.id), ["SMA", "EMA"]);
  assert.equal(registry.has("FABRICATED_OSCILLATOR"), false);
});

test("pane layout advances auto ids after restoring explicit pane-N panes", async () => {
  const { PaneLayout } = await import("../src/core/pane-layout.js");
  const layout = new PaneLayout();
  assert.equal(layout.add({ id: "pane-1", height: 180 }), "pane-1");
  assert.equal(layout.add({ height: 180 }), "pane-2");
  assert.equal(layout.add({ id: "pane-5", height: 120 }), "pane-5");
  assert.equal(layout.add({ height: 120 }), "pane-6");
});
