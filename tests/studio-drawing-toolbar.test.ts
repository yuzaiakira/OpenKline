import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStudioDrawingToolbarCatalog,
  builtInDrawingTools,
  cancelStudioInteractiveDrawing,
  createStudioWorkspaceBaseline,
  filterStudioDrawingToolbarCatalog,
  listStudioDrawingToolGroups,
  parseStudioWorkspace,
  resolveStudioWorkspaceSaveStatus,
  studioDrawingToolGroupLabel,
  studioWorkspaceContentFingerprint,
  type WorkspaceDocument,
} from "../src/index.js";
import {
  hasInteractiveDrawingCancellation,
  registerInteractiveDrawingCancellation,
} from "../src/internal/drawing-cancellation.js";

const SUPPORTED = [
  "trend-line", "ray", "extended-line", "parallel-channel",
  "horizontal-line", "vertical-line", "rectangle",
  "fibonacci-retracement", "fibonacci-extension", "price-range",
  "date-range", "long-position", "short-position", "text",
] as const;

function chartWorkspace(drawings: WorkspaceDocument["drawings"]["drawings"] = []): WorkspaceDocument {
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
    panes: [{ id: "main", height: null, minHeight: 120 }],
    series: [],
    indicators: [],
    drawings: { version: 1, drawings },
    viewport: { rangeStart: 0, visibleCount: 1 },
    plugins: [],
  };
}

test("buildStudioDrawingToolbarCatalog discovers grounded engine tools in Studio order", () => {
  const catalog = buildStudioDrawingToolbarCatalog(builtInDrawingTools, [...SUPPORTED, "not-a-tool"]);
  assert.equal(catalog.length, SUPPORTED.length);
  assert.deepEqual(catalog.map((entry) => entry.type), [...SUPPORTED]);
  const trend = catalog.find((entry) => entry.type === "trend-line");
  assert.ok(trend);
  assert.equal(trend.label, "Trend");
  assert.equal(trend.group, "lines");
  assert.equal(trend.minPoints, 2);
  assert.equal(trend.maxPoints, 2);
});

test("filterStudioDrawingToolbarCatalog searches type, label, group, and description", () => {
  const catalog = buildStudioDrawingToolbarCatalog(builtInDrawingTools, SUPPORTED);
  assert.equal(filterStudioDrawingToolbarCatalog(catalog, { query: "" }).length, catalog.length);
  const fib = filterStudioDrawingToolbarCatalog(catalog, { query: "fibonacci" });
  assert.ok(fib.length >= 2);
  assert.ok(fib.every((entry) => entry.group === "fibonacci" || entry.description.toLowerCase().includes("fibonacci") || entry.type.includes("fibonacci")));
  const empty = filterStudioDrawingToolbarCatalog(catalog, { query: "zzz-no-match" });
  assert.equal(empty.length, 0);
  const lines = filterStudioDrawingToolbarCatalog(catalog, { group: "lines" });
  assert.ok(lines.every((entry) => entry.group === "lines"));
  assert.ok(lines.length >= 4);
});

test("listStudioDrawingToolGroups preserves stable product order", () => {
  const catalog = buildStudioDrawingToolbarCatalog(builtInDrawingTools, SUPPORTED);
  assert.deepEqual(listStudioDrawingToolGroups(catalog), ["lines", "shapes", "fibonacci", "measure", "trade", "annotate"]);
  assert.equal(studioDrawingToolGroupLabel("fibonacci"), "Fibonacci");
});

test("cancelStudioInteractiveDrawing invokes a registered chart cancellation hook", () => {
  const owner = { id: "chart-stub" };
  let canceled = 0;
  assert.equal(hasInteractiveDrawingCancellation(owner), false);
  registerInteractiveDrawingCancellation(owner, () => { canceled += 1; });
  assert.equal(hasInteractiveDrawingCancellation(owner), true);
  cancelStudioInteractiveDrawing(owner);
  cancelStudioInteractiveDrawing(owner);
  assert.equal(canceled, 2);
  cancelStudioInteractiveDrawing({ unrelated: true });
  assert.equal(canceled, 2);
});

test("workspace fingerprint observes committed drawings but not selection-only identity", () => {
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
  const withTrend = {
    ...empty,
    charts: [
      {
        ...empty.charts[0]!,
        workspace: chartWorkspace([{
          id: "drawing-1",
          type: "trend-line",
          points: [{ time: 1, price: 100 }, { time: 2, price: 110 }],
          style: { color: "#fbbf24", lineWidth: 2, locked: false, visible: true },
          zIndex: 0,
        }]),
      },
      empty.charts[1]!,
    ],
  };
  const recolored = {
    ...withTrend,
    charts: [
      {
        ...withTrend.charts[0]!,
        workspace: chartWorkspace([{
          id: "drawing-1",
          type: "trend-line",
          points: [{ time: 1, price: 100 }, { time: 2, price: 110 }],
          style: { color: "#ef4444", lineWidth: 2, locked: false, visible: true },
          zIndex: 0,
        }]),
      },
      withTrend.charts[1]!,
    ],
  };
  const emptyFp = studioWorkspaceContentFingerprint(empty);
  const trendFp = studioWorkspaceContentFingerprint(withTrend);
  const colorFp = studioWorkspaceContentFingerprint(recolored);
  assert.notEqual(emptyFp, trendFp);
  assert.notEqual(trendFp, colorFp);
  const baseline = createStudioWorkspaceBaseline(withTrend);
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: trendFp,
  }), "saved");
  assert.equal(resolveStudioWorkspaceSaveStatus({
    libraryBackingId: baseline.libraryId,
    baselineFingerprint: baseline.fingerprint,
    liveFingerprint: colorFp,
  }), "unsaved-changes");
});
