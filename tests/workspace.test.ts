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

test("workspace parser preserves corporate-action presentation references without derived candles", () => {
  const input = {
    ...workspace(),
    corporateActions: {
      instrumentId: "AAA",
      sourceId: "fixture-actions",
      sourceVersion: "2026-01",
      mode: "split-adjusted" as const,
      context: "causal-as-of" as const,
      asOfTime: 2,
      volumePolicy: "equivalent-shares" as const,
      markersVisible: true,
    },
  };
  const parsed = parseWorkspace(input);
  assert.deepEqual(parsed.corporateActions, input.corporateActions);
  assert.throws(() => parseWorkspace({ ...input, corporateActions: { ...input.corporateActions, context: "causal-as-of", asOfTime: null } }), WorkspaceValidationError);
  assert.deepEqual(parseWorkspace(JSON.parse(JSON.stringify(input))).corporateActions, input.corporateActions);
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

test("workspace parser validates a replay-visible export marker without treating it as resumable", () => {
  const workspaceDocument = workspace();
  const parsed = parseWorkspace({
    ...workspaceDocument,
    replay: { active: true, currentIndex: 2, currentTimestamp: 30, totalBars: 5 },
  });
  assert.deepEqual(parsed.replay, { active: true, currentIndex: 2, currentTimestamp: 30, totalBars: 5 });
  assert.throws(
    () => parseWorkspace({ ...workspaceDocument, replay: { active: true, currentIndex: 5, currentTimestamp: 30, totalBars: 5 } }),
    WorkspaceValidationError,
  );
});

test("workspace parser preserves professional chart series and appearance settings", () => {
  const input = workspace();
  const candle = input.series[0]!;
  const parsed = parseWorkspace({
    ...input,
    series: [
      { ...candle, id: "ohlc", type: "ohlc", style: { upColor: "#0ff", downColor: "#f0f" } },
      { ...candle, id: "hollow", type: "hollow-candlestick", style: { hollowUpColor: "#0ff", downColor: "#f0f" } },
      { ...candle, id: "heikin", type: "heikin-ashi", style: { upColor: "#0f0" } },
      {
        id: "baseline",
        type: "baseline",
        paneId: "main",
        style: { baseline: 100, aboveColor: "#0f0", belowColor: "#f00", aboveFillOpacity: 0.25, belowFillOpacity: 0.4 },
        data: [{ time: 1, value: 101 }],
      },
    ],
  });
  assert.deepEqual(parsed.series.map((series) => series.type), ["ohlc", "hollow-candlestick", "heikin-ashi", "baseline"]);
  assert.equal(parsed.series[3]?.style.baseline, 100);
  assert.throws(() => parseWorkspace({
    ...input,
    series: [{ ...candle, type: "ohlc", style: { aboveFillOpacity: 2 } }],
  }), WorkspaceValidationError);
});

test("workspace parser round-trips additive multi-timeframe configuration without derived data", () => {
  const input = workspace();
  const parsed = parseWorkspace({
    ...input,
    multiTimeframe: {
      indicators: [{
        id: "mtf-sma",
        indicatorId: "SMA",
        paneId: "main",
        sourceTimeframe: "1m",
        targetTimeframe: "5m",
        parameters: { period: 3 },
        coveragePolicy: "fixed-duration",
        missingVolumePolicy: "ignore",
        finalityPolicy: "complete-only",
        outputStyles: { value: { color: "#60a5fa" } },
        visible: true,
      }],
      references: [{
        id: "previous-5m",
        sourceTimeframe: "1m",
        targetTimeframe: "5m",
        levels: ["open", "high", "low", "close"],
        coveragePolicy: "fixed-duration",
        missingVolumePolicy: "ignore",
        finalityPolicy: "complete-only",
        visible: true,
        labels: true,
        labelPrefix: "Previous",
        style: { color: "#f59e0b", lineStyle: "dashed", lineWidth: 1.5, alpha: 0.8 },
      }],
    },
  });
  assert.equal(parsed.multiTimeframe?.indicators[0]?.targetTimeframe, "5m");
  assert.equal(parsed.multiTimeframe?.references[0]?.style.lineStyle, "dashed");
  assert.throws(() => parseWorkspace({ ...input, multiTimeframe: { indicators: [{
    id: "bad", indicatorId: "SMA", paneId: "main", sourceTimeframe: "1m", targetTimeframe: "1W", parameters: {}, coveragePolicy: "unknown", missingVolumePolicy: "ignore", finalityPolicy: "time-closed", outputStyles: {}, visible: true,
  }], references: [] } }), WorkspaceValidationError);
});

test("workspace parser validates serializable trading calendar identity and display settings", () => {
  const input = workspace();
  const parsed = parseWorkspace({
    ...input,
    tradingCalendar: {
      calendarId: "nyse",
      version: "2024.1",
      display: {
        visible: true,
        showBoundaries: true,
        showBreaks: true,
        showLabels: false,
        sessionColor: "#64748b",
        breakColor: "#94a3b8",
        labelColor: "#64748b",
        opacity: 0.2,
        maxSessions: 64,
      },
    },
  });
  assert.equal(parsed.tradingCalendar?.calendarId, "nyse");
  assert.equal(parsed.tradingCalendar?.display.showLabels, false);
  assert.throws(() => parseWorkspace({
    ...input,
    tradingCalendar: {
      calendarId: "nyse",
      version: "2024.1",
      display: { opacity: 2 },
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

test("workspace parser preserves serializable alert definitions without runtime history", () => {
  const input = {
    ...workspace(),
    alerts: {
      version: 1 as const,
      alerts: [{
        id: "close-cross",
        name: "Close crosses 10",
        condition: { type: "price-cross-above" as const, value: 10 },
        frequency: "once-per-bar" as const,
        enabled: true,
      }],
    },
  };
  const parsed = parseWorkspace(input);
  assert.deepEqual(parsed.alerts, input.alerts);
  assert.throws(() => parseWorkspace({ ...workspace(), alerts: { version: 2, alerts: [] } }), WorkspaceValidationError);
});

test("workspace parser preserves optional estimated Volume Profile configuration", () => {
  const input = {
    ...workspace(),
    volumeAnalytics: {
      volumeProfiles: [{
        id: "profile-main",
        mode: "fixed" as const,
        range: { from: 1, to: 2_000 },
        binCount: 16,
        allocation: "range-uniform" as const,
        valueAreaPercentage: 0.7,
        position: "left" as const,
        width: 0.3,
        opacity: 0.5,
        color: "#60a5fa",
        valueAreaColor: "#34d399",
        pocColor: "#f59e0b",
        showPoc: true,
        showValueArea: true,
        showLabels: false,
        visible: true,
      }],
    },
  };
  const parsed = parseWorkspace(input);
  assert.deepEqual(parsed.volumeAnalytics, input.volumeAnalytics);
  assert.throws(() => parseWorkspace({
    ...workspace(),
    volumeAnalytics: { volumeProfiles: [{ id: "profile-main", mode: "fixed", binCount: 4 }] },
  }), WorkspaceValidationError);
  assert.deepEqual(parseWorkspace(workspace()).volumeAnalytics, undefined);
});

test("workspace Volume Profile persistence accepts empty and multiple profiles deterministically", () => {
  const input = {
    ...workspace(),
    volumeAnalytics: {
      volumeProfiles: [
        { id: "left", mode: "visible" as const, binCount: 8, allocation: "close" as const, position: "left" as const },
        { id: "right", mode: "fixed" as const, range: { from: 1, to: 2_000 }, binCount: 12, allocation: "range-uniform" as const, position: "right" as const },
      ],
    },
  };
  const parsed = parseWorkspace(input);
  assert.deepEqual(parsed.volumeAnalytics?.volumeProfiles.map((profile) => profile.id), ["left", "right"]);
  assert.deepEqual(parseWorkspace({ ...workspace(), volumeAnalytics: { volumeProfiles: [] } }).volumeAnalytics, { volumeProfiles: [] });
  assert.equal(JSON.stringify(parseWorkspace(input)), JSON.stringify(parseWorkspace(JSON.parse(JSON.stringify(input)))));
  assert.throws(() => parseWorkspace({
    ...input,
    volumeAnalytics: {
      volumeProfiles: [input.volumeAnalytics.volumeProfiles[0], input.volumeAnalytics.volumeProfiles[0]],
    },
  }), /duplicate/);
});
