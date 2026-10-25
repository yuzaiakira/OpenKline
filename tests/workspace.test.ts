import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceValidationError, parseWorkspace, type WorkspaceDocument } from "../src/index.js";

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

function workspace(): WorkspaceDocument {
  return {
    version: 1,
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

test("workspace parser validates and defensively clones a versioned document", () => {
  const input = workspace();
  const parsed = parseWorkspace(input);
  assert.deepEqual(parsed, input);
  (input.chart.theme as { background: string }).background = "#000";
  assert.equal(parsed.chart.theme.background, "#fff");
});

test("workspace parser keeps Phase 7 price-scale settings while accepting prior version-1 workspaces", () => {
  const legacy = parseWorkspace(workspace());
  assert.equal(legacy.chart.priceScale, undefined);

  const input = workspace();
  const parsed = parseWorkspace({
    ...input,
    chart: {
      ...input.chart,
      priceScale: {
        mode: "percentage",
        autoScale: false,
        referencePrice: 100,
        marginTop: 0.1,
        marginBottom: 0.05,
        axisVisible: false,
        range: { min: 90, max: 120 },
      },
    },
  });
  assert.deepEqual(parsed.chart.priceScale, {
    mode: "percentage",
    autoScale: false,
    referencePrice: 100,
    marginTop: 0.1,
    marginBottom: 0.05,
    axisVisible: false,
    range: { min: 90, max: 120 },
  });
  assert.throws(() => parseWorkspace({
    ...input,
    chart: {
      ...input.chart,
      priceScale: { mode: "logarithmic", autoScale: true, marginTop: 1, marginBottom: 0, axisVisible: true },
    },
  }), WorkspaceValidationError);
});

test("workspace parser rejects invalid references, ordering, and JSON state", () => {
  assert.throws(() => parseWorkspace({ ...workspace(), version: 2 }), WorkspaceValidationError);
  assert.throws(() => parseWorkspace({
    ...workspace(),
    series: [{ ...workspace().series[0]!, paneId: "missing" }],
  }), /missing pane/);
  assert.throws(() => parseWorkspace({
    ...workspace(),
    series: [{ ...workspace().series[0]!, data: [
      { time: 2, open: 1, high: 2, low: 1, close: 1.5 },
      { time: 1, open: 1, high: 2, low: 1, close: 1.5 },
    ] }],
  }), /timestamps are not ascending/);
  assert.throws(() => parseWorkspace({
    ...workspace(),
    plugins: [{ id: "example.plugin", version: "1.0.0", state: { bad: new Date() } }],
  }), WorkspaceValidationError);
});

test("workspace parser accepts only serializable KlineScript source references", () => {
  const parsed = parseWorkspace({
    ...workspace(),
    indicators: [{
      id: "script-1",
      indicatorId: "KLINESCRIPT-ABCD1234",
      paneId: "main",
      parameters: { period: 14 },
      outputStyles: { "plot-1": { color: "#8B5CF6" } },
      script: { programId: "KLINESCRIPT-ABCD1234", source: 'indicator("Test")\nplot(close)' },
    }],
  });
  assert.equal(parsed.indicators[0]?.script?.programId, "KLINESCRIPT-ABCD1234");
  assert.throws(() => parseWorkspace({
    ...workspace(),
    indicators: [{
      id: "script-1",
      indicatorId: "KLINESCRIPT-ABCD1234",
      paneId: "main",
      parameters: {},
      outputStyles: {},
      script: { programId: "KLINESCRIPT-ABCD1234", source: "" },
    }],
  }), /Invalid KlineScript reference/);
});
