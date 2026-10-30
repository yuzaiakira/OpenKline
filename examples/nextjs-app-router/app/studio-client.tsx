"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FinancialChart } from "@openkline/react";
import type { FinancialChartHandle } from "@openkline/react";
import { isCandleSeriesType } from "openkline";
import type {
  Candle,
  Chart,
  ChartSeriesInfo,
  CrosshairMoveEvent,
  DrawingSnapshot,
  AlertDefinition,
  AlertEvent,
  AlertFrequency,
  MarketTrade,
  OrderFlowState,
  OrderBookSnapshot,
  PriceScaleMode,
  ReplayApi,
  ReplayStatus,
  WorkspaceDocument,
} from "openkline";
import styles from "./studio.module.css";
import { KlineScriptStudioEditor } from "./klinescript-studio-editor";

type Timeframe = "5m" | "1h" | "4h" | "1D";
type Presentation = "candles" | "ohlc" | "hollow" | "heikin-ashi" | "line" | "area" | "baseline";

interface StudioObjects {
  readonly series: readonly ChartSeriesInfo[];
  readonly indicators: ReadonlyArray<{ id: string; indicatorId: string; paneId: string }>;
  readonly drawings: readonly DrawingSnapshot[];
}

interface StudioTimeAndSalesRow {
  readonly id: string;
  readonly time: number;
  readonly price: number;
  readonly quantity: number;
  readonly aggressorSide: MarketTrade["aggressorSide"];
}

const STORAGE_KEY = "openkline-studio-workspace-v1";
const symbols = ["BTC-USD", "ETH-USD", "AAPL"] as const;
const indicatorChoices = [
  ["SMA", "SMA · 20"],
  ["EMA", "EMA · 20"],
  ["RSI", "RSI · 14"],
  ["MACD", "MACD · 12/26/9"],
  ["BOLLINGER_BANDS", "Bollinger Bands · 20"],
  ["ATR", "ATR · 14"],
  ["STOCHASTIC", "Stochastic · 14/3"],
  ["VWAP", "VWAP · UTC day"],
] as const;
const drawingTools = [
  ["trend-line", "Trend"],
  ["horizontal-line", "Horizontal"],
  ["vertical-line", "Vertical"],
  ["rectangle", "Rectangle"],
  ["fibonacci-retracement", "Fib"],
  ["text", "Text"],
] as const;
const presentationChoices: ReadonlyArray<readonly [Presentation, string]> = [
  ["candles", "Candles"],
  ["ohlc", "OHLC"],
  ["hollow", "Hollow"],
  ["heikin-ashi", "Heikin-Ashi"],
  ["line", "Line"],
  ["area", "Area"],
  ["baseline", "Baseline"],
];
const scaleModes: ReadonlyArray<readonly [PriceScaleMode, string]> = [
  ["linear", "Linear"],
  ["logarithmic", "Log"],
  ["percentage", "%"],
  ["indexed", "Index 100"],
];

const defaultScript = [
  'indicator("Studio EMA")',
  'period = input.int("Period", default=21, min=1, max=200)',
  "value = ta.ema(close, period)",
  'plot(value, title="EMA", color="#a78bfa")',
].join("\n");

const IDLE_REPLAY_STATUS: ReplayStatus = {
  state: "idle",
  currentIndex: null,
  currentTimestamp: null,
  totalBars: 0,
  speed: 1,
};

function intervalFor(timeframe: Timeframe): number {
  return { "5m": 5 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000, "1D": 24 * 60 * 60_000 }[timeframe];
}

function buildCandles(symbol: string, timeframe: Timeframe): Candle[] {
  const interval = intervalFor(timeframe);
  const seed = [...symbol].reduce((total, character) => total + character.charCodeAt(0), 0);
  const baseline = symbol === "BTC-USD" ? 64_000 : symbol === "ETH-USD" ? 3_200 : 190;
  const start = Date.UTC(2026, 0, 1) - interval * 239;
  return Array.from({ length: 240 }, (_, index) => {
    const wave = Math.sin((index + seed) / 13) * baseline * 0.025;
    const trend = index * baseline * 0.00035;
    const close = baseline + wave + trend + Math.cos((index + seed) / 5) * baseline * 0.006;
    const open = close - Math.sin((index + seed) / 3) * baseline * 0.004;
    const spread = baseline * (0.004 + ((index + seed) % 7) * 0.00045);
    return {
      time: start + index * interval,
      open,
      high: Math.max(open, close) + spread,
      low: Math.min(open, close) - spread,
      close,
      volume: 120 + ((index * 17 + seed) % 180) * 8,
    };
  });
}

function pricePoints(candles: readonly Candle[]) {
  return candles.map((candle) => ({ time: candle.time, value: candle.close }));
}

function volumePoints(candles: readonly Candle[]) {
  return candles.map((candle) => ({
    time: candle.time,
    value: candle.volume ?? 0,
    color: candle.close >= candle.open ? "#34d39999" : "#fb718599",
  }));
}

/** Clearly labelled offline illustration; these are not observed exchange events. */
function illustrativeTrades(symbol: string, candles: readonly Candle[]): MarketTrade[] {
  const source = { id: "studio-illustrative-order-flow", version: "1" };
  return candles.slice(-48).flatMap((candle, index) => {
    const price = Number(candle.close.toFixed(2));
    const quantity = 1 + (index % 5) * 0.25;
    return [
      { id: `${symbol}-illustrative-buy-${candle.time}`, instrumentId: symbol, time: candle.time, price, quantity, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source },
      { id: `${symbol}-illustrative-sell-${candle.time}`, instrumentId: symbol, time: candle.time + 1, price: Number((price - 0.01).toFixed(2)), quantity: quantity * 0.7, aggressorSide: index % 7 === 0 ? "unknown" as const : "sell" as const, sideQuality: index % 7 === 0 ? "unknown" as const : "observed" as const, revision: 0, source },
    ];
  });
}

function illustrativeDepth(symbol: string, candle: Candle): OrderBookSnapshot {
  const mid = Number(candle.close.toFixed(2));
  return {
    version: 1,
    instrumentId: symbol,
    time: candle.time,
    sequence: 1,
    bids: [{ price: Number((mid - 0.01).toFixed(2)), quantity: 120 }, { price: Number((mid - 0.02).toFixed(2)), quantity: 80 }, { price: Number((mid - 0.03).toFixed(2)), quantity: 55 }],
    asks: [{ price: Number((mid + 0.01).toFixed(2)), quantity: 100 }, { price: Number((mid + 0.02).toFixed(2)), quantity: 75 }, { price: Number((mid + 0.03).toFixed(2)), quantity: 48 }],
    tickSize: 0.01,
    quantityUnit: "illustrative base units",
    source: { id: "studio-illustrative-depth", version: "1" },
  };
}

function indicatorParameters(id: string): Record<string, unknown> {
  switch (id) {
    case "MACD": return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 };
    case "BOLLINGER_BANDS": return { period: 20, standardDeviations: 2 };
    case "STOCHASTIC": return { kPeriod: 14, dPeriod: 3 };
    case "VWAP": return { session: "utc-day" };
    default: return { period: 14 };
  }
}

function textForCrosshair(event: CrosshairMoveEvent | null): string {
  if (event === null || event.time === null || event.price === null) return "Move across the chart for OHLC-scale readout";
  return `${new Date(event.time).toLocaleString()} · ${event.formattedPrice ?? event.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function textForReplay(status: ReplayStatus, timeZone: string): string {
  if (status.currentTimestamp === null) return "No current bar";
  return new Date(status.currentTimestamp).toLocaleString(undefined, { timeZone });
}

export default function StudioClient() {
  const handleRef = useRef<FinancialChartHandle>(null);
  const replayRef = useRef<ReplayApi | null>(null);
  const replayUnsubscribeRef = useRef<(() => void) | null>(null);
  const serialRef = useRef(1);
  const [symbol, setSymbol] = useState<(typeof symbols)[number]>("BTC-USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [presentation, setPresentation] = useState<Presentation>("candles");
  const [scaleMode, setScaleMode] = useState<PriceScaleMode>("linear");
  const [autoScale, setAutoScale] = useState(true);
  const [axisVisible, setAxisVisible] = useState(true);
  const [marginTop, setMarginTop] = useState(0.08);
  const [marginBottom, setMarginBottom] = useState(0.08);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [locale, setLocale] = useState("en-US");
  const [timeZone, setTimeZone] = useState("UTC");
  const [pricePrecision, setPricePrecision] = useState(2);
  const [interaction, setInteraction] = useState({ wheelZoom: true, pointerPan: true, crosshair: true, keyboardShortcuts: true });
  const [objects, setObjects] = useState<StudioObjects>({ series: [], indicators: [], drawings: [] });
  const [alerts, setAlerts] = useState<AlertDefinition[]>([]);
  const [alertHistory, setAlertHistory] = useState<AlertEvent[]>([]);
  const [alertName, setAlertName] = useState("Close crosses threshold");
  const [alertThreshold, setAlertThreshold] = useState(0);
  const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>("once-per-bar");
  const [crosshair, setCrosshair] = useState<CrosshairMoveEvent | null>(null);
  const [notice, setNotice] = useState("Ready. The Studio uses deterministic local market data; no vendor credentials are required.");
  const [indicatorToAdd, setIndicatorToAdd] = useState<(typeof indicatorChoices)[number][0]>("SMA");
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptSource, setScriptSource] = useState(defaultScript);
  const [replayStatus, setReplayStatus] = useState<ReplayStatus>(IDLE_REPLAY_STATUS);
  const [replaySourceLength, setReplaySourceLength] = useState(0);
  const [replayStartIndex, setReplayStartIndex] = useState(84);
  const [footprintVisible, setFootprintVisible] = useState(false);
  const [cvdVisible, setCvdVisible] = useState(false);
  const [cvdReset, setCvdReset] = useState<"continuous" | "session">("continuous");
  const [depthVisible, setDepthVisible] = useState(false);
  const [depthHeatmap, setDepthHeatmap] = useState(false);
  const [orderFlowState, setOrderFlowState] = useState<OrderFlowState | null>(null);
  const [timeAndSales, setTimeAndSales] = useState<StudioTimeAndSalesRow[]>([]);

  const chart = (): Chart | null => handleRef.current?.getChart() ?? null;

  const refreshOrderFlow = useCallback((target = chart()): void => {
    if (target === null) return;
    setOrderFlowState(target.getOrderFlowState());
    setTimeAndSales(target.getMarketTrades({ limit: 8 }).map((trade) => ({ id: trade.id, time: trade.time, price: trade.price, quantity: trade.quantity, aggressorSide: trade.aggressorSide })));
  }, []);

  const applyOrderFlowFixtures = useCallback((target: Chart, candles: readonly Candle[]): void => {
    const trades = illustrativeTrades(symbol, candles);
    const snapshot = illustrativeDepth(symbol, candles.at(-1) ?? candles[0]!);
    target.setMarketTrades(trades);
    target.setFootprintOptions({ visible: footprintVisible, intervalMs: intervalFor(timeframe), tickSize: 0.01, offTickPolicy: "round", showLabels: false });
    target.setCvdOptions({ visible: cvdVisible, intervalMs: intervalFor(timeframe), reset: cvdReset, pane: "new", sourceCoverage: "partial" });
    target.setDepthOptions({ visible: depthVisible, showHeatmap: depthHeatmap, maxLevels: 8, maxHistory: 256 });
    target.setOrderBookSnapshot(snapshot);
    target.applyOrderBookDelta({
      version: 1,
      id: `${symbol}-illustrative-delta`,
      instrumentId: symbol,
      time: snapshot.time + 1,
      sequence: 2,
      previousSequence: 1,
      quantityMode: "absolute",
      bids: [snapshot.bids[0]!],
      asks: [snapshot.asks[0]!],
      source: snapshot.source,
    });
    refreshOrderFlow(target);
  }, [cvdReset, cvdVisible, depthHeatmap, depthVisible, footprintVisible, refreshOrderFlow, symbol, timeframe]);

  const refreshObjects = useCallback((target = chart()): void => {
    if (target === null) return;
    const workspace = target.serializeWorkspace();
    setObjects({
      series: target.getSeriesInfo(),
      indicators: workspace.indicators.map((indicator) => ({ id: indicator.id, indicatorId: indicator.indicatorId, paneId: indicator.paneId })),
      drawings: target.getDrawings(),
    });
  }, []);

  const refreshAlerts = useCallback((target = chart()): void => {
    if (target === null) return;
    setAlerts(target.getAlerts());
    setAlertHistory(target.getAlertHistory());
  }, []);

  const syncDisplayPreferences = useCallback((target = chart()): void => {
    if (target === null) return;
    const workspace = target.serializeWorkspace();
    const active = presentationChoices.find(([kind]) => {
      const id = {
        candles: "studio-price",
        ohlc: "studio-ohlc",
        hollow: "studio-hollow",
        "heikin-ashi": "studio-heikin",
        line: "studio-line",
        area: "studio-area",
        baseline: "studio-baseline",
      }[kind];
      return workspace.series.find((series) => series.id === id)?.style.visible !== false;
    })?.[0];
    if (active !== undefined) setPresentation(active);
    const priceScale = target.getPriceScaleOptions();
    setScaleMode(priceScale.mode);
    setAutoScale(priceScale.autoScale);
    setAxisVisible(priceScale.axisVisible);
    setMarginTop(priceScale.marginTop);
    setMarginBottom(priceScale.marginBottom);
    setLocale(workspace.chart.locale);
    setTimeZone(workspace.chart.timeZone);
    setPricePrecision(workspace.chart.pricePrecision);
    setTheme(workspace.chart.theme.background === "#ffffff" ? "light" : "dark");
  }, []);

  const replayActive = replayStatus.state !== "idle" && replayStatus.state !== "disposed";

  const refreshReplayStatus = useCallback((status: ReplayStatus, target = chart()): void => {
    setReplayStatus(status);
    refreshObjects(target);
    refreshAlerts(target);
  }, [refreshAlerts, refreshObjects]);

  const enterReplay = useCallback((): void => {
    const target = chart();
    if (target === null) return;
    try {
      let replay = replayRef.current;
      if (replay === null || replay.getStatus().state === "disposed") {
        const source = target.getData();
        if (source.length < 2) {
          setNotice("Replay needs at least two historical bars.");
          return;
        }
        replay = target.createReplay({
          source,
          startAt: source[Math.min(Math.max(0, replayStartIndex), source.length - 1)]!.time,
          speed: 2,
        });
        replayRef.current = replay;
        replayUnsubscribeRef.current = replay.subscribe((status) => refreshReplayStatus(status, target));
      }
      replay.start();
      setNotice("Replay mode started from the selected historical point.");
    } catch (error) {
      setNotice(`Could not start replay: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [refreshReplayStatus, replayStartIndex]);

  const runReplayCommand = useCallback((command: (replay: ReplayApi) => void): void => {
    const replay = replayRef.current;
    if (replay === null) return;
    try {
      command(replay);
    } catch (error) {
      setNotice(`Replay command failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, []);

  const exitReplay = useCallback((): void => {
    const replay = replayRef.current;
    if (replay === null) return;
    try {
      replay.exit();
      const target = chart();
      syncDisplayPreferences(target);
      refreshObjects(target);
      refreshAlerts(target);
      setNotice("Replay exited; the complete workspace and live chart state were restored.");
    } catch (error) {
      setNotice(`Could not exit replay: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      replayUnsubscribeRef.current?.();
      replayUnsubscribeRef.current = null;
      replay.dispose();
      replayRef.current = null;
      setReplayStatus(IDLE_REPLAY_STATUS);
    }
  }, [refreshAlerts, refreshObjects, syncDisplayPreferences]);

  useEffect(() => {
    if (!replayActive) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        runReplayCommand((replay) => replay.stepForward());
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        runReplayCommand((replay) => replay.stepBackward());
      } else if (event.key === " ") {
        event.preventDefault();
        runReplayCommand((replay) => replay.getStatus().state === "playing" ? replay.pause() : replay.play());
      } else if (event.key === "Escape") {
        event.preventDefault();
        exitReplay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitReplay, replayActive, runReplayCommand]);

  const applyPresentation = useCallback((next: Presentation, target = chart()): void => {
    if (target === null) return;
    const visibility: Record<string, boolean> = {
      "studio-price": next === "candles",
      "studio-ohlc": next === "ohlc",
      "studio-hollow": next === "hollow",
      "studio-heikin": next === "heikin-ashi",
      "studio-line": next === "line",
      "studio-area": next === "area",
      "studio-baseline": next === "baseline",
    };
    for (const [id, visible] of Object.entries(visibility)) {
      if (target.getSeriesIds().includes(id)) target.setSeriesStyle(id, { visible });
    }
    setPresentation(next);
    refreshObjects(target);
  }, [refreshObjects]);

  const replaceMarketData = useCallback((nextSymbol: string, nextTimeframe: Timeframe): void => {
    const target = chart();
    if (target === null) return;
    const candles = buildCandles(nextSymbol, nextTimeframe);
    setReplaySourceLength(candles.length);
    setReplayStartIndex(Math.floor(candles.length * 0.35));
    const workspace = target.serializeWorkspace({ symbol: nextSymbol, timeframe: nextTimeframe });
    const nextWorkspace: WorkspaceDocument = {
      ...workspace,
      series: workspace.series.map((series) => ({
        ...series,
        style: series.id === "studio-baseline"
          ? { ...series.style, baseline: candles[0]?.close ?? 0 }
          : series.style,
        data: isCandleSeriesType(series.type)
          ? candles
          : series.type === "volume" || series.type === "histogram"
            ? volumePoints(candles)
            : pricePoints(candles),
      })),
    };
    try {
      target.restoreWorkspace(nextWorkspace);
      applyOrderFlowFixtures(target, candles);
      target.resetView();
      syncDisplayPreferences(target);
      refreshObjects(target);
      refreshAlerts(target);
      setNotice(`Loaded ${nextSymbol} at ${nextTimeframe} with ${candles.length} deterministic bars.`);
    } catch (error) {
      setNotice(`Could not replace market data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [applyOrderFlowFixtures, refreshAlerts, refreshObjects, syncDisplayPreferences]);

  const initializeChart = useCallback((target: Chart): void => {
    const candles = buildCandles(symbol, timeframe);
    const price = target.addCandlestickSeries({ id: "studio-price", title: "Price", style: { upColor: "#34d399", downColor: "#fb7185" } });
    const ohlc = target.addOhlcSeries({ id: "studio-ohlc", title: "OHLC", style: { upColor: "#34d399", downColor: "#fb7185", visible: false } });
    const hollow = target.addHollowCandlestickSeries({ id: "studio-hollow", title: "Hollow candles", style: { hollowUpColor: "#34d399", downColor: "#fb7185", visible: false } });
    const heikin = target.addHeikinAshiSeries({ id: "studio-heikin", title: "Heikin-Ashi", style: { upColor: "#a78bfa", downColor: "#f472b6", visible: false } });
    const line = target.addLineSeries({ id: "studio-line", title: "Close", style: { color: "#60a5fa", lineWidth: 2, visible: false } });
    const area = target.addAreaSeries({ id: "studio-area", title: "Close area", style: { color: "#a78bfa", fillColor: "#8b5cf6", fillOpacity: 0.2, visible: false } });
    const baseline = target.addBaselineSeries({ id: "studio-baseline", title: "Close vs first", style: { baseline: candles[0]?.close ?? 0, aboveColor: "#34d399", belowColor: "#fb7185", aboveFillOpacity: 0.14, belowFillOpacity: 0.14, visible: false } });
    const volume = target.addVolumeSeries({ id: "studio-volume", title: "Volume" });
    price.setData(candles);
    ohlc.setData(candles);
    hollow.setData(candles);
    heikin.setData(candles);
    line.setData(pricePoints(candles));
    area.setData(pricePoints(candles));
    baseline.setData(pricePoints(candles));
    volume.setData(volumePoints(candles));
    target.addIndicator("SMA", { id: "studio-sma", pane: "main", parameters: { period: 20 } });
    target.addIndicator("RSI", { id: "studio-rsi", pane: "new", parameters: { period: 14 } });
    applyOrderFlowFixtures(target, candles);
    setReplaySourceLength(candles.length);
    setReplayStartIndex(Math.floor(candles.length * 0.35));
    target.subscribe("drawingSelection", () => window.setTimeout(() => refreshObjects(target), 0));
    target.subscribe("indicatorChange", () => window.setTimeout(() => refreshObjects(target), 0));
    target.subscribe("alertTriggered", (event) => {
      refreshAlerts(target);
      setNotice(`${event.simulated ? "Simulated alert" : "Alert"}: ${event.alertName} at ${new Date(event.barTimestamp).toLocaleString()}`);
    });
    target.subscribe("alertError", (diagnostic) => {
      setNotice(`Alert ${diagnostic.alertId} could not be evaluated: ${diagnostic.message}`);
    });
    syncDisplayPreferences(target);
    refreshObjects(target);
    refreshAlerts(target);
    setNotice(`Loaded ${symbol} at ${timeframe} with ${candles.length} deterministic bars.`);
  }, [applyOrderFlowFixtures, refreshAlerts, refreshObjects, symbol, syncDisplayPreferences, timeframe]);

  useEffect(() => () => {
    replayUnsubscribeRef.current?.();
    replayUnsubscribeRef.current = null;
    replayRef.current = null;
    handleRef.current = null;
  }, []);

  const updateTheme = (next: "dark" | "light"): void => {
    chart()?.setOptions({ theme: next });
    setTheme(next);
    setNotice(`${next === "dark" ? "Dark" : "Light"} theme applied without recreating the chart.`);
  };

  const updateScaleMode = (next: PriceScaleMode): void => {
    chart()?.setPriceScaleOptions({ mode: next });
    setScaleMode(next);
    setNotice(`${scaleModes.find(([mode]) => mode === next)?.[1] ?? next} price scale applied without changing financial data.`);
  };

  const updateAutoScale = (next: boolean): void => {
    const target = chart();
    if (target === null) return;
    if (next) target.resetPriceScale();
    else target.setPriceScaleOptions({ autoScale: false });
    setAutoScale(next);
    setNotice(next ? "Price autoscale restored." : "Price range frozen at the current raw range.");
  };

  const updateAxisVisibility = (next: boolean): void => {
    chart()?.setPriceScaleOptions({ axisVisible: next });
    setAxisVisible(next);
  };

  const updateMargin = (side: "top" | "bottom", value: number): void => {
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      setNotice("Scale margins must be between 0 (inclusive) and 1 (exclusive).");
      return;
    }
    chart()?.setPriceScaleOptions(side === "top" ? { marginTop: value } : { marginBottom: value });
    if (side === "top") setMarginTop(value); else setMarginBottom(value);
  };

  const updateInteraction = (name: keyof typeof interaction): void => {
    const next = { ...interaction, [name]: !interaction[name] };
    chart()?.setOptions({ interaction: next });
    setInteraction(next);
  };

  const addIndicator = (): void => {
    const target = chart();
    if (target === null) return;
    const id = `studio-${indicatorToAdd.toLowerCase()}-${serialRef.current++}`;
    try {
      target.addIndicator(indicatorToAdd, {
        id,
        pane: indicatorToAdd === "SMA" || indicatorToAdd === "EMA" || indicatorToAdd === "BOLLINGER_BANDS" || indicatorToAdd === "VWAP" ? "main" : "new",
        parameters: indicatorParameters(indicatorToAdd),
      });
      refreshObjects(target);
      setNotice(`Added ${indicatorToAdd} (${id}).`);
    } catch (error) {
      setNotice(`Could not add ${indicatorToAdd}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const addOverlay = (): void => {
    const target = chart();
    if (target === null) return;
    const data = target.getData();
    const id = `studio-overlay-${serialRef.current++}`;
    const overlay = target.addLineSeries({ id, title: "Custom overlay", style: { color: "#fbbf24", lineWidth: 2 } });
    overlay.setData(data.map((candle) => ({ time: candle.time, value: candle.close * 1.01 })));
    refreshObjects(target);
    setNotice(`Added removable overlay ${id}.`);
  };

  const activateDrawing = (type: string): void => {
    const target = chart();
    if (target === null) return;
    try {
      target.startDrawing(type, {
        style: { color: "#fbbf24", fillColor: "#fbbf2433", lineWidth: 2 },
        ...(type === "text" ? { text: "Studio note" } : {}),
      });
      setNotice(`${type} is active. Place its anchors directly on the chart.`);
    } catch (error) {
      setNotice(`Could not activate ${type}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const patchDrawingStyle = (id: string, patch: Record<string, unknown>): void => {
    const target = chart();
    if (target === null) return;
    const document = target.serializeDrawings();
    target.restoreDrawings({
      version: 1,
      drawings: document.drawings.map((drawing) => drawing.id === id ? { ...drawing, style: { ...drawing.style, ...patch } } : drawing),
    });
    target.selectDrawing(id);
    refreshObjects(target);
  };

  const saveWorkspace = (): void => {
    const target = chart();
    if (target === null) return;
    try {
      const workspace = target.serializeWorkspace({ symbol, timeframe });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      setNotice("Workspace saved locally in this browser.");
    } catch (error) {
      setNotice(`Could not save workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const loadWorkspace = (): void => {
    const target = chart();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (target === null || raw === null) {
      setNotice("No locally saved Studio workspace is available.");
      return;
    }
    try {
      target.restoreWorkspace(JSON.parse(raw));
      applyOrderFlowFixtures(target, target.getData());
      syncDisplayPreferences(target);
      refreshObjects(target);
      setNotice("Local workspace restored through the public workspace contract.");
    } catch (error) {
      setNotice(`Could not load workspace: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const exportWorkspace = (): void => {
    const target = chart();
    if (target === null) return;
    const file = new Blob([JSON.stringify(target.serializeWorkspace({ symbol, timeframe }), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `openkline-${symbol.toLowerCase()}-${timeframe}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Workspace JSON export started.");
  };

  const addPriceAlert = (): void => {
    const target = chart();
    if (target === null || !Number.isFinite(alertThreshold)) {
      setNotice("Alert thresholds must be finite numbers.");
      return;
    }
    try {
      target.addAlert({
        id: `studio-alert-${serialRef.current++}`,
        name: alertName.trim() || "Price alert",
        condition: { type: "price-cross-above", field: "close", value: alertThreshold },
        frequency: alertFrequency,
      });
      refreshAlerts(target);
      setNotice("Alert created. Notifications remain local to this chart.");
    } catch (error) {
      setNotice(`Could not create alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const toggleAlert = (alert: AlertDefinition): void => {
    const target = chart();
    if (target === null) return;
    try {
      target.updateAlert(alert.id, { enabled: alert.enabled === false });
      refreshAlerts(target);
    } catch (error) {
      setNotice(`Could not update alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const removeAlert = (id: string): void => {
    const target = chart();
    if (target === null) return;
    try {
      target.removeAlert(id);
      refreshAlerts(target);
      setNotice("Alert removed.");
    } catch (error) {
      setNotice(`Could not remove alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const addScript = async (source: string, signal: AbortSignal): Promise<void> => {
    const target = chart();
    if (target === null) throw new Error("Chart is not ready");
    const indicator = await target.addScriptIndicatorAsync(source, { id: `studio-script-${serialRef.current++}`, pane: "new", signal });
    refreshObjects(target);
    setNotice(`Added Worker-backed KlineScript indicator “${indicator.indicatorId}”.`);
  };

  return (
    <main className={styles.studio}>
      <header className={styles.topbar}>
        <div className={styles.brand}><span aria-hidden="true">◈</span><strong>OpenKline Studio</strong><small>Phase 6 local workspace</small></div>
        <label>Symbol
          <select value={symbol} disabled={replayActive} onChange={(event) => { const next = event.target.value as (typeof symbols)[number]; setSymbol(next); replaceMarketData(next, timeframe); }}>
            {symbols.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>Timeframe
          <select value={timeframe} disabled={replayActive} onChange={(event) => { const next = event.target.value as Timeframe; setTimeframe(next); replaceMarketData(symbol, next); }}>
            {(["5m", "1h", "4h", "1D"] as const).map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <div className={styles.topActions}>
          <button type="button" onClick={saveWorkspace} disabled={replayActive}>Save</button>
          <button type="button" onClick={loadWorkspace} disabled={replayActive}>Load</button>
          <button type="button" onClick={exportWorkspace} disabled={replayActive}>Export</button>
          <button type="button" onClick={() => setScriptOpen((open) => !open)} disabled={replayActive} aria-expanded={scriptOpen}>KlineScript</button>
        </div>
      </header>

      <section className={styles.toolbar} aria-label="Chart tools">
        <div className={styles.toolGroup} aria-label="Chart type">
          {presentationChoices.map(([kind, label]) => <button key={kind} type="button" aria-pressed={presentation === kind} onClick={() => applyPresentation(kind)}>{label}</button>)}
          <button type="button" onClick={() => chart()?.fitContent()}>Fit</button>
          <button type="button" onClick={() => chart()?.resetView()}>Reset</button>
        </div>
        <div className={styles.toolGroup} aria-label="Drawing tools">
          {drawingTools.map(([type, label]) => <button key={type} type="button" disabled={replayActive} onClick={() => activateDrawing(type)}>{label}</button>)}
          <button type="button" disabled={replayActive} onClick={() => { const changed = chart()?.undoDrawing(); refreshObjects(); if (changed) setNotice("Drawing undo applied."); }}>Undo</button>
          <button type="button" disabled={replayActive} onClick={() => { const changed = chart()?.redoDrawing(); refreshObjects(); if (changed) setNotice("Drawing redo applied."); }}>Redo</button>
        </div>
      </section>

      <section className={styles.replayPanel} aria-label="Bar replay">
        <div className={styles.replayHeading}>
          <strong>Bar replay <span className={styles.replayBadge}>REPLAY</span></strong>
          <span aria-live="polite">Replay: {replayStatus.state}</span>
          <small>{textForReplay(replayStatus, timeZone)}</small>
        </div>
        <div className={styles.replayControls}>
          <button type="button" onClick={enterReplay} disabled={replayActive}>Enter replay</button>
          <label>Start
            <input
              aria-label="Replay starting point"
              type="range"
              min="0"
              max={Math.max(0, replaySourceLength - 1)}
              value={Math.min(replayStartIndex, Math.max(0, replaySourceLength - 1))}
              disabled={replayActive || replaySourceLength < 2}
              onChange={(event) => setReplayStartIndex(Number(event.target.value))}
            />
          </label>
          <button type="button" onClick={() => runReplayCommand((replay) => replay.stepBackward())} disabled={!replayActive} aria-label="Replay previous bar">◀</button>
          <button type="button" onClick={() => runReplayCommand((replay) => replay.getStatus().state === "playing" ? replay.pause() : replay.play())} disabled={!replayActive}>{replayStatus.state === "playing" ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => runReplayCommand((replay) => replay.stepForward())} disabled={!replayActive} aria-label="Replay next bar">▶</button>
          <button type="button" onClick={() => runReplayCommand((replay) => replay.jumpToStart())} disabled={!replayActive}>Beginning</button>
          <button type="button" onClick={() => runReplayCommand((replay) => replay.jumpToLatest())} disabled={!replayActive}>Latest</button>
          <button type="button" onClick={exitReplay} disabled={!replayActive}>Exit replay</button>
          <label>Speed
            <select aria-label="Replay speed" value={replayStatus.speed} disabled={!replayActive} onChange={(event) => runReplayCommand((replay) => replay.setSpeed(Number(event.target.value)))}>
              {[0.5, 1, 2, 5, 10].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
            </select>
          </label>
        </div>
        <div className={styles.replayTimeline}>
          <input
            aria-label="Replay position"
            type="range"
            min="0"
            max={Math.max(0, replayStatus.totalBars - 1)}
            value={replayStatus.currentIndex ?? 0}
            disabled={!replayActive || replayStatus.totalBars < 2}
            onChange={(event) => runReplayCommand((replay) => replay.seekToBar(Number(event.target.value)))}
          />
          <span>{replayStatus.currentIndex === null ? "No bars" : `${replayStatus.currentIndex + 1} / ${replayStatus.totalBars}`}</span>
        </div>
      </section>

      {scriptOpen ? <KlineScriptStudioEditor source={scriptSource} disabled={replayActive} onSourceChange={setScriptSource} onAdd={addScript} onClose={() => setScriptOpen(false)} /> : null}

      <section className={styles.workspace}>
        <aside className={styles.sidebar} aria-label="Chart object manager">
          <div className={styles.panelHeading}><h2>Objects</h2><button type="button" disabled={replayActive} onClick={addOverlay}>Add overlay</button></div>
          <details open>
            <summary>Series ({objects.series.length})</summary>
            <ul>{objects.series.map((series) => <li key={series.id}>
              <span title={`${series.type} · ${series.dataLength} points`}>{series.title ?? series.id}</span>
              <button type="button" aria-label={`Toggle ${series.id}`} onClick={() => { chart()?.setSeriesStyle(series.id, { visible: series.style.visible === false }); refreshObjects(); }}>{series.style.visible === false ? "Show" : "Hide"}</button>
              <input aria-label={`${series.id} color`} type="color" value={series.style.color ?? series.style.hollowUpColor ?? series.style.upColor ?? "#60a5fa"} onChange={(event) => { chart()?.setSeriesStyle(series.id, isCandleSeriesType(series.type) ? { upColor: event.target.value } : { color: event.target.value }); refreshObjects(); }} />
              {series.id === "studio-price" || series.id.includes(":") ? null : <button type="button" disabled={replayActive} aria-label={`Remove ${series.id}`} onClick={() => { chart()?.removeSeries(series.id); refreshObjects(); }}>×</button>}
            </li>)}</ul>
          </details>
          <details open>
            <summary>Indicators ({objects.indicators.length})</summary>
            <div className={styles.addRow}><select aria-label="Indicator" value={indicatorToAdd} disabled={replayActive} onChange={(event) => setIndicatorToAdd(event.target.value as typeof indicatorToAdd)}>{indicatorChoices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="button" disabled={replayActive} onClick={addIndicator}>Add</button></div>
            <ul>{objects.indicators.map((indicator) => <li key={indicator.id}><span>{indicator.indicatorId} <small>{indicator.paneId}</small></span><button type="button" disabled={replayActive} aria-label={`Remove ${indicator.id}`} onClick={() => { chart()?.removeIndicator(indicator.id); refreshObjects(); }}>×</button></li>)}</ul>
          </details>
          <details open>
            <summary>Drawings ({objects.drawings.length})</summary>
            <ul>{objects.drawings.map((drawing) => <li key={drawing.id} className={styles.drawingRow}>
              <button type="button" className={styles.objectName} onClick={() => chart()?.selectDrawing(drawing.id)}>{drawing.type}</button>
              <button type="button" disabled={replayActive} onClick={() => patchDrawingStyle(drawing.id, { visible: drawing.style.visible === false })}>{drawing.style.visible === false ? "Show" : "Hide"}</button>
              <button type="button" disabled={replayActive} onClick={() => patchDrawingStyle(drawing.id, { locked: drawing.style.locked !== true })}>{drawing.style.locked ? "Unlock" : "Lock"}</button>
              <input aria-label={`${drawing.id} color`} disabled={replayActive} type="color" value={drawing.style.color ?? "#fbbf24"} onChange={(event) => patchDrawingStyle(drawing.id, { color: event.target.value })} />
              <button type="button" disabled={replayActive} aria-label={`Remove ${drawing.id}`} onClick={() => { chart()?.removeDrawing(drawing.id); refreshObjects(); }}>×</button>
            </li>)}</ul>
          </details>
        </aside>

        <section className={styles.chartColumn} aria-label="OpenKline chart workspace">
          <div className={styles.chartFrame}>
            <FinancialChart
              ref={handleRef}
              autoSize
              theme={theme}
              locale={locale}
              timeZone={timeZone}
              pricePrecision={pricePrecision}
              interaction={interaction}
              onChartReady={initializeChart}
              onCrosshairMove={setCrosshair}
              style={{ height: "100%" }}
            />
          </div>
          <div className={styles.status} aria-live="polite"><span>{textForCrosshair(crosshair)}</span><span>{notice}</span></div>
        </section>

        <aside className={styles.sidebar} aria-label="Chart settings">
          <div className={styles.panelHeading}><h2>Settings</h2></div>
          <details className={styles.alertPanel} open>
            <summary>Alerts ({alerts.length})</summary>
            <div className={styles.alertForm}>
              <label>Name<input aria-label="Alert name" value={alertName} disabled={replayActive} onChange={(event) => setAlertName(event.target.value)} /></label>
              <label>Close crosses above<input aria-label="Alert threshold" type="number" value={alertThreshold} disabled={replayActive} onChange={(event) => setAlertThreshold(Number(event.target.value))} /></label>
              <label>Frequency<select aria-label="Alert frequency" value={alertFrequency} disabled={replayActive} onChange={(event) => setAlertFrequency(event.target.value as AlertFrequency)}>
                <option value="once">Once</option>
                <option value="every-event">Every event</option>
                <option value="once-per-bar">Once per bar</option>
                <option value="once-per-confirmed-bar">Confirmed bars</option>
              </select></label>
              <button type="button" disabled={replayActive} onClick={addPriceAlert}>Create alert</button>
            </div>
            {alerts.length === 0 ? <small>No alerts configured.</small> : <ul className={styles.alertList}>{alerts.map((alert) => <li key={alert.id} className={styles.alertItem}>
              <span title={alert.id}>{alert.name}<small>{alert.condition.type} · {alert.frequency}</small></span>
              <button type="button" disabled={replayActive} onClick={() => toggleAlert(alert)}>{alert.enabled === false ? "Enable" : "Pause"}</button>
              <button type="button" disabled={replayActive} aria-label={`Remove ${alert.name}`} onClick={() => removeAlert(alert.id)}>×</button>
            </li>)}</ul>}
            <div className={styles.alertHistoryHeading}><small>Recent events</small><button type="button" onClick={() => { chart()?.clearAlertHistory(); refreshAlerts(); }}>Clear</button></div>
            {alertHistory.length === 0 ? <small>No alert events yet.</small> : <ul className={styles.alertList}>{alertHistory.slice(-6).reverse().map((event) => <li key={event.eventId} className={styles.alertEvent}><span>{event.alertName}<small>{new Date(event.barTimestamp).toLocaleString()}</small></span>{event.simulated ? <em>SIM</em> : <em>LIVE</em>}</li>)}</ul>}
          </details>
          <details className={styles.orderFlowPanel} open>
            <summary>Order Flow &amp; Market Depth</summary>
            <p className={styles.orderFlowDisclaimer}>Illustrative offline fixtures only; these prints and levels are not observed exchange transactions.</p>
            <label className={styles.check}><input type="checkbox" checked={footprintVisible} disabled={replayActive} onChange={(event) => { const next = event.target.checked; setFootprintVisible(next); const target = chart(); target?.setFootprintOptions({ visible: next }); refreshOrderFlow(target); }} />Footprint</label>
            <label className={styles.check}><input type="checkbox" checked={cvdVisible} disabled={replayActive} onChange={(event) => { const next = event.target.checked; setCvdVisible(next); const target = chart(); target?.setCvdOptions({ visible: next, reset: cvdReset }); refreshOrderFlow(target); }} />CVD pane</label>
            <label>CVD reset<select value={cvdReset} disabled={replayActive} onChange={(event) => { const next = event.target.value as "continuous" | "session"; setCvdReset(next); const target = chart(); target?.setCvdOptions({ reset: next }); refreshOrderFlow(target); }}><option value="continuous">Continuous</option><option value="session">Trading session</option></select></label>
            <label className={styles.check}><input type="checkbox" checked={depthVisible} disabled={replayActive} onChange={(event) => { const next = event.target.checked; setDepthVisible(next); const target = chart(); target?.setDepthOptions({ visible: next }); refreshOrderFlow(target); }} />Depth view</label>
            <label className={styles.check}><input type="checkbox" checked={depthHeatmap} disabled={replayActive} onChange={(event) => { const next = event.target.checked; setDepthHeatmap(next); const target = chart(); target?.setDepthOptions({ showHeatmap: next, visible: depthVisible }); refreshOrderFlow(target); }} />Liquidity heatmap</label>
            <div className={styles.orderFlowSummary} aria-live="polite">
              <span>Coverage <strong>{orderFlowState?.tradeCoverage ?? "empty"}</strong></span>
              <span>Book <strong>{orderFlowState?.depth?.status ?? "uninitialized"}</strong></span>
              <span>Best bid <strong>{orderFlowState?.depthMetrics?.bestBid ?? "—"}</strong></span>
              <span>Best ask <strong>{orderFlowState?.depthMetrics?.bestAsk ?? "—"}</strong></span>
              <span>Spread <strong>{orderFlowState?.depthMetrics?.spread ?? "—"}</strong></span>
              <span>Imbalance <strong>{orderFlowState?.depthMetrics?.imbalance?.toFixed(3) ?? "—"}</strong></span>
            </div>
            {cvdReset === "session" ? <small className={styles.orderFlowWarning}>Session reset requires an explicit exchange calendar; this offline Studio fixture keeps CVD unavailable until one is attached.</small> : null}
            <details>
              <summary>Time &amp; Sales ({timeAndSales.length})</summary>
              {timeAndSales.length === 0 ? <small>No illustrative trades are loaded.</small> : <ul className={styles.timeAndSalesList}>{timeAndSales.slice().reverse().map((trade) => <li key={trade.id}><time>{new Date(trade.time).toLocaleTimeString()}</time><span>{trade.price}</span><span>{trade.quantity}</span><strong className={trade.aggressorSide === "buy" ? styles.orderFlowBuy : trade.aggressorSide === "sell" ? styles.orderFlowSell : styles.orderFlowUnknown}>{trade.aggressorSide}</strong></li>)}</ul>}
            </details>
          </details>
          <label>Theme<select value={theme} onChange={(event) => updateTheme(event.target.value as "dark" | "light")}><option value="dark">Dark</option><option value="light">Light</option></select></label>
          <label>Locale<select value={locale} onChange={(event) => { const next = event.target.value; chart()?.setOptions({ locale: next }); setLocale(next); }}><option value="en-US">English (US)</option><option value="de-DE">Deutsch</option><option value="fa-IR">فارسی</option></select></label>
          <label>Timezone<select value={timeZone} onChange={(event) => { const next = event.target.value; chart()?.setOptions({ timeZone: next }); setTimeZone(next); }}><option value="UTC">UTC</option><option value="America/New_York">New York</option><option value="Asia/Tehran">Tehran</option></select></label>
          <label>Precision<select value={pricePrecision} onChange={(event) => { const next = Number(event.target.value); chart()?.setOptions({ pricePrecision: next }); setPricePrecision(next); }}><option value={0}>0</option><option value={2}>2</option><option value={4}>4</option><option value={6}>6</option></select></label>
          <fieldset><legend>Price scale</legend>
            <label>Mode<select aria-label="Price scale" value={scaleMode} onChange={(event) => updateScaleMode(event.target.value as PriceScaleMode)}>{scaleModes.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label>
            <label className={styles.check}><input aria-label="Auto scale" type="checkbox" checked={autoScale} onChange={(event) => updateAutoScale(event.target.checked)} />Auto scale</label>
            <label className={styles.check}><input aria-label="Show price axis" type="checkbox" checked={axisVisible} onChange={(event) => updateAxisVisibility(event.target.checked)} />Show price axis</label>
            <label>Top margin<input aria-label="Top scale margin" type="number" min="0" max="0.99" step="0.01" value={marginTop} onChange={(event) => updateMargin("top", Number(event.target.value))} /></label>
            <label>Bottom margin<input aria-label="Bottom scale margin" type="number" min="0" max="0.99" step="0.01" value={marginBottom} onChange={(event) => updateMargin("bottom", Number(event.target.value))} /></label>
            <button type="button" onClick={() => { const target = chart(); target?.resetPriceScale(); if (target !== null) syncDisplayPreferences(target); setNotice("Price scale reset to visible data."); }}>Reset scale</button>
          </fieldset>
          <fieldset><legend>Interaction</legend>{(Object.keys(interaction) as Array<keyof typeof interaction>).map((name) => <label key={name} className={styles.check}><input type="checkbox" checked={interaction[name]} onChange={() => updateInteraction(name)} />{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</label>)}</fieldset>
          <button type="button" onClick={() => { chart()?.pan(-20); setNotice("Panned twenty bars toward history."); }}>Pan history</button>
          <button type="button" onClick={() => { chart()?.zoom(0.75); setNotice("Zoomed in around the centre."); }}>Zoom in</button>
        </aside>
      </section>
    </main>
  );
}
