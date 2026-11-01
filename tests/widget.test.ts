import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeWidgetLabels } from "../src/widget/controller.js";
import { normalizeWidgetFeatures } from "../src/widget/controller.js";
import { chartCountForLayout, parseWidgetComposition } from "../src/widget/composition.js";

test("widget defaults are deterministic and feature visibility is additive", () => {
  assert.deepEqual(normalizeWidgetFeatures(), {
    header: true,
    symbol: true,
    timeframe: true,
    chartType: true,
    indicators: true,
    drawings: true,
    theme: true,
    direction: true,
    workspace: true,
    status: true,
    indicatorExplorer: true,
    drawingToolbar: true,
    objectTree: true,
    drawingProperties: true,
    chartSettings: true,
    layout: true,
    synchronization: true,
    watchlist: true,
    comparison: true,
    replay: true,
  });
  assert.deepEqual(normalizeWidgetFeatures({ header: false, workspace: false, watchlist: false }), {
    header: false,
    symbol: true,
    timeframe: true,
    chartType: true,
    indicators: true,
    drawings: true,
    theme: true,
    direction: true,
    workspace: false,
    status: true,
    indicatorExplorer: true,
    drawingToolbar: true,
    objectTree: true,
    drawingProperties: true,
    chartSettings: true,
    layout: true,
    synchronization: true,
    watchlist: false,
    comparison: true,
    replay: true,
  });
  assert.equal(normalizeWidgetLabels({ symbol: "نماد" }).symbol, "نماد");
  assert.equal(normalizeWidgetLabels({}).timeframe, "Timeframe");
  assert.equal(normalizeWidgetLabels({}).layout, "Layout");
});

test("widget composition validates layout cardinality and rejects malformed input", () => {
  assert.equal(chartCountForLayout("single"), 1);
  assert.equal(chartCountForLayout("two-horizontal"), 2);
  assert.equal(chartCountForLayout("four-grid"), 4);
  assert.throws(() => parseWidgetComposition({ version: 1, layout: "two-horizontal", activeChartId: "chart-1", charts: [], synchronization: { enabled: false, crosshair: false, visibleRange: false }, watchlist: { version: 1, selectedWatchlistId: null, lists: [] } }), /requires 2 chart/);
});

test("widget foundation remains independent from React and Next.js", () => {
  const source = [
    "src/widget/controller.ts",
    "src/widget/types.ts",
    "src/widget/chart-slot.ts",
    "src/widget/composition.ts",
    "src/widget/focus.ts",
  ].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /from ["'](?:react|next|next\/)/i);
  assert.doesNotMatch(source, /examples\/nextjs-app-router/i);
});
