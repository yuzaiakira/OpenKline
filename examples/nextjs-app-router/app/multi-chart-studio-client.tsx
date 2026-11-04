"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FinancialChart } from "@openkline/react";
import type { FinancialChartHandle } from "@openkline/react";
import {
  WatchlistModel,
  ChartSynchronizationController,
  ComparisonDatafeedController,
  InMemoryDatafeed,
  applyScopedDrawingStyle,
  applyStudioKlineScriptIndicator,
  clearScopedDrawingSelection,
  allocateStudioScriptInstanceId,
  allocateStudioWorkspaceId,
  allocateStudioWorkspaceImportId,
  buildStudioDrawingToolbarCatalog,
  buildStudioIndicatorCatalog,
  buildStudioUserScriptCatalog,
  builtInDrawingTools,
  cancelStudioInteractiveDrawing,
  createStudioWorkspaceBaseline,
  deleteStudioWorkspaceRecord,
  describeStudioWorkspaceImportError,
  describeStudioWorkspaceSaveStatus,
  filterStudioIndicatorCatalog,
  filterStudioUserScriptCatalog,
  finalizeStudioWorkspaceImport,
  listStudioDrawingToolGroups,
  listStudioIndicatorCategories,
  normalizeStudioWorkspaceName,
  parseStudioWorkspaceCollection,
  partitionStudioAppliedIndicators,
  prepareStudioWorkspaceImport,
  renameStudioWorkspaceRecord,
  resolveStudioWorkspaceSaveStatus,
  STUDIO_KLINESCRIPT_TEMPLATES,
  studioDrawingToolGroupLabel,
  studioIndicatorDefaultPane,
  studioWorkspaceContentFingerprint,
  studioWorkspaceNeedsNavigationGuard,
  studioWorkspaceSelectorLabel,
  StudioWorkspaceLibraryError,
  type ComparisonAssetOutput,
  type ComparisonDatafeedState,
  type ComparisonNormalizationMode,
  type Datafeed,
  type GetBarsQuery,
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
  type DrawingStyle,
  type PriceScaleMode,
  type PriceScaleConfiguration,
  type ReplayApi,
  type ReplayStatus,
  type StudioLayout,
  type StudioComparisonDocument,
  type StudioWorkspaceDocument,
  type PortfolioBacktestWorkspaceDocument,
  type WorkspaceMetadata,
  type WatchlistDocument,
  type WatchlistQuote,
  type WorkspaceDocument,
  type SeriesStyle,
  type MarketTrade,
  type OrderBookSnapshot,
  type OrderFlowState,
  type AnchoredVwapPriceSource,
  type ResolvedVolumeProfileOptions,
  type VolumeProfileAllocationMethod,
  type VolumeProfileMode,
  type VolumeProfileOptionsPatch,
  type MultiTimeframeFinalityPolicy,
  type TradingAggregationPeriod,
  type SubscribeBarsArgs,
  type DatafeedRealtimeSubscriptionArgs,
  type SymbolInfo,
  TradingCalendarEngine,
} from "openkline";
import { binanceStudioInterval, binanceStudioSymbol, createBinanceDatafeed } from "../../shared/binance-datafeed.js";
import styles from "./studio.module.css";
import { KlineScriptStudioEditor } from "./klinescript-studio-editor";
import { MarketReplayLab } from "./market-replay-lab";
import { StrategyTester } from "./strategy-tester";
import { StrategyOptimizer } from "./strategy-optimizer";
import { PaperTradingPanel } from "./paper-trading-panel";
import { ScreenerPanel } from "./screener-panel";
import { PortfolioBacktestingPanel } from "./portfolio-backtesting-panel";
import { CorporateActionsPanel } from "./corporate-actions-panel";

type Timeframe = "5m" | "1h" | "4h" | "1D";
type Presentation = "candles" | "ohlc" | "hollow" | "heikin-ashi" | "line" | "area" | "baseline";

interface PanelState {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: Timeframe;
}

interface PanelSnapshot {
  readonly series: readonly ChartSeriesInfo[];
  readonly indicators: ReadonlyArray<{ id: string; indicatorId: string; paneId: string; script?: { readonly programId: string; readonly source: string } }>;
  readonly drawings: readonly DrawingSnapshot[];
  readonly selectedDrawingId: string | null;
  readonly activeDrawingTool: string | null;
  readonly alerts: readonly AlertDefinition[];
  readonly alertHistory: readonly AlertEvent[];
  readonly replayStatus: ReplayStatus;
  readonly replaySourceLength: number;
  readonly replayStartIndex: number;
  readonly replayVisibleLatest: number | null;
  readonly anchoredVwaps: ReadonlyArray<{ readonly id: string; readonly anchorTime: number; readonly priceSource: AnchoredVwapPriceSource }>;
  readonly volumeProfiles: readonly ResolvedVolumeProfileOptions[];
  readonly multiTimeframeIndicators: ReadonlyArray<{ readonly id: string; readonly indicatorId: string; readonly targetTimeframe: string; readonly visible?: boolean }>;
  readonly multiTimeframeReferences: ReadonlyArray<{ readonly id: string; readonly targetTimeframe: string; readonly visible?: boolean }>;
  readonly tradingCalendar: { readonly calendarId: string; readonly version: string; readonly visible: boolean } | null;
  readonly sessionIndicators: ReadonlyArray<{ readonly id: string; readonly indicatorId: string; readonly targetPeriod: string; readonly visible?: boolean }>;
  readonly sessionReferences: ReadonlyArray<{ readonly id: string; readonly targetPeriod: string; readonly visible?: boolean }>;
  readonly orderFlow: OrderFlowState;
  readonly footprintOptions: ReturnType<Chart["getFootprintOptions"]>;
  readonly cvdOptions: ReturnType<Chart["getCvdOptions"]>;
  readonly depthOptions: ReturnType<Chart["getDepthOptions"]>;
}

interface StudioDialog {
  readonly kind: "confirm" | "prompt" | "navigate";
  readonly title: string;
  readonly message: string;
  readonly initialValue?: string;
  readonly onSubmit: (value: string) => void;
  readonly onSaveContinue?: () => void;
  readonly onDiscardContinue?: () => void;
}

interface PendingStudioNavigation {
  readonly generation: number;
  readonly proceed: () => void;
}

interface ChartPanelHandle {
  getChart(): Chart | null;
  serializeWorkspace(metadata?: WorkspaceMetadata): WorkspaceDocument;
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
  readonly onDrawingCommitted?: (panelId: string, drawingId: string) => void;
  readonly comparison: ComparisonPanelState | null;
}

interface ComparisonPanelState {
  readonly active: boolean;
  readonly mode: ComparisonNormalizationMode;
  readonly lines: readonly ComparisonAssetOutput[];
}

function comparisonSeriesId(assetId: string): string {
  return `comparison-${encodeURIComponent(assetId)}`;
}

const WORKSPACES_KEY = "openkline-studio-workspaces-v1";
const LEGACY_WORKSPACE_KEY = "openkline-studio-workspace-v1";
const DEFAULT_WORKSPACE_ID = "studio-default";
const symbols = ["BTC-USD", "ETH-USD", "AAPL"] as const;
const comparisonColors = ["#f59e0b", "#60a5fa", "#34d399"] as const;
const timeframes: readonly Timeframe[] = ["5m", "1h", "4h", "1D"];
const layoutChoices: ReadonlyArray<readonly [StudioLayout, string]> = [
  ["single", "Single chart"],
  ["two-horizontal", "Two side by side"],
  ["two-vertical", "Two vertical"],
  ["four-grid", "Four chart grid"],
];
const indicatorSupportedIds = [
  "SMA", "EMA", "RSI", "MACD", "BOLLINGER_BANDS", "ATR", "STOCHASTIC", "VWAP",
  "ROC", "CCI", "WILLIAMS_R", "OBV", "MFI", "ADX", "DONCHIAN_CHANNELS", "KELTNER_CHANNELS",
] as const;
const indicatorChoices = [
  ["SMA", "SMA · 20"], ["EMA", "EMA · 20"], ["RSI", "RSI · 14"],
  ["MACD", "MACD · 12/26/9"], ["BOLLINGER_BANDS", "Bollinger Bands · 20"],
  ["ATR", "ATR · 14"], ["STOCHASTIC", "Stochastic · 14/3"], ["VWAP", "VWAP · UTC day"],
  ["ROC", "ROC · 14"], ["CCI", "CCI · 20"], ["WILLIAMS_R", "Williams %R · 14"],
  ["OBV", "OBV"], ["MFI", "MFI · 14"], ["ADX", "ADX · 14 (+DI/-DI)"],
  ["DONCHIAN_CHANNELS", "Donchian Channels · 20"], ["KELTNER_CHANNELS", "Keltner Channels · 20/2"],
] as const;
const indicatorRegistry = createDefaultIndicatorRegistry();
const indicatorCatalog = buildStudioIndicatorCatalog(indicatorRegistry, indicatorSupportedIds);
const indicatorCategories = listStudioIndicatorCategories(indicatorCatalog);
const drawingSupportedTypes = [
  "trend-line", "ray", "extended-line", "parallel-channel",
  "horizontal-line", "vertical-line", "rectangle",
  "fibonacci-retracement", "fibonacci-extension", "price-range",
  "date-range", "long-position", "short-position", "text",
] as const;
const drawingToolbarCatalog = buildStudioDrawingToolbarCatalog(builtInDrawingTools, drawingSupportedTypes);
const drawingToolGroups = listStudioDrawingToolGroups(drawingToolbarCatalog);
const drawingTools = drawingToolbarCatalog.map((entry) => [entry.type, entry.label] as const);
const presentationChoices: ReadonlyArray<readonly [Presentation, string]> = [
  ["candles", "Candles"], ["ohlc", "OHLC"], ["hollow", "Hollow"], ["heikin-ashi", "Heikin-Ashi"], ["line", "Line"], ["area", "Area"], ["baseline", "Baseline"],
];
const scaleModes: ReadonlyArray<readonly [PriceScaleMode, string]> = [["linear", "Linear"], ["logarithmic", "Log"], ["percentage", "%"], ["indexed", "Index 100"]];
const defaultScript = STUDIO_KLINESCRIPT_TEMPLATES[0]!.source;
const IDLE_REPLAY_STATUS: ReplayStatus = { state: "idle", currentIndex: null, currentTimestamp: null, totalBars: 0, speed: 1 };
const studioTradingCalendar = new TradingCalendarEngine({
  id: "openkline-studio-demo-market",
  version: "2026.1",
  timeZone: "America/New_York",
  weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:30", end: "16:00" }] })),
  exceptions: [{ date: "2026-07-03", kind: "modified", classification: "early-close", segments: [{ start: "09:30", end: "13:00" }] }],
});

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

/**
 * Deterministic, clearly labelled offline fixtures for the Studio walkthrough.
 * These values demonstrate the public order-flow APIs; they are not exchange
 * prints and must never be presented as live market data.
 */
function buildStudioTrades(symbol: string, candles: readonly Candle[]): MarketTrade[] {
  const source = { id: "studio-illustrative-order-flow", version: "1" };
  return candles.slice(-96).flatMap((candle, index) => {
    const price = Number(candle.close.toFixed(2));
    const quantity = 1 + (index % 5) * 0.25;
    return [
      { id: `${symbol}-illustrative-buy-${candle.time}`, instrumentId: symbol, time: candle.time, price, quantity, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source },
      { id: `${symbol}-illustrative-sell-${candle.time}`, instrumentId: symbol, time: candle.time + 1, price: Number((price - 0.01).toFixed(2)), quantity: quantity * 0.7, aggressorSide: index % 11 === 0 ? "unknown" as const : "sell" as const, sideQuality: index % 11 === 0 ? "unknown" as const : "observed" as const, revision: 0, source },
    ];
  });
}

function buildStudioDepth(symbol: string, candle: Candle): OrderBookSnapshot {
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

function seedStudioOrderFlow(target: Chart, symbol: string, timeframe: Timeframe, candles: readonly Candle[]): void {
  const footprintOptions = target.getFootprintOptions();
  const cvdOptions = target.getCvdOptions();
  const depthOptions = target.getDepthOptions();
  target.removeOrderFlow();
  target.setMarketTrades(buildStudioTrades(symbol, candles));
  target.setFootprintOptions({ ...footprintOptions, intervalMs: intervalFor(timeframe), tickSize: 0.01, offTickPolicy: "round" });
  target.setCvdOptions({ ...cvdOptions, intervalMs: intervalFor(timeframe), pane: cvdOptions.pane === "new" ? "new" : cvdOptions.pane });
  target.setDepthOptions(depthOptions);
  const snapshot = buildStudioDepth(symbol, candles.at(-1) ?? candles[0]!);
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
}

class RecoverableStudioDatafeed implements Datafeed {
  private readonly source: InMemoryDatafeed;
  private readonly hiddenHistoricalTimes = new Set<number>();
  private readonly subscriptions = new Set<DatafeedRealtimeSubscriptionArgs>();
  private latestCandle: Candle;
  private streaming = true;

  public constructor(info: SymbolInfo, candles: readonly Candle[]) {
    this.source = new InMemoryDatafeed(info, candles);
    const latest = candles.at(-1);
    if (latest === undefined) throw new Error("Studio datafeed requires at least one candle");
    this.latestCandle = { ...latest };
  }

  public resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo> {
    return this.source.resolveSymbol(symbol, signal);
  }

  public async getBars(query: GetBarsQuery): Promise<readonly Candle[]> {
    const bars = await this.source.getBars(query);
    return bars.filter((bar) => !this.hiddenHistoricalTimes.has(bar.time));
  }

  public subscribeBars(args: SubscribeBarsArgs): () => void {
    const lifecycleArgs = args as DatafeedRealtimeSubscriptionArgs;
    const wrapped: DatafeedRealtimeSubscriptionArgs = {
      symbol: lifecycleArgs.symbol,
      timeframe: lifecycleArgs.timeframe,
      onBar: (bar) => { if (this.streaming) lifecycleArgs.onBar(bar); },
      ...(lifecycleArgs.onError === undefined ? {} : { onError: lifecycleArgs.onError }),
      ...(lifecycleArgs.onStatus === undefined ? {} : { onStatus: lifecycleArgs.onStatus }),
    };
    this.subscriptions.add(lifecycleArgs);
    const unsubscribe = this.source.subscribeBars(wrapped);
    return () => {
      this.subscriptions.delete(lifecycleArgs);
      unsubscribe();
    };
  }

  public pushBar(candle: Candle): void {
    this.latestCandle = { ...candle };
    this.source.pushBar(candle);
  }

  public pushNextBar(interval: number): Candle {
    const previous = this.latestCandle;
    const close = previous.close * 1.0005;
    const next: Candle = {
      time: previous.time + interval,
      open: previous.close,
      high: Math.max(previous.close, close) + Math.abs(previous.close - close) * 0.25,
      low: Math.min(previous.close, close) - Math.abs(previous.close - close) * 0.25,
      close,
      volume: (previous.volume ?? 0) + 10,
    };
    this.pushBar(next);
    return next;
  }

  public getLatestTime(): number {
    return this.latestCandle.time;
  }

  public emitStatus(status: "connected" | "reconnected" | "disconnected" | "stopped"): void {
    if (status === "disconnected" || status === "stopped") this.streaming = false;
    if (status === "connected" || status === "reconnected") this.streaming = true;
    for (const subscription of this.subscriptions) subscription.onStatus?.(status);
  }

  public hideHistoricalBar(time: number): void {
    this.hiddenHistoricalTimes.add(time);
  }

  public restoreHiddenHistoricalBars(): void {
    this.hiddenHistoricalTimes.clear();
  }
}

function createStudioComparisonDatafeed(symbol: string, timeframe: Timeframe): RecoverableStudioDatafeed {
  return new RecoverableStudioDatafeed({ symbol, timezone: "UTC", pricePrecision: 2 }, buildCandles(symbol, timeframe));
}

type StudioComparisonSource = "demo" | "binance";

interface StudioDatafeedSource {
  readonly datafeed: Datafeed;
  readonly symbol: string;
}

function unavailableBinanceDatafeed(symbol: string, timeframe: Timeframe, reason: string): StudioDatafeedSource {
  const message = `Binance does not support Studio symbol ${symbol} or timeframe ${timeframe}: ${reason}`;
  return {
    symbol,
    datafeed: {
      async resolveSymbol(): Promise<SymbolInfo> { throw new Error(message); },
      async getBars(): Promise<readonly Candle[]> { throw new Error(message); },
    },
  };
}

function createBinanceStudioDatafeed(symbol: string, timeframe: Timeframe): StudioDatafeedSource {
  const providerSymbol = binanceStudioSymbol(symbol);
  const interval = binanceStudioInterval(timeframe);
  if (providerSymbol === null || interval === null) return unavailableBinanceDatafeed(symbol, timeframe, "no explicit provider mapping is configured");
  return { symbol: providerSymbol, datafeed: createBinanceDatafeed({ symbol: providerSymbol, interval }) };
}

function createStudioDatafeedSource(symbol: string, timeframe: Timeframe, source: StudioComparisonSource): StudioDatafeedSource {
  if (source === "binance") return createBinanceStudioDatafeed(symbol, timeframe);
  return { symbol, datafeed: createStudioComparisonDatafeed(symbol, timeframe) };
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
function comparisonPointValue(value: CrosshairMoveEvent["series"][number]["value"]): number | null { if (value === null) return null; return "value" in value ? value.value : value.close; }
function formatComparisonValue(value: number | null, mode: ComparisonNormalizationMode): string { if (value === null) return "—"; return mode === "percentage" ? `${value >= 0 ? "+" : ""}${value.toFixed(2)}%` : value.toFixed(2); }
function latestComparisonTime(lines: readonly ComparisonAssetOutput[], id: string, fallback: number | null, replayActive: boolean): number | null {
  if (!replayActive) return fallback;
  return lines.find((line) => line.id === id)?.data.at(-1)?.time ?? null;
}
function textForReplay(status: ReplayStatus, timeZone: string): string { return status.currentTimestamp === null ? "No current bar" : new Date(status.currentTimestamp).toLocaleString(undefined, { timeZone }); }
function panelKey(panel: PanelState): string { return `${panel.symbol}|${panel.timeframe}`; }
function utcInputValue(time: number | undefined): string {
  return time === undefined || !Number.isFinite(time) ? "" : new Date(time).toISOString().slice(0, 16);
}
function parseUtcInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}:00Z`);
  return Number.isSafeInteger(time) && time >= 0 ? time : null;
}

function toStudioColorInput(value: string | undefined): string {
  return value !== undefined && /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#60a5fa";
}

function emptySnapshot(): PanelSnapshot {
  return {
    series: [], indicators: [], drawings: [], selectedDrawingId: null, activeDrawingTool: null, alerts: [], alertHistory: [], replayStatus: IDLE_REPLAY_STATUS,
    replaySourceLength: 0, replayStartIndex: 84, replayVisibleLatest: null, anchoredVwaps: [], volumeProfiles: [],
    multiTimeframeIndicators: [], multiTimeframeReferences: [], tradingCalendar: null, sessionIndicators: [], sessionReferences: [],
    orderFlow: { tradeCount: 0, tradeCoverage: "empty", footprint: null, cvd: null, depth: null, depthMetrics: null },
    footprintOptions: { visible: false, intervalMs: 60_000, tickSize: 1, offTickPolicy: "reject", showLabels: true, opacity: 0.5, buyColor: "#22c55e", sellColor: "#ef4444", unknownColor: "#94a3b8", maxCells: 20_000 },
    cvdOptions: { visible: false, intervalMs: 60_000, reset: "continuous", pane: "new", color: "#38bdf8", lineWidth: 2, baselineColor: "#64748b", sourceCoverage: "unknown" },
    depthOptions: { visible: false, maxLevels: 10, showLabels: true, showHeatmap: false, opacity: 0.5, bidColor: "#22c55e", askColor: "#ef4444", maxHistory: 2_000 },
  };
}

function withoutComparisonSeries(workspace: WorkspaceDocument): WorkspaceDocument {
  const series = workspace.series.filter((item) => !item.id.startsWith("comparison-"));
  return series.length === workspace.series.length ? workspace : { ...workspace, series };
}

function withWorkspaceMetadata(workspace: WorkspaceDocument, metadata?: WorkspaceMetadata): WorkspaceDocument {
  if (metadata === undefined) return workspace;
  return { ...workspace, metadata: { ...workspace.metadata, ...metadata } };
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

const ChartPanel = forwardRef<ChartPanelHandle, ChartPanelProps>(function ChartPanel({ panel, active, initialWorkspace, onActivate, onReady, onSnapshot, onCrosshair, onViewport, onNotice, onDrawingCommitted, comparison }, ref) {
  const chartHandle = useRef<FinancialChartHandle>(null);
  const chartRef = useRef<Chart | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const replayRef = useRef<ReplayApi | null>(null);
  const replayUnsubscribeRef = useRef<(() => void) | null>(null);
  const symbolWorkspacesRef = useRef(new Map<string, WorkspaceDocument>());
  const initializedRef = useRef(false);
  const marketKeyRef = useRef(panelKey(panel));
  const comparisonSeriesIdsRef = useRef<Set<string>>(new Set());
  const comparisonNormalStylesRef = useRef(new Map<string, SeriesStyle>());
  const comparisonNormalProfileVisibilityRef = useRef(new Map<string, boolean>());
  const comparisonMultiTimeframeVisibilityRef = useRef(new Map<string, boolean>());
  const comparisonNormalScaleRef = useRef<PriceScaleConfiguration | null>(null);
  const comparisonActiveRef = useRef(false);
  const canonicalWorkspaceRef = useRef<WorkspaceDocument | null>(null);
  const comparisonStateRef = useRef<ComparisonPanelState | null>(comparison);
  const applyComparisonRef = useRef<(next: ComparisonPanelState | null) => void>(() => undefined);
  const activeDrawingToolRef = useRef<string | null>(null);
  const drawingCountRef = useRef(0);
  const onDrawingCommittedRef = useRef(onDrawingCommitted);
  onDrawingCommittedRef.current = onDrawingCommitted;
  comparisonStateRef.current = comparison;
  const [snapshot, setSnapshot] = useState<PanelSnapshot>(emptySnapshot);
  const [crosshairTime, setCrosshairTime] = useState<number | null>(null);
  const [visibleTimeRange, setVisibleTimeRange] = useState<{ readonly from: number | null; readonly to: number | null } | null>(null);

  const publish = useCallback((target = chartRef.current, replayStatus = snapshot.replayStatus, replaySourceLength = snapshot.replaySourceLength, replayStartIndex = snapshot.replayStartIndex): void => {
    if (target === null) return;
    const workspace = withoutComparisonSeries(target.serializeWorkspace());
    if (!comparisonActiveRef.current) canonicalWorkspaceRef.current = workspace;
    const replayVisibleLatest = workspace.series.reduce<number | null>((latest, series) => {
      const candidate = series.data.at(-1)?.time;
      return candidate === undefined || (latest !== null && candidate <= latest) ? latest : candidate;
    }, null);
    const next: PanelSnapshot = {
      series: target.getSeriesInfo(),
      indicators: workspace.indicators.map((indicator) => ({
        id: indicator.id,
        indicatorId: indicator.indicatorId,
        paneId: indicator.paneId,
        ...(indicator.script === undefined ? {} : { script: { programId: indicator.script.programId, source: indicator.script.source } }),
      })),
      drawings: target.getDrawings(), selectedDrawingId: target.getSelectedDrawingId(), activeDrawingTool: activeDrawingToolRef.current, alerts: target.getAlerts(), alertHistory: target.getAlertHistory(), replayStatus, replaySourceLength, replayStartIndex, replayVisibleLatest,
      anchoredVwaps: target.getAnchoredVwaps().map((item) => ({ id: item.id, ...item.getOptions() })),
      volumeProfiles: target.getVolumeProfiles().map((item) => item.getOptions()),
      multiTimeframeIndicators: target.getMultiTimeframeIndicators().map((item) => ({ id: item.id, indicatorId: item.indicatorId, targetTimeframe: item.getOptions().targetTimeframe, visible: item.getOptions().visible })),
      multiTimeframeReferences: target.getMultiTimeframeReferences().map((item) => ({ id: item.id, targetTimeframe: item.getOptions().targetTimeframe, visible: item.getOptions().visible })),
      tradingCalendar: target.getTradingCalendar() === null ? null : {
        calendarId: target.getTradingCalendar()!.getSnapshot().calendarId,
        version: target.getTradingCalendar()!.getSnapshot().version,
        visible: target.getTradingCalendar()!.getDisplayOptions().visible,
      },
      sessionIndicators: target.getSessionIndicators().map((item) => ({ id: item.id, indicatorId: item.getOptions().indicatorId, targetPeriod: item.getOptions().targetPeriod, visible: item.getOptions().visible })),
      sessionReferences: target.getSessionReferences().map((item) => ({ id: item.id, targetPeriod: item.getOptions().targetPeriod, visible: item.getOptions().visible })),
      orderFlow: target.getOrderFlowState(),
      footprintOptions: target.getFootprintOptions(),
      cvdOptions: target.getCvdOptions(),
      depthOptions: target.getDepthOptions(),
    };
    setSnapshot(next);
    onSnapshot(panel.panelId, next);
    queueMicrotask(() => syncMainPaneDiagnostics(target, rootRef.current));
  }, [onSnapshot, panel.panelId, snapshot.replaySourceLength, snapshot.replayStartIndex, snapshot.replayStatus]);

  const seedChart = useCallback((target: Chart, symbol: string, timeframe: Timeframe): void => {
    const candles = buildCandles(symbol, timeframe);
    target.setTradingCalendar(studioTradingCalendar, { showLabels: false });
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
    seedStudioOrderFlow(target, symbol, timeframe, candles);
    marketKeyRef.current = `${symbol}|${timeframe}`;
    publish(target, IDLE_REPLAY_STATUS, candles.length, Math.floor(candles.length * 0.35));
  }, [publish]);

  const attachChart = useCallback((target: Chart): void => {
    chartRef.current = target;
    if (initialWorkspace === undefined) seedChart(target, panel.symbol, panel.timeframe);
    else {
      try {
        const canonical = withoutComparisonSeries(initialWorkspace);
        target.restoreWorkspace(canonical, { tradingCalendarResolver: (id, version) => id === studioTradingCalendar.id && version === studioTradingCalendar.version ? studioTradingCalendar : undefined });
        seedStudioOrderFlow(target, panel.symbol, panel.timeframe, buildCandles(panel.symbol, panel.timeframe));
        canonicalWorkspaceRef.current = canonical;
        publish(target, IDLE_REPLAY_STATUS, target.getData().length, Math.floor(target.getData().length * 0.35));
      }
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
    drawingCountRef.current = target.getDrawings().length;
    activeDrawingToolRef.current = null;
    target.subscribe("drawingSelection", () => publish());
    target.subscribe("toolActivation", (event) => {
      activeDrawingToolRef.current = event.active ? event.type : null;
      const nextCount = target.getDrawings().length;
      if (!event.active && nextCount > drawingCountRef.current) {
        const committedId = target.getSelectedDrawingId() ?? target.getDrawings().at(-1)?.id;
        if (committedId !== undefined && committedId !== null) onDrawingCommittedRef.current?.(panel.panelId, committedId);
      }
      drawingCountRef.current = nextCount;
      publish();
    });
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

  const serializeCanonicalWorkspace = useCallback((metadata?: WorkspaceMetadata): WorkspaceDocument => {
    const target = chartRef.current;
    if (target === null) return emptyWorkspace(metadata?.symbol ?? panel.symbol, metadata?.timeframe ?? panel.timeframe);
    if (comparisonActiveRef.current && canonicalWorkspaceRef.current !== null) return withWorkspaceMetadata(canonicalWorkspaceRef.current, metadata);
    const workspace = withoutComparisonSeries(target.serializeWorkspace(metadata));
    canonicalWorkspaceRef.current = workspace;
    return workspace;
  }, [panel.symbol, panel.timeframe]);

  const replaceMarketData = useCallback((symbol: string, timeframe: Timeframe): void => {
    const target = chartRef.current;
    if (target === null || !initializedRef.current) return;
    const oldKey = marketKeyRef.current;
    const current = serializeCanonicalWorkspace({ symbol, timeframe });
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
    try {
      target.restoreWorkspace(nextWorkspace, { tradingCalendarResolver: (id, version) => id === studioTradingCalendar.id && version === studioTradingCalendar.version ? studioTradingCalendar : undefined });
      seedStudioOrderFlow(target, symbol, timeframe, candles);
      canonicalWorkspaceRef.current = nextWorkspace;
      comparisonActiveRef.current = false;
      comparisonSeriesIdsRef.current = new Set();
      comparisonNormalStylesRef.current.clear();
      comparisonNormalProfileVisibilityRef.current.clear();
      comparisonMultiTimeframeVisibilityRef.current.clear();
      comparisonNormalScaleRef.current = null;
      marketKeyRef.current = `${symbol}|${timeframe}`;
      publish(target, IDLE_REPLAY_STATUS, candles.length, Math.floor(candles.length * 0.35));
      if (comparisonStateRef.current?.active === true) queueMicrotask(() => applyComparisonRef.current(comparisonStateRef.current));
      onNotice(`${panel.panelId}: loaded ${symbol} at ${timeframe}; symbol-scoped drawings were restored only when previously saved.`);
    }
    catch (error) { onNotice(`Could not change ${panel.panelId}: ${error instanceof Error ? error.message : String(error)}`); }
  }, [onNotice, panel.panelId, publish, serializeCanonicalWorkspace]);

  const restoreWorkspace = useCallback((document: WorkspaceDocument): void => {
    const target = chartRef.current;
    if (target === null) return;
    try {
      cancelStudioInteractiveDrawing(target);
      activeDrawingToolRef.current = null;
      const canonical = withoutComparisonSeries(document);
      target.restoreWorkspace(canonical, { tradingCalendarResolver: (id, version) => id === studioTradingCalendar.id && version === studioTradingCalendar.version ? studioTradingCalendar : undefined });
      seedStudioOrderFlow(target, panel.symbol, panel.timeframe, buildCandles(panel.symbol, panel.timeframe));
      canonicalWorkspaceRef.current = canonical;
      comparisonActiveRef.current = false;
      comparisonSeriesIdsRef.current = new Set();
      comparisonNormalStylesRef.current.clear();
      comparisonNormalProfileVisibilityRef.current.clear();
      comparisonMultiTimeframeVisibilityRef.current.clear();
      comparisonNormalScaleRef.current = null;
      drawingCountRef.current = target.getDrawings().length;
      publish(target, IDLE_REPLAY_STATUS, target.getData().length, Math.floor(target.getData().length * 0.35));
      if (comparisonStateRef.current?.active === true) queueMicrotask(() => applyComparisonRef.current(comparisonStateRef.current));
    }
    catch (error) { onNotice(`Could not restore ${panel.panelId}: ${error instanceof Error ? error.message : String(error)}`); }
  }, [onNotice, panel.panelId, publish]);

  const applyComparison = useCallback((next: ComparisonPanelState | null): void => {
    const target = chartRef.current;
    if (target === null || !initializedRef.current || replayRef.current !== null) return;
    if (next?.active === true) {
      if (!comparisonActiveRef.current) {
        canonicalWorkspaceRef.current = withoutComparisonSeries(target.serializeWorkspace());
        comparisonNormalStylesRef.current.clear();
        comparisonNormalProfileVisibilityRef.current.clear();
        const existingComparisonIds = new Set(target.getSeriesIds().filter((id) => id.startsWith("comparison-")));
        comparisonSeriesIdsRef.current = existingComparisonIds;
        target.getSeriesInfo().forEach((series) => {
          if (!existingComparisonIds.has(series.id)) comparisonNormalStylesRef.current.set(series.id, { ...series.style });
        });
        comparisonNormalScaleRef.current = target.getPriceScaleOptions();
        target.getVolumeProfiles().forEach((profile) => {
          comparisonNormalProfileVisibilityRef.current.set(profile.id, profile.getOptions().visible);
          profile.setVisible(false);
        });
        target.getMultiTimeframeIndicators().forEach((indicator) => {
          comparisonMultiTimeframeVisibilityRef.current.set(`indicator:${indicator.id}`, indicator.getOptions().visible !== false);
          indicator.setVisible(false);
        });
        target.getMultiTimeframeReferences().forEach((reference) => {
          comparisonMultiTimeframeVisibilityRef.current.set(`reference:${reference.id}`, reference.getOptions().visible !== false);
          reference.setVisible(false);
        });
        comparisonActiveRef.current = true;
      }
      const nextIds = new Set<string>();
      for (const line of next.lines) {
        const id = comparisonSeriesId(line.id);
        nextIds.add(id);
        if (target.getSeriesIds().includes(id)) target.removeSeries(id);
        const series = target.addLineSeries({ id, title: line.label, style: { color: line.color ?? "#60a5fa", lineWidth: 2, visible: true } });
        series.setData(line.data);
        target.setSeriesStyle(id, { color: line.color ?? "#60a5fa", lineWidth: 2, visible: true });
      }
      for (const id of comparisonSeriesIdsRef.current) {
        if (!nextIds.has(id) && target.getSeriesIds().includes(id)) target.removeSeries(id);
      }
      comparisonSeriesIdsRef.current = nextIds;
      for (const series of target.getSeriesInfo()) {
        if (!nextIds.has(series.id)) target.setSeriesStyle(series.id, { visible: false });
      }
      target.setPriceScaleOptions({ mode: "linear", autoScale: true, axisVisible: true });
      return;
    }
    if (!comparisonActiveRef.current) return;
    for (const id of comparisonSeriesIdsRef.current) {
      if (target.getSeriesIds().includes(id)) target.removeSeries(id);
    }
    for (const [id, style] of comparisonNormalStylesRef.current) {
      if (target.getSeriesIds().includes(id)) target.setSeriesStyle(id, style);
    }
    for (const [id, visible] of comparisonNormalProfileVisibilityRef.current) {
      target.getVolumeProfiles().find((profile) => profile.id === id)?.setVisible(visible);
    }
    for (const [key, visible] of comparisonMultiTimeframeVisibilityRef.current) {
      const [kind, id] = key.split(":", 2);
      if (kind === "indicator") target.getMultiTimeframeIndicators().find((indicator) => indicator.id === id)?.setVisible(visible);
      if (kind === "reference") target.getMultiTimeframeReferences().find((reference) => reference.id === id)?.setVisible(visible);
    }
    const savedScale = comparisonNormalScaleRef.current;
    if (savedScale !== null) {
      target.setPriceScaleOptions({
        mode: savedScale.mode,
        autoScale: savedScale.autoScale,
        ...(savedScale.referencePrice === undefined ? {} : { referencePrice: savedScale.referencePrice }),
        marginTop: savedScale.marginTop,
        marginBottom: savedScale.marginBottom,
        axisVisible: savedScale.axisVisible,
      });
      if (savedScale.range !== undefined) target.setPriceScaleRange(savedScale.range);
    }
    comparisonSeriesIdsRef.current = new Set();
    comparisonNormalStylesRef.current.clear();
    comparisonNormalProfileVisibilityRef.current.clear();
    comparisonMultiTimeframeVisibilityRef.current.clear();
    comparisonNormalScaleRef.current = null;
    comparisonActiveRef.current = false;
    canonicalWorkspaceRef.current = withoutComparisonSeries(target.serializeWorkspace());
  }, []);

  applyComparisonRef.current = applyComparison;

  useEffect(() => {
    applyComparison(comparison);
  }, [applyComparison, comparison]);

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
    serializeWorkspace: serializeCanonicalWorkspace,
    refresh: () => publish(),
    getSnapshot: () => snapshot,
    replaceMarketData,
    restoreWorkspace,
    enterReplay,
    replayCommand: (command) => { if (replayRef.current !== null) command(replayRef.current); },
    exitReplay,
    setReplayStartIndex: (index) => setSnapshot((current) => ({ ...current, replayStartIndex: index })),
  }), [enterReplay, exitReplay, publish, replaceMarketData, restoreWorkspace, serializeCanonicalWorkspace, snapshot]);

  useEffect(() => {
    const nextKey = panelKey(panel);
    if (initializedRef.current && nextKey !== marketKeyRef.current) replaceMarketData(panel.symbol, panel.timeframe);
  }, [panel.symbol, panel.timeframe, replaceMarketData]);

  useEffect(() => () => { replayUnsubscribeRef.current?.(); replayRef.current?.dispose(); replayRef.current = null; }, []);

  const visibleRangeLabel = visibleTimeRange === null || visibleTimeRange.from === null || visibleTimeRange.to === null ? "empty" : `${visibleTimeRange.from}:${visibleTimeRange.to}`;
  return <article ref={rootRef} className={`${styles.multiChartPanel} ${active ? styles.multiChartPanelActive : ""}`} onPointerDown={() => onActivate(panel.panelId)} data-panel-id={panel.panelId} data-crosshair-time={crosshairTime === null ? "" : String(crosshairTime)} data-visible-time-range={visibleRangeLabel} data-replay-cutoff={snapshot.replayStatus.currentTimestamp === null ? "" : String(snapshot.replayStatus.currentTimestamp)} data-replay-visible-latest={snapshot.replayVisibleLatest === null ? "" : String(snapshot.replayVisibleLatest)}>
    <header className={styles.multiPanelHeader}><button type="button" className={styles.panelSelect} aria-label={`Activate ${panel.panelId}`} aria-pressed={active} onClick={() => onActivate(panel.panelId)}>{panel.panelId} · {panel.symbol} · {panel.timeframe}</button><span>{snapshot.indicators.length} indicators</span><span>{snapshot.drawings.length} drawings</span><span aria-label={`UTC crosshair for ${panel.panelId}`}>{crosshairTime === null ? "Crosshair —" : `Crosshair ${new Date(crosshairTime).toISOString()}`}</span></header>
    <div className={styles.multiChartCanvas}><FinancialChart ref={chartHandle} autoSize theme="dark" locale="en-US" timeZone="UTC" pricePrecision={2} onChartReady={attachChart} style={{ height: "100%" }} /></div>
  </article>;
});

function defaultWatchlists(): WatchlistDocument {
  return { version: 1, selectedWatchlistId: "watchlist-favorites", lists: [{ id: "watchlist-favorites", name: "Favorites", symbols: symbols.map((displaySymbol, index) => ({ id: displaySymbol, displaySymbol, name: displaySymbol === "BTC-USD" ? "Bitcoin" : displaySymbol === "ETH-USD" ? "Ether" : "Apple Inc.", exchange: displaySymbol === "AAPL" ? "NASDAQ" : "Demo", assetCategory: displaySymbol === "AAPL" ? "Equity" : "Crypto", quoteCurrency: "USD", favorite: index === 0 })) }] };
}

export default function MultiChartStudioClient() {
  const panelRefs = useRef(new Map<string, ChartPanelHandle>());
  const strategyResultsRef = useRef(new Map<string, BacktestResult>());
  const appliedStrategyParametersRef = useRef(new Map<string, { readonly strategyId: string; readonly parameters: Readonly<Record<string, unknown>> }>());
  const archivedPanelsRef = useRef(new Map<string, { panel: PanelState; workspace?: WorkspaceDocument }>());
  const pendingRestoreRef = useRef<StudioWorkspaceDocument | null>(null);
  const pendingBaselineAfterRestoreRef = useRef<StudioWorkspaceDocument | null>(null);
  const syncControllerRef = useRef<ChartSynchronizationController | null>(null);
  if (syncControllerRef.current === null) {
    syncControllerRef.current = new ChartSynchronizationController();
  }
  const serialRef = useRef(2);
  const scriptGenerationRef = useRef(0);
  const snapshotsRef = useRef<Record<string, PanelSnapshot>>({});
  const activePanelIdRef = useRef("chart-1");
  const [layout, setLayout] = useState<StudioLayout>("single");
  const [panels, setPanels] = useState<PanelState[]>([{ panelId: "chart-1", symbol: "BTC-USD", timeframe: "1h" }]);
  const [activePanelId, setActivePanelId] = useState("chart-1");
  // Only the active panel's snapshot is mirrored into React state so inactive
  // panel publishes (drawing/viewport/indicator churn) do not re-render Studio.
  const [activeSnapshotState, setActiveSnapshotState] = useState<PanelSnapshot>(() => emptySnapshot());
  const [panelReadyEpoch, setPanelReadyEpoch] = useState(0);
  const [sync, setSync] = useState({ crosshair: false, visibleRange: false, symbol: false, timeframe: false });
  const [watchlistModel, setWatchlistModel] = useState(() => new WatchlistModel(defaultWatchlists(), (prefix) => `${prefix}-studio-${serialRef.current++}`));
  const [watchlists, setWatchlists] = useState<WatchlistDocument>(() => watchlistModel.getDocument());
  const [quotes, setQuotes] = useState<Record<string, WatchlistQuote>>({});
  const [watchlistSearch, setWatchlistSearch] = useState("");
  const [workspaceName, setWorkspaceName] = useState("Default workspace");
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [workspaceEntries, setWorkspaceEntries] = useState<ReadonlyArray<{ readonly id: string; readonly name: string }>>([{ id: DEFAULT_WORKSPACE_ID, name: "Default workspace" }]);
  const [restoreSummary, setRestoreSummary] = useState<{ readonly name: string; readonly panelCount: number; readonly panelIds: readonly string[] } | null>(null);
  const [notice, setNotice] = useState("Ready. Multi-chart Studio uses deterministic demo data; no vendor credentials are required.");
  const [crosshair, setCrosshair] = useState<CrosshairMoveEvent | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [scriptOpen, setScriptOpen] = useState(false);
  const [scriptSource, setScriptSource] = useState(defaultScript);
  const [scriptLibrarySearch, setScriptLibrarySearch] = useState("");
  const [localUserScripts, setLocalUserScripts] = useState<ReadonlyArray<{ readonly name: string; readonly source: string }>>([]);
  const [indicatorToAdd, setIndicatorToAdd] = useState<string>("SMA");
  const [selectedAppliedIndicatorId, setSelectedAppliedIndicatorId] = useState<string | null>(null);
  const [indicatorSearch, setIndicatorSearch] = useState("");
  const [indicatorCategory, setIndicatorCategory] = useState("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favoriteIndicatorIds, setFavoriteIndicatorIds] = useState<string[]>(["SMA", "EMA", "RSI"]);
  const [indicatorPeriodOverride, setIndicatorPeriodOverride] = useState("");
  const [indicatorConstant, setIndicatorConstant] = useState("0.015");
  const [indicatorMultiplier, setIndicatorMultiplier] = useState("2");
  const [multiTimeframeIndicator, setMultiTimeframeIndicator] = useState<"SMA" | "EMA" | "RSI">("SMA");
  const [multiTimeframeTarget, setMultiTimeframeTarget] = useState<Timeframe>("4h");
  const [multiTimeframePeriod, setMultiTimeframePeriod] = useState("20");
  const [multiTimeframeFinality, setMultiTimeframeFinality] = useState<MultiTimeframeFinalityPolicy>("complete-only");
  const [multiTimeframeReference, setMultiTimeframeReference] = useState(true);
  const [sessionIndicatorEnabled, setSessionIndicatorEnabled] = useState(false);
  const [sessionReferenceEnabled, setSessionReferenceEnabled] = useState(false);
  const [sessionCalendarVisible, setSessionCalendarVisible] = useState(true);
  const [sessionPeriod, setSessionPeriod] = useState<TradingAggregationPeriod>("session");
  const [presentation, setPresentation] = useState<Presentation>("candles");
  const [comparisonSettings, setComparisonSettings] = useState<StudioComparisonDocument>(() => ({
    active: false,
    mode: "indexed",
    baselineTime: buildCandles("BTC-USD", "1h")[0]?.time ?? null,
    baselineMaxAgeMs: intervalFor("1h"),
    assetIds: ["BTC-USD", "ETH-USD"],
    dataSource: "demo",
  }));
  const [portfolioConfiguration, setPortfolioConfiguration] = useState<PortfolioBacktestWorkspaceDocument | null>(null);
  const [comparisonLines, setComparisonLines] = useState<ComparisonAssetOutput[]>([]);
  const comparisonDatafeedRef = useRef<ComparisonDatafeedController | null>(null);
  const comparisonFeedsRef = useRef(new Map<string, Datafeed>());
  const [comparisonFeedState, setComparisonFeedState] = useState<ComparisonDatafeedState | null>(null);
  const [scaleMode, setScaleMode] = useState<PriceScaleMode>("linear");
  const [autoScale, setAutoScale] = useState(true);
  const [axisVisible, setAxisVisible] = useState(true);
  const [marginTop, setMarginTop] = useState(0.08);
  const [marginBottom, setMarginBottom] = useState(0.08);
  const timeZone = "UTC";
  const [interaction, setInteraction] = useState({ wheelZoom: true, pointerPan: true, crosshair: true, keyboardShortcuts: true });
  const replayWasActiveRef = useRef(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [alertName, setAlertName] = useState("Close crosses threshold");
  const alertNameInputRef = useRef<HTMLInputElement>(null);
  const [lastAlertDiagnostic, setLastAlertDiagnostic] = useState<{ readonly inputValue: string; readonly createdName: string; readonly outcome: "accepted" | "rejected" } | null>(null);
  const [alertThreshold, setAlertThreshold] = useState(0);
  const [alertFrequency, setAlertFrequency] = useState<AlertFrequency>("once-per-bar");
  const [dialog, setDialog] = useState<StudioDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const dialogTriggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const dialogWasOpenRef = useRef(false);
  const [libraryBackingId, setLibraryBackingId] = useState<string | null>(null);
  const [baselineFingerprint, setBaselineFingerprint] = useState<string | null>(null);
  const [liveFingerprint, setLiveFingerprint] = useState<string | null>(null);
  const [sessionOriginFingerprint, setSessionOriginFingerprint] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const navigationGenerationRef = useRef(0);
  const pendingNavigationRef = useRef<PendingStudioNavigation | null>(null);
  const navigationBusyRef = useRef(false);
  /** True for brand-new / detached desks until the first meaningful user edit. */
  const [pristineUnsaved, setPristineUnsaved] = useState(true);

  const showConfirm = (title: string, message: string, onConfirm: () => void, trigger?: HTMLElement | null): void => {
    dialogTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogWasOpenRef.current = true;
    setDialogValue("");
    setDialogError(null);
    setDialog({ kind: "confirm", title, message, onSubmit: () => { setDialog(null); setDialogError(null); onConfirm(); } });
  };
  const showPrompt = (title: string, message: string, initialValue: string, onSubmit: (value: string) => void, trigger?: HTMLElement | null): void => {
    dialogTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogWasOpenRef.current = true;
    setDialogValue(initialValue);
    setDialogError(null);
    setDialog({
      kind: "prompt",
      title,
      message,
      initialValue,
      onSubmit: (value) => {
        try {
          onSubmit(value);
          setDialogError(null);
          setDialog(null);
        } catch (error) {
          // Keep the dialog open so validation failures remain keyboard-accessible
          // with an explicit alert and aria-invalid on the field (WCAG 3.3.1 / 4.1.3).
          setDialogError(error instanceof Error ? error.message : String(error));
        }
      },
    });
  };
  const clearPendingNavigation = (): void => {
    pendingNavigationRef.current = null;
    navigationBusyRef.current = false;
  };
  const showNavigateGuard = (title: string, message: string, onSaveContinue: () => void, onDiscardContinue: () => void, trigger?: HTMLElement | null): void => {
    dialogTriggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialogWasOpenRef.current = true;
    setDialogValue("");
    setDialogError(null);
    setDialog({
      kind: "navigate",
      title,
      message,
      onSubmit: () => undefined,
      onSaveContinue: () => {
        try {
          onSaveContinue();
        } catch (error) {
          setDialogError(error instanceof Error ? error.message : String(error));
        }
      },
      onDiscardContinue: () => {
        setDialog(null);
        setDialogError(null);
        onDiscardContinue();
      },
    });
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
      : dialog.kind === "navigate"
        ? dialogElement.querySelector<HTMLElement>('button[data-studio-navigate-action="cancel"]')
        : getFocusable()[0];
    preferred?.focus();
    if (preferred !== null && preferred !== undefined && document.activeElement !== preferred) getFocusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearPendingNavigation();
        setDialog(null);
        setDialogError(null);
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
  const activeSnapshot = activeSnapshotState;
  const replayActive = activeSnapshot.replayStatus.state !== "idle" && activeSnapshot.replayStatus.state !== "disposed";
  const chartReady = activeHandle !== null && activeHandle.getChart() !== null;

  useEffect(() => {
    activePanelIdRef.current = activePanelId;
    const cached = snapshotsRef.current[activePanelId];
    const live = panelRefs.current.get(activePanelId)?.getSnapshot();
    setActiveSnapshotState(cached ?? live ?? emptySnapshot());
  }, [activePanelId]);

  useEffect(() => () => {
    syncControllerRef.current?.destroy();
    syncControllerRef.current = null;
  }, []);
  const comparisonBaselineOptions = useMemo(() => {
    const candles = buildCandles(activePanel.symbol, activePanel.timeframe);
    const indexes = [0, Math.floor(candles.length * 0.25), Math.floor(candles.length * 0.5), Math.floor(candles.length * 0.75)];
    return [...new Set(indexes)].map((index) => candles[index]).filter((candle): candle is Candle => candle !== undefined);
  }, [activePanel.symbol, activePanel.timeframe]);
  const comparisonPanel = useMemo<ComparisonPanelState | null>(() => comparisonSettings.active
    ? { active: true, mode: comparisonSettings.mode, lines: comparisonLines }
    : null, [comparisonLines, comparisonSettings.active, comparisonSettings.mode]);
  const comparisonAssetKey = comparisonSettings.assetIds.join("\u0000");
  useEffect(() => {
    comparisonDatafeedRef.current?.dispose();
    comparisonDatafeedRef.current = null;
    setComparisonLines([]);
    setComparisonFeedState(null);
    if (!comparisonSettings.active) return undefined;

    const source: StudioComparisonSource = comparisonSettings.dataSource === "binance" ? "binance" : "demo";
    const interval = intervalFor(activePanel.timeframe);
    const primaryCandles = buildCandles(activePanel.symbol, activePanel.timeframe);
    const firstCandle = primaryCandles[0];
    const lastCandle = primaryCandles.at(-1);
    if (firstCandle === undefined || lastCandle === undefined) return undefined;
    const window = source === "binance"
      ? { from: Date.now() - interval * 240, to: Date.now() }
      : { from: firstCandle.time, to: lastCandle.time + interval };
    const baselineTime = source === "binance" && (comparisonSettings.baselineTime === null || comparisonSettings.baselineTime < window.from)
      ? window.from
      : comparisonSettings.baselineTime;
    const controller = new ComparisonDatafeedController({
      window,
      mode: comparisonSettings.mode,
      realtimeWindowMode: "follow",
      ...(source === "demo" ? {
        recoveryNow: (): number => comparisonSettings.assetIds.reduce((latest, id) => {
          const feed = comparisonFeedsRef.current.get(`${source}|${id}|${activePanel.timeframe}`);
          if (!(feed instanceof RecoverableStudioDatafeed)) return latest;
          return Math.max(latest, feed.getLatestTime() + interval);
        }, window.to),
      } : {}),
      baseline: baselineTime === null ? null : { time: baselineTime, maxAgeMs: comparisonSettings.baselineMaxAgeMs },
    });
    comparisonSettings.assetIds.forEach((id, index) => {
      const key = `${source}|${id}|${activePanel.timeframe}`;
      let datafeed = comparisonFeedsRef.current.get(key);
      let providerSymbol = id;
      if (datafeed === undefined) {
        const created = createStudioDatafeedSource(id, activePanel.timeframe, source);
        datafeed = created.datafeed;
        providerSymbol = created.symbol;
        comparisonFeedsRef.current.set(key, datafeed);
      } else if (source === "binance") {
        providerSymbol = binanceStudioSymbol(id) ?? id;
      }
      controller.registerAsset({ id, symbol: providerSymbol, timeframe: activePanel.timeframe, datafeed, label: id, color: comparisonColors[index % comparisonColors.length], coverage: { kind: "continuous", intervalMs: interval } });
    });
    const publishComparisonState = (): void => {
      setComparisonLines(controller.getNormalizedData());
      setComparisonFeedState(controller.getState());
    };
    const unsubscribe = controller.subscribe(publishComparisonState);
    comparisonDatafeedRef.current = controller;
    publishComparisonState();
    void controller.load().then(() => {
      if (comparisonDatafeedRef.current === controller) publishComparisonState();
    });
    return () => {
      unsubscribe();
      controller.dispose();
      if (comparisonDatafeedRef.current === controller) comparisonDatafeedRef.current = null;
    };
  }, [activePanel.symbol, activePanel.timeframe, comparisonAssetKey, comparisonSettings.active, comparisonSettings.dataSource]);
  useEffect(() => {
    const controller = comparisonDatafeedRef.current;
    if (controller === null || !comparisonSettings.active) return;
    controller.setMode(comparisonSettings.mode);
    controller.setBaseline(comparisonSettings.baselineTime === null ? null : { time: comparisonSettings.baselineTime, maxAgeMs: comparisonSettings.baselineMaxAgeMs });
    setComparisonLines(controller.getNormalizedData());
    setComparisonFeedState(controller.getState());
  }, [comparisonSettings.baselineMaxAgeMs, comparisonSettings.baselineTime, comparisonSettings.mode, comparisonSettings.active]);
  useEffect(() => {
    const controller = comparisonDatafeedRef.current;
    if (controller === null || !comparisonSettings.active) return;
    controller.setReplayCutoff(replayActive ? activeSnapshot.replayStatus.currentTimestamp : null);
    setComparisonLines(controller.getNormalizedData());
    setComparisonFeedState(controller.getState());
  }, [activeSnapshot.replayStatus.currentTimestamp, comparisonSettings.active, replayActive]);
  const selectedList = watchlists.lists.find((list) => list.id === watchlists.selectedWatchlistId) ?? watchlists.lists[0];
  const filteredSymbols = selectedList?.symbols.filter((symbol) => `${symbol.displaySymbol} ${symbol.name}`.toLowerCase().includes(watchlistSearch.toLowerCase())) ?? [];
  const comparisonVisibleLatest = comparisonLines.reduce<number | null>((latest, line) => {
    const candidate = line.data.at(-1)?.time ?? null;
    return candidate === null ? latest : latest === null ? candidate : Math.max(latest, candidate);
  }, null);
  const filteredIndicatorCatalog = filterStudioIndicatorCatalog(indicatorCatalog, {
    query: indicatorSearch,
    category: indicatorCategory,
    favoriteIds: favoriteIndicatorIds,
    favoritesOnly,
  });
  const selectedIndicatorEntry = indicatorCatalog.find((item) => item.id === indicatorToAdd) ?? indicatorCatalog[0]!;
  const selectedIndicatorMetadata = indicatorRegistry.getMetadata(selectedIndicatorEntry.id);
  const appliedIndicators = activeSnapshot.indicators;
  const { builtIn: appliedBuiltInIndicators, scripts: appliedScriptIndicators } = partitionStudioAppliedIndicators(appliedIndicators);
  const selectedAppliedIndicator = appliedIndicators.find((indicator) => indicator.id === selectedAppliedIndicatorId) ?? null;
  const myScriptsCatalog = useMemo(() => {
    const saved = buildStudioUserScriptCatalog(localUserScripts);
    const templates = buildStudioUserScriptCatalog(STUDIO_KLINESCRIPT_TEMPLATES.map((item) => ({ id: item.id, name: item.name, source: item.source })));
    return filterStudioUserScriptCatalog([...templates, ...saved], { query: scriptLibrarySearch });
  }, [localUserScripts, scriptLibrarySearch]);
  useEffect(() => {
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem("openkline-studio-klinescripts-v1") ?? "[]");
      if (Array.isArray(parsed)) {
        setLocalUserScripts(parsed.filter((item): item is { name: string; source: string } => typeof item === "object" && item !== null && typeof (item as { name?: unknown }).name === "string" && typeof (item as { source?: unknown }).source === "string"));
      }
    } catch {
      setLocalUserScripts([]);
    }
  }, [scriptOpen]);
  useEffect(() => {
    if (selectedAppliedIndicatorId === null) return;
    if (appliedIndicators.some((indicator) => indicator.id === selectedAppliedIndicatorId)) return;
    setSelectedAppliedIndicatorId(null);
  }, [appliedIndicators, selectedAppliedIndicatorId]);

  const onChartReady = useCallback((panelId: string, chart: Chart): void => {
    const controller = syncControllerRef.current;
    if (controller === null) return;
    if (controller.hasChart(panelId)) controller.removeChart(panelId);
    controller.addChart(panelId, chart);
    setPanelReadyEpoch((value) => value + 1);
  }, []);

  useEffect(() => {
    syncControllerRef.current?.setOptions({ crosshair: sync.crosshair, visibleRange: sync.visibleRange });
  }, [sync.crosshair, sync.visibleRange]);

  useEffect(() => {
    const liveIds = new Set(panels.map((panel) => panel.panelId));
    for (const id of Object.keys(snapshotsRef.current)) {
      if (!liveIds.has(id)) delete snapshotsRef.current[id];
    }
    for (const key of [...strategyResultsRef.current.keys()]) {
      const panelId = key.split("|", 1)[0] ?? "";
      if (!liveIds.has(panelId)) strategyResultsRef.current.delete(key);
    }
    for (const key of [...appliedStrategyParametersRef.current.keys()]) {
      const panelId = key.split("|", 1)[0] ?? "";
      if (!liveIds.has(panelId)) appliedStrategyParametersRef.current.delete(key);
    }
    const controller = syncControllerRef.current;
    if (controller === null) return;
    for (const id of controller.getChartIds()) {
      if (!liveIds.has(id)) controller.removeChart(id);
    }
  }, [panels]);

  useEffect(() => {
    const host = window as Window & {
      __OPENKLINE_ENABLE_STUDIO_DIAGNOSTICS__?: boolean;
      __openklineStudioDiagnostics?: () => {
        readonly panelIds: readonly string[];
        readonly syncChartIds: readonly string[];
        readonly snapshotKeys: readonly string[];
        readonly archivedPanelCount: number;
        readonly strategyResultCount: number;
        readonly appliedStrategyParameterCount: number;
        readonly pendingRestore: boolean;
        readonly canvasCount: number;
      };
    };
    if (host.__OPENKLINE_ENABLE_STUDIO_DIAGNOSTICS__ !== true) return undefined;
    host.__openklineStudioDiagnostics = () => ({
      panelIds: panels.map((panel) => panel.panelId),
      syncChartIds: syncControllerRef.current?.getChartIds() ?? [],
      snapshotKeys: Object.keys(snapshotsRef.current),
      archivedPanelCount: archivedPanelsRef.current.size,
      strategyResultCount: strategyResultsRef.current.size,
      appliedStrategyParameterCount: appliedStrategyParametersRef.current.size,
      pendingRestore: pendingRestoreRef.current !== null,
      canvasCount: document.querySelectorAll("canvas").length,
    });
    return () => {
      delete host.__openklineStudioDiagnostics;
    };
  }, [panels, panelReadyEpoch]);

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
        const parsed = parseStudioWorkspaceCollection(JSON.parse(stored));
        const current = parsed.workspaces.find((item) => item.id === parsed.currentId)!;
        setWorkspaceId(current.id); setWorkspaceName(current.name); setWorkspaceEntries(parsed.workspaces.map((item) => ({ id: item.id, name: item.name }))); applyDocument(current);
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
    const panelIds = pending.charts.map((chart) => chart.panelId);
    setRestoreSummary({ name: pending.name, panelCount: panelIds.length, panelIds });
    setNotice(`Workspace “${pending.name}” restored with ${panelIds.length} chart panel${panelIds.length === 1 ? "" : "s"} (${panelIds.join(", ")}). Drawing selection remains transient until you select an object.`);
    pendingBaselineAfterRestoreRef.current = pending;
  }, [panels, layout, panelReadyEpoch]);

  const adoptPersistedBaseline = useCallback((document: StudioWorkspaceDocument, libraryId: string = document.id): void => {
    const baseline = createStudioWorkspaceBaseline(document, libraryId);
    setLibraryBackingId(baseline.libraryId);
    setBaselineFingerprint(baseline.fingerprint);
    setLiveFingerprint(baseline.fingerprint);
    setSessionOriginFingerprint(null);
    userDirtyRef.current = false;
    setPristineUnsaved(false);
    setSaveFailed(false);
  }, []);

  const clearPersistedBaseline = useCallback((): void => {
    setLibraryBackingId(null);
    setBaselineFingerprint(null);
    userDirtyRef.current = false;
    setPristineUnsaved(true);
    setSaveFailed(false);
  }, []);

  const markUnsavedSessionOrigin = useCallback((fingerprint: string | null): void => {
    setSessionOriginFingerprint(fingerprint);
    setPristineUnsaved(true);
  }, []);

  const userDirtyRef = useRef(false);
  const markLiveDirty = useCallback((): void => {
    userDirtyRef.current = true;
    setPristineUnsaved(false);
  }, []);

  const applyDocument = (document: StudioWorkspaceDocument, options?: { readonly adoptBaseline?: boolean }): void => {
    const firstChart = document.charts[0]?.workspace;
    snapshotsRef.current = {};
    setActiveSnapshotState(emptySnapshot());
    setWorkspaceId(document.id); setWorkspaceName(document.name); setWorkspaceEntries((current) => current.some((item) => item.id === document.id) ? current.map((item) => item.id === document.id ? { id: document.id, name: document.name } : item) : [...current, { id: document.id, name: document.name }]); setLayout(document.layout); setPanels(document.charts.map((chart) => ({ panelId: chart.panelId, symbol: chart.symbol, timeframe: chart.timeframe as Timeframe }))); setActivePanelId(document.charts[0]?.panelId ?? "chart-1"); setSync({ ...document.synchronization }); setComparisonSettings(document.comparison ?? { active: false, mode: "indexed", baselineTime: buildCandles(document.charts[0]?.symbol ?? "BTC-USD", (document.charts[0]?.timeframe as Timeframe | undefined) ?? "1h")[0]?.time ?? null, baselineMaxAgeMs: intervalFor((document.charts[0]?.timeframe as Timeframe | undefined) ?? "1h"), assetIds: [document.charts[0]?.symbol ?? "BTC-USD", "ETH-USD"] }); setPortfolioConfiguration(document.portfolioBacktest ?? null); setWatchlistModel(new WatchlistModel(document.watchlists, (prefix) => `${prefix}-studio-${serialRef.current++}`)); setWatchlists(document.watchlists); if (firstChart !== undefined) { setTheme(firstChart.chart.theme.background === "#ffffff" ? "light" : "dark"); setScaleMode(firstChart.chart.priceScale?.mode ?? "linear"); } pendingRestoreRef.current = document;
    if (options?.adoptBaseline !== false) adoptPersistedBaseline(document);
  };

  const collectDocument = useCallback((id = workspaceId, name = workspaceName): StudioWorkspaceDocument => parseStudioWorkspace({ version: 1, id, name: name.trim() || "Workspace", layout, charts: panels.map((panel) => ({ panelId: panel.panelId, symbol: panel.symbol, timeframe: panel.timeframe, workspace: panelRefs.current.get(panel.panelId)?.serializeWorkspace({ symbol: panel.symbol, timeframe: panel.timeframe }) ?? emptyWorkspace(panel.symbol, panel.timeframe) })), synchronization: sync, watchlists: watchlistModel.getDocument(), comparison: comparisonSettings, ...(portfolioConfiguration === null ? {} : { portfolioBacktest: portfolioConfiguration }) }), [comparisonSettings, layout, panels, portfolioConfiguration, sync, watchlistModel, workspaceId, workspaceName]);

  const refreshLiveFingerprint = useCallback((): string | null => {
    try {
      const fingerprint = studioWorkspaceContentFingerprint(collectDocument());
      setLiveFingerprint(fingerprint);
      return fingerprint;
    } catch {
      setLiveFingerprint(null);
      return null;
    }
  }, [collectDocument]);

  const persist = useCallback((document: StudioWorkspaceDocument, all: readonly StudioWorkspaceDocument[]): boolean => {
    try {
      window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify({ version: 1, currentId: document.id, workspaces: all }));
      const activeChart = document.charts[0]?.workspace;
      if (activeChart !== undefined) window.localStorage.setItem(LEGACY_WORKSPACE_KEY, JSON.stringify(activeChart));
      setNotice(`Workspace “${document.name}” saved locally.`);
      adoptPersistedBaseline(document);
      return true;
    } catch {
      setSaveFailed(true);
      setNotice("Workspace could not be saved. Browser storage may be unavailable or full.");
      return false;
    }
  }, [adoptPersistedBaseline]);

  const saveWorkspace = useCallback((asNew = false): boolean => {
    let named: string;
    try { named = normalizeStudioWorkspaceName(workspaceName); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); return false; }
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    let all: StudioWorkspaceDocument[] = [];
    if (raw !== null) { try { all = [...parseStudioWorkspaceCollection(JSON.parse(raw)).workspaces]; } catch { all = []; } }
    // Detached / new desks must create a record (current id if free, otherwise allocate) rather than overwrite an unrelated library id.
    const hasBacking = libraryBackingId !== null && all.some((item) => item.id === libraryBackingId) && !asNew;
    const id = asNew || !hasBacking
      ? (asNew || all.some((item) => item.id === workspaceId)
        ? allocateStudioWorkspaceId(all.map((item) => item.id), "workspace")
        : workspaceId)
      : libraryBackingId;
    const document = collectDocument(id, named);
    const index = all.findIndex((item) => item.id === id);
    if (index >= 0) all[index] = document; else all.push(document);
    if (!persist(document, all)) return false;
    setWorkspaceId(id); setWorkspaceName(document.name); setWorkspaceEntries(all.map((item) => ({ id: item.id, name: item.name })));
    return true;
  }, [collectDocument, libraryBackingId, persist, workspaceId, workspaceName]);

  const currentSaveStatus = resolveStudioWorkspaceSaveStatus({
    libraryBackingId,
    baselineFingerprint,
    liveFingerprint,
    saveFailed,
  });
  const pristineUnsavedWorkspace = libraryBackingId === null && pristineUnsaved;

  const requestDestructiveNavigation = useCallback((args: {
    readonly title: string;
    readonly message: string;
    readonly proceed: () => void;
    readonly trigger?: HTMLElement | null;
  }): void => {
    let fingerprint = refreshLiveFingerprint();
    let effectiveBaseline = baselineFingerprint;
    // Chart serialization can drift after save/restore without a user edit.
    // Only treat fingerprint mismatch as dirty when the user has edited.
    if (
      libraryBackingId !== null
      && !userDirtyRef.current
      && fingerprint !== null
      && effectiveBaseline !== null
      && fingerprint !== effectiveBaseline
      && saveFailed !== true
    ) {
      try {
        adoptPersistedBaseline(collectDocument(libraryBackingId, workspaceName), libraryBackingId);
        effectiveBaseline = fingerprint;
      } catch {
        // Keep prior baseline when live serialize is temporarily invalid.
      }
    }
    const status = resolveStudioWorkspaceSaveStatus({
      libraryBackingId,
      baselineFingerprint: effectiveBaseline,
      liveFingerprint: fingerprint,
      saveFailed,
    });
    const pristine = libraryBackingId === null && pristineUnsaved;
    if (!studioWorkspaceNeedsNavigationGuard(status, { pristineUnsavedWorkspace: pristine })) {
      args.proceed();
      return;
    }
    const generation = navigationGenerationRef.current + 1;
    navigationGenerationRef.current = generation;
    pendingNavigationRef.current = { generation, proceed: args.proceed };
    showNavigateGuard(
      args.title,
      args.message,
      () => {
        if (navigationBusyRef.current) return;
        const pending = pendingNavigationRef.current;
        if (pending === null || pending.generation !== generation) return;
        navigationBusyRef.current = true;
        if (!saveWorkspace(false)) {
          navigationBusyRef.current = false;
          setDialogError("Workspace could not be saved. Browser storage may be unavailable or full.");
          return;
        }
        if (pendingNavigationRef.current?.generation !== generation) {
          navigationBusyRef.current = false;
          return;
        }
        clearPendingNavigation();
        setDialog(null);
        setDialogError(null);
        pending.proceed();
      },
      () => {
        const pending = pendingNavigationRef.current;
        if (pending === null || pending.generation !== generation) return;
        clearPendingNavigation();
        pending.proceed();
      },
      args.trigger,
    );
  }, [adoptPersistedBaseline, baselineFingerprint, collectDocument, libraryBackingId, pristineUnsaved, refreshLiveFingerprint, saveFailed, saveWorkspace, workspaceName]);

  useEffect(() => {
    const pending = pendingBaselineAfterRestoreRef.current;
    if (pending === null) return;
    pendingBaselineAfterRestoreRef.current = null;
    // Re-baseline from live serialization after restore so transient runtime
    // differences (cleared selection, chart defaults) do not false-dirty the desk.
    try {
      adoptPersistedBaseline(collectDocument(pending.id, pending.name), pending.id);
    } catch {
      adoptPersistedBaseline(pending, pending.id);
    }
  }, [adoptPersistedBaseline, collectDocument, layout, panelReadyEpoch, panels]);

  useEffect(() => {
    refreshLiveFingerprint();
  }, [
    activeSnapshotState.alerts,
    activeSnapshotState.drawings,
    activeSnapshotState.indicators,
    activeSnapshotState.anchoredVwaps,
    activeSnapshotState.volumeProfiles,
    comparisonSettings,
    layout,
    panels,
    panelReadyEpoch,
    portfolioConfiguration,
    refreshLiveFingerprint,
    sync,
    watchlists,
    workspaceName,
  ]);

  useEffect(() => {
    if (!studioWorkspaceNeedsNavigationGuard(currentSaveStatus, { pristineUnsavedWorkspace })) return undefined;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [currentSaveStatus, pristineUnsavedWorkspace]);

  useEffect(() => {
    // While a new/detached desk remains pristine, track hydration into the session origin
    // so chart readiness does not look like a user edit.
    if (libraryBackingId !== null || !pristineUnsaved) return;
    markUnsavedSessionOrigin(refreshLiveFingerprint());
  }, [libraryBackingId, markUnsavedSessionOrigin, panelReadyEpoch, panels, layout, pristineUnsaved, refreshLiveFingerprint]);

  useEffect(() => {
    // After restore/load, chart serialization can settle across ready epochs without a user edit.
    // Re-accept live content as the baseline until the user dirties the desk.
    if (libraryBackingId === null || userDirtyRef.current) return;
    const fingerprint = refreshLiveFingerprint();
    if (fingerprint === null || baselineFingerprint === null || fingerprint === baselineFingerprint) return;
    try {
      adoptPersistedBaseline(collectDocument(libraryBackingId, workspaceName), libraryBackingId);
    } catch {
      // Keep prior baseline when live serialize is temporarily invalid.
    }
  }, [adoptPersistedBaseline, baselineFingerprint, collectDocument, libraryBackingId, panelReadyEpoch, panels, layout, refreshLiveFingerprint, workspaceName]);

  const changeLayout = (nextLayout: StudioLayout): void => {
    const desired = chartCount(nextLayout);
    const next = [...panels];
    while (next.length > desired) { const removed = next.pop(); if (removed !== undefined) archivedPanelsRef.current.set(removed.panelId, { panel: removed, workspace: panelRefs.current.get(removed.panelId)?.serializeWorkspace({ symbol: removed.symbol, timeframe: removed.timeframe }) }); }
    while (next.length < desired) { const archived = [...archivedPanelsRef.current.values()][0]; if (archived !== undefined) { next.push(archived.panel); archivedPanelsRef.current.delete(archived.panel.panelId); } else { const panelId = `chart-${serialRef.current++}`; next.push({ panelId, symbol: next[0]?.symbol ?? "BTC-USD", timeframe: next[0]?.timeframe ?? "1h" }); } }
    setPanels(next);
    setLayout(nextLayout);
    markLiveDirty();
    setNotice(`Layout changed to ${layoutChoices.find(([id]) => id === nextLayout)?.[1] ?? nextLayout}; hidden panel analysis is retained in this session.`);
  };

  const changeActiveSymbol = (nextSymbol: string): void => { const nextPanels = sync.symbol ? panels.map((panel) => ({ ...panel, symbol: nextSymbol })) : panels.map((panel) => panel.panelId === activePanel.panelId ? { ...panel, symbol: nextSymbol } : panel); setPanels(nextPanels); setComparisonSettings((current) => current.active ? { ...current, assetIds: [nextSymbol, ...current.assetIds.filter((id) => id !== nextSymbol)] } : current); markLiveDirty(); setNotice(`Loaded deterministic ${nextSymbol}${sync.symbol ? " across synchronized panels" : " in the active panel"}.`); };
  const changeActiveTimeframe = (nextTimeframe: Timeframe): void => { setPanels((current) => sync.timeframe ? current.map((panel) => ({ ...panel, timeframe: nextTimeframe })) : current.map((panel) => panel.panelId === activePanel.panelId ? { ...panel, timeframe: nextTimeframe } : panel)); setComparisonSettings((current) => ({ ...current, baselineTime: buildCandles(activePanel.symbol, nextTimeframe)[0]?.time ?? current.baselineTime, baselineMaxAgeMs: intervalFor(nextTimeframe) })); markLiveDirty(); };

  const onCrosshair = (panelId: string, event: CrosshairMoveEvent): void => { if (panelId === activePanelIdRef.current) setCrosshair(event); };
  const onViewport = (_panelId: string, _range: { from: number; to: number }): void => undefined;
  const onSnapshot = useCallback((panelId: string, snapshot: PanelSnapshot): void => {
    snapshotsRef.current[panelId] = snapshot;
    if (panelId !== activePanelIdRef.current) return;
    setActiveSnapshotState(snapshot);
    const visible = snapshot.series.find((series) => series.id.startsWith("studio-") && series.id !== "studio-volume" && series.style.visible !== false);
    const next: Partial<Record<string, Presentation>> = { "studio-price": "candles", "studio-ohlc": "ohlc", "studio-hollow": "hollow", "studio-heikin": "heikin-ashi", "studio-line": "line", "studio-area": "area", "studio-baseline": "baseline" };
    const restored = visible === undefined ? undefined : next[visible.id];
    if (restored !== undefined) setPresentation(restored);
  }, []);

  useEffect(() => { if (scaleMode !== "linear") setNotice(`${scaleModes.find(([mode]) => mode === scaleMode)?.[1] ?? scaleMode} price scale applied without changing financial data.`); }, [scaleMode]);
  useEffect(() => { if (theme !== "dark") setNotice("Light theme applied without recreating the chart."); }, [theme]);
  useEffect(() => {
    if (replayActive) {
      replayWasActiveRef.current = true;
      return;
    }
    if (!replayWasActiveRef.current) return;
    replayWasActiveRef.current = false;
    setPresentation("candles");
    setScaleMode("linear");
    activeHandle?.getChart()?.setPriceScaleOptions({ mode: "linear" });
  }, [activeHandle, replayActive]);
  const updatePresentation = (next: Presentation): void => { const target = activeHandle?.getChart(); if (target === null || target === undefined) return; const ids: Record<Presentation, string> = { candles: "studio-price", ohlc: "studio-ohlc", hollow: "studio-hollow", "heikin-ashi": "studio-heikin", line: "studio-line", area: "studio-area", baseline: "studio-baseline" }; for (const [kind, id] of Object.entries(ids)) if (target.getSeriesIds().includes(id)) target.setSeriesStyle(id, { visible: kind === next }); setPresentation(next); activeHandle?.refresh(); markLiveDirty(); };
  const analyticsDisabled = replayActive || comparisonSettings.active || !chartReady;
  const multiTimeframeTargetOptions = timeframes.filter((candidate) => intervalFor(candidate) > intervalFor(activePanel.timeframe));
  const activeMultiTimeframeIndicator = activeSnapshot.multiTimeframeIndicators[0];
  const activeMultiTimeframeReference = activeSnapshot.multiTimeframeReferences[0];
  const activeAnchoredVwap = activeSnapshot.anchoredVwaps[0];
  const activeProfile = activeSnapshot.volumeProfiles[0];
  const analyticsData = activeHandle?.getChart()?.getData() ?? [];
  const activeProfileResult = activeHandle?.getChart()?.getVolumeProfiles()[0]?.getResult();
  const addOrRemoveAnchoredVwap = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    try {
      const existing = target.getAnchoredVwaps();
      if (existing.length > 0) existing.forEach((item) => item.remove());
      else {
        const anchorTime = analyticsData.at(-50)?.time ?? analyticsData[0]?.time;
        if (anchorTime === undefined) throw new Error("Anchored VWAP needs at least one candle");
        target.addAnchoredVwap({ id: `studio-anchored-vwap-${serialRef.current++}`, anchorTime, priceSource: "typical", style: { color: "#f59e0b", lineWidth: 2 } });
      }
      activeHandle?.refresh();
      setNotice(existing.length > 0 ? "Anchored VWAP removed from the active chart." : "Anchored VWAP enabled; choose a UTC anchor or select a candle on the chart.");
    } catch (error) { setNotice(`Could not update Anchored VWAP: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const setAnchoredVwapAnchor = (value: string): void => {
    const time = parseUtcInput(value);
    const target = activeHandle?.getChart();
    const api = target?.getAnchoredVwaps()[0];
    if (time === null || api === undefined || analyticsDisabled) { if (time === null) setNotice("Enter a valid UTC date and time for the Anchored VWAP anchor."); return; }
    try { api.setAnchor(time); activeHandle?.refresh(); } catch (error) { setNotice(`Could not set Anchored VWAP anchor: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const setAnchoredVwapSource = (source: AnchoredVwapPriceSource): void => {
    const target = activeHandle?.getChart();
    const api = target?.getAnchoredVwaps()[0];
    if (api === undefined || analyticsDisabled) return;
    try { api.setPriceSource(source); activeHandle?.refresh(); } catch (error) { setNotice(`Could not set Anchored VWAP source: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const startAnchoredVwapPlacement = (): void => {
    const target = activeHandle?.getChart();
    const api = target?.getAnchoredVwaps()[0];
    if (api === undefined || analyticsDisabled) return;
    try { api.startPlacement(); setNotice("Anchored VWAP placement active; select a visible candle on the chart."); } catch (error) { setNotice(`Could not start Anchored VWAP placement: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const addOrRemoveVolumeProfile = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    try {
      const existing = target.getVolumeProfiles();
      if (existing.length > 0) existing.forEach((item) => item.remove());
      else target.addVolumeProfile({ id: `studio-volume-profile-${serialRef.current++}`, mode: "visible", allocation: "close", binCount: 24, valueAreaPercentage: 0.7, showLabels: true });
      activeHandle?.refresh();
      setNotice(existing.length > 0 ? "Estimated Volume Profile removed from the active chart." : "Estimated Volume Profile enabled; values are estimated from OHLCV candles.");
    } catch (error) { setNotice(`Could not update Estimated Volume Profile: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const updateVolumeProfile = (patch: VolumeProfileOptionsPatch): void => {
    const target = activeHandle?.getChart();
    const api = target?.getVolumeProfiles()[0];
    if (api === undefined || analyticsDisabled) return;
    try { api.setOptions(patch); activeHandle?.refresh(); } catch (error) { setNotice(`Could not update Volume Profile: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const setVolumeProfileMode = (mode: VolumeProfileMode): void => {
    const target = activeHandle?.getChart();
    const api = target?.getVolumeProfiles()[0];
    if (api === undefined || analyticsDisabled) return;
    try {
      if (mode === "fixed") {
        const from = activeProfile?.range?.from ?? analyticsData[0]?.time;
        const latest = analyticsData.at(-1)?.time;
        if (from === undefined || latest === undefined) throw new Error("Fixed mode needs chart data");
        api.setMode("fixed", { from, to: Math.max(from + 1, activeProfile?.range?.to ?? latest + 1) });
      } else api.setMode("visible");
      activeHandle?.refresh();
    } catch (error) { setNotice(`Could not change Volume Profile mode: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const setVolumeProfileRange = (field: "from" | "to", value: string): void => {
    const time = parseUtcInput(value);
    const target = activeHandle?.getChart();
    const api = target?.getVolumeProfiles()[0];
    if (time === null || api === undefined || analyticsDisabled) { if (time === null) setNotice("Enter a valid UTC Volume Profile boundary."); return; }
    const current = activeProfile?.range ?? { from: analyticsData[0]?.time ?? time, to: (analyticsData.at(-1)?.time ?? time) + 1 };
    const range = { ...current, [field]: time };
    try { api.setRange(range); activeHandle?.refresh(); } catch (error) { setNotice(`Could not set Volume Profile range: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const addIndicator = (definitionId = selectedIndicatorEntry.id, sourcePanelId = activePanelId): void => {
    if (sourcePanelId !== activePanelIdRef.current) {
      setNotice(`Skipped stale indicator add for ${sourcePanelId}; ${activePanelIdRef.current} is active.`);
      return;
    }
    if (replayActive) {
      setNotice("Indicators cannot be added during replay.");
      return;
    }
    const handle = panelRefs.current.get(sourcePanelId);
    const target = handle?.getChart();
    if (target === null || target === undefined) {
      setNotice(`No active chart for panel ${sourcePanelId}.`);
      return;
    }
    const entry = indicatorCatalog.find((item) => item.id === definitionId);
    if (entry === undefined) {
      setNotice(`Indicator "${definitionId}" is not available in the Studio catalog.`);
      return;
    }
    try {
      const period = indicatorPeriodOverride.trim() === "" ? undefined : Number(indicatorPeriodOverride);
      const constant = indicatorConstant.trim() === "" ? undefined : Number(indicatorConstant);
      const multiplier = indicatorMultiplier.trim() === "" ? undefined : Number(indicatorMultiplier);
      target.addIndicator(definitionId, {
        id: `studio-${definitionId.toLowerCase()}-${serialRef.current++}`,
        pane: studioIndicatorDefaultPane(entry),
        parameters: indicatorParameters(definitionId, { period, constant, multiplier }),
      });
      handle?.refresh();
      setIndicatorToAdd(definitionId);
      markLiveDirty();
      setNotice(`Added ${definitionId} to ${sourcePanelId}.`);
    } catch (error) {
      setNotice(`Could not add indicator: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const removeAppliedIndicator = (instanceId: string, sourcePanelId = activePanelId): void => {
    if (sourcePanelId !== activePanelIdRef.current) {
      setNotice(`Skipped stale indicator remove for ${sourcePanelId}; ${activePanelIdRef.current} is active.`);
      return;
    }
    if (replayActive) {
      setNotice("Indicators cannot be removed during replay.");
      return;
    }
    const handle = panelRefs.current.get(sourcePanelId);
    const target = handle?.getChart();
    if (target === null || target === undefined) {
      setNotice(`No active chart for panel ${sourcePanelId}.`);
      return;
    }
    try {
      target.removeIndicator(instanceId);
      handle?.refresh();
      markLiveDirty();
      setNotice(`Removed ${instanceId} from ${sourcePanelId}.`);
    } catch (error) {
      setNotice(`Could not remove indicator: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const applyExplorerParametersToSelected = (instanceId: string, sourcePanelId = activePanelId): void => {
    if (sourcePanelId !== activePanelIdRef.current) {
      setNotice(`Skipped stale indicator edit for ${sourcePanelId}; ${activePanelIdRef.current} is active.`);
      return;
    }
    if (replayActive) {
      setNotice("Indicator parameters cannot change during replay.");
      return;
    }
    const handle = panelRefs.current.get(sourcePanelId);
    if (handle === undefined) {
      setNotice(`No active chart for panel ${sourcePanelId}.`);
      return;
    }
    const target = handle.getChart();
    if (target === null) {
      setNotice(`No active chart for panel ${sourcePanelId}.`);
      return;
    }
    const document = handle.serializeWorkspace();
    const existing = document.indicators.find((indicator) => indicator.id === instanceId);
    if (existing === undefined) {
      setNotice(`Indicator ${instanceId} is no longer on ${sourcePanelId}.`);
      return;
    }
    const period = indicatorPeriodOverride.trim() === "" ? undefined : Number(indicatorPeriodOverride);
    const constant = indicatorConstant.trim() === "" ? undefined : Number(indicatorConstant);
    const multiplier = indicatorMultiplier.trim() === "" ? undefined : Number(indicatorMultiplier);
    const nextParameters = {
      ...existing.parameters,
      ...indicatorParameters(existing.indicatorId, { period, constant, multiplier }),
    };
    try {
      target.removeIndicator(instanceId);
      target.addIndicator(existing.indicatorId, {
        id: instanceId,
        pane: existing.paneId,
        parameters: nextParameters,
      });
      handle.refresh();
      markLiveDirty();
      setNotice(`Updated ${existing.indicatorId} parameters on ${sourcePanelId}.`);
    } catch (error) {
      setNotice(`Could not update indicator: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const toggleMultiTimeframeIndicator = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    const existing = target.getMultiTimeframeIndicators()[0];
    if (existing !== undefined) {
      existing.remove();
      activeHandle?.refresh();
      setNotice(`Removed higher-timeframe ${existing.indicatorId} from ${activePanel.panelId}.`);
      return;
    }
    const targetTimeframe = multiTimeframeTargetOptions.includes(multiTimeframeTarget) ? multiTimeframeTarget : multiTimeframeTargetOptions[0];
    if (targetTimeframe === undefined) {
      setNotice(`${activePanel.timeframe} has no larger fixed Studio timeframe available.`);
      return;
    }
    const period = Number(multiTimeframePeriod);
    if (!Number.isSafeInteger(period) || period < 1 || period > 500) {
      setNotice("Higher-timeframe indicator period must be an integer from 1 to 500.");
      return;
    }
    try {
      target.addMultiTimeframeIndicator({
        id: `studio-mtf-${multiTimeframeIndicator.toLowerCase()}-${serialRef.current++}`,
        indicatorId: multiTimeframeIndicator,
        sourceTimeframe: activePanel.timeframe,
        targetTimeframe,
        pane: "main",
        parameters: { period },
        coveragePolicy: "fixed-duration",
        finalityPolicy: multiTimeframeFinality,
      });
      activeHandle?.refresh();
      setNotice(`Added causal ${multiTimeframeIndicator} from ${activePanel.timeframe} into ${targetTimeframe} on ${activePanel.panelId}.`);
    } catch (error) { setNotice(`Could not add higher-timeframe indicator: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const toggleMultiTimeframeReference = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    const existing = target.getMultiTimeframeReferences()[0];
    if (existing !== undefined) {
      existing.remove();
      activeHandle?.refresh();
      setNotice(`Removed previous-period levels from ${activePanel.panelId}.`);
      return;
    }
    const targetTimeframe = multiTimeframeTargetOptions.includes(multiTimeframeTarget) ? multiTimeframeTarget : multiTimeframeTargetOptions[0];
    if (targetTimeframe === undefined) {
      setNotice(`${activePanel.timeframe} has no larger fixed Studio timeframe available.`);
      return;
    }
    try {
      target.addMultiTimeframeReference({
        id: `studio-mtf-levels-${serialRef.current++}`,
        sourceTimeframe: activePanel.timeframe,
        targetTimeframe,
        levels: ["open", "high", "low", "close"],
        coveragePolicy: "fixed-duration",
        finalityPolicy: multiTimeframeFinality,
        labels: true,
        style: { color: "#f59e0b", lineWidth: 1.5, lineStyle: "dashed", alpha: 0.85 },
      });
      activeHandle?.refresh();
      setNotice(`Added previous ${targetTimeframe} OHLC levels to ${activePanel.panelId}.`);
    } catch (error) { setNotice(`Could not add previous-period levels: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const toggleSessionCalendar = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    try {
      const existing = target.getTradingCalendar();
      if (existing === null) target.setTradingCalendar(studioTradingCalendar, { showLabels: false });
      else existing.setVisible(!existing.getDisplayOptions().visible);
      const visible = target.getTradingCalendar()?.getDisplayOptions().visible ?? false;
      setSessionCalendarVisible(visible);
      activeHandle?.refresh();
      setNotice(`${visible ? "Enabled" : "Hidden"} session boundaries for ${activePanel.panelId}.`);
    } catch (error) { setNotice(`Could not update trading calendar: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const setSessionMarketMode = (mode: "calendar" | "utc"): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    try {
      if (mode === "utc") {
        target.getSessionIndicators().forEach((item) => item.remove());
        target.getSessionReferences().forEach((item) => item.remove());
        target.removeTradingCalendar();
        setSessionIndicatorEnabled(false);
        setSessionReferenceEnabled(false);
        setNotice(`Switched ${activePanel.panelId} to 24/7 UTC mode; session-derived studies were cleared.`);
      } else {
        target.setTradingCalendar(studioTradingCalendar, { showLabels: false });
        setSessionCalendarVisible(true);
        setNotice(`Using the illustrative ${studioTradingCalendar.timeZone} trading calendar on ${activePanel.panelId}.`);
      }
      activeHandle?.refresh();
    } catch (error) { setNotice(`Could not change market session mode: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const toggleSessionIndicator = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    const existing = target.getSessionIndicators()[0];
    if (existing !== undefined) {
      existing.remove();
      setSessionIndicatorEnabled(false);
      activeHandle?.refresh();
      setNotice(`Removed session SMA from ${activePanel.panelId}.`);
      return;
    }
    try {
      target.addSessionIndicator({
        id: `studio-session-sma-${serialRef.current++}`,
        indicatorId: "SMA",
        sourceTimeframe: activePanel.timeframe,
        targetPeriod: sessionPeriod,
        calendar: studioTradingCalendar,
        pane: "main",
        parameters: { period: 1 },
        coveragePolicy: "fixed-duration",
        finalityPolicy: "time-closed",
        asOfTime: Number.MAX_SAFE_INTEGER,
      });
      setSessionIndicatorEnabled(true);
      activeHandle?.refresh();
      setNotice(`Added causal session SMA to ${activePanel.panelId}.`);
    } catch (error) { setNotice(`Could not add session indicator: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const toggleSessionReference = (): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    const existing = target.getSessionReferences()[0];
    if (existing !== undefined) {
      existing.remove();
      setSessionReferenceEnabled(false);
      activeHandle?.refresh();
      setNotice(`Removed previous session levels from ${activePanel.panelId}.`);
      return;
    }
    try {
      target.addSessionReference({
        id: `studio-session-levels-${serialRef.current++}`,
        sourceTimeframe: activePanel.timeframe,
        targetPeriod: sessionPeriod,
        calendar: studioTradingCalendar,
        levels: ["open", "high", "low", "close"],
        labels: true,
        labelPrefix: "Previous session",
        style: { color: "#fb923c", lineWidth: 1.5, lineStyle: "dashed", alpha: 0.85 },
      });
      setSessionReferenceEnabled(true);
      activeHandle?.refresh();
      setNotice(`Added previous session levels to ${activePanel.panelId}.`);
    } catch (error) { setNotice(`Could not add session levels: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const activateDrawing = (type: string, sourcePanelId = activePanelId): void => {
    if (sourcePanelId !== activePanelIdRef.current) {
      setNotice(`Skipped stale drawing tool for ${sourcePanelId}; ${activePanelIdRef.current} is active.`);
      return;
    }
    if (replayActive) {
      setNotice("Drawing tools stay read-only during replay.");
      return;
    }
    const entry = drawingToolbarCatalog.find((tool) => tool.type === type);
    if (entry === undefined) {
      setNotice(`Drawing tool "${type}" is not available in the Studio toolbar.`);
      return;
    }
    const handle = panelRefs.current.get(sourcePanelId);
    const chart = handle?.getChart();
    if (chart === null || chart === undefined) {
      setNotice(`No active chart for panel ${sourcePanelId}.`);
      return;
    }
    try {
      chart.startDrawing(type, {
        style: { color: "#fbbf24", fillColor: "#fbbf2433", lineWidth: 2 },
        snap: snapEnabled ? "visible-ohlc" : "none",
        ...(type === "text" ? { text: "Studio note" } : {}),
      });
      handle?.refresh();
      setNotice(`${entry.label} is active on ${sourcePanelId}${snapEnabled ? " with visible OHLC snapping" : ""}. Place ${entry.minPoints} point${entry.minPoints === 1 ? "" : "s"} to complete.`);
    } catch (error) {
      setNotice(`Could not activate drawing: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const cancelActiveDrawing = (sourcePanelId = activePanelId): void => {
    if (sourcePanelId !== activePanelIdRef.current) {
      setNotice(`Skipped stale drawing cancel for ${sourcePanelId}; ${activePanelIdRef.current} is active.`);
      return;
    }
    const handle = panelRefs.current.get(sourcePanelId);
    const chart = handle?.getChart();
    if (chart === null || chart === undefined) return;
    const hadTool = activeSnapshot.activeDrawingTool !== null;
    cancelStudioInteractiveDrawing(chart);
    handle?.refresh();
    if (hadTool) setNotice(`Canceled drawing tool on ${sourcePanelId}.`);
  };
  const clearDrawingToolToCursor = (sourcePanelId = activePanelId): void => {
    cancelActiveDrawing(sourcePanelId);
  };
  const onDrawingCommitted = useCallback((panelId: string, drawingId: string): void => {
    markLiveDirty();
    setNotice(`Completed drawing ${drawingId} on ${panelId}.`);
  }, [markLiveDirty]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (dialog !== null) return;
      if (activeSnapshot.activeDrawingTool === null) return;
      event.preventDefault();
      cancelActiveDrawing(activePanelIdRef.current);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeSnapshot.activeDrawingTool, dialog]);
  const selectedDrawing = activeSnapshot.drawings.find((drawing) => drawing.id === activeSnapshot.selectedDrawingId) ?? null;
  const chartForPanel = (panelId: string): Chart | null => panelRefs.current.get(panelId)?.getChart() ?? null;
  const applyDrawingStyle = (targetPanelId: string, drawingId: string, patch: DrawingStyle): void => {
    if (replayActive) {
      setNotice(`Drawing properties stay read-only while ${targetPanelId} is in replay.`);
      return;
    }
    const result = applyScopedDrawingStyle({
      activePanelId: activePanel.panelId,
      targetPanelId,
      drawingId,
      patch,
      getChart: chartForPanel,
      requireSelected: true,
    });
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        "stale-panel": `Skipped stale drawing edit for ${targetPanelId}; ${activePanel.panelId} is active.`,
        "missing-chart": `Chart for ${targetPanelId} is unavailable.`,
        "missing-drawing": `Drawing ${drawingId} is not on ${targetPanelId}.`,
        "selection-mismatch": `Drawing ${drawingId} is no longer selected on ${targetPanelId}.`,
      };
      setNotice(messages[result.reason]);
      return;
    }
    panelRefs.current.get(targetPanelId)?.refresh();
    markLiveDirty();
    setNotice(`Updated ${drawingId} on ${targetPanelId}.`);
  };
  const clearActiveDrawingSelection = (targetPanelId: string): void => {
    if (replayActive) {
      setNotice(`Drawing selection stays read-only while ${targetPanelId} is in replay.`);
      return;
    }
    const result = clearScopedDrawingSelection({
      activePanelId: activePanel.panelId,
      targetPanelId,
      getChart: chartForPanel,
    });
    if (!result.ok) {
      setNotice(result.reason === "stale-panel"
        ? `Skipped stale clear-selection for ${targetPanelId}; ${activePanel.panelId} is active.`
        : `Chart for ${targetPanelId} is unavailable.`);
      return;
    }
    panelRefs.current.get(targetPanelId)?.refresh();
    setNotice(`Cleared drawing selection on ${targetPanelId}.`);
  };
  const addAlert = (): void => { const target = activeHandle?.getChart(); if (target === null || target === undefined) return; const inputName = alertNameInputRef.current?.value ?? alertName; const normalizedName = inputName.trim() || "Price alert"; try { target.addAlert({ id: `studio-alert-${serialRef.current++}`, name: normalizedName, condition: { type: "price-cross-above", field: "close", value: alertThreshold }, frequency: alertFrequency }); setLastAlertDiagnostic({ inputValue: inputName.slice(0, 120), createdName: normalizedName.slice(0, 120), outcome: "accepted" }); activeHandle?.refresh(); setNotice(`Alert created in ${activePanel.panelId}; events remain local.`); } catch (error) { setLastAlertDiagnostic({ inputValue: inputName.slice(0, 120), createdName: "", outcome: "rejected" }); setNotice(`Could not create alert: ${error instanceof Error ? error.message : String(error)}`); } };
  const addScript = async (source: string, signal: AbortSignal, generation: number, sourcePanelId = activePanelIdRef.current): Promise<void> => {
    const instanceId = allocateStudioScriptInstanceId(serialRef.current++);
    // Generation is frozen to the request token from the editor/catalog call site.
    // Panel ownership is re-validated after the Worker await inside the helper.
    const result = await applyStudioKlineScriptIndicator({
      source,
      activePanelId: activePanelIdRef.current,
      targetPanelId: sourcePanelId,
      requestGeneration: generation,
      getCurrentGeneration: () => generation,
      getActivePanelId: () => activePanelIdRef.current,
      instanceId,
      replayActive,
      signal,
      getChart: (panelId) => panelRefs.current.get(panelId)?.getChart() ?? null,
    });
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        "stale-panel": `Skipped stale KlineScript apply for ${sourcePanelId}; ${activePanelIdRef.current} is active.`,
        "stale-request": "Skipped stale KlineScript apply; editor source changed.",
        "missing-chart": `Chart for ${sourcePanelId} is unavailable.`,
        "replay-active": "KlineScript cannot be applied during replay.",
        "empty-source": "KlineScript source is empty.",
        "compile-failed": result.diagnostics?.map((item) => item.message).join(" · ") || "KlineScript compilation or Worker execution failed.",
      };
      throw new Error(messages[result.reason]);
    }
    panelRefs.current.get(result.panelId)?.refresh();
    markLiveDirty();
    setNotice(`Added Worker-backed KlineScript ${result.indicatorId} to ${result.panelId}.`);
  };
  const applyCatalogScript = async (source: string, sourcePanelId = activePanelIdRef.current): Promise<void> => {
    if (replayActive) {
      setNotice("KlineScript cannot be applied during replay.");
      return;
    }
    scriptGenerationRef.current += 1;
    const generation = scriptGenerationRef.current;
    try {
      await addScript(source, new AbortController().signal, generation, sourcePanelId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const toggleComparison = (): void => {
    setComparisonSettings((current) => {
      if (current.active) return { ...current, active: false };
      const initialAssets = current.assetIds.includes(activePanel.symbol)
        ? [activePanel.symbol, ...current.assetIds.filter((id) => id !== activePanel.symbol)]
        : [activePanel.symbol, ...symbols.filter((id) => id !== activePanel.symbol).slice(0, 1)];
      return { ...current, active: true, mode: current.mode, assetIds: initialAssets, baselineTime: comparisonBaselineOptions[0]?.time ?? current.baselineTime, baselineMaxAgeMs: intervalFor(activePanel.timeframe) };
    });
  };
  const toggleComparisonAsset = (id: string): void => {
    if (id === activePanel.symbol) return;
    setComparisonSettings((current) => {
      const assetIds = current.assetIds.includes(id) ? current.assetIds.filter((assetId) => assetId !== id) : [...current.assetIds, id];
      return { ...current, assetIds: assetIds.includes(activePanel.symbol) ? assetIds : [activePanel.symbol, ...assetIds] };
    });
  };
  const setComparisonMode = (mode: ComparisonNormalizationMode): void => setComparisonSettings((current) => ({ ...current, mode }));
  const setComparisonBaseline = (time: number): void => setComparisonSettings((current) => ({ ...current, baselineTime: time }));
  const setComparisonDataSource = (dataSource: StudioComparisonSource): void => {
    setComparisonSettings((current) => ({
      ...current,
      dataSource,
      baselineTime: dataSource === "binance" ? Date.now() - intervalFor(activePanel.timeframe) * 239 : current.baselineTime,
    }));
  };
  const recoverComparison = (): void => {
    const controller = comparisonDatafeedRef.current;
    if (controller === null) return;
    for (const id of comparisonSettings.assetIds) {
      const feed = comparisonFeedsRef.current.get(`${comparisonSettings.dataSource ?? "demo"}|${id}|${activePanel.timeframe}`);
      if (feed instanceof RecoverableStudioDatafeed) feed.restoreHiddenHistoricalBars();
    }
    void controller.backfill({ maxAttempts: 2, maxConcurrency: 2, retryBackoffMs: 100 }).then((result) => {
      setComparisonFeedState(controller.getState());
      setComparisonLines(controller.getNormalizedData());
      setNotice(result.status === "complete" ? "Comparison history recovery completed." : `Comparison recovery status: ${result.status}.`);
    }).catch((error: unknown) => setNotice(`Comparison recovery failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  const simulateComparisonGap = (): void => {
    if ((comparisonSettings.dataSource ?? "demo") !== "demo") {
      setNotice("Missing-history simulation is available only for deterministic demo data.");
      return;
    }
    const id = comparisonSettings.assetIds[0];
    if (id === undefined) return;
    const feed = comparisonFeedsRef.current.get(`demo|${id}|${activePanel.timeframe}`);
    const candles = buildCandles(id, activePanel.timeframe);
    const missing = candles.at(-2);
    const controller = comparisonDatafeedRef.current;
    if (!(feed instanceof RecoverableStudioDatafeed) || missing === undefined || controller === null) return;
    feed.hideHistoricalBar(missing.time);
    void controller.load().then(() => {
      if (comparisonDatafeedRef.current !== controller) return;
      setComparisonFeedState(controller.getState());
      setComparisonLines(controller.getNormalizedData());
      setNotice(`Simulated a missing ${id} observation at ${new Date(missing.time).toISOString()}.`);
    }).catch((error: unknown) => setNotice(`Missing-history simulation failed: ${error instanceof Error ? error.message : String(error)}`));
  };
  const simulateComparisonCorrection = (): void => {
    if ((comparisonSettings.dataSource ?? "demo") !== "demo") {
      setNotice("Realtime correction simulation is available only for deterministic demo data.");
      return;
    }
    const id = comparisonSettings.assetIds[0];
    if (id === undefined) return;
    const feed = comparisonFeedsRef.current.get(`demo|${id}|${activePanel.timeframe}`);
    const candles = buildCandles(id, activePanel.timeframe);
    const latest = candles.at(-1);
    if (!(feed instanceof RecoverableStudioDatafeed) || latest === undefined) return;
    const close = latest.close * 1.001;
    feed.pushBar({ ...latest, open: latest.open, close, high: Math.max(latest.high, close), low: Math.min(latest.low, close) });
    setComparisonFeedState(comparisonDatafeedRef.current?.getState() ?? null);
    setComparisonLines(comparisonDatafeedRef.current?.getNormalizedData() ?? []);
    setNotice(`Simulated a deterministic realtime correction for ${id}.`);
  };
  const advanceComparisonStream = (): void => {
    if ((comparisonSettings.dataSource ?? "demo") !== "demo") {
      setNotice("Deterministic stream controls are available only for the offline demo source.");
      return;
    }
    let advanced = 0;
    for (const id of comparisonSettings.assetIds) {
      const feed = comparisonFeedsRef.current.get(`demo|${id}|${activePanel.timeframe}`);
      if (feed instanceof RecoverableStudioDatafeed) {
        feed.pushNextBar(intervalFor(activePanel.timeframe));
        advanced += 1;
      }
    }
    setComparisonFeedState(comparisonDatafeedRef.current?.getState() ?? null);
    setComparisonLines(comparisonDatafeedRef.current?.getNormalizedData() ?? []);
    setNotice(`Advanced ${advanced} deterministic comparison stream${advanced === 1 ? "" : "s"}.`);
  };
  const disconnectComparisonStream = (): void => {
    if ((comparisonSettings.dataSource ?? "demo") !== "demo") {
      setNotice("Deterministic stream controls are available only for the offline demo source.");
      return;
    }
    for (const id of comparisonSettings.assetIds) {
      const feed = comparisonFeedsRef.current.get(`demo|${id}|${activePanel.timeframe}`);
      if (feed instanceof RecoverableStudioDatafeed) feed.emitStatus("disconnected");
    }
    setNotice("Deterministic comparison streams disconnected; subsequent bars are retained for bounded recovery.");
  };
  const reconnectComparisonStream = (): void => {
    if ((comparisonSettings.dataSource ?? "demo") !== "demo") {
      setNotice("Deterministic stream controls are available only for the offline demo source.");
      return;
    }
    for (const id of comparisonSettings.assetIds) {
      const feed = comparisonFeedsRef.current.get(`demo|${id}|${activePanel.timeframe}`);
      if (feed instanceof RecoverableStudioDatafeed) feed.emitStatus("reconnected");
    }
    setNotice("Deterministic comparison streams reconnected; bounded recovery is running.");
  };

  const selectedSymbol = (symbolId: string): void => { const symbol = selectedList?.symbols.find((item) => item.id === symbolId); if (symbol !== undefined) changeActiveSymbol(symbol.displaySymbol); };
  const openScreenerChart = (symbol: string): void => { changeActiveSymbol(symbol); setNotice(`Opened ${symbol} from the screener in the active chart.`); };
  const favoriteScreenerSymbol = (symbol: string): void => { const candidate = selectedList?.symbols.find((item) => item.displaySymbol === symbol); if (candidate !== undefined && selectedList !== undefined) { watchlistModel.setFavorite(selectedList.id, candidate.id, true); setNotice(`${symbol} was added to watchlist favorites.`); } };
  const createWatchlist = (): void => { const list = watchlistModel.create(`Watchlist ${watchlists.lists.length + 1}`); setNotice(`Created ${list.name}.`); };
  const addWatchlistSymbol = (): void => { if (selectedList === undefined) { createWatchlist(); return; } const candidate = symbols.find((symbol) => !selectedList.symbols.some((item) => item.displaySymbol === symbol)); if (candidate === undefined) return; watchlistModel.addSymbol(selectedList.id, { id: candidate, displaySymbol: candidate, name: candidate, exchange: "Demo", assetCategory: "Sample", quoteCurrency: "USD" }); };
  const removePanelNow = (panelId: string): void => {
    syncControllerRef.current?.removeChart(panelId);
    delete snapshotsRef.current[panelId];
    setPanels((current) => current.filter((panel) => panel.panelId !== panelId));
    archivedPanelsRef.current.delete(panelId);
    panelRefs.current.delete(panelId);
    if (activePanelId === panelId) setActivePanelId(panels.find((panel) => panel.panelId !== panelId)?.panelId ?? "chart-1");
    setNotice(`${panelId} removed and its chart resources disposed.`);
  };
  const removePanel = (panelId: string): void => { if (panels.length <= 1) return; showConfirm(`Remove ${panelId}`, "Its chart resources will be destroyed.", () => removePanelNow(panelId)); };

  const importInputRef = useRef<HTMLInputElement>(null);
  const importWorkspace = (file: File, trigger?: HTMLElement | null): void => {
    void file.text().then((rawText) => {
      try {
        const prepared = prepareStudioWorkspaceImport({
          text: rawText,
          byteLength: file.size,
          existingIds: workspaceEntries.map((entry) => entry.id),
          existingNames: workspaceEntries.map((entry) => entry.name),
        });
        const collisionNotes = [
          prepared.idCollision ? "The imported id already exists locally; a new id will be assigned so nothing is overwritten." : null,
          prepared.nameCollision ? "Another saved workspace already uses a similar name; both remain available under different ids." : null,
        ].filter((item): item is string => item !== null);
        const message = [
          `Validated “${prepared.sourceName}” with ${prepared.panelCount} chart panel${prepared.panelCount === 1 ? "" : "s"} (${prepared.panelIds.join(", ")}).`,
          "Confirm a local name to import into browser storage. Cancel leaves the current workspace unchanged.",
          ...collisionNotes,
        ].join(" ");
        showPrompt("Import workspace", message, prepared.suggestedName, (value) => {
          const storageRaw = window.localStorage.getItem(WORKSPACES_KEY);
          let all: StudioWorkspaceDocument[] = [];
          if (storageRaw !== null) {
            try { all = [...parseStudioWorkspaceCollection(JSON.parse(storageRaw)).workspaces]; }
            catch { all = []; }
          }
          const named = finalizeStudioWorkspaceImport(
            prepared.document,
            value,
            allocateStudioWorkspaceImportId(all.map((item) => item.id)),
          );
          const commitImport = (): void => {
            const storageRawNow = window.localStorage.getItem(WORKSPACES_KEY);
            let nextAll: StudioWorkspaceDocument[] = [];
            if (storageRawNow !== null) {
              try { nextAll = [...parseStudioWorkspaceCollection(JSON.parse(storageRawNow)).workspaces]; }
              catch { nextAll = []; }
            }
            if (nextAll.some((item) => item.id === named.id)) {
              throw new Error("Import aborted: the allocated workspace id collided before commit. The current workspace was not changed.");
            }
            nextAll = [...nextAll, named];
            if (!persist(named, nextAll)) {
              throw new Error("Import validated but browser storage could not be updated. The current workspace was not changed.");
            }
            setWorkspaceEntries(nextAll.map((item) => ({ id: item.id, name: item.name })));
            applyDocument(named);
            setNotice(`Imported “${named.name}” with ${named.charts.length} panel${named.charts.length === 1 ? "" : "s"} into local storage without overwriting existing workspaces.`);
          };
          // Close the naming prompt first, then optionally open the navigation guard.
          queueMicrotask(() => {
            requestDestructiveNavigation({
              title: "Replace workspace with import?",
              message: `Importing “${named.name}” replaces the current live workspace. Save your unsaved work first, discard it, or cancel to keep the current desk. The import is not written until you continue.`,
              proceed: commitImport,
              trigger,
            });
          });
        }, trigger);
      } catch (error) {
        setNotice(describeStudioWorkspaceImportError(error));
      }
    }, () => setNotice("Import rejected: the file could not be read. The current workspace was not changed."));
  };
  const newWorkspaceNow = (): void => {
    const panelId = `chart-${serialRef.current++}`;
    archivedPanelsRef.current.clear();
    pendingRestoreRef.current = null;
    snapshotsRef.current = {};
    strategyResultsRef.current.clear();
    appliedStrategyParametersRef.current.clear();
    setActiveSnapshotState(emptySnapshot());
    setRestoreSummary(null);
    setQuotes({});
    setPanels([{ panelId, symbol: "BTC-USD", timeframe: "1h" }]);
    setActivePanelId(panelId);
    setLayout("single");
    setPortfolioConfiguration(null);
    setWorkspaceId(`${DEFAULT_WORKSPACE_ID}-${Date.now()}`);
    setWorkspaceName("New workspace");
    setWatchlistModel(new WatchlistModel(defaultWatchlists(), (prefix) => `${prefix}-studio-${serialRef.current++}`));
    clearPersistedBaseline();
    setPristineUnsaved(true);
    setSessionOriginFingerprint(null);
    setLiveFingerprint(null);
    setNotice("New empty Studio workspace started.");
    queueMicrotask(() => {
      const fingerprint = refreshLiveFingerprint();
      markUnsavedSessionOrigin(fingerprint);
    });
  };
  const newWorkspace = (trigger?: HTMLElement | null): void => {
    requestDestructiveNavigation({
      title: "Start a new workspace?",
      message: `“${workspaceName}” has unsaved content. Save and continue, discard changes and continue, or cancel to keep the current desk.`,
      proceed: newWorkspaceNow,
      trigger,
    });
  };
  const loadWorkspaceNow = (id: string): void => {
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    if (raw === null) return;
    try {
      const stored = parseStudioWorkspaceCollection(JSON.parse(raw));
      const document = stored.workspaces.find((item) => item.id === id);
      if (document !== undefined) applyDocument(document);
    } catch {
      setNotice("Saved workspace collection is invalid; nothing was changed.");
    }
  };
  const loadWorkspace = (id: string, trigger?: HTMLElement | null): void => {
    if (id === workspaceId && libraryBackingId === id && !studioWorkspaceNeedsNavigationGuard(currentSaveStatus, { pristineUnsavedWorkspace })) {
      loadWorkspaceNow(id);
      return;
    }
    const destination = workspaceEntries.find((entry) => entry.id === id)?.name ?? id;
    requestDestructiveNavigation({
      title: "Load another workspace?",
      message: `Loading “${destination}” replaces the current live workspace “${workspaceName}”. Save and continue, discard changes and continue, or cancel to keep your unsaved work.`,
      proceed: () => loadWorkspaceNow(id),
      trigger,
    });
  };
  const renameWorkspace = (trigger?: HTMLElement | null): void => {
    const targetId = workspaceId;
    const currentLabel = workspaceName;
    showPrompt(
      "Rename workspace",
      `Choose a new display name for “${currentLabel}”. The workspace id stays the same; charts, drawings, and panels are not rebuilt.`,
      currentLabel,
      (value) => {
        const raw = window.localStorage.getItem(WORKSPACES_KEY);
        if (raw === null) throw new Error("No saved workspace library is available to rename.");
        let stored;
        try { stored = parseStudioWorkspaceCollection(JSON.parse(raw)); }
        catch { throw new Error("Saved workspace collection is invalid; nothing was renamed."); }
        const result = renameStudioWorkspaceRecord(stored, targetId, value);
        try {
          window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(result.collection));
        } catch {
          throw new Error("Workspace could not be renamed. Browser storage may be unavailable or full.");
        }
        setWorkspaceEntries(result.collection.workspaces.map((item) => ({ id: item.id, name: item.name })));
        if (workspaceId === targetId) setWorkspaceName(result.document.name);
        setNotice(result.nameCollision
          ? `Renamed workspace to “${result.document.name}”. Another saved workspace already uses a similar name; both remain available under different ids.`
          : `Renamed workspace to “${result.document.name}”.`);
      },
      trigger,
    );
  };
  const deleteWorkspaceNow = (targetId: string, targetName: string): void => {
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    if (raw === null) {
      setNotice("No saved workspace library entry to delete.");
      return;
    }
    try {
      const stored = parseStudioWorkspaceCollection(JSON.parse(raw));
      const result = deleteStudioWorkspaceRecord(stored, targetId);
      if (result.collection === null) {
        try { window.localStorage.removeItem(WORKSPACES_KEY); }
        catch {
          setNotice("Workspace could not be deleted. Browser storage may be unavailable or full.");
          return;
        }
        setWorkspaceEntries([]);
        if (result.detachLiveWorkspace) {
          setWorkspaceId(allocateStudioWorkspaceId([], "workspace"));
          clearPersistedBaseline();
          setSessionOriginFingerprint(null);
          queueMicrotask(() => { markUnsavedSessionOrigin(refreshLiveFingerprint()); });
        }
        setNotice(`Deleted saved workspace “${targetName}”. Live charts remain open as an unsaved desk.`);
        return;
      }
      try {
        window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(result.collection));
      } catch {
        setNotice("Workspace could not be deleted. Browser storage may be unavailable or full.");
        return;
      }
      setWorkspaceEntries(result.collection.workspaces.map((item) => ({ id: item.id, name: item.name })));
      if (result.detachLiveWorkspace) {
        setWorkspaceId(allocateStudioWorkspaceId(result.collection.workspaces.map((item) => item.id), "workspace"));
        clearPersistedBaseline();
        setSessionOriginFingerprint(null);
        queueMicrotask(() => { markUnsavedSessionOrigin(refreshLiveFingerprint()); });
        setNotice(`Deleted saved workspace “${targetName}”. Live charts remain open as an unsaved desk; no other workspace was loaded.`);
      } else {
        setNotice(`Deleted saved workspace “${targetName}” from this browser.`);
      }
    } catch (error) {
      if (error instanceof StudioWorkspaceLibraryError && error.reason === "missing") {
        setNotice(`Saved workspace “${targetName}” was not found; nothing was deleted.`);
        return;
      }
      setNotice("Could not delete the workspace collection safely.");
    }
  };
  const deleteWorkspace = (trigger?: HTMLElement | null): void => {
    const targetId = workspaceId;
    const targetName = workspaceName;
    showConfirm(
      `Delete workspace “${targetName}”?`,
      `Removes only the saved library entry with id ending …${targetId.slice(-8)} from this browser. Live charts stay open. Deletion cannot be undone.`,
      () => deleteWorkspaceNow(targetId, targetName),
      trigger,
    );
  };
  const duplicateWorkspace = (): void => {
    let named: string;
    try { named = normalizeStudioWorkspaceName(`${workspaceName} copy`); }
    catch (error) { setNotice(error instanceof Error ? error.message : String(error)); return; }
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    let all: StudioWorkspaceDocument[] = [];
    if (raw !== null) {
      try { all = [...parseStudioWorkspaceCollection(JSON.parse(raw)).workspaces]; }
      catch { all = []; }
    }
    const id = allocateStudioWorkspaceId(all.map((item) => item.id), "copy");
    const document = collectDocument(id, named);
    const next = [...all, document];
    if (!persist(document, next)) return;
    setWorkspaceId(id);
    setWorkspaceName(document.name);
    setWorkspaceEntries(next.map((item) => ({ id: item.id, name: item.name })));
  };

  const initialWorkspaceFor = (panelId: string): WorkspaceDocument | undefined => pendingRestoreRef.current?.charts.find((chart) => chart.panelId === panelId)?.workspace ?? archivedPanelsRef.current.get(panelId)?.workspace;
  const strategyScopeKey = `${activePanel.panelId}|${activePanel.symbol}|${activePanel.timeframe}`;
  const applyStrategyParameters = (strategyId: string, parameters: Readonly<Record<string, unknown>>): void => {
    appliedStrategyParametersRef.current.set(strategyScopeKey, { strategyId, parameters: { ...parameters } });
    setNotice(`${activePanel.panelId}: optimizer selection is ready for Strategy Tester; Paper Trading remains unchanged.`);
  };

  const activeOrderFlow = activeSnapshot.orderFlow;
  const activeFootprintOptions = activeSnapshot.footprintOptions;
  const activeCvdOptions = activeSnapshot.cvdOptions;
  const activeDepthOptions = activeSnapshot.depthOptions;
  const activeTimeAndSales = activeHandle?.getChart()?.getMarketTrades({ limit: 8 }) ?? [];
  const updateOrderFlow = (operation: (target: Chart) => void, message: string): void => {
    const target = activeHandle?.getChart();
    if (target === null || target === undefined || analyticsDisabled) return;
    try {
      operation(target);
      activeHandle?.refresh();
      setNotice(message);
    } catch (error) {
      setNotice(`Could not update order flow: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const orderFlowControls = <section className={styles.comparisonPanel} aria-label="Order Flow and Market Depth" data-order-flow-trade-count={activeOrderFlow.tradeCount} data-order-flow-coverage={activeOrderFlow.tradeCoverage} data-order-book-status={activeOrderFlow.depth?.status ?? "uninitialized"}>
    <div className={styles.panelHeading}><div><h2>Order Flow &amp; Market Depth</h2><small>Provider-neutral trade prints, footprint, CVD, depth, and Time &amp; Sales.</small></div><span>{activeOrderFlow.tradeCount} prints</span></div>
    <p className={styles.orderFlowDisclaimer}>Illustrative offline fixtures only; these prints and levels are not observed exchange transactions.</p>
    <div className={styles.comparisonControls}>
      <label className={styles.check}><input aria-label="Enable Footprint" type="checkbox" checked={activeFootprintOptions.visible} disabled={analyticsDisabled} onChange={(event) => updateOrderFlow((target) => target.setFootprintOptions({ visible: event.target.checked }), `${event.target.checked ? "Enabled" : "Disabled"} Footprint on ${activePanel.panelId}.`)} />Footprint</label>
      <label className={styles.check}><input aria-label="Enable CVD" type="checkbox" checked={activeCvdOptions.visible} disabled={analyticsDisabled} onChange={(event) => updateOrderFlow((target) => target.setCvdOptions({ visible: event.target.checked }), `${event.target.checked ? "Enabled" : "Disabled"} CVD on ${activePanel.panelId}.`)} />CVD pane</label>
      <label>CVD reset<select aria-label="CVD reset policy" value={activeCvdOptions.reset} disabled={analyticsDisabled} onChange={(event) => updateOrderFlow((target) => target.setCvdOptions({ reset: event.target.value as "continuous" | "session" }), `CVD reset policy changed to ${event.target.value}.`)}><option value="continuous">Continuous</option><option value="session">Trading session</option></select></label>
      <label className={styles.check}><input aria-label="Enable Market Depth" type="checkbox" checked={activeDepthOptions.visible} disabled={analyticsDisabled} onChange={(event) => updateOrderFlow((target) => target.setDepthOptions({ visible: event.target.checked }), `${event.target.checked ? "Enabled" : "Disabled"} market depth on ${activePanel.panelId}.`)} />Depth view</label>
      <label className={styles.check}><input aria-label="Enable Liquidity Heatmap" type="checkbox" checked={activeDepthOptions.showHeatmap} disabled={analyticsDisabled} onChange={(event) => updateOrderFlow((target) => target.setDepthOptions({ showHeatmap: event.target.checked, visible: activeDepthOptions.visible }), `${event.target.checked ? "Enabled" : "Disabled"} liquidity heatmap.`)} />Liquidity heatmap</label>
    </div>
    <div className={styles.orderFlowSummary} aria-live="polite"><span>Coverage <strong>{activeOrderFlow.tradeCoverage}</strong></span><span>Book <strong>{activeOrderFlow.depth?.status ?? "uninitialized"}</strong></span><span>Best bid <strong>{activeOrderFlow.depthMetrics?.bestBid ?? "—"}</strong></span><span>Best ask <strong>{activeOrderFlow.depthMetrics?.bestAsk ?? "—"}</strong></span><span>Spread <strong>{activeOrderFlow.depthMetrics?.spread ?? "—"}</strong></span><span>Imbalance <strong>{activeOrderFlow.depthMetrics?.imbalance?.toFixed(3) ?? "—"}</strong></span></div>
    {activeCvdOptions.reset === "session" ? <small className={styles.orderFlowWarning}>Session CVD uses the Studio's illustrative trading calendar. Attach a provider-owned calendar before treating session boundaries as exchange facts.</small> : null}
    <details><summary>Time &amp; Sales ({activeTimeAndSales.length})</summary>{activeTimeAndSales.length === 0 ? <small>No trade prints are loaded.</small> : <ul className={styles.timeAndSalesList}>{activeTimeAndSales.slice().reverse().map((trade) => <li key={`${trade.id}:${trade.revision}`}><time>{new Date(trade.time).toLocaleTimeString()}</time><span>{trade.price}</span><span>{trade.quantity}</span><strong className={trade.aggressorSide === "buy" ? styles.orderFlowBuy : trade.aggressorSide === "sell" ? styles.orderFlowSell : styles.orderFlowUnknown}>{trade.aggressorSide}</strong></li>)}</ul>}</details>
  </section>;

  const volumeAnalyticsControls = <details open aria-label="Volume Analytics">
    <summary>Volume Analytics</summary>
    <p><small>Anchored VWAP and Volume Profile use raw OHLCV. Profile values are estimated, not exchange-reported volume-at-price.</small></p>
    <label className={styles.check}><input aria-label="Enable Anchored VWAP" type="checkbox" checked={activeAnchoredVwap !== undefined} disabled={analyticsDisabled} onChange={addOrRemoveAnchoredVwap} />Anchored VWAP</label>
    {activeAnchoredVwap === undefined ? null : <div className={styles.alertForm}>
      <label>Anchor (UTC)<input aria-label="Anchored VWAP anchor UTC" type="datetime-local" value={utcInputValue(activeAnchoredVwap.anchorTime)} disabled={analyticsDisabled} onChange={(event) => setAnchoredVwapAnchor(event.target.value)} /></label>
      <label>Price source<select aria-label="Anchored VWAP price source" value={activeAnchoredVwap.priceSource} disabled={analyticsDisabled} onChange={(event) => setAnchoredVwapSource(event.target.value as AnchoredVwapPriceSource)}><option value="typical">Typical price</option><option value="close">Close</option></select></label>
      <button type="button" disabled={analyticsDisabled} onClick={startAnchoredVwapPlacement}>Select candle anchor</button>
    </div>}
    <label className={styles.check}><input aria-label="Enable Estimated Volume Profile" type="checkbox" checked={activeProfile !== undefined} disabled={analyticsDisabled} onChange={addOrRemoveVolumeProfile} />Estimated Volume Profile</label>
    {activeProfile === undefined ? null : <div className={styles.alertForm}>
      <label>Mode<select aria-label="Volume Profile mode" value={activeProfile.mode} disabled={analyticsDisabled} onChange={(event) => setVolumeProfileMode(event.target.value as VolumeProfileMode)}><option value="visible">Visible range</option><option value="fixed">Fixed UTC range</option></select></label>
      <label>Allocation<select aria-label="Volume Profile allocation" value={activeProfile.allocation} disabled={analyticsDisabled} onChange={(event) => updateVolumeProfile({ allocation: event.target.value as VolumeProfileAllocationMethod })}><option value="close">Close price</option><option value="range-uniform">Uniform high/low range</option></select></label>
      <label>Bins<input aria-label="Volume Profile bins" type="number" min="1" max="10000" value={activeProfile.binCount} disabled={analyticsDisabled} onChange={(event) => updateVolumeProfile({ binCount: Number(event.target.value) })} /></label>
      <label>Value area<input aria-label="Volume Profile value area" type="number" min="0.01" max="1" step="0.05" value={activeProfile.valueAreaPercentage} disabled={analyticsDisabled} onChange={(event) => updateVolumeProfile({ valueAreaPercentage: Number(event.target.value) })} /></label>
      {activeProfile.mode === "fixed" ? <><label>From (UTC)<input aria-label="Volume Profile range from UTC" type="datetime-local" value={utcInputValue(activeProfile.range?.from)} disabled={analyticsDisabled} onChange={(event) => setVolumeProfileRange("from", event.target.value)} /></label><label>To (UTC, exclusive)<input aria-label="Volume Profile range to UTC" type="datetime-local" value={utcInputValue(activeProfile.range?.to)} disabled={analyticsDisabled} onChange={(event) => setVolumeProfileRange("to", event.target.value)} /></label></> : null}
      <label className={styles.check}><input aria-label="Show POC" type="checkbox" checked={activeProfile.showPoc} disabled={analyticsDisabled} onChange={(event) => updateVolumeProfile({ showPoc: event.target.checked })} />Show POC</label>
      <label className={styles.check}><input aria-label="Show value area" type="checkbox" checked={activeProfile.showValueArea} disabled={analyticsDisabled} onChange={(event) => updateVolumeProfile({ showValueArea: event.target.checked })} />Show VAH / VAL</label>
      <label className={styles.check}><input aria-label="Show Volume Profile labels" type="checkbox" checked={activeProfile.showLabels} disabled={analyticsDisabled} onChange={(event) => updateVolumeProfile({ showLabels: event.target.checked })} />Show labels</label>
      <output aria-label="Volume Profile result" data-volume-profile-status={activeProfileResult?.status ?? "empty"} data-volume-profile-eligible-candles={activeProfileResult?.eligibleCandleCount ?? ""} data-volume-profile-poc={activeProfileResult?.pointOfControl?.price ?? ""} data-volume-profile-vah={activeProfileResult?.valueArea?.high ?? ""} data-volume-profile-val={activeProfileResult?.valueArea?.low ?? ""}>{activeProfile.mode === "visible" ? "Visible" : "Fixed"} · {activeProfileResult?.status ?? "empty"} · POC {activeProfileResult?.pointOfControl?.price.toFixed(2) ?? "—"} · VAH {activeProfileResult?.valueArea?.high.toFixed(2) ?? "—"} · VAL {activeProfileResult?.valueArea?.low.toFixed(2) ?? "—"}</output>
    </div>}
    {comparisonSettings.active ? <small>Raw-price volume analytics are temporarily hidden while normalized comparison mode is active and are restored on exit.</small> : null}
  </details>;

  const multiTimeframeControls = <section className={styles.comparisonPanel} aria-label="Multi-timeframe analysis"><div className={styles.panelHeading}><div><h2>Multi-timeframe analysis</h2><small>Causal fixed-duration analysis for the active chart panel.</small></div><span>{activeSnapshot.multiTimeframeIndicators.length + activeSnapshot.multiTimeframeReferences.length} active</span></div><div className={styles.comparisonControls}><label>Indicator<select aria-label="Higher-timeframe study" value={multiTimeframeIndicator} disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onChange={(event) => setMultiTimeframeIndicator(event.target.value as typeof multiTimeframeIndicator)}><option value="SMA">SMA</option><option value="EMA">EMA</option><option value="RSI">RSI</option></select></label><label>Target<select aria-label="Higher-timeframe target" value={multiTimeframeTarget} disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onChange={(event) => setMultiTimeframeTarget(event.target.value as Timeframe)}>{multiTimeframeTargetOptions.map((timeframe) => <option key={timeframe} value={timeframe}>{timeframe}</option>)}</select></label><label>Period<input aria-label="Higher-timeframe period" type="number" min="1" max="500" value={multiTimeframePeriod} disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onChange={(event) => setMultiTimeframePeriod(event.target.value)} /></label><label>Finality<select aria-label="Higher-timeframe finality" value={multiTimeframeFinality} disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onChange={(event) => setMultiTimeframeFinality(event.target.value as MultiTimeframeFinalityPolicy)}><option value="complete-only">Complete coverage only</option><option value="time-closed">Time-closed, preserve partial</option></select></label></div><label className={styles.check}><input aria-label="Previous timeframe levels" type="checkbox" checked={multiTimeframeReference} disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onChange={(event) => setMultiTimeframeReference(event.target.checked)} />Previous OHLC levels</label><div className={styles.addRow}><button type="button" aria-label="Toggle higher-timeframe study" disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onClick={toggleMultiTimeframeIndicator}>{activeMultiTimeframeIndicator === undefined ? "Add" : "Remove"} {multiTimeframeIndicator}</button><button type="button" aria-label="Toggle previous timeframe levels" disabled={analyticsDisabled || multiTimeframeTargetOptions.length === 0} onClick={toggleMultiTimeframeReference}>{activeMultiTimeframeReference === undefined ? "Add" : "Remove"} levels</button></div>{activeMultiTimeframeIndicator === undefined ? null : <small data-multi-timeframe-indicator={activeMultiTimeframeIndicator.id}>{activeMultiTimeframeIndicator.indicatorId} · {activeMultiTimeframeIndicator.targetTimeframe} · {activeMultiTimeframeIndicator.visible === false ? "hidden" : "visible"}</small>}{activeMultiTimeframeReference === undefined ? null : <small data-multi-timeframe-reference={activeMultiTimeframeReference.id}>Previous OHLC · {activeMultiTimeframeReference.targetTimeframe} · {activeMultiTimeframeReference.visible === false ? "hidden" : "visible"}</small>}{multiTimeframeTargetOptions.length === 0 ? <small>This chart timeframe has no larger fixed Studio timeframe.</small> : null}{analyticsDisabled ? <small>Controls are disabled during replay or normalized comparison; saved causal configuration remains intact.</small> : null}</section>;

  const activeCalendar = activeHandle?.getChart()?.getTradingCalendar();
  const activeCalendarSnapshot = activeCalendar?.getSnapshot() ?? null;
  const sessionControls = <section className={styles.comparisonPanel} aria-label="Trading sessions and calendar analysis"><div className={styles.panelHeading}><div><h2>Trading sessions</h2><small>Offline illustrative schedule; it is not an authoritative exchange holiday calendar.</small></div><span>{activeSnapshot.sessionIndicators.length + activeSnapshot.sessionReferences.length} active</span></div><div className={styles.comparisonControls}><label>Market mode<select aria-label="Market session mode" value={activeCalendarSnapshot === null ? "utc" : "calendar"} disabled={analyticsDisabled} onChange={(event) => setSessionMarketMode(event.target.value as "calendar" | "utc")}><option value="utc">24/7 UTC</option><option value="calendar">Calendar-backed market</option></select></label><label>Calendar<select aria-label="Trading calendar" value={activeCalendarSnapshot?.calendarId ?? studioTradingCalendar.id} disabled={analyticsDisabled || activeCalendarSnapshot === null} onChange={() => setSessionMarketMode("calendar")}><option value={studioTradingCalendar.id}>Illustrative US cash · 2026.1</option></select></label><label>Analysis period<select aria-label="Session analysis period" value={sessionPeriod} disabled={analyticsDisabled || activeCalendarSnapshot === null} onChange={(event) => setSessionPeriod(event.target.value as TradingAggregationPeriod)}><option value="session">Trading session</option><option value="week">Trading week</option><option value="month">Trading month</option></select></label></div><small data-calendar-status={activeCalendarSnapshot?.coverage ?? "utc"}>{activeCalendarSnapshot === null ? "24/7 UTC mode: no exchange session assumptions" : `Calendar ${activeCalendarSnapshot.calendarId}@${activeCalendarSnapshot.version} · ${activeCalendarSnapshot.timeZone} · validity ${activeCalendarSnapshot.validity.from ?? "unbounded"}–${activeCalendarSnapshot.validity.to ?? "unbounded"}`}</small><label className={styles.check}><input aria-label="Show trading sessions" type="checkbox" checked={activeSnapshot.tradingCalendar?.visible ?? sessionCalendarVisible} disabled={analyticsDisabled || activeCalendarSnapshot === null} onChange={toggleSessionCalendar} />Session boundaries and labels</label><div className={styles.addRow}><button type="button" aria-label="Toggle session SMA" disabled={analyticsDisabled || activeCalendarSnapshot === null} onClick={toggleSessionIndicator}>{activeSnapshot.sessionIndicators.length === 0 && !sessionIndicatorEnabled ? "Add" : "Remove"} {sessionPeriod} SMA</button><button type="button" aria-label="Toggle previous session levels" disabled={analyticsDisabled || activeCalendarSnapshot === null} onClick={toggleSessionReference}>{activeSnapshot.sessionReferences.length === 0 && !sessionReferenceEnabled ? "Add" : "Remove"} previous {sessionPeriod} levels</button></div>{activeSnapshot.sessionIndicators[0] === undefined ? null : <small data-session-indicator={activeSnapshot.sessionIndicators[0].id}>SMA · {activeSnapshot.sessionIndicators[0].targetPeriod}</small>}{activeSnapshot.sessionReferences[0] === undefined ? null : <small data-session-reference={activeSnapshot.sessionReferences[0].id}>Previous OHLC · {activeSnapshot.sessionReferences[0].targetPeriod}</small>}{analyticsDisabled ? <small>Session controls are disabled during replay or normalized comparison; persisted configuration remains intact.</small> : null}</section>;

  return <main className={styles.studio}>
    {volumeAnalyticsControls}
    {multiTimeframeControls}
    {sessionControls}
    {orderFlowControls}
    <header className={styles.topbar}>
      <div className={styles.brand}><span aria-hidden="true">◈</span><strong>OpenKline Studio</strong><small>Phase 7.5 analysis workspace</small></div>
      <label>Layout<select aria-label="Chart layout" value={layout} onChange={(event) => changeLayout(event.target.value as StudioLayout)}>{layoutChoices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Active chart<select aria-label="Active chart panel" value={activePanelId} onChange={(event) => setActivePanelId(event.target.value)}>{panels.map((panel) => <option key={panel.panelId} value={panel.panelId}>{panel.panelId} · {panel.symbol}</option>)}</select></label>
      <label>Active symbol<select aria-label="Active symbol" value={activePanel.symbol} disabled={replayActive} onChange={(event) => changeActiveSymbol(event.target.value)}>{symbols.map((symbol) => <option key={symbol}>{symbol}</option>)}</select></label>
      <label>Timeframe<select aria-label="Active timeframe" value={activePanel.timeframe} disabled={replayActive} onChange={(event) => changeActiveTimeframe(event.target.value as Timeframe)}>{timeframes.map((timeframe) => <option key={timeframe}>{timeframe}</option>)}</select></label>
      <div className={styles.topActions}><button type="button" onClick={(event) => newWorkspace(event.currentTarget)}>New</button><button type="button" onClick={() => { void saveWorkspace(false); }} disabled={replayActive}>Save</button><button type="button" onClick={() => { void saveWorkspace(true); }} disabled={replayActive}>Save As</button><button type="button" onClick={(event) => renameWorkspace(event.currentTarget)} disabled={replayActive}>Rename</button><button type="button" onClick={duplicateWorkspace} disabled={replayActive}>Duplicate</button><button type="button" onClick={(event) => deleteWorkspace(event.currentTarget)}>Delete</button><button type="button" onClick={(event) => loadWorkspace(workspaceId, event.currentTarget)}>Load</button><select aria-label="Workspace" value={workspaceEntries.some((entry) => entry.id === workspaceId) ? workspaceId : ""} onChange={(event) => { if (event.target.value !== "") loadWorkspace(event.target.value, event.currentTarget); }}>{workspaceEntries.some((entry) => entry.id === workspaceId) ? null : <option value="" disabled>{workspaceEntries.length === 0 ? "No saved workspaces" : "Unsaved desk"}</option>}{workspaceEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.id === workspaceId ? studioWorkspaceSelectorLabel({ id: entry.id, name: workspaceName }, workspaceEntries.map((candidate) => candidate.id === workspaceId ? { id: workspaceId, name: workspaceName } : candidate)) : studioWorkspaceSelectorLabel(entry, workspaceEntries)}</option>)}</select><input aria-label="Workspace name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} /><output aria-label="Workspace save status" data-workspace-save-status={currentSaveStatus} data-workspace-library-id={libraryBackingId ?? ""} data-workspace-save-failed={saveFailed ? "true" : "false"}>{describeStudioWorkspaceSaveStatus(currentSaveStatus, workspaceName)}</output><button type="button" aria-label="Export workspace" onClick={() => { try { const named = normalizeStudioWorkspaceName(workspaceName); const document = collectDocument(workspaceId, named); const file = new Blob([JSON.stringify(document, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(file); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `openkline-${named.toLowerCase().replace(/\s+/g, "-")}.json`; anchor.click(); URL.revokeObjectURL(url); setNotice(`Exported “${named}” (${document.charts.length} panel${document.charts.length === 1 ? "" : "s"}).`); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } }}>Export</button><button type="button" aria-label="Import workspace" onClick={(event) => { dialogTriggerRef.current = event.currentTarget; importInputRef.current?.click(); }}>Import</button><input ref={importInputRef} type="file" accept="application/json,.json" hidden aria-label="Workspace import file" onChange={(event) => { const file = event.target.files?.[0]; if (file !== undefined) importWorkspace(file, dialogTriggerRef.current); event.currentTarget.value = ""; }} /></div>
    </header>
        <section className={styles.toolbar} aria-label="Chart tools" data-drawing-toolbar-panel={activePanel.panelId} data-active-drawing-tool={activeSnapshot.activeDrawingTool ?? ""}>
      <div className={styles.toolGroup} aria-label="Chart type">{presentationChoices.map(([kind, label]) => <button key={kind} type="button" aria-pressed={presentation === kind} onClick={() => updatePresentation(kind)}>{label}</button>)}<button type="button" onClick={() => activeHandle?.getChart()?.fitContent()}>Fit</button><button type="button" onClick={() => activeHandle?.getChart()?.resetView()}>Reset</button></div>
      <div className={styles.drawingToolbar} role="region" aria-label="Professional drawing toolbar">
        <div className={styles.toolGroup} aria-label="Drawing mode">
          <button type="button" aria-label="Cursor selection mode" aria-pressed={activeSnapshot.activeDrawingTool === null} data-drawing-mode="cursor" disabled={replayActive} onClick={() => clearDrawingToolToCursor(activePanel.panelId)}>Cursor</button>
          <button type="button" aria-label="Cancel active drawing tool" data-drawing-mode="cancel" disabled={replayActive || activeSnapshot.activeDrawingTool === null} onClick={() => cancelActiveDrawing(activePanel.panelId)}>Cancel</button>
        </div>
        {drawingToolGroups.map((group) => (
          <div key={group} className={styles.toolGroup} aria-label={`${studioDrawingToolGroupLabel(group)} drawing tools`} data-drawing-tool-group={group}>
            {drawingToolbarCatalog.filter((tool) => tool.group === group).map((tool) => (
              <button
                key={tool.type}
                type="button"
                title={tool.description}
                aria-label={tool.label}
                aria-pressed={activeSnapshot.activeDrawingTool === tool.type}
                data-drawing-tool={tool.type}
                data-drawing-min-points={tool.minPoints}
                disabled={replayActive}
                onClick={() => activateDrawing(tool.type, activePanel.panelId)}
              >{tool.label}</button>
            ))}
          </div>
        ))}
        <div className={styles.toolGroup} aria-label="Drawing history">
          <button type="button" disabled={replayActive} onClick={() => { if (activeHandle?.getChart()?.undoDrawing()) { activeHandle.refresh(); markLiveDirty(); } }}>Undo</button>
          <button type="button" disabled={replayActive} onClick={() => { if (activeHandle?.getChart()?.redoDrawing()) { activeHandle.refresh(); markLiveDirty(); } }}>Redo</button>
          <button type="button" onClick={() => setScriptOpen((open) => !open)} disabled={replayActive}>KlineScript</button>
        </div>
      </div>
    </section>
    <section className={styles.comparisonPanel} aria-label="Asset comparison"><div className={styles.panelHeading}><div><h2>Asset comparison</h2><small>Normalized display values; raw market prices remain unchanged.</small></div><button type="button" aria-label="Comparison mode" aria-pressed={comparisonSettings.active} onClick={toggleComparison}>{comparisonSettings.active ? "Exit comparison" : "Compare assets"}</button></div>{comparisonSettings.active ? <><div className={styles.comparisonControls}><label>Data source<select aria-label="Comparison data source" value={comparisonSettings.dataSource ?? "demo"} disabled={replayActive} onChange={(event) => setComparisonDataSource(event.target.value as StudioComparisonSource)}><option value="demo">Demo fixtures · offline</option><option value="binance">Binance public · optional</option></select></label><label>Normalization<select aria-label="Comparison normalization" value={comparisonSettings.mode} disabled={replayActive} onChange={(event) => setComparisonMode(event.target.value as ComparisonNormalizationMode)}><option value="percentage">Percentage change</option><option value="indexed">Indexed · base 100</option></select></label><label>Baseline<select aria-label="Comparison baseline" disabled={replayActive} value={String(comparisonSettings.baselineTime ?? "")} onChange={(event) => setComparisonBaseline(Number(event.target.value))}>{(comparisonSettings.dataSource ?? "demo") === "binance" ? <option value={String(comparisonSettings.baselineTime ?? "")}>Provider window start</option> : comparisonBaselineOptions.map((candle) => <option key={candle.time} value={String(candle.time)}>{new Date(candle.time).toISOString().slice(0, 16).replace("T", " ")} UTC</option>)}</select></label></div><fieldset className={styles.comparisonAssets}><legend>Assets</legend>{symbols.map((symbol) => <label key={symbol} className={styles.check}><input aria-label={`Compare ${symbol}`} type="checkbox" checked={comparisonSettings.assetIds.includes(symbol)} disabled={symbol === activePanel.symbol || replayActive} onChange={() => toggleComparisonAsset(symbol)} />{symbol}{symbol === activePanel.symbol ? " · primary" : ""}</label>)}</fieldset><div className={styles.comparisonStatus} data-comparison-feed-status={comparisonFeedState?.status ?? "idle"} data-comparison-visible-latest={comparisonVisibleLatest === null ? "" : String(comparisonVisibleLatest)} data-comparison-replay-cutoff={comparisonFeedState?.replayCutoff === null || comparisonFeedState === null ? "" : String(comparisonFeedState.replayCutoff)}><small>Historical data: {comparisonFeedState?.status ?? "idle"} · {comparisonFeedState?.assets.filter((asset) => asset.state === "ready").length ?? 0}/{comparisonSettings.assetIds.length} assets ready</small><small>Source: {(comparisonSettings.dataSource ?? "demo") === "demo" ? "deterministic demo; not live market data" : "optional public provider; freshness is not guaranteed"}</small>{comparisonFeedState?.assets.map((asset) => { const latest = latestComparisonTime(comparisonLines, asset.id, asset.coverage.observedTo, replayActive); return <small key={asset.id}>{asset.id}: {asset.state}/{asset.realtime} · coverage {asset.coverage.completeness} · recovery {asset.recovery.state} · latest {latest === null ? "—" : new Date(latest).toISOString()}{asset.error === null ? "" : ` · ${asset.error}`}</small>; })}<div><button type="button" onClick={recoverComparison} disabled={replayActive || comparisonFeedState?.status === "loading"}>Recover missing history</button>{(comparisonSettings.dataSource ?? "demo") === "demo" ? <><button type="button" onClick={simulateComparisonGap} disabled={replayActive || comparisonFeedState?.status === "loading"}>Simulate missing history</button><button type="button" onClick={simulateComparisonCorrection} disabled={replayActive}>Simulate realtime correction</button><button type="button" onClick={advanceComparisonStream} disabled={replayActive}>Advance demo stream</button><button type="button" onClick={disconnectComparisonStream} disabled={replayActive}>Simulate disconnect</button><button type="button" onClick={reconnectComparisonStream} disabled={replayActive}>Reconnect and recover</button></> : null}</div></div><ul className={styles.comparisonLegend} aria-label="Comparison legend">{comparisonLines.map((line) => <li key={line.id}><span aria-hidden="true" style={{ backgroundColor: line.color ?? "#60a5fa" }} />{line.label}<strong>{formatComparisonValue(crosshair?.series.find((item) => item.id === comparisonSeriesId(line.id)) === undefined ? null : comparisonPointValue(crosshair?.series.find((item) => item.id === comparisonSeriesId(line.id))?.value ?? null), comparisonSettings.mode)}</strong></li>)}</ul><small>Baseline uses the latest observation at or before the selected UTC time, within {comparisonSettings.baselineMaxAgeMs / 3_600_000}h. No future bar is used; recovery never fabricates candles.</small></> : <p>Compare BTC-USD, ETH-USD, and AAPL using deterministic offline fixtures or explicitly selected optional public provider data.</p>}</section>
    <section className={styles.replayBar} aria-label="Chart replay controls"><label>Replay speed<select aria-label="Replay speed" value={activeSnapshot.replayStatus.speed} disabled={!replayActive} onChange={(event) => activeHandle?.replayCommand((replay) => replay.setSpeed(Number(event.target.value)))}>{[0.5, 1, 2, 5, 10].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}</select></label><label className={styles.check}><input aria-label="Snap drawings to visible OHLC" type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />Snap drawings to visible OHLC</label></section>
    {scriptOpen ? <KlineScriptStudioEditor
      source={scriptSource}
      disabled={replayActive}
      activePanelId={activePanel.panelId}
      appliedScripts={appliedScriptIndicators}
      onSourceChange={(next) => { setScriptSource(next); scriptGenerationRef.current += 1; }}
      onAdd={addScript}
      onRemoveApplied={(instanceId) => removeAppliedIndicator(instanceId, activePanel.panelId)}
      onClose={() => setScriptOpen(false)}
    /> : null}
        <section className={styles.indicatorExplorerPanel} aria-label="Technical analysis explorer" data-indicator-explorer="true" data-indicator-explorer-panel={activePanel.panelId}>
      <div className={styles.panelHeading}>
        <h2>Indicator Explorer</h2>
        <span>{filteredIndicatorCatalog.length} of {indicatorCatalog.length} definitions · active {activePanel.panelId}</span>
      </div>
      <div className={styles.indicatorExplorerFilters}>
        <label>Search<input aria-label="Search technical studies" placeholder="Search by name, id, or description" value={indicatorSearch} onChange={(event) => setIndicatorSearch(event.target.value)} /></label>
        <label>Category<select aria-label="Category filter" value={indicatorCategory} onChange={(event) => setIndicatorCategory(event.target.value)}>{indicatorCategories.map((category) => <option key={category} value={category}>{category === "all" ? "All categories" : category}</option>)}</select></label>
        <label className={styles.check}><input aria-label="Favorites only" type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} />Favorites only</label>
      </div>
      <div className={styles.indicatorExplorerItems} role="listbox" aria-label="Technical study catalog">
        {filteredIndicatorCatalog.length === 0 ? <p className={styles.indicatorExplorerEmpty} role="status">No indicators match the current search.</p> : filteredIndicatorCatalog.map((item) => (
          <button type="button" role="option" key={item.id} data-indicator-id={item.id} aria-selected={indicatorToAdd === item.id} aria-pressed={indicatorToAdd === item.id} onClick={() => setIndicatorToAdd(item.id)} onDoubleClick={() => addIndicator(item.id, activePanel.panelId)}>
            {favoriteIndicatorIds.includes(item.id) ? "★" : "☆"} {item.name}<small>{item.category}{item.overlay ? " · overlay" : " · pane"}</small>
          </button>
        ))}
      </div>
      <div className={styles.indicatorParameters} data-indicator-selected={selectedIndicatorEntry.id}>
        <div className={styles.indicatorExplorerDetail}>
          <strong>{selectedIndicatorEntry.name}</strong>
          <p>{selectedIndicatorEntry.description}</p>
          <small>{selectedIndicatorEntry.id} · {selectedIndicatorEntry.category} · {selectedIndicatorEntry.overlay ? "main pane overlay" : "separate pane"}</small>
        </div>
        {selectedIndicatorMetadata.parameters.some((parameter) => parameter.name === "period") ? <label>Period<input aria-label="Period override" type="number" min="1" value={indicatorPeriodOverride} placeholder="definition default" disabled={replayActive} onChange={(event) => setIndicatorPeriodOverride(event.target.value)} /></label> : null}
        {selectedIndicatorMetadata.parameters.some((parameter) => parameter.name === "constant") ? <label>CCI constant<input aria-label="CCI constant" type="number" min="0" step="0.001" value={indicatorConstant} disabled={replayActive} onChange={(event) => setIndicatorConstant(event.target.value)} /></label> : null}
        {selectedIndicatorMetadata.parameters.some((parameter) => parameter.name === "multiplier") ? <label>Channel multiplier<input aria-label="Channel multiplier" type="number" min="0" step="0.1" value={indicatorMultiplier} disabled={replayActive} onChange={(event) => setIndicatorMultiplier(event.target.value)} /></label> : null}
        <button type="button" aria-label={`Add ${selectedIndicatorEntry.name} to ${activePanel.panelId}`} data-indicator-add="" disabled={replayActive} onClick={() => addIndicator(selectedIndicatorEntry.id, activePanel.panelId)}>Add to {activePanel.panelId}</button>
        <button type="button" aria-label={`${favoriteIndicatorIds.includes(indicatorToAdd) ? "Remove" : "Add"} ${indicatorToAdd} favorite`} onClick={() => setFavoriteIndicatorIds((current) => current.includes(indicatorToAdd) ? current.filter((id) => id !== indicatorToAdd) : [...current, indicatorToAdd])}>{favoriteIndicatorIds.includes(indicatorToAdd) ? "Unfavorite" : "Favorite"}</button>
      </div>
      <div className={styles.indicatorApplied} aria-label="My Scripts catalog" data-my-scripts-count={myScriptsCatalog.length}>
        <div className={styles.panelHeading}>
          <h3>My Scripts</h3>
          <span>{myScriptsCatalog.length} · KlineScript · not built-in registry</span>
        </div>
        <label>Search scripts<input aria-label="Search My Scripts catalog" placeholder="Template or saved script" value={scriptLibrarySearch} onChange={(event) => setScriptLibrarySearch(event.target.value)} /></label>
        <div className={styles.indicatorExplorerItems} role="listbox" aria-label="My Scripts">
          {myScriptsCatalog.length === 0 ? <p className={styles.indicatorExplorerEmpty} role="status">No scripts match the current search.</p> : myScriptsCatalog.map((item) => (
            <button type="button" role="option" key={item.id} data-user-script-id={item.id} onClick={() => { setScriptSource(item.source); scriptGenerationRef.current += 1; setScriptOpen(true); }}>
              {item.name}<small>KlineScript · open editor</small>
            </button>
          ))}
        </div>
        <div className={styles.indicatorParameters}>
          <button type="button" disabled={replayActive} onClick={() => setScriptOpen(true)}>Open KlineScript editor</button>
          <button type="button" aria-label={`Apply selected script template to ${activePanel.panelId}`} disabled={replayActive || myScriptsCatalog[0] === undefined} onClick={() => { const first = myScriptsCatalog[0]; if (first !== undefined) void applyCatalogScript(first.source, activePanel.panelId); }}>Apply first listed script to {activePanel.panelId}</button>
        </div>
      </div>
      <div className={styles.indicatorApplied} aria-label={`Applied studies on ${activePanel.panelId}`} data-applied-indicator-count={appliedIndicators.length} data-applied-script-count={appliedScriptIndicators.length} data-applied-builtin-count={appliedBuiltInIndicators.length}>
        <div className={styles.panelHeading}><h3>Applied on {activePanel.panelId}</h3><span>{appliedIndicators.length} · {appliedScriptIndicators.length} scripts</span></div>
        {appliedIndicators.length === 0 ? <p role="status">No indicators on this panel yet.</p> : <ul>{appliedIndicators.map((indicator) => (
          <li key={indicator.id} data-applied-indicator-id={indicator.id} data-applied-indicator-type={indicator.indicatorId} data-applied-indicator-pane={indicator.paneId} data-applied-indicator-kind={indicator.script === undefined ? "built-in" : "klinescript"}>
            <button type="button" className={styles.objectName} aria-pressed={selectedAppliedIndicatorId === indicator.id} aria-label={`Select applied ${indicator.indicatorId} ${indicator.id}`} onClick={() => { setSelectedAppliedIndicatorId(indicator.id); if (indicator.script === undefined) setIndicatorToAdd(indicator.indicatorId); else { setScriptSource(indicator.script.source); setScriptOpen(true); } }}>{indicator.indicatorId}<small>{indicator.id} · {indicator.paneId}{indicator.script === undefined ? "" : " · KlineScript"}</small></button>
            <button type="button" aria-label={`Apply explorer parameters to ${indicator.id}`} disabled={replayActive || selectedAppliedIndicatorId !== indicator.id || indicator.script !== undefined} onClick={() => applyExplorerParametersToSelected(indicator.id, activePanel.panelId)}>Apply params</button>
            <button type="button" aria-label={`Remove ${indicator.id}`} disabled={replayActive} onClick={() => removeAppliedIndicator(indicator.id, activePanel.panelId)}>×</button>
          </li>
        ))}</ul>}
        {selectedAppliedIndicator === null ? null : <small>Selected instance {selectedAppliedIndicator.id} on {activePanel.panelId}. {selectedAppliedIndicator.script === undefined ? "Parameter overrides apply only after Add or Apply params." : "KlineScript instances use the editor to recompile and reapply."}</small>}
      </div>
    </section>
<section className={styles.workspace}>
      <aside className={styles.objectTree} aria-label="Object tree" data-object-tree-ready={activeHandle === null ? "false" : "true"} data-object-tree-panel-id={activePanel.panelId}><h2>Objects</h2><p className={styles.objectTreePanel}>Active panel · {activePanel.panelId}</p><details open><summary>Series ({activeSnapshot.series.length})</summary><ul>{activeSnapshot.series.map((series) => <li key={series.id}><button type="button" className={styles.objectName} onClick={() => { activeHandle?.getChart()?.setSeriesStyle(series.id, { visible: series.style.visible === false }); activeHandle?.refresh(); }} aria-label={`${series.style.visible === false ? "Show" : "Hide"} ${series.id}`}>{series.style.visible === false ? "○" : "●"} {series.title ?? series.id}</button><small>{series.paneId}</small></li>)}</ul></details><details open><summary>Drawings ({activeSnapshot.drawings.length})</summary><ul>{activeSnapshot.drawings.map((drawing) => <li key={drawing.id} data-drawing-id={drawing.id} data-drawing-selected={drawing.id === activeSnapshot.selectedDrawingId ? "true" : "false"} data-drawing-visible={drawing.style.visible === false ? "false" : "true"} data-drawing-locked={drawing.style.locked === true ? "true" : "false"}><button type="button" className={styles.objectName} aria-current={drawing.id === activeSnapshot.selectedDrawingId ? "true" : undefined} onClick={() => activeHandle?.getChart()?.selectDrawing(drawing.id)} aria-label={`Select ${drawing.id}`}>{drawing.type}</button><button type="button" aria-label={`${drawing.style.visible === false ? "Show" : "Hide"} ${drawing.id}`} onClick={() => { const chart = activeHandle?.getChart(); if (chart === null || chart === undefined) return; chart.setDrawingVisibility(drawing.id, drawing.style.visible === false); activeHandle?.refresh(); markLiveDirty(); }}>{drawing.style.visible === false ? "○" : "●"}</button><button type="button" aria-label={`${drawing.style.locked === true ? "Unlock" : "Lock"} ${drawing.id}`} onClick={() => { const chart = activeHandle?.getChart(); if (chart === null || chart === undefined) return; chart.setDrawingLocked(drawing.id, drawing.style.locked !== true); activeHandle?.refresh(); markLiveDirty(); }}>{drawing.style.locked === true ? "🔒" : "🔓"}</button></li>)}</ul></details><section className={styles.drawingProperties} aria-label="Drawing properties" data-drawing-properties-ready={selectedDrawing === null ? "false" : "true"} data-selected-drawing-id={selectedDrawing?.id ?? ""} data-drawing-owner-panel={activePanel.panelId}><h3>Drawing properties</h3>{selectedDrawing === null ? <p>Select a drawing on {activePanel.panelId} in the Object Tree or on that chart to edit color, width, visibility, and lock. Drawings stay panel-local; chart sync does not share drawing objects.</p> : <><p><strong>{selectedDrawing.type}</strong> · {selectedDrawing.id}<small> · {activePanel.panelId}</small></p><label>Color<input aria-label="Drawing color" type="color" value={toStudioColorInput(selectedDrawing.style.color)} disabled={replayActive} onChange={(event) => applyDrawingStyle(activePanel.panelId, selectedDrawing.id, { color: event.target.value })} /></label><label>Width<input aria-label="Drawing line width" type="number" min={1} max={8} value={selectedDrawing.style.lineWidth ?? 2} disabled={replayActive} onChange={(event) => { const width = Number(event.target.value); if (!Number.isFinite(width) || width < 1 || width > 8) return; applyDrawingStyle(activePanel.panelId, selectedDrawing.id, { lineWidth: Math.round(width) }); }} /></label><label className={styles.check}><input aria-label="Drawing visible" type="checkbox" checked={selectedDrawing.style.visible !== false} disabled={replayActive} onChange={(event) => applyDrawingStyle(activePanel.panelId, selectedDrawing.id, { visible: event.target.checked })} />Visible</label><label className={styles.check}><input aria-label="Drawing locked" type="checkbox" checked={selectedDrawing.style.locked === true} disabled={replayActive} onChange={(event) => applyDrawingStyle(activePanel.panelId, selectedDrawing.id, { locked: event.target.checked })} />Locked</label><button type="button" aria-label={`Clear selection for ${selectedDrawing.id}`} disabled={replayActive} onClick={() => clearActiveDrawingSelection(activePanel.panelId)}>Clear selection</button></>}</section></aside>
      <div className={styles.watchlistActions} aria-label="Watchlist actions"><strong>Manage symbols</strong>{selectedList === undefined ? null : <div className={styles.watchlistListActions}><button type="button" aria-label="Rename watchlist" onClick={(event) => showPrompt("Rename watchlist", "Choose a name for this watchlist.", selectedList.name, (name) => { watchlistModel.rename(selectedList.id, name); }, event.currentTarget)}>Rename</button><button type="button" aria-label="Delete watchlist" onClick={(event) => showConfirm(`Delete watchlist “${selectedList.name}”?`, "The list and its symbols will be removed from this browser.", () => watchlistModel.delete(selectedList.id), event.currentTarget)}>Delete</button></div>}{selectedList?.symbols.map((symbol, index) => <div key={symbol.id}><span>{symbol.displaySymbol}</span><button type="button" aria-label={`${symbol.favorite ? "Unfavorite" : "Favorite"} ${symbol.displaySymbol}`} onClick={() => watchlistModel.setFavorite(selectedList.id, symbol.id, !symbol.favorite)}>{symbol.favorite ? "★" : "☆"}</button><button type="button" aria-label={`Move ${symbol.displaySymbol} up`} disabled={index === 0} onClick={() => watchlistModel.reorderSymbol(selectedList.id, symbol.id, index - 1)}>↑</button><button type="button" aria-label={`Move ${symbol.displaySymbol} down`} disabled={index === selectedList.symbols.length - 1} onClick={() => watchlistModel.reorderSymbol(selectedList.id, symbol.id, index + 1)}>↓</button></div>)}</div>
      <aside className={`${styles.sidebar} ${styles.watchlistSidebar}`} aria-label="Watchlists"><div className={styles.panelHeading}><h2>Watchlists</h2><button type="button" onClick={createWatchlist}>New</button></div><label>List<select aria-label="Watchlist" value={watchlists.selectedWatchlistId ?? ""} onChange={(event) => watchlistModel.select(event.target.value)}>{watchlists.lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label><input aria-label="Search watchlist" placeholder="Search symbols" value={watchlistSearch} onChange={(event) => setWatchlistSearch(event.target.value)} /><button type="button" onClick={addWatchlistSymbol}>Add sample symbol</button><ul className={styles.watchlistRows}>{filteredSymbols.map((symbol) => { const quote = quotes[symbol.id]; return <li key={symbol.id} className={symbol.displaySymbol === activePanel.symbol ? styles.watchlistActive : ""}><button type="button" onClick={() => selectedSymbol(symbol.id)}>{symbol.favorite ? "★" : "☆"} {symbol.displaySymbol}<small>{symbol.name}</small></button><span className={quote?.status === "ready" ? "" : styles.quoteStale}>{quote?.last?.toFixed(2) ?? "—"}<small>{quote === undefined ? "Loading" : quote.demo ? "Demo" : quote.status}</small></span><button type="button" aria-label={`Remove ${symbol.displaySymbol}`} onClick={() => watchlistModel.removeSymbol(selectedList!.id, symbol.id)}>×</button></li>; })}</ul><small>Quotes are deterministic demo data, not exchange prices.</small></aside>
      <section className={styles.multiChartArea} aria-label="OpenKline multi-chart workspace"><div className={`${styles.multiChartGrid} ${styles[`layout-${layout}`]}`}>{panels.map((panel) => <ChartPanel key={panel.panelId} ref={(handle) => { if (handle === null) panelRefs.current.delete(panel.panelId); else panelRefs.current.set(panel.panelId, handle); }} panel={panel} active={panel.panelId === activePanelId} initialWorkspace={initialWorkspaceFor(panel.panelId)} onActivate={setActivePanelId} onReady={onChartReady} onSnapshot={onSnapshot} onCrosshair={onCrosshair} onViewport={onViewport} onNotice={setNotice} onDrawingCommitted={onDrawingCommitted} comparison={panel.panelId === activePanelId ? comparisonPanel : null} />)}</div><div className={styles.status} aria-live="polite" data-workspace-restore-name={restoreSummary?.name ?? ""} data-workspace-restore-panels={restoreSummary?.panelCount ?? ""} data-workspace-restore-panel-ids={(restoreSummary?.panelIds ?? []).join(",")}><span>{textForCrosshair(crosshair)}</span><span>{notice}</span></div></section>
      <aside className={styles.sidebar} aria-label="Active chart settings"><div className={styles.panelHeading}><h2>Active chart</h2><button type="button" disabled={panels.length <= 1} onClick={() => removePanel(activePanel.panelId)}>Remove chart</button></div><p className={styles.activeChartBadge}>{activePanel.panelId} · {activePanel.symbol} · {activePanel.timeframe}</p><details open><summary>Synchronization</summary><label className={styles.check}><input aria-label="Sync crosshair" type="checkbox" checked={sync.crosshair} onChange={(event) => { setSync((current) => ({ ...current, crosshair: event.target.checked })); markLiveDirty(); }} />Crosshair</label><label className={styles.check}><input aria-label="Sync visible range" type="checkbox" checked={sync.visibleRange} onChange={(event) => { setSync((current) => ({ ...current, visibleRange: event.target.checked })); markLiveDirty(); }} />Visible range</label><label className={styles.check}><input aria-label="Sync symbols" type="checkbox" checked={sync.symbol} onChange={(event) => { setSync((current) => ({ ...current, symbol: event.target.checked })); markLiveDirty(); }} />Symbols</label><label className={styles.check}><input aria-label="Sync timeframes" type="checkbox" checked={sync.timeframe} onChange={(event) => { setSync((current) => ({ ...current, timeframe: event.target.checked })); markLiveDirty(); }} />Timeframes</label><small>Replay sessions remain independent.</small></details><details open><summary>Indicators ({activeSnapshot.indicators.length})</summary><div className={styles.addRow}><select aria-label="Indicator" value={indicatorToAdd} disabled={replayActive} onChange={(event) => setIndicatorToAdd(event.target.value)}>{indicatorChoices.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="button" disabled={replayActive} onClick={() => addIndicator()}>Add</button></div><ul>{activeSnapshot.indicators.map((indicator) => <li key={indicator.id}><span>{indicator.indicatorId} <small>{indicator.paneId}</small></span><button type="button" disabled={replayActive} aria-label={`Remove ${indicator.id}`} onClick={() => removeAppliedIndicator(indicator.id)}>×</button></li>)}</ul></details><details open data-alert-input-value={alertNameInputRef.current?.value ?? alertName} data-alert-last-created-name={lastAlertDiagnostic?.createdName ?? ""} data-alert-last-outcome={lastAlertDiagnostic?.outcome ?? ""}><summary>Alerts ({activeSnapshot.alerts.length})</summary><div className={styles.alertForm}><label>Name<input ref={alertNameInputRef} aria-label="Alert name" defaultValue={alertName} disabled={replayActive} onInput={(event) => setAlertName(event.currentTarget.value)} onChange={(event) => setAlertName(event.target.value)} /></label><label>Close crosses above<input aria-label="Alert threshold" type="number" value={alertThreshold} disabled={replayActive} onChange={(event) => setAlertThreshold(Number(event.target.value))} /></label><label>Frequency<select aria-label="Alert frequency" value={alertFrequency} disabled={replayActive} onChange={(event) => setAlertFrequency(event.target.value as AlertFrequency)}><option value="once">Once</option><option value="every-event">Every event</option><option value="once-per-bar">Once per bar</option><option value="once-per-confirmed-bar">Confirmed bars</option></select></label><button type="button" disabled={replayActive} onClick={addAlert}>Create alert</button></div>{activeSnapshot.alerts.map((alert) => <div className={styles.alertItem} key={alert.id}><span>{alert.name}</span><button type="button" disabled={replayActive} onClick={() => { activeHandle?.getChart()?.updateAlert(alert.id, { enabled: alert.enabled === false }); activeHandle?.refresh(); }}>{alert.enabled === false ? "Enable" : "Pause"}</button><button type="button" aria-label={`Remove ${alert.name}`} disabled={replayActive} onClick={() => { activeHandle?.getChart()?.removeAlert(alert.id); activeHandle?.refresh(); }}>×</button></div>)}</details><details open><summary>Replay: {activeSnapshot.replayStatus.state}</summary><small>{textForReplay(activeSnapshot.replayStatus, timeZone)} · {activeSnapshot.replayStatus.currentIndex === null ? "No bars" : `${activeSnapshot.replayStatus.currentIndex + 1} / ${activeSnapshot.replayStatus.totalBars}`}</small><div className={styles.replayControls}><button type="button" onClick={() => activeHandle?.enterReplay()} disabled={replayActive}>Enter replay</button><button type="button" aria-label="Replay previous bar" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.stepBackward())}>◀</button><button type="button" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => activeSnapshot.replayStatus.state === "playing" ? replay.pause() : replay.play())}>{activeSnapshot.replayStatus.state === "playing" ? "Pause" : "Play"}</button><button type="button" aria-label="Replay next bar" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.stepForward())}>▶</button><button type="button" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.jumpToStart())}>Beginning</button><button type="button" disabled={!replayActive} onClick={() => activeHandle?.replayCommand((replay) => replay.jumpToLatest())}>Latest</button><button type="button" onClick={() => activeHandle?.exitReplay()} disabled={!replayActive}>Exit replay</button></div><label>Replay position<input aria-label="Replay position" type="range" min="0" max={Math.max(0, activeSnapshot.replayStatus.totalBars - 1)} value={activeSnapshot.replayStatus.currentIndex ?? 0} disabled={!replayActive} onChange={(event) => activeHandle?.replayCommand((replay) => replay.seekToBar(Number(event.target.value)))} /></label></details><details open><summary>Display</summary><label>Theme<select aria-label="Theme" value={theme} onChange={(event) => { const next = event.target.value as "dark" | "light"; activeHandle?.getChart()?.setOptions({ theme: next }); setTheme(next); markLiveDirty(); }}><option value="dark">Dark</option><option value="light">Light</option></select></label><label>Price scale<select aria-label="Price scale" value={scaleMode} onChange={(event) => { const next = event.target.value as PriceScaleMode; activeHandle?.getChart()?.setPriceScaleOptions({ mode: next }); setScaleMode(next); markLiveDirty(); }}>{scaleModes.map(([mode, label]) => <option key={mode} value={mode}>{label}</option>)}</select></label><label className={styles.check}><input aria-label="Auto scale" type="checkbox" checked={autoScale} onChange={(event) => { const next = event.target.checked; if (next) activeHandle?.getChart()?.resetPriceScale(); else activeHandle?.getChart()?.setPriceScaleOptions({ autoScale: false }); setAutoScale(next); }} />Auto scale</label><label className={styles.check}><input aria-label="Show price axis" type="checkbox" checked={axisVisible} onChange={(event) => { activeHandle?.getChart()?.setPriceScaleOptions({ axisVisible: event.target.checked }); setAxisVisible(event.target.checked); }} />Show price axis</label><label>Top margin<input aria-label="Top scale margin" type="number" step="0.01" value={marginTop} onChange={(event) => { const value = Number(event.target.value); activeHandle?.getChart()?.setPriceScaleOptions({ marginTop: value }); setMarginTop(value); }} /></label><label>Bottom margin<input aria-label="Bottom scale margin" type="number" step="0.01" value={marginBottom} onChange={(event) => { const value = Number(event.target.value); activeHandle?.getChart()?.setPriceScaleOptions({ marginBottom: value }); setMarginBottom(value); }} /></label></details><details><summary>Interaction</summary>{(Object.keys(interaction) as Array<keyof typeof interaction>).map((name) => <label key={name} className={styles.check}><input type="checkbox" checked={interaction[name]} onChange={() => { const next = { ...interaction, [name]: !interaction[name] }; activeHandle?.getChart()?.setOptions({ interaction: next }); setInteraction(next); }} />{name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}</label>)}</details></aside>
    </section>
    <ScreenerPanel watchlists={watchlists} onOpenChart={openScreenerChart} onFavorite={favoriteScreenerSymbol} onSelectWatchlist={(id) => { try { watchlistModel.select(id); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); } }} onNotice={setNotice} />
    <StrategyOptimizer key={`optimizer-${strategyScopeKey}`} panelId={activePanel.panelId} symbol={activePanel.symbol} timeframe={activePanel.timeframe} chart={activeHandle?.getChart() ?? null} onApplyParameters={applyStrategyParameters} onNotice={setNotice} />
    <StrategyTester key={strategyScopeKey} panelId={activePanel.panelId} symbol={activePanel.symbol} timeframe={activePanel.timeframe} chart={activeHandle?.getChart() ?? null} initialResult={strategyResultsRef.current.get(strategyScopeKey) ?? null} appliedParameters={appliedStrategyParametersRef.current.get(strategyScopeKey) ?? null} onResult={(nextResult) => { if (nextResult === null) strategyResultsRef.current.delete(strategyScopeKey); else strategyResultsRef.current.set(strategyScopeKey, nextResult); }} onNotice={setNotice} />
    <PaperTradingPanel key={`paper-${activePanel.panelId}`} panelId={activePanel.panelId} symbol={activePanel.symbol} timeframe={activePanel.timeframe} chart={activeHandle?.getChart() ?? null} onNotice={setNotice} />
    <CorporateActionsPanel chart={activeHandle?.getChart() ?? null} symbol={activePanel.symbol} timeframe={activePanel.timeframe} replayActive={replayActive} onNotice={setNotice} />
    <PortfolioBacktestingPanel initialConfiguration={portfolioConfiguration} onConfigurationChange={setPortfolioConfiguration} onNotice={setNotice} />
    <MarketReplayLab />
    {dialog === null ? null : <div className={styles.dialogBackdrop} role="presentation" data-studio-dialog-open="true" data-studio-dialog-kind={dialog.kind}><section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="studio-dialog-title" aria-describedby={dialogError === null ? "studio-dialog-message" : "studio-dialog-message studio-dialog-error"} data-studio-dialog-title={dialog.title}><h2 id="studio-dialog-title">{dialog.title}</h2><p id="studio-dialog-message">{dialog.message}</p>{dialog.kind === "prompt" ? <label>Value<input autoFocus aria-label="Dialog value" aria-invalid={dialogError !== null ? "true" : undefined} value={dialogValue} onChange={(event) => { setDialogValue(event.target.value); if (dialogError !== null) setDialogError(null); }} onKeyDown={(event) => { if (event.key === "Enter") dialog.onSubmit(dialogValue); }} /></label> : null}{dialogError === null ? null : <p id="studio-dialog-error" className={styles.strategyError} role="alert">{dialogError}</p>}<div className={styles.dialogActions}>{dialog.kind === "navigate" ? <><button type="button" data-studio-navigate-action="cancel" onClick={() => { clearPendingNavigation(); setDialog(null); setDialogError(null); }}>Cancel</button><button type="button" data-studio-navigate-action="discard" onClick={() => dialog.onDiscardContinue?.()}>Discard Changes and Continue</button><button type="button" data-studio-navigate-action="save" onClick={() => dialog.onSaveContinue?.()}>Save and Continue</button></> : <><button type="button" onClick={() => { clearPendingNavigation(); setDialog(null); setDialogError(null); }}>Cancel</button><button type="button" autoFocus={dialog.kind === "confirm"} onClick={() => dialog.onSubmit(dialogValue)}>{dialog.kind === "prompt" ? "Apply" : "Confirm"}</button></>}</div></section></div>}
  </main>;
}

function emptyWorkspace(symbol: string, timeframe: string): WorkspaceDocument {
  return { version: 1, metadata: { symbol, timeframe }, chart: { theme: { background: "#0f172a", text: "#e2e8f0", grid: "#24344d", border: "#334155", upCandle: "#34d399", downCandle: "#fb7185", crosshair: "#94a3b8", volumeUp: "#34d399", volumeDown: "#fb7185" }, locale: "en-US", timeZone: "UTC", pricePrecision: 2, direction: "ltr" }, panes: [{ id: "main", height: null, minHeight: 120 }], series: [], indicators: [], drawings: { version: 1, drawings: [] }, viewport: { rangeStart: 0, visibleCount: 1 }, plugins: [] };
}
