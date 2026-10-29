"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { FinancialChart } from "@openkline/react";
import type { FinancialChartHandle } from "@openkline/react";
import {
  WatchlistModel,
  ChartSynchronizationController,
  createDeterministicDemoQuoteProvider,
  createDefaultIndicatorRegistry,
  migrateLegacyWorkspace,
  parseStudioWorkspace,
  type AlertDefinition,
  type AlertEvent,
  type AlertFrequency,
  type BacktestResult,
  type Candle,
  type Chart,
  type ChartSeriesInfo,
  type CrosshairMoveEvent,
  type DrawingSnapshot,
  type PriceScaleMode,
  type ReplayApi,
  type ReplayStatus,
  type StudioLayout,
  type StudioWorkspaceDocument,
  type WatchlistDocument,
  type WatchlistQuote,
  type WorkspaceDocument,
} from "openkline";
import type { IndicatorCategory } from "openkline";
import styles from "./studio.module.css";
import { KlineScriptStudioEditor } from "./klinescript-studio-editor";
import { StrategyTester } from "./strategy-tester";
import { StrategyOptimizer } from "./strategy-optimizer";
import { PaperTradingPanel } from "./paper-trading-panel";
import { ScreenerPanel } from "./screener-panel";

type Timeframe = "5m" | "1h" | "4h" | "1D";
type Presentation = "candles" | "ohlc" | "hollow" | "heikin-ashi" | "line" | "area" | "baseline";

interface PanelState {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
}

interface PanelSnapshot {
  readonly series: readonly ChartSeriesInfo[];
  readonly indicators: ReadonlyArray<{ id: string; indicatorId: string; paneId: string }>;
  readonly drawings: readonly DrawingSnapshot[];
  readonly alerts: readonly AlertDefinition[];
  readonly alertHistory: readonly AlertEvent[];
  readonly replayStatus: ReplayStatus;
  readonly replaySourceLength: number;
  readonly replayStartIndex: number;
}

interface StudioDialog {
  readonly kind: "confirm" | "prompt";
  readonly title: string;
  readonly message: string;
  readonly initialValue?: string;
  readonly onSubmit: (value: string) => void;
}

interface ChartPanelHandle {
  getChart(): Chart | null;
  refresh(): void;
  getSnapshot(): PanelSnapshot;
  replaceMarketData(symbol: string, timeframe: Timeframe): void;
  restoreWorkspace(document: WorkspaceDocument): void;
  enterReplay(): void;
  replayCommand(command: (replay: ReplayApi) => void): void;
  exitReplay(): void;
  setReplayStartIndex(index: number): void;
}

interface ChartPanelProps {
  readonly panel: PanelState;
  readonly active: boolean;
  readonly initialWorkspace?: WorkspaceDocument;
  readonly onActivate: (panelId: string) => void;
  readonly onReady: (panelId: string, chart: Chart) => void;
  readonly onSnapshot: (panelId: string, snapshot: PanelSnapshot) => void;
  readonly onCrosshair: (panelId: string, event: CrosshairMoveEvent) => void;
  readonly onViewport: (panelId: string, range: { from: number; to: number }) => void;
  readonly onNotice: (message: string) => void;
}

const WORKSPACES_KEY = "openkline-studio-workspaces-v1";
const LEGACY_WORKSPACE_KEY = "openkline-studio-workspace-v1";
const DEFAULT_WORKSPACE_ID = "studio-default";
const symbols = ["BTC-USD", "ETH-USD", "AAPL"] as const;
const timeframes: readonly Timeframe[] = ["5m", "1h", "4h", "1D"];
const layoutChoices: ReadonlyArray<readonly [StudioLayout, string]> = [
  ["single", "Single chart"],
  ["two-horizontal", "Two side by side"],
  ["two-vertical", "Two vertical"],
  ["four-grid", "Four chart grid"],
];
const indicatorChoices = [
  ["SMA", "SMA · 20"], ["EMA", "EMA · 20"], ["RSI", "RSI · 14"],
  ["MACD", "MACD · 12/26/9"], ["BOLLINGER_BANDS", "Bollinger Bands · 20"],
  ["ATR", "ATR · 14"], ["STOCHASTIC", "Stochastic · 14/3"], ["VWAP", "VWAP · UTC day"],
  ["ROC", "ROC · 14"], ["CCI", "CCI · 20"], ["WILLIAMS_R", "Williams %R · 14"],
  ["OBV", "OBV"], ["MFI", "MFI · 14"], ["ADX", "ADX · 14 (+DI/-DI)"],
  ["DONCHIAN_CHANNELS", "Donchian Channels · 20"], ["KELTNER_CHANNELS", "Keltner Channels · 20/2"],
] as const;
const indicatorRegistry = createDefaultIndicatorRegistry();
const indicatorCatalog = indicatorChoices.map(([id, label]) => ({ id, label, category: indicatorRegistry.getMetadata(id).category ?? "custom" as IndicatorCategory }));
const indicatorCategories = ["all", ...new Set(indicatorCatalog.map((item) => item.category))];
const drawingTools = [
  ["trend-line", "Trend"], ["ray", "Ray"], ["extended-line", "Extended"], ["parallel-channel", "Channel"],
  ["horizontal-line", "Horizontal"], ["vertical-line", "Vertical"], ["rectangle", "Rectangle"],
  ["fibonacci-retracement", "Fib retrace"], ["fibonacci-extension", "Fib extend"], ["price-range", "Price range"],
  ["date-range", "Date range"], ["long-position", "Long R:R"], ["short-position", "Short R:R"], ["text", "Text"],
] as const;
const presentationChoices: ReadonlyArray<readonly [Presentation, string]> = [
  ["candles", "Candles"], ["ohlc", "OHLC"], ["hollow", "Hollow"], ["heikin-ashi", "Heikin-Ashi"], ["line", "Line"], ["area", "Area"], ["baseline", "Baseline"],
];
const scaleModes: ReadonlyArray<readonly [PriceScaleMode, string]> = [["linear", "Linear"], ["logarithmic", "Log"], ["percentage", "%"], ["indexed", "Index 100"]];
const defaultScript = ['indicator("Studio EMA")', 'period = input.int("Period", default=21, min=1, max=200)', "value = ta.ema(close, period)", 'plot(value, title="EMA", color="#a78bfa")'].join("\n");
const IDLE_REPLAY_STATUS: ReplayStatus = { state: "idle", currentIndex: null, currentTimestamp: null, totalBars: 0, speed: 1 };

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
    return { time: start + index * interval, open, high: Math.max(open, close) + spread, low: Math.min(open, close) - spread, close, volume: 120 + ((index * 17 + seed) % 180) * 8 };
  });
}

function pricePoints(candles: readonly Candle[]) { return candles.map((candle) => ({ time: candle.time, value: candle.close })); }
function volumePoints(candles: readonly Candle[]) { return candles.map((candle) => ({ time: candle.time, value: candle.volume ?? 0, color: candle.close >= candle.open ? "#34d39999" : "#fb718599" })); }
function indicatorParameters(id: string, overrides: { readonly period?: number; readonly constant?: number; readonly multiplier?: number } = {}): Record<string, unknown> {
  const defaults: Record<string, unknown> = (() => {
    switch (id) {
    case "MACD": return { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 };
    case "BOLLINGER_BANDS": return { period: 20, standardDeviations: 2 };
    case "STOCHASTIC": return { kPeriod: 14, dPeriod: 3 };
    case "VWAP": return { session: "utc-day" };
    case "CCI": return { period: 20, constant: 0.015 };
    case "KELTNER_CHANNELS": return { period: 20, multiplier: 2 };
    case "OBV": return {};
    default: return { period: 14 };
    }
  })();
  if (overrides.period !== undefined && "period" in defaults) defaults.period = overrides.period;
  if (overrides.constant !== undefined && id === "CCI") defaults.constant = overrides.constant;
  if (overrides.multiplier !== undefined && id === "KELTNER_CHANNELS") defaults.multiplier = overrides.multiplier;
  return defaults;
}
function chartCount(layout: StudioLayout): number { return layout === "single" ? 1 : layout === "four-grid" ? 4 : 2; }
function textForCrosshair(event: CrosshairMoveEvent | null): string { return event?.time === null || event?.time === undefined || event?.price === null ? "Move across a chart for timestamp and price" : `${new Date(event.time).toLocaleString()} · ${event.formattedPrice ?? event.price.toLocaleString()}`; }
function textForReplay(status: ReplayStatus, timeZone: string): string { return status.currentTimestamp === null ? "No current bar" : new Date(status.currentTimestamp).toLocaleString(undefined, { timeZone }); }
function panelKey(panel: PanelState): string { return `${panel.symbol}|${panel.timeframe}`; }

function emptySnapshot(): PanelSnapshot {
  return { series: [], indicators: [], drawings: [], alerts: [], alertHistory: [], replayStatus: IDLE_REPLAY_STATUS, replaySourceLength: 0, replayStartIndex: 84 };
}

function syncMainPaneDiagnostics(target: Chart, root: HTMLElement | null): void {
  // ResizeObserver and publish microtasks can run after Chart.destroy(); never throw into page errors.
  try {
    const canvas = root?.querySelector("canvas");
    const bounds = target.getPrimaryDrawingPaneBounds();
    if (!(canvas instanceof HTMLCanvasElement) || bounds === null || bounds.chartWidth <= 0 || bounds.chartHeight <= 0) return;
    canvas.dataset.openklineMainPane = JSON.stringify({
      topFraction: Number((bounds.top / bounds.chartHeight).toFixed(4)),
      bottomFraction: Number((bounds.bottom / bounds.chartHeight).toFixed(4)),
      leftFraction: Number((bounds.left / bounds.chartWidth).toFixed(4)),
      rightFraction: Number((bounds.right / bounds.chartWidth).toFixed(4)),
      chartWidth: bounds.chartWidth,
      chartHeight: bounds.chartHeight,
      paneCount: target.getPaneIds().length,
    });
  } catch {
    return;
  }
}

const ChartPanel = forwardRef<ChartPanelHandle, ChartPanelProps>(function ChartPanel({ panel, active, initialWorkspace, onActivate, onReady, onSnapshot, onCrosshair, onViewport, onNotice }, ref) {
  const chartHandle = useRef<FinancialChartHandle>(null);
  const chartRef = useRef<Chart | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const replayRef = useRef<ReplayApi | null>(null);
  const replayUnsubscribeRef = useRef<(() => void) | null>(null);
  const symbolWorkspacesRef = useRef(new Map<string, WorkspaceDocument>());
  const initializedRef = useRef(false);
  const marketKeyRef = useRef(panelKey(panel));
  const [snapshot, setSnapshot] = useState<PanelSnapshot>(emptySnapshot);
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);
  const [visibleTimeRange, setVisibleTimeRange] = useState<{ readonly from: number | null; readonly to: number | null } | null>(null);

  const publish = useCallback((target = chartRef.current, replayStatus = snapshot.replayStatus, replaySourceLength = snapshot.replaySourceLength, replayStartIndex = snapshot.replayStartIndex): void => {
    if (target === null) return;
    const workspace = target.serializeWorkspace();
    const next: PanelSnapshot = {
      series: target.getSeriesInfo(),
      indicators: workspace.indicators.map((indicator) => ({ id: indicator.id, indicatorId: indicator.indicatorId, paneId: indicator.paneId })),
      drawings: target.getDrawings(), alerts: target.getAlerts(), alertHistory: target.getAlertHistory(), replayStatus, replaySourceLength, replayStartIndex,
    };
    setSnapshot(next);
    onSnapshot(panel.panelId, next);
    queueMicrotask(() => syncMainPaneDiagnostics(target, rootRef.current));
  }, [onSnapshot, panel.panelId, snapshot.replaySourceLength, snapshot.replayStartIndex, snapshot.replayStatus]);

  const seedChart = useCallback((target: Chart, symbol: string, timeframe: Timeframe): void => {
    const candles = buildCandles(symbol, timeframe);
    const price = target.addCandlestickSeries({ id: "studio-price", title: "Price", style: { upColor: "#34d399", downColor: "#fb7185" } });
    const ohlc = target.addOhlcSeries({ id: "studio-ohlc", title: "OHLC", style: { upColor: "#34d399", downColor: "#fb7185", visible: false } });
    const hollow = target.addHollowCandlestickSeries({ id: "studio-hollow", title: "Hollow candles", style: { hollowUpColor: "#34d399", downColor: "#fb7185", visible: false } });
    const heikin = target.addHeikinAshiSeries({ id: "studio-heikin", title: "Heikin-Ashi", style: { upColor: "#a78bfa", downColor: "#f472b6", visible: false } });
    const line = target.addLineSeries({ id: "studio-line", title: "Close", style: { color: "#60a5fa", lineWidth: 2, visible: false } });
    const area = target.addAreaSeries({ id: "studio-area", title: "Close area", style: { color: "#a78bfa", fillColor: "#8b5cf6", fillOpacity: 0.2, visible: false } });
    const baseline = target.addBaselineSeries({ id: "studio-baseline", title: "Close vs first", style: { baseline: candles[0]?.close ?? 0, aboveColor: "#34d399", belowColor: "#fb7185", visible: false } });
    const volume = target.addVolumeSeries({ id: "studio-volume", title: "Volume" });
    price.setData(candles); ohlc.setData(candles); hollow.setData(candles); heikin.setData(candles); line.setData(pricePoints(candles)); area.setData(pricePoints(candles)); baseline.setData(pricePoints(candles)); volume.setData(volumePoints(candles));
    target.addIndicator("SMA", { id: "studio-sma", pane: "main", parameters: { period: 20 } });
    target.addIndicator("RSI", { id: "studio-rsi", pane: "new", parameters: { period: 14 } });
    marketKeyRef.current = `${symbol}|${timeframe}`;
    publish(target, IDLE_REPLAY_STATUS, candles.length, Math.floor(candles.length * 0.35));
  }, [publish]);

  const attachChart = useCallback((target: Chart): void => {
    chartRef.current = target;
    if (initialWorkspace === undefined) seedChart(target, panel.symbol, panel.timeframe);
    else {
      try { target.restoreWorkspace(initialWorkspace); publish(target, IDLE_REPLAY_STATUS, target.getData().length, Math.floor(target.getData().length * 0.35)); }
      catch { seedChart(target, panel.symbol, panel.timeframe); onNotice(`Panel ${panel.panelId} had an invalid saved chart; deterministic data was restored.`); }
    }
    initializedRef.current = true;
    setVisibleTimeRange(target.getVisibleTimeRange());
    onReady(panel.panelId, target);
    target.subscribe("crosshairMove", (event) => { setCrosshairTime(event.time); onCrosshair(panel.panelId, event); });
    target.subscribe("viewportChange", (range) => {
      setVisibleTimeRange(target.getVisibleTimeRange());
      onViewport(panel.panelId, range);
      syncMainPaneDiagnostics(target, rootRef.current);
    });
    target.subscribe("drawingSelection", () => publish());
    target.subscribe("indicatorChange", () => publish());
    target.subscribe("alertTriggered", (event) => { publish(); onNotice(`${event.simulated ? "Simulated" : "Live"} alert on ${panel.symbol}: ${event.alertName}`); });
    target.subscribe("alertError", (diagnostic) => onNotice(`Alert ${diagnostic.alertId} failed: ${diagnostic.message}`));
    syncMainPaneDiagnostics(target, rootRef.current);
  }, [initialWorkspace, onCrosshair, onNotice, onReady, onViewport, panel.panelId, panel.symbol, panel.timeframe, publish, seedChart]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
      const target = chartRef.current;
      if (target === null || chartRef.current !== target) return;
      syncMainPaneDiagnostics(target, root);
    });
    observer.observe(root);
    return () => {
      observer.disconnect();
    };
  }, []);

  const replaceMarketData = useCallback((symbol: string, timeframe: Timeframe): void => {
    const target = chartRef.current;
    if (target === null || !initializedRef.current) return;
    const oldKey = marketKeyRef.current;
    const current = target.serializeWorkspace({ symbol, timeframe });
    symbolWorkspacesRef.current.set(oldKey, current);
    const saved = symbolWorkspacesRef.current.get(`${symbol}|${timeframe}`);
    const candles = buildCandles(symbol, timeframe);
    const base = saved ?? current;
    const { alerts: _alerts, ...withoutAlerts } = base;
    const nextWorkspace: WorkspaceDocument = {
      ...withoutAlerts,
      metadata: { symbol, timeframe },
      drawings: saved?.drawings ?? { version: 1, drawings: [] },
      series: base.series.map((series) => ({ ...series, data: series.type === "volume" || series.type === "histogram" ? volumePoints(candles) : (series.type === "line" || series.type === "area" || series.type === "baseline" ? pricePoints(candles) : candles) })),
    };
    try { target.restoreWorkspace(nextWorkspace); marketKeyRef.current = `${symbol}|${timeframe}`; publish(target, IDLE_REPLAY_STATUS, candles.length, Math.floor(candles.length * 0.35)); onNotice(`${panel.panelId}: loaded ${symbol} at ${timeframe}; symbol-scoped drawings were restored only when previously saved.`); }
    catch (error) { onNotice(`Could not change ${panel.panelId}: ${error instanceof Error ? error.message : String(error)}`); }
  }, [onNotice, panel.panelId, publish]);

  const restoreWorkspace = useCallback((document: WorkspaceDocument): void => {
    const target = chartRef.current;
    if (target === null) return;
    try { target.restoreWorkspace(document); publish(target, IDLE_REPLAY_STATUS, target.getData().length, Math.floor(target.getData().length * 0.35)); }
    catch (error) { onNotice(`Could not restore ${panel.panelId}: ${error instanceof Error ? error.message : String(error)}`); }
  }, [onNotice, panel.panelId, publish]);

  const enterReplay = useCallback((): void => {
    const target = chartRef.current;
    if (target === null) return;
    try {
      const source = target.getData();
      if (source.length < 2) { onNotice("Replay needs at least two bars."); return; }
      const startIndex = Math.min(Math.max(0, snapshot.replayStartIndex), source.length - 1);
      const replay = target.createReplay({ source, startAt: source[startIndex]!.time, speed: 2 });
      replayRef.current = replay;
      replayUnsubscribeRef.current?.();
      replayUnsubscribeRef.current = replay.subscribe((status) => publish(target, status, source.length, startIndex));
      replay.start();
    } catch (error) { onNotice(`Could not start replay: ${error instanceof Error ? error.message : String(error)}`); }
  }, [onNotice, publish, snapshot.replayStartIndex]);

  const exitReplay = useCallback((): void => {
    const replay = replayRef.current;
    if (replay === null) return;
    try { replay.exit(); publish(chartRef.current, IDLE_REPLAY_STATUS, snapshot.replaySourceLength, snapshot.replayStartIndex); }
    catch (error) { onNotice(`Could not exit replay: ${error instanceof Error ? error.message : String(error)}`); }
    finally { replayUnsubscribeRef.current?.(); replayUnsubscribeRef.current = null; replay.dispose(); replayRef.current = null; }
  }, [onNotice, publish, snapshot.replaySourceLength, snapshot.replayStartIndex]);

  useImperativeHandle(ref, () => ({
    getChart: () => chartRef.current,
    refresh: () => publish(),
    getSnapshot: () => snapshot,
    replaceMarketData,
    restoreWorkspace,
    enterReplay,
    replayCommand: (command) => { if (replayRef.current !== null) command(replayRef.current); },
    exitReplay,
    setReplayStartIndex: (index) => setSnapshot((current) => ({ ...current, replayStartIndex: index })),
  }), [enterReplay, exitReplay, publish, replaceMarketData, restoreWorkspace, snapshot]);

  useEffect(() => {
    const nextKey = panelKey(panel);
    if (initializedRef.current && nextKey !== marketKeyRef.current) replaceMarketData(panel.symbol, panel.timeframe);
  }, [panel.symbol, panel.timeframe, replaceMarketData]);

  useEffect(() => () => { replayUnsubscribeRef.current?.(); replayRef.current?.dispose(); replayRef.current = null; }, []);

  const visibleRangeLabel = visibleTimeRange === null || visibleTimeRange.from === null || visibleTimeRange.to === null ? "empty" : `${visibleTimeRange.from}:${visibleTimeRange.to}`;
  return <article ref={rootRef} className={`${styles.multiChartPanel} ${active ? styles.multiChartPanelActive : ""}`} onPointerDown={() => onActivate(panel.panelId)} data-panel-id={panel.panelId} data-crosshair-time={crosshairTime === null ? "" : String(crosshairTime)} data-visible-time-range={visibleRangeLabel}>
    <header className={styles.multiPanelHeader}><button type="button" className={styles.panelSelect} aria-label={`Activate ${panel.panelId}`} aria-pressed={active} onClick={() => onActivate(panel.panelId)}>{panel.panelId} · {panel.symbol} · {panel.timeframe}</button><span>{snapshot.indicators.length} indicators</span><span>{snapshot.drawings.length} drawings</span><span aria-label={`UTC crosshair for ${panel.panelId}`}>{crosshairTime === null ? "Crosshair —" : `Crosshair ${new Date(crosshairTime).toISOString()}`}</span></header>
    <div className={styles.multiChartCanvas}><FinancialChart ref={chartHandle} autoSize theme="dark" locale="en-US" timeZone="UTC" pricePrecision={2} onChartReady={attachChart} style={{ height: "100%" }} /></div>
  </article>;
});

function defaultWatchlists(): WatchlistDocument {
  return { version: 1, selectedWatchlistId: "watchlist-favorites", lists: [{ id: "watchlist-favorites", name: "Favorites", symbols: symbols.map((displaySymbol, index) => ({ id: displaySymbol, displaySymbol, name: displaySymbol === "BTC-USD" ? "Bitcoin" : displaySymbol === "ETH-USD" ? "Ether" : "Apple Inc.", exchange: displaySymbol === "AAPL" ? "NASDAQ" : "Demo", assetCategory: displaySymbol === "AAPL" ? "Equity" : "Crypto", quoteCurrency: "USD", favorite: index === 0 })) }] };
}

interface StoredWorkspaces { readonly version: 1; readonly currentId: string; readonly workspaces: readonly StudioWorkspaceDocument[]; }

function parseStoredWorkspaces(value: unknown): StoredWorkspaces {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid workspace collection");
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || typeof record.currentId !== "string" || !Array.isArray(record.workspaces)) throw new Error("Invalid workspace collection");
  const workspaces = record.workspaces.map((item) => parseStudioWorkspace(item));
  if (workspaces.length === 0) throw new Error("Workspace collection is empty");
  if (!workspaces.some((item) => item.id === record.currentId)) throw new Error("Current workspace is missing");
  return { version: 1, currentId: record.currentId, workspaces };
}

export default function MultiChartStudioClient() {
  const panelRefs = useRef(new Map<string, ChartPanelHandle>());
  const strategyResultsRef = useRef(new Map<string, BacktestResult>());
  const appliedStrategyParametersRef = useRef(new Map<string, { readonly strategyId: string; readonly parameters: Readonly<Record<string, unknown>> }>());
  const archivedPanelsRef = useRef(new Map<string, { panel: PanelState; workspace?: WorkspaceDocument }>());
  const pendingRestoreRef = useRef<StudioWorkspaceDocument | null>(null);
  const syncControllerRef = useRef<ChartSynchronizationController | null>(null);
  if (syncControllerRef.current === null) {
    syncControllerRef.current = new ChartSynchronizationController();
  }
  const serialRef = useRef(2);
  const [layout, setLayout] = useState<StudioLayout>("single");
  const [panels, setPanels] = useState<PanelState[]>([{ panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h" }]);
  const [activePanelId, setActivePanelId] = useState("chart-1");
  const [snapshots, setSnapshots] = useState<Record<string, PanelSnapshot>>({});
  const [sync, setSync] = useState({ crosshair: false, visibleRange: false, symbol: false, timeframe: false });
  const [watchlistModel, setWatchlistModel] = useState(() => new WatchlistModel(defaultWatchlists(), (prefix) => `${prefix}-studio-${serialRef.current++}`));
  const [watchlists, setWatchlists] = useState<WatchlistDocument>(() => watchlistModel.getDocument());
  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Default workspace");
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [workspaceIds, setWorkspaceIds] = useState<string[]>([DEFAULT_WORKSPACE_ID]);
  const [notice, setNotice] = useState("Ready. Multi-chart Studio uses deterministic demo data; no vendor credentials are required.");
  const [crosshair, setCrosshair] = useState<CrosshairMoveEvent | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptSource, setScriptSource] = useState(defaultScript);
  const [indicatorToAdd, setIndicatorToAdd] = useState<(typeof indicatorChoices)[number][0]>("SMA");
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorCategory, setIndicatorCategory] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIndicatorIds, setFavoriteIndicatorIds] = useState<string[]>(["SMA", "EMA", "RSI"]);
  const [indicatorPeriodOverride, setIndicatorPeriodOverride] = useState("");
  const [indicatorConstant, setIndicatorConstant] = useState("0.015");
  const [indicatorMultiplier, setIndicatorMultiplier] = useState("2");
  const [presentation, setPresentation] = useState<Presentation>("candles");
  const [scaleMode, setScaleMode] = useState<PriceScaleMode>("linear");
  const [autoScale, setAutoScale] = useState(true);
  const [axisVisible, setAxisVisible] = useState(true);
  const [marginTop, setMarginTop] = useState(0.08);
  const [marginBottom, setMarginBottom] = useState(0.08);
  const timeZone = "UTC";
  const [interaction, setInteraction] = useState({ wheelZoom: true, pointerPan: true, crosshair: true, keyboardShortcuts: true });
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [alertName, setAlertName] = useState("Close crosses threshold");
  const alertNameInputRef = useRef<HTMLInputElement>(null);
  const [lastAlertDiagnostic, setLastAlertDiagnostic] = useState<{ readonly inputValue: string; readonly createdName: string; readonly outcome: "accepted" | "rejected" } | null>(null);
  const [alertThreshold, setAlertThreshold] = useState(0);
  const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>("once-per-bar");
  const [dialog, setDialog] = useState<StudioDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dialogWasOpenRef = useRef(false);

  const showConfirm = (title: string, message: string, onConfirm: () => void, trigger?: HTMLElement | null): void => {
    dialogTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogWasOpenRef.current = true;
    setDialogValue("");
    setDialog({ kind: "confirm", title, message, onSubmit: () => { setDialog(null); onConfirm(); } });
  };
  const showPrompt = (title: string, message: string, initialValue: string, onSubmit: (value: string) => void, trigger?: HTMLElement | null): void => {
    dialogTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogWasOpenRef.current = true;
    setDialogValue(initialValue);
    setDialog({ kind: "prompt", title, message, initialValue, onSubmit: (value) => { setDialog(null); onSubmit(value); } });
  };

  useEffect(() => {
    if (dialog !== null) return undefined;
    if (!dialogWasOpenRef.current) return undefined;
    dialogWasOpenRef.current = false;
    const trigger = dialogTriggerRef.current;
    dialogTriggerRef.current = null;
    if (trigger !== null && document.contains(trigger)) trigger.focus();
    return undefined;
  }, [dialog]);

  // useLayoutEffect so initial focus lands before Playwright's focus assertion on WebKit/Safari.
  useLayoutEffect(() => {
    if (dialog === null) return undefined;
    const dialogElement = dialogRef.current;
    if (dialogElement === null) return undefined;
    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex=\"-1\"])";
    const getFocusable = (): HTMLElement[] => Array.from(dialogElement.querySelectorAll<HTMLElement>(focusableSelector));
    const preferred = dialog.kind === "prompt"
      ? dialogElement.querySelector<HTMLElement>('input[aria-label="Dialog value"]')
      : getFocusable()[0];
    preferred?.focus();
    if (preferred !== null && preferred !== undefined && document.activeElement !== preferred) getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDialog(null);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const current = document.activeElement;
      const index = focusable.indexOf(current as HTMLElement);
      if (event.shiftKey && (index === 0 || index === -1)) {
        event.preventDefault();
        focusable[focusable.length - 1]?.focus();
      } else if (!event.shiftKey && (index === focusable.length - 1 || index === -1)) {
        event.preventDefault();
        focusable[0]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  const activePanel = panels.find((panel) => panel.panelId === activePanelId) ?? panels[0]!;
  const activeHandle = panelRefs.current.get(activePanel.panelId) ?? null;
  const activeSnapshot = snapshots[activePanel.panelId] ?? activeHandle?.getSnapshot() ?? emptySnapshot();
  const replayActive = activeSnapshot.replayStatus.state !== "idle" && activeSnapshot.replayStatus.state !== "disposed";
  const selectedList = watchlists.lists.find((list) => list.id === watchlists.selectedWatchlistId) ?? watchlists.lists[0];
  const filteredSymbols = selectedList?.symbols.filter((symbol) => `${symbol.displaySymbol} ${symbol.name}`.toLowerCase().includes(watchlistSearch.toLowerCase())) ?? [];
  const filteredIndicatorCatalog = indicatorCatalog.filter((item) => (indicatorCategory === "all" || item.category === indicatorCategory) && (!favoritesOnly || favoriteIndicatorIds.includes(item.id)) && item.label.toLowerCase().includes(indicatorSearch.toLowerCase()));
  const selectedIndicatorMetadata = indicatorRegistry.getMetadata(indicatorToAdd);

  const onChartReady = useCallback((panelId: string, chart: Chart): void => {
    const controller = syncControllerRef.current;
    if (controller === null) return;
    if (controller.hasChart(panelId)) controller.removeChart(panelId);
    controller.addChart(panelId, chart);
  }, []);

  useEffect(() => {
    syncControllerRef.current?.setOptions({ crosshair: sync.crosshair, visibleRange: sync.visibleRange });
  }, [sync.crosshair, sync.visibleRange]);

  useEffect(() => {
    if (!replayActive) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") { event.preventDefault(); activeHandle?.replayCommand((replay) => replay.stepForward()); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); activeHandle?.replayCommand((replay) => replay.stepBackward()); }
      else if (event.key === " ") { event.preventDefault(); activeHandle?.replayCommand((replay) => activeSnapshot.replayStatus.state === "playing" ? replay.pause() : replay.play()); }
      else if (event.key === "Escape") { event.preventDefault(); activeHandle?.exitReplay(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeHandle, activeSnapshot.replayStatus.state, replayActive]);

  useEffect(() => watchlistModel.subscribe(setWatchlists), [watchlistModel]);

  useEffect(() => {
    const provider = createDeterministicDemoQuoteProvider();
    const ids = selectedList?.symbols.map((symbol) => symbol.id) ?? [];
    return provider.subscribe(ids, (updates) => setQuotes((current) => ({ ...current, ...Object.fromEntries(updates.map((quote) => [quote.symbolId, quote])) })));
  }, [selectedList]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WORKSPACES_KEY);
      if (stored !== null) {
        const parsed = parseStoredWorkspaces(JSON.parse(stored));
        const current = parsed.workspaces.find((item) => item.id === parsed.currentId)!;
        setWorkspaceId(current.id); setWorkspaceName(current.name); setWorkspaceIds(parsed.workspaces.map((item) => item.id)); applyDocument(current);
      } else {
        const legacy = window.localStorage.getItem(LEGACY_WORKSPACE_KEY);
        if (legacy !== null) { const migrated = migrateLegacyWorkspace(JSON.parse(legacy), { id: DEFAULT_WORKSPACE_ID, name: "Migrated workspace" }); applyDocument(migrated); setNotice("Migrated the legacy single-chart workspace without deleting its original storage key."); }
      }
    } catch { setNotice("Saved workspace data was invalid; the current deterministic workspace was kept safely."); }
    // Startup migration intentionally runs once against browser storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pending = pendingRestoreRef.current;
    if (pending === null) return;
    if (!pending.charts.every((chart) => panelRefs.current.has(chart.panelId))) return;
    if (!pending.charts.every((chart) => panelRefs.current.get(chart.panelId)?.getChart() !== null)) return;
    pending.charts.forEach((chart) => panelRefs.current.get(chart.panelId)?.restoreWorkspace(chart.workspace));
    pendingRestoreRef.current = null;
    setNotice(`Workspace “${pending.name}” restored with ${pending.charts.length} chart panels.`);
  }, [panels, layout, snapshots]);

  const applyDocument = (document: StudioWorkspaceDocument): void => {
    const firstChart = document.charts[0]?.workspace;
    setWorkspaceId(document.id); setWorkspaceName(document.name); setWorkspaceIds((current) => current.includes(document.id) ? current : [...current, document.id]); setLayout(document.layout); setPanels(document.charts.map((chart) => ({ panelId: chart.panelId, symbol: chart.symbol, timeframe: chart.timeframe as Timeframe }))); setActivePanelId(document.charts[0]?.panelId ?? "chart-1"); setSync({ ...document.synchronization }); setWatchlistModel(new WatchlistModel(document.watchlists, (prefix) => `${prefix}-studio-${serialRef.current++}`)); setWatchlists(document.watchlists); if (firstChart !== undefined) { setTheme(firstChart.chart.theme.background === "#ffffff" ? "light" : "dark"); setScaleMode(firstChart.chart.priceScale?.mode ?? "linear"); } pendingRestoreRef.current = document;
  };

  const collectDocument = useCallback((id = workspaceId, name = workspaceName): StudioWorkspaceDocument => parseStudioWorkspace({ version: 1, id, name: name.trim() || "Workspace", layout, charts: panels.map((panel) => ({ panelId: panel.panelId, symbol: panel.symbol, timeframe: panel.timeframe, workspace: panelRefs.current.get(panel.panelId)?.getChart()?.serializeWorkspace({ symbol: panel.symbol, timeframe: panel.timeframe }) ?? emptyWorkspace(panel.symbol, panel.timeframe) })), synchronization: sync, watchlists: watchlistModel.getDocument() }), [layout, panels, sync, watchlistModel, workspaceId, workspaceName]);

  const persist = useCallback((document: StudioWorkspaceDocument, all: readonly StudioWorkspaceDocument[]): void => {
    try { window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify({ version: 1, currentId: document.id, workspaces: all })); const activeChart = document.charts[0]?.workspace; if (activeChart !== undefined) window.localStorage.setItem(LEGACY_WORKSPACE_KEY, JSON.stringify(activeChart)); setNotice(`Workspace “${document.name}” saved locally.`); }
    catch { setNotice("Workspace could not be saved. Browser storage may be unavailable or full."); }
  }, []);

  const saveWorkspace = useCallback((asNew = false): void => {
    const id = asNew ? `${workspaceId}-${Date.now()}` : workspaceId;
    const document = collectDocument(id, workspaceName);
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    let all: StudioWorkspaceDocument[] = [];
    if (raw !== null) { try { all = [...parseStoredWorkspaces(JSON.parse(raw)).workspaces]; } catch { all = []; } }
    const index = all.findIndex((item) => item.id === id);
    if (index >= 0) all[index] = document; else all.push(document);
    setWorkspaceId(id); setWorkspaceName(document.name); setWorkspaceIds(all.map((item) => item.id)); persist(document, all);
  }, [collectDocument, persist, workspaceId, workspaceName]);

  const changeLayout = (nextLayout: StudioLayout): void => {
    const desired = chartCount(nextLayout);
    const next = [...panels];
    while (next.length > desired) { const removed = next.pop(); if (removed !== undefined) archivedPanelsRef.current.set(removed.panelId, { panel: removed, workspace: panelRefs.current.get(removed.panelId)?.getChart()?.serializeWorkspace({ symbol: removed.symbol, timeframe: removed.timeframe }) }); }
    while (next.length < desired) { const archived = [...archivedPanelsRef.current.values()][0]; if (archived !== undefined) { next.push(archived.panel); archivedPanelsRef.current.delete(archived.panel.panelId); } else { const panelId = `chart-${serialRef.current++}`; next.push({ panelId, symbol: next[0]?.symbol ?? "BTC-USD", timeframe: next[0]?.timeframe ?? "1h" }); } }
    setPanels(next);
    setLayout(nextLayout);
    setNotice(`Layout changed to ${layoutChoices.find(([id]) => id === nextLayout)?.[1] ?? nextLayout}; hidden panel analysis is retained in this session.`);
  };

  const changeActiveSymbol = (nextSymbol: string): void => { const nextPanels = sync.symbol ? panels.map((panel) => ({ ...panel, symbol: nextSymbol })) : panels.map((panel) => panel.panelId === activePanel.panelId ? { ...panel, symbol: nextSymbol } : panel); setPanels(nextPanels); setNotice(`Loaded deterministic ${nextSymbol}${sync.symbol ? " across synchronized panels" : " in the active panel"}.`); };
  const changeActiveTimeframe = (nextTimeframe: Timeframe): void => { setPanels((current) => sync.timeframe ? current.map((panel) => ({ ...panel, timeframe: nextTimeframe })) : current.map((panel) => panel.panelId === activePanel.panelId ? { ...panel, timeframe: nextTimeframe } : panel)); };

  const onCrosshair = (panelId: string, event: CrosshairMoveEvent): void => { if (panelId === activePanelId) setCrosshair(event); };
  const onViewport = (_panelId: string, _range: { from: number; to: number }): void => undefined;
  const onSnapshot = (panelId: string, snapshot: PanelSnapshot): void => { setSnapshots((current) => ({ ...current, [panelId]: snapshot })); if (panelId === activePanelId) { const visible = snapshot.series.find((series) => series.id.startsWith("studio-") && series.id !== "studio-volume" && series.style.visible !== false); const next: Partial<Record<string, Presentation>> = { "studio-price": "candles", "studio-ohlc": "ohlc", "studio-hollow": "hollow", "studio-heikin": "heikin-ashi", "studio-line": "line", "studio-area": "area", "studio-baseline": "baseline" }; const restored = visible === undefined ? undefined : next[visible.id]; if (restored !== undefined) setPresentation(restored); } };

  useEffect(() => { if (scaleMode !== "linear") setNotice(`${scaleModes.find(([mode]) => mode === scaleMode)?.[1] ?? scaleMode} price scale applied without changing financial data.`); }, [scaleMode]);
  useEffect(() => { if (theme !== "dark") setNotice("Light theme applied without recreating the chart."); }, [theme]);
  useEffect(() => { if (!replayActive) { setPresentation("candles"); setScaleMode("linear"); activeHandle?.getChart()?.setPriceScaleOptions({ mode: "linear" }); } }, [replayActive]);
  const updatePresentation = (next: Presentation): void => { const target = activeHandle?.getChart(); if (target === null || target === undefined) return; const ids: Record<Presentation, string> = { candles: "studio-price", ohlc: "studio-ohlc", hollow: "studio-hollow", "heikin-ashi": "studio-heikin", line: "studio-line", area: "studio-area", baseline: "studio-baseline" }; for (const [kind, id] of Object.entries(ids)) if (target.getSeriesIds().includes(id)) target.setSeriesStyle(id, { visible: kind === next }); setPresentation(next); activeHandle?.refresh(); };
  const addIndicator = (): void => { const target = activeHandle?.getChart(); if (target === null || target === undefined) return; try { const period = indicatorPeriodOverride.trim() === "" ? undefined : Number(indicatorPeriodOverride); const constant = indicatorConstant.trim() === "" ? undefined : Number(indicatorConstant); const multiplier = indicatorMultiplier.trim() === "" ? undefined : Number(indicatorMultiplier); target.addIndicator(indicatorToAdd, { id: `studio-${indicatorToAdd.toLowerCase()}-${serialRef.current++}`, pane: ["SMA", "EMA", "BOLLINGER_BANDS", "VWAP", "DONCHIAN_CHANNELS", "KELTNER_CHANNELS"].includes(indicatorToAdd) ? "main" : "new", parameters: indicatorParameters(indicatorToAdd, { period, constant, multiplier }) }); activeHandle?.refresh(); setNotice(`Added ${indicatorToAdd} to ${activePanel.panelId}.`); } catch (error) { setNotice(`Could not add indicator: ${error instanceof Error ? error.message : String(error)}`); } };
  const activateDrawing = (type: string): void => { try { activeHandle?.getChart()?.startDrawing(type, { style: { color: "#fbbf24", fillColor: "#fbbf2433", lineWidth: 2 }, snap: snapEnabled ? "visible-ohlc" : "none", ...(type === "text" ? { text: "Studio note" } : {}) }); setNotice(`${type} is active in ${activePanel.panelId}${snapEnabled ? " with visible OHLC snapping" : ""}.`); } catch (error) { setNotice(`Could not activate drawing: ${error instanceof Error ? error.message : String(error)}`); } };
  const addAlert = (): void => { const target = activeHandle?.getChart(); if (target === null || target === undefined) return; const inputName = alertNameInputRef.current?.value ?? alertName; const normalizedName = inputName.trim() || "Price alert"; try { target.addAlert({ id: `studio-alert-${serialRef.current++}`, name: normalizedName, condition: { type: "price-cross-above", field: "close", value: alertThreshold }, frequency: alertFrequency }); setLastAlertDiagnostic({ inputValue: inputName.slice(0, 120), createdName: normalizedName.slice(0, 120), outcome: "accepted" }); activeHandle?.refresh(); setNotice(`Alert created in ${activePanel.panelId}; events remain local.`); } catch (error) { setLastAlertDiagnostic({ inputValue: inputName.slice(0, 120), createdName: "", outcome: "rejected" }); setNotice(`Could not create alert: ${error instanceof Error ? error.message : String(error)}`); } };
  const addScript = async (source: string, signal: AbortSignal): Promise<void> => { const target = activeHandle?.getChart(); if (target === null || target === undefined) throw new Error("Chart is not ready"); await target.addScriptIndicatorAsync(source, { id: `studio-script-${serialRef.current++}`, pane: "new", signal }); activeHandle?.refresh(); setNotice(`Added Worker-backed KlineScript to ${activePanel.panelId}.`); };

  const selectedSymbol = (symbolId: string): void => { const symbol = selectedList?.symbols.find((item) => item.id === symbolId); if (symbol !== undefined) changeActiveSymbol(symbol.displaySymbol); };
  const openScreenerChart = (symbol: string): void => { changeActiveSymbol(symbol); setNotice(`Opened ${symbol} from the screener in the active chart.`); };
  const favoriteScreenerSymbol = (symbol: string): void => { const candidate = selectedList?.symbols.find((item) => item.displaySymbol === symbol); if (candidate !== undefined && selectedList !== undefined) { watchlistModel.setFavorite(selectedList.id, candidate.id, true); setNotice(`${symbol} was added to watchlist favorites.`); } };
  const createWatchlist = (): void => { const list = watchlistModel.create(`Watchlist ${watchlists.lists.length + 1}`); setNotice(`Created ${list.name}.`); };
  const addWatchlistSymbol = (): void => { if (selectedList === undefined) { createWatchlist(); return; } const candidate = symbols.find((symbol) => !selectedList.symbols.some((item) => item.displaySymbol === symbol)); if (candidate === undefined) return; watchlistModel.addSymbol(selectedList.id, { id: candidate, displaySymbol: candidate, name: candidate, exchange: "Demo", assetCategory: "Sample", quoteCurrency: "USD" }); };
  const removePanelNow = (panelId: string): void => { setPanels((current) => current.filter((panel) => panel.panelId !== panelId)); archivedPanelsRef.current.delete(panelId); panelRefs.current.delete(panelId); if (activePanelId === panelId) setActivePanelId(panels.find((panel) => panel.panelId !== panelId)?.panelId ?? "chart-1"); setNotice(`${panelId} removed and its chart resources disposed.`); };
  const removePanel = (panelId: string): void => { if (panels.length <= 1) return; showConfirm(`Remove ${panelId}`, "Its chart resources will be destroyed.", () => removePanelNow(panelId)); };

  const importInputRef = useRef<HTMLInputElement>(null);
  const importWorkspace = (file: File): void => { void file.text().then((text) => { try { const document = parseStudioWorkspace(JSON.parse(text)); applyDocument(document); setNotice(`Imported workspace “${document.name}" after validation.`); } catch { setNotice("Import rejected; the current workspace was not changed."); } }); };
  const newWorkspace = (): void => { const panelId = `chart-${serialRef.current++}`; archivedPanelsRef.current.clear(); pendingRestoreRef.current = null; setPanels([{ panelId, symbol: "BTC-USD", timeframe: "1h" }]); setActivePanelId(panelId); setLayout("single"); setWorkspaceId(`${DEFAULT_WORKSPACE_ID}-${Date.now()}`); setWorkspaceName("New workspace"); setWatchlistModel(new WatchlistModel(defaultWatchlists(), (prefix) => `${prefix}-studio-${serialRef.current++}`)); setNotice("New empty Studio workspace started."); };
  const loadWorkspace = (id: string): void => { const raw = window.localStorage.getItem(WORKSPACES_KEY); if (raw === null) return; try { const stored = parseStoredWorkspaces(JSON.parse(raw)); const document = stored.workspaces.find((item) => item.id === id); if (document !== undefined) applyDocument(document); } catch { setNotice("Saved workspace collection is invalid; nothing was changed."); } };
  const deleteWorkspaceNow = (): void => { const raw = window.localStorage.getItem(WORKSPACES_KEY); if (raw === null) return; try { const stored = parseStoredWorkspaces(JSON.parse(raw)); const remaining = stored.workspaces.filter((item) => item.id !== workspaceId); if (remaining.length === 0) { newWorkspace(); window.localStorage.removeItem(WORKSPACES_KEY); } else { const next = remaining[0]!; window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify({ version: 1, currentId: next.id, workspaces: remaining })); applyDocument(next); } } catch { setNotice("Could not delete the workspace collection safely."); } };
  const deleteWorkspace = (): void => { showConfirm(`Delete workspace “${workspaceName}"?`, "The saved workspace will be removed from this browser.", deleteWorkspaceNow); };
  const duplicateWorkspace = (): void => { const id = `${workspaceId}-copy-${Date.now()}`; const document = collectDocument(id, `${workspaceName} copy`); const raw = window.localStorage.getItem(WORKSPACES_KEY); let all: StudioWorkspaceDocument[] = []; if (raw !== null) { try { all = [...parseStoredWorkspaces(JSON.parse(raw)).workspaces]; } catch { all = []; } } all.push(document); setWorkspaceId(id); setWorkspaceName(document.name); setWorkspaceIds(all.map((item) => item.id)); persist(document, all); };

  const initialWorkspaceFor = (panelId: string): WorkspaceDocument | undefined => pendingRestoreRef.current?.charts.find((chart) => chart.panelId === panelId)?.workspace ?? archivedPanelsRef.current.get(panelId)?.workspace;
  const strategyScopeKey = `${activePanel.panelId}|${activePanel.symbol}|${activePanel.timeframe}`;
  const applyStrategyParameters = (strategyId: string, parameters: Readonly<Record<string, unknown>>): void => {
    appliedStrategyParametersRef.current.set(strategyScopeKey, { strategyId, parameters: { ...parameters } });
    setNotice(`${activePanel.panelId}: optimizer selection is ready for Strategy Tester; Paper Trading remains unchanged.`);
  };

  return <main className={styles.studio}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span aria-hidden="true">◈</span><strong>OpenKline Studio</strong><small>Phase 7.5 analysis workspace</small></div>
      <label>Layout<select aria-label="Chart layout" value={layout} onChange={(event) => changeLayout(event.target.value as StudioLayout)}>{layoutChoices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Active chart<select aria-label="Active chart panel" value={activePanelId} onChange={(event) => setActivePanelId(event.target.value)}>{panels.map((panel) => <option key={panel.panelId} value={panel.panelId}>{panel.panelId} · {panel.symbol}</option>)}</select></label>
      <label>Active symbol<select aria-label="Active symbol" value={activePanel.symbol} disabled={replayActive} onChange={(event) => changeActiveSymbol(event.target.value)}>{symbols.map((symbol) => <option key={symbol}>{symbol}</option>)}</select></label>
      <label>Timeframe<select aria-label="Active timeframe" value={activePanel.timeframe} disabled={replayActive} onChange={(event) => changeActiveTimeframe(event.target.value as Timeframe)}>{timeframes.map((timeframe) => <option key={timeframe}>{timeframe}</option>)}</select></label>
      <div className={styles.topActions}><button type="button" onClick={newWorkspace}>New</button><button type="button" onClick={() => saveWorkspace(false)} disabled={replayActive}>Save</button><button type="button" onClick={() => saveWorkspace(true)} disabled={replayActive}>Save As</button><button type="button" onClick={duplicateWorkspace} disabled={replayActive}>Duplicate</button><button type="button" onClick={deleteWorkspace}>Delete</button><button type="button" onClick={() => loadWorkspace(workspaceId)}>Load</button><select aria-label="Workspace" value={workspaceId} onChange={(event) => loadWorkspace(event.target.value)}>{workspaceIds.map((id) => <option key={id} value={id}>{id === workspaceId ? workspaceName : id}</option>)}</select><input aria-label="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /><button type="button" onClick={() => { const target = activeHandle?.getChart(); if (target === null || target === undefined) return; const file = new Blob([JSON.stringify(collectDocument(), null, 2)], { type: "application/json" }); const url = URL.createObjectURL(file); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `openkline-${workspaceName.toLowerCase().replace(/\s+/g, "-")}.json`; anchor.click(); URL.revokeObjectURL(url); }}>Export</button><button type="button" onClick={() => importInputRef.current?.click()}>Import</button><input ref={importInputRef} type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) importWorkspace(file); event.currentTarget.value = ""; }} /></div>
    </header>
    <section className={styles.toolbar} aria-label="Chart tools"><div className={styles.toolGroup} aria-label="Chart type">{presentationChoices.map(([kind, label]) => <button key={kind} type="button" aria-pressed={presentation === kind} onClick={() => updatePresentation(kind)}>{label}</button>)}<button type="button" onClick={() => activeHandle?.getChart()?.fitContent()}>Fit</button><button type="button" onClick={() => activeHandle?.getChart()?.resetView()}>Reset</button></div><div className={styles.toolGroup} aria-label="Drawing tools">{drawingTools.map(([type, label]) => <button key={type} type="button" disabled={replayActive} onClick={() => activateDrawing(type)}>{label}</button>)}<button type="button" disabled={replayActive} onClick={() => { if (activeHandle?.getChart()?.undoDrawing()) activeHandle.refresh(); }}>Undo</button><button type="button" disabled={replayActive} onClick={() => { if (activeHandle?.getChart()?.redoDrawing()) activeHandle.refresh(); }}>Redo</button><button type="button" onClick={() => setScriptOpen((open) => !open)} disabled={replayActive}>KlineScript</button></div></section>
    <div className={styles.replayBar}><label>Replay speed<select aria-label="Replay speed" value={activeSnapshot.replayStatus.speed} disabled={!replayActive} onChange={(event) => activeHandle?.replayCommand((replay) => replay.setSpeed(Number(event.target.value)))}>{[0.5, 1, 2, 5, 10].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label><label className={styles.check}><input aria-label="Snap drawings to visible OHLC" type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />Snap drawings to visible OHLC</label></div>
    {scriptOpen ? <KlineScriptStudioEditor source={scriptSource} disabled={replayActive} onSourceChange={setScriptSource} onAdd={addScript} onClose={() => setScriptOpen(false)} /> : null}
    <section className={styles.indicatorExplorerPanel} aria-label="Technical analysis explorer"><div className={styles.panelHeading}><h2>Indicator Explorer</h2><span>{filteredIndicatorCatalog.length} definitions</span></div><div className={styles.indicatorExplorerFilters}><label>Search<input aria-label="Library search" placeholder="Search indicators" value={indicatorSearch} onChange={(event) => setIndicatorSearch(event.target.value)} /></label><label>Category<select aria-label="Category filter" value={indicatorCategory} onChange={(event) => setIndicatorCategory(event.target.value)}>{indicatorCategories.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}</select></label><label className={styles.check}><input aria-label="Favorites only" type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />Favorites only</label></div><div className={styles.indicatorExplorerItems}>{filteredIndicatorCatalog.map((item) => <button type="button" key={item.id} aria-pressed={indicatorToAdd === item.id} onClick={() => setIndicatorToAdd(item.id)}>{favoriteIndicatorIds.includes(item.id) ? "★" : "☆"} {item.label}<small>{item.category}</small></button>)}</div><div className={styles.indicatorParameters}><strong>{indicatorToAdd} parameters</strong>{selectedIndicatorMetadata.parameters.some((parameter) => parameter.name === "period") ? <label>Period<input aria-label="Period override" type="number" min="1" value={indicatorPeriodOverride} placeholder="definition default" disabled={replayActive} onChange={(event) => setIndicatorPeriodOverride(event.target.value)} /></label> : null}{selectedIndicatorMetadata.parameters.some((parameter) => parameter.name === "constant") ? <label>CCI constant<input aria-label="CCI constant" type="number" min="0" step="0.001" value={indicatorConstant} disabled={replayActive} onChange={(event) => setIndicatorConstant(event.target.value)} /></label> : null}{selectedIndicatorMetadata.parameters.some((parameter) => parameter.name === "multiplier") ? <label>Channel multiplier<input aria-label="Channel multiplier" type="number" min="0" step="0.1" value={indicatorMultiplier} disabled={replayActive} onChange={(event) => setIndicatorMultiplier(event.target.value)} /></label> : null}<button type="button" aria-label={`${favoriteIndicatorIds.includes(indicatorToAdd) ? "Remove" : "Add"} ${indicatorToAdd} favorite`} onClick={() => setFavoriteIndicatorIds((current) => current.includes(indicatorToAdd) ? current.filter((id) => id !== indicatorToAdd) : [...current, indicatorToAdd])}>{favoriteIndicatorIds.includes(indicatorToAdd) ? "Unfavorite" : "Favorite"}</button></div></section>
    <section className={styles.workspace}>
      <aside className={styles.objectTree} aria-label="Object tree"><h2>Objects</h2><details open><summary>Series ({activeSnapshot.series.length})</summary><ul>{activeSnapshot.series.map((series) => <li key={series.id}><button type="button" className={styles.objectName} onClick={() => { activeHandle?.getChart()?.setSeriesStyle(series.id, { visible: series.style.visible === false }); activeHandle?.refresh(); }} aria-label={`${series.style.visible === false ? "Show" : "Hide"} ${series.id}`}>{series.style.visible === false ? "○" : "●"} {series.title ?? series.id}</button><small>{series.paneId}</small></li>)}</ul></details><details open><summary>Drawings ({activeSnapshot.drawings.length})</summary><ul>{activeSnapshot.drawings.map((drawing) => <li key={drawing.id}><button type="button" className={styles.objectName} onClick={() => activeHandle?.getChart()?.selectDrawing(drawing.id)} aria-label={`Select ${drawing.id}`}>{drawing.type}</button><button type="button" aria-label={`${drawing.style.visible === false ? "Show" : "Hide"} ${drawing.id}`} onClick={() => { activeHandle?.getChart()?.setDrawingVisibility(drawing.id, drawing.style.visible === false); activeHandle?.refresh(); }}>{drawing.style.visible === false ? "○" : "●"}</button><button type="button" aria-label={`${drawing.style.locked === true ? "Unlock" : "Lock"} ${drawing.id}`} onClick={() => { activeHandle?.getChart()?.setDrawingLocked(drawing.id, drawing.style.locked !== true); activeHandle?.refresh(); }}>{drawing.style.locked === true ? "🔒" : "🔓"}</button></li>)}</ul></details></aside>
      <div className={styles.watchlistActions} aria-label="Watchlist actions"><strong>Manage symbols</strong>{selectedList === undefined ? null : <div className={styles.watchlistListActions}><button type="button" aria-label="Rename watchlist" onClick={(event) => showPrompt("Rename watchlist", "Choose a name for this watchlist.", selectedList.name, (name) => { try { watchlistModel.rename(selectedList.id, name); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } }, event.currentTarget)}>Rename</button><button type="button" aria-label="Delete watchlist" onClick={(event) => showConfirm(`Delete watchlist “${selectedList.name}”?`, "The list and its symbols will be removed from this browser.", () => watchlistModel.delete(selectedList.id), event.currentTarget)}>Delete</button></div>}{selectedList?.symbols.map((symbol, index) => <div key={symbol.id}><span>{symbol.displaySymbol}</span><button type="button" aria-label={`${symbol.favorite ? "Unfavorite" : "Favorite"} ${symbol.displaySymbol}`} onClick={() => watchlistModel.setFavorite(selectedList.id, symbol.id, !symbol.favorite)}>{symbol.favorite ? "★" : "☆"}</button><button type="button" aria-label={`Move ${symbol.displaySymbol} up`} disabled={index === 0} onClick={() => watchlistModel.reorderSymbol(selectedList.id, symbol.id, index - 1)}>↑</button><button type="button" aria-label={`Move ${symbol.displaySymbol} down`} disabled={index === selectedList.symbols.length - 1} onClick={() => watchlistModel.reorderSymbol(selectedList.id, symbol.id, index + 1)}>↓</button></div>)}</div>
      <aside className={`${styles.sidebar} ${styles.watchlistSidebar}`} aria-label="Watchlists"><div className={styles.panelHeading}><h2>Watchlists</h2><button type="button" onClick={createWatchlist}>New</button></div><label>List<select aria-label="Watchlist" value={watchlists.selectedWatchlistId ?? ""} onChange={(event) => watchlistModel.select(event.target.value)}>{watchlists.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><input aria-label="Search watchlist" placeholder="Search symbols" value={watchlistSearch} onChange={(event) => setWatchlistSearch(event.target.value)} /><button type="button" onClick={addWatchlistSymbol}>Add sample symbol</button><ul className={styles.watchlistRows}>{filteredSymbols.map((symbol) => { const quote = quotes[symbol.id]; return <li key={symbol.id} className={symbol.displaySymbol === activePanel.symbol ? styles.watchlistActive : ""}><button type="button" onClick={() => selectedSymbol(symbol.id)}>{symbol.favorite ? "★" : "☆"} {symbol.displaySymbol}<small>{symbol.name}</small></button><span className={quote?.status === "ready" ? "" : styles.quoteStale}>{quote?.last?.toFixed(2) ?? "—"}<small>{quote === undefined ? "Loading" : quote.demo ? "Demo" : quote.status}</small></span><button type="button" aria-label={`Remove ${symbol.displaySymbol}`} onClick={() => watchlistModel.removeSymbol(selectedList!.id, symbol.id)}>×</button></li>; })}</ul><small>Quotes are deterministic demo data, not exchange prices.</small></aside>
      <section className={styles.multiChartArea} aria-label="OpenKline multi-chart workspace"><div className={`${styles.multiChartGrid} ${styles[`layout-${layout}`]}`}>{panels.map((panel) => <ChartPanel key={panel.panelId} ref={(handle) => { if (handle === null) panelRefs.current.delete(panel.panelId); else panelRefs.current.set(panel.panelId, handle); }} panel={panel} active={panel.panelId === activePanelId} initialWorkspace={initialWorkspaceFor(panel.panelId)} onActivate={setActivePanelId} onReady={onChartReady} onSnapshot={onSnapshot} onCrosshair={onCrosshair} onViewport={onViewport} onNotice={setNotice} />)}</div><div className={styles.status} aria-live="polite"><span>{textForCrosshair(crosshair)}</span><span>{notice}</span></div></section>
      <aside className={styles.sidebar} aria-label="Active chart settings"><div className={styles.panelHeading}><h2>Active chart</h2><button type="button" disabled={panels.length <= 1} onClick={() => removePanel(activePanel.panelId)}>Remove chart</button></div><p className={styles.activeChartBadge}>{activePanel.panelId} · {activePanel.symbol} · {activePanel.timeframe}</p><details open><summary>Synchronization</summary><label className={styles.check}><input aria-label="Sync crosshair" type="checkbox" checked={sync.crosshair} onChange={(event) => setSync((current) => ({ ...current, crosshair: event.target.checked }))} />Crosshair</label><label className={styles.check}><input aria-label="Sync visible range" type="checkbox" checked={sync.visibleRange} onChange={(event) => setSync((current) => ({ ...current, visibleRange: event.target.checked }))} />Visible range</label><label className={styles.check}><input aria-label="Sync symbols" type="checkbox" checked={sync.symbol} onChange={(event) => setSync((current) => ({ ...current, symbol: event.target.checked }))} />Symbols</label><label className={styles.check}><input aria-label="Sync timeframes" type="checkbox" checked={sync.timeframe} onChange={(event) => setSync((current) => ({ ...current, timeframe: event.target.checked }))} />Timeframes</label><small>Replay sessions remain independent.</small></details><details open><summary>Indicators ({activeSnapshot.indicators.length})</summary><div className={styles.addRow}><select aria-label="Indicator" value={indicatorToAdd} disabled={replayActive} onChange={(event) => setIndicatorToAdd(event.target.value as typeof indicatorToAdd)}>{indicatorChoices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="button" disabled={replayActive} onClick={addIndicator}>Add</button></div><ul>{activeSnapshot.indicators.map((indicator) => <li key={indicator.id}><span>{indicator.indicatorId} <small>{indicator.paneId}</small></span><button type="button" disabled={replayActive} aria-label={`Remove ${indicator.id}`} onClick={() => { activeHandle?.getChart()?.removeIndicator(indicator.id); activeHandle?.refresh(); }}>×</button></li>)}</ul></details><details open data-alert-input-value={alertNameInputRef.current?.value ?? alertName} data-alert-last-created-name={lastAlertDiagnostic?.createdName ?? ""} data-alert-last-outcome={lastAlertDiagnostic?.outcome ?? ""}><summary>Alerts ({activeSnapshot.alerts.length})</summary><div className={styles.alertForm}><label>Name<input ref={alertNameInputRef} aria-label="Alert name" defaultValue={alertName} disabled={replayActive} onInput={(event) => setAlertName(event.currentTarget.value)} onChange={(event) => setAlertName(event.target.value)} /></label><label>Close crosses above<input aria-label="Alert threshold" type="number" value={alertThreshold} disabled={replayActive} onChange={(event) => setAlertThreshold(Number(event.target.value))} /></label><label>Frequency<select aria-label="Alert frequency" value={alertFrequency} disabled={replayActive} onChange={(event) => setAlertFrequency(event.target.value as AlertFrequency)}><option value="once">Once</option><option value="every-event">Every event</option><option value="once-per-bar">Once per bar</option><option value="once-per-confirmed-bar">Confirmed bars</option></select></label><button type="button" disabled={replayActive} onClick={addAlert}>Create alert</button></div>{activeSnapshot.alerts.map((alert) => <div className={styles.alertItem} key={alert.id}><span>{alert.name}</span><button type="button" disabled={replayActive} onClick={() => { activeHandle?.getChart()?.updateAlert(alert.id, { enabled: alert.enabled === false }); activeHandle?.refresh(); }}>{alert.enabled === false ? "Enable" : "Pause"}</button><button type="button" aria-label={`Remove ${alert.name}`} disabled={replayActive} onClick={() => { activeHandle?.getChart()?.removeAlert(alert.id); activeHandle?.refresh(); }}>×</button></div>)}</details><details open><summary>Replay: {activeSnapshot.replayStatus.state}</summary><small>{textForReplay(activeSnapshot.replayStatus, timeZone)} · {activeSnapshot.replayStatus.currentIndex === null ? "No bars" : `${activeSnapshot.replayStatus.currentIndex + 1} / ${activeSnapshot.replayStatus.totalBars}`}</small><div className={styles.replayControls}><button type="button" onClick={() => activeHandle?.enterReplay()} disabled={replayActive}>Enter replay</button><button type="button" aria-label="Replay previous bar" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.stepBackward())}>◀</button><button type="button" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => activeSnapshot.replayStatus.state === "playing" ? replay.pause() : replay.play())}>{activeSnapshot.replayStatus.state === "playing" ? "Pause" : "Play"}</button><button type="button" aria-label="Replay next bar" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.stepForward())}>▶</button><button type="button" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.jumpToStart())}>Beginning</button><button type="button" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.jumpToLatest())}>Latest</button><button type="button" onClick={() => activeHandle?.exitReplay()} disabled={!replayActive}>Exit replay</button></div><label>Replay position<input aria-label="Replay position" type="range" min="0" max={Math.max(0, activeSnapshot.replayStatus.totalBars - 1)} value={activeSnapshot.replayStatus.currentIndex ?? 0} disabled={!replayActive} onChange={(event) => activeHandle?.replayCommand((replay) => replay.seekToBar(Number(event.target.value)))} /></label></details><details open><summary>Display</summary><label>Theme<select aria-label="Theme" value={theme} onChange={(event) => { const next = event.target.value as "dark" | "light"; activeHandle?.getChart()?.setOptions({ theme: next }); setTheme(next); }}><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Price scale<select aria-label="Price scale" value={scaleMode} onChange={(event) => { const next = event.target.value as PriceScaleMode; activeHandle?.getChart()?.setPriceScaleOptions({ mode: next }); setScaleMode(next); }}>{scaleModes.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label><label className={styles.check}><input aria-label="Auto scale" type="checkbox" checked={autoScale} onChange={(event) => { const next = event.target.checked; if (next) activeHandle?.getChart()?.resetPriceScale(); else activeHandle?.getChart()?.setPriceScaleOptions({ autoScale: false }); setAutoScale(next); }} />Auto scale</label><label className={styles.check}><input aria-label="Show price axis" type="checkbox" checked={axisVisible} onChange={(event) => { activeHandle?.getChart()?.setPriceScaleOptions({ axisVisible: event.target.checked }); setAxisVisible(event.target.checked); }} />Show price axis</label><label>Top margin<input aria-label="Top scale margin" type="number" step="0.01" value={marginTop} onChange={(event) => { const value = Number(event.target.value); activeHandle?.getChart()?.setPriceScaleOptions({ marginTop: value }); setMarginTop(value); }} /></label><label>Bottom margin<input aria-label="Bottom scale margin" type="number" step="0.01" value={marginBottom} onChange={(event) => { const value = Number(event.target.value); activeHandle?.getChart()?.setPriceScaleOptions({ marginBottom: value }); setMarginBottom(value); }} /></label></details><details><summary>Interaction</summary>{(Object.keys(interaction) as Array<keyof typeof interaction>).map((name) => <label key={name} className={styles.check}><input type="checkbox" checked={interaction[name]} onChange={() => { const next = { ...interaction, [name]: !interaction[name] }; activeHandle?.getChart()?.setOptions({ interaction: next }); setInteraction(next); }} />{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</label>)}</details></aside>
    </section>
    <ScreenerPanel watchlists={watchlists} onOpenChart={openScreenerChart} onFavorite={favoriteScreenerSymbol} onSelectWatchlist={(id) => { try { watchlistModel.select(id); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } }} onNotice={setNotice} />
    <StrategyOptimizer key={`optimizer-${strategyScopeKey}`} panelId={activePanel.panelId} symbol={activePanel.symbol} timeframe={activePanel.timeframe} chart={activeHandle?.getChart() ?? null} onApplyParameters={applyStrategyParameters} onNotice={setNotice} />
    <StrategyTester key={strategyScopeKey} panelId={activePanel.panelId} symbol={activePanel.symbol} timeframe={activePanel.timeframe} chart={activeHandle?.getChart() ?? null} initialResult={strategyResultsRef.current.get(strategyScopeKey) ?? null} appliedParameters={appliedStrategyParametersRef.current.get(strategyScopeKey) ?? null} onResult={(nextResult) => { if (nextResult === null) strategyResultsRef.current.delete(strategyScopeKey); else strategyResultsRef.current.set(strategyScopeKey, nextResult); }} onNotice={setNotice} />
    <PaperTradingPanel key={`paper-${activePanel.panelId}`} panelId={activePanel.panelId} symbol={activePanel.symbol} timeframe={activePanel.timeframe} chart={activeHandle?.getChart() ?? null} onNotice={setNotice} />
    {dialog === null ? null : <div className={styles.dialogBackdrop} role="presentation" data-studio-dialog-open="true" data-studio-dialog-kind={dialog.kind}><section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="studio-dialog-title" aria-describedby="studio-dialog-message" data-studio-dialog-title={dialog.title}><h2 id="studio-dialog-title">{dialog.title}</h2><p id="studio-dialog-message">{dialog.message}</p>{dialog.kind === "prompt" ? <label>Value<input autoFocus aria-label="Dialog value" value={dialogValue} onChange={(event) => setDialogValue(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") dialog.onSubmit(dialogValue); }} /></label> : null}<div className={styles.dialogActions}><button type="button" onClick={() => setDialog(null)}>Cancel</button><button type="button" autoFocus={dialog.kind === "confirm"} onClick={() => dialog.onSubmit(dialogValue)}>{dialog.kind === "prompt" ? "Apply" : "Confirm"}</button></div></section></div>}
  </main>;
}

function emptyWorkspace(symbol: string, timeframe: string): WorkspaceDocument {
  return { version: 1, metadata: { symbol, timeframe }, chart: { theme: { background: "#0f172a", text: "#e2e8f0", grid: "#24344d", border: "#334155", upCandle: "#34d399", downCandle: "#fb7185", crosshair: "#94a3b8", volumeUp: "#34d399", volumeDown: "#fb7185" }, locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr" }, panes: [{ id: "main", height: null, minHeight: 120 }], series: [], indicators: [], drawings: { version: 1, drawings: [] }, viewport: { rangeStart: 0, visibleCount: 1 }, plugins: [] };
}
