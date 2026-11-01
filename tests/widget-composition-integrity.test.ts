import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalChartIdsForLayout,
  chartCountForLayout,
  parseWidgetComposition,
} from "../src/widget/composition.js";
import { WidgetCompositionValidationError } from "../src/widget/errors.js";
import type { WorkspaceDocument } from "../src/workspace.js";

const theme = {
  background: "#fff",
  text: "#111",
  grid: "#ddd",
  border: "#ccc",
  upCandle: "#0a0",
  downCandle: "#a00",
  crosshair: "#555",
  volumeUp: "#0a0",
  volumeDown: "#a00",
};

function workspace(symbol = "BTC-USD"): WorkspaceDocument {
  return {
    version: 1,
    metadata: { symbol, timeframe: "1m" },
    chart: { theme, locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr" },
    panes: [{ id: "main", height: null, minHeight: 80 }],
    series: [{
      id: "candles",
      type: "candlestick",
      paneId: "main",
      style: {},
      data: [{ time: 1, open: 1, high: 2, low: 0.5, close: 1.5, volume: 3 }],
    }],
    indicators: [],
    drawings: { version: 1, drawings: [] },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

function sync() {
  return { enabled: false, crosshair: false, visibleRange: false };
}

function watchlist() {
  return { version: 1 as const, selectedWatchlistId: null, lists: [] };
}

function compositionFor(layout: "single" | "two-horizontal" | "two-vertical" | "four-grid") {
  const ids = canonicalChartIdsForLayout(layout);
  return {
    version: 1 as const,
    layout,
    activeChartId: ids[0]!,
    charts: ids.map((id) => ({
      id,
      symbol: "BTC-USD",
      timeframe: "1m",
      workspace: workspace(),
    })),
    synchronization: sync(),
    watchlist: watchlist(),
    comparison: {
      active: false,
      mode: "percentage" as const,
      baselineTime: null,
      baselineMaxAgeMs: 0,
      assetIds: [] as string[],
    },
  };
}

test("composition requires canonical chart ids for each layout", () => {
  assert.deepEqual(canonicalChartIdsForLayout("single"), ["chart-1"]);
  assert.deepEqual(canonicalChartIdsForLayout("two-horizontal"), ["chart-1", "chart-2"]);
  assert.deepEqual(canonicalChartIdsForLayout("four-grid"), ["chart-1", "chart-2", "chart-3", "chart-4"]);
  assert.equal(chartCountForLayout("two-vertical"), 2);

  const valid = parseWidgetComposition(compositionFor("two-horizontal"));
  assert.equal(valid.layout, "two-horizontal");
  assert.deepEqual(valid.charts.map((chart) => chart.id), ["chart-1", "chart-2"]);

  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("two-horizontal"),
      charts: [
        { id: "left", symbol: "BTC-USD", timeframe: "1m", workspace: workspace() },
        { id: "right", symbol: "ETH-USD", timeframe: "5m", workspace: workspace("ETH-USD") },
      ],
    }),
    (error: unknown) => error instanceof WidgetCompositionValidationError && /canonical chart ids/.test(String(error)),
  );

  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      charts: [
        { id: "chart-1", symbol: "BTC-USD", timeframe: "1m", workspace: workspace() },
        { id: "chart-1", symbol: "ETH-USD", timeframe: "5m", workspace: workspace("ETH-USD") },
      ],
    }),
    /requires 1 chart/,
  );
});

test("composition rejects invalid active chart, duplicate ids, and unknown versions", () => {
  assert.throws(
    () => parseWidgetComposition({ ...compositionFor("single"), activeChartId: "chart-9" }),
    /activeChartId does not match/,
  );
  assert.throws(
    () => parseWidgetComposition({ ...compositionFor("single"), version: 2 }),
    /Unsupported Widget composition version/,
  );
  assert.throws(
    () => parseWidgetComposition({ ...compositionFor("single"), layout: "nine-grid" }),
    /Invalid Widget layout/,
  );
});

test("composition rejects non-finite comparison numerics and hostile shapes", () => {
  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      comparison: {
        active: true,
        mode: "percentage",
        baselineTime: Number.NaN,
        baselineMaxAgeMs: 0,
        assetIds: [],
      },
    }),
    /Invalid Widget comparison/,
  );
  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      comparison: {
        active: true,
        mode: "indexed",
        baselineTime: Number.POSITIVE_INFINITY,
        baselineMaxAgeMs: 10,
        assetIds: ["A"],
      },
    }),
    /Invalid Widget comparison/,
  );
  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      comparison: {
        active: false,
        mode: "percentage",
        baselineTime: 1,
        baselineMaxAgeMs: Number.NaN,
        assetIds: [],
      },
    }),
    /Invalid Widget comparison/,
  );
  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      comparison: {
        active: false,
        mode: "percentage",
        baselineTime: null,
        baselineMaxAgeMs: -1,
        assetIds: [],
      },
    }),
    /Invalid Widget comparison/,
  );

  const cyclic: Record<string, unknown> = { ...compositionFor("single") };
  cyclic.self = cyclic;
  assert.throws(() => parseWidgetComposition(cyclic), /cyclic/);

  assert.throws(
    () => parseWidgetComposition(Object.assign(Object.create({ poisoned: true }), compositionFor("single"))),
    /plain objects/,
  );

  assert.throws(
    () => parseWidgetComposition({ ...compositionFor("single"), unexpected: true }),
    /Unexpected Widget composition key/,
  );
});

test("composition rejects malformed watchlist and nested workspace documents", () => {
  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      watchlist: { version: 1, selectedWatchlistId: "missing", lists: [] },
    }),
    /Invalid watchlist/,
  );
  assert.throws(
    () => parseWidgetComposition({
      ...compositionFor("single"),
      charts: [{
        id: "chart-1",
        symbol: "BTC-USD",
        timeframe: "1m",
        workspace: { version: 1, panes: [], series: [], indicators: [], drawings: { version: 1, drawings: [] }, viewport: { rangeStart: 0, visibleCount: 1 }, plugins: [] },
      }],
    }),
    /Invalid workspace/,
  );
});
