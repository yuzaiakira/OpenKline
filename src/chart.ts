import { ChartModel, type VisibleChartData } from "./core/chart-model.js";
import { isCandleSeriesType } from "./core/candle-series.js";
import { normalizePriceScaleOptions, normalizePriceScaleRange, TimeScale } from "./core/scales.js";
import { CanvasRenderer, createPanePriceScale, getPaneBounds, getPaneScaleRange } from "./renderer/canvas-renderer.js";
import { createDefaultIndicatorRegistry } from "./indicators/index.js";
import { DrawingEngine } from "./drawings/engine.js";
import { PluginRegistry } from "./extensions/registry.js";
import { AlertEngine } from "./alerts/engine.js";
import type {
  AlertApi,
  AlertDefinition,
  AlertDefinitionPatch,
  AlertEvaluationMode,
  AlertEvent,
  AlertOutputSnapshot,
} from "./alerts/types.js";
import { ReplayController, type ReplayControllerHost } from "./replay/controller.js";
import type { ReplayApi, ReplayCursor, ReplayOptions, ReplayStatus } from "./replay/types.js";
import { MarketReplayController, type MarketReplayControllerOptions, type MarketReplaySnapshot, type MarketReplayState } from "./replay/market-replay-controller.js";
import { registerInteractiveDrawingCancellation } from "./internal/drawing-cancellation.js";
import type { ExtensionHandle, OpenKlineExtension } from "./extensions/types.js";
import type {
  InstalledPluginMetadata,
  OpenKlinePlugin,
  PluginCommandMetadata,
  PluginHandle,
  PluginOverlayDefinition,
  PluginRenderCommand,
  PluginOverlayRenderItem,
  PluginPaneRenderContext,
  PluginRenderContext,
} from "./extensions/types.js";
import type {
  DrawingApi,
  DrawingCoordinateConverter,
  DrawingDocument,
  DrawingOptions,
  DrawingPoint,
  DrawingSnapshot,
  DrawingSnapMode,
  DrawingStartOptions,
  DrawingStyle,
  DrawingToolDefinition,
} from "./drawings/types.js";
import type { IndicatorDefinition, IndicatorInstance } from "./indicators/types.js";
import type { KlineScriptCompiledProgram } from "./klinescript/compiler.js";
import { compileKlineScript } from "./klinescript/compiler.js";
import { KlineScriptWorkerError, KlineScriptWorkerRuntime, type KlineScriptWorkerTask } from "./klinescript/worker-runtime.js";
import type { KlineScriptExecutionResult } from "./klinescript/runtime.js";
import type { SeriesData } from "./core/series-store.js";
import type { Datafeed, GetBarsQuery } from "./types.js";
import type {
  Candle,
  AreaPoint,
  ChartIndicatorApi,
  ChartEventHandler,
  ChartEventName,
  ChartEvents,
  ChartDirection,
  ChartInteractionOptions,
  ChartOptions,
  ChartSeriesInfo,
  ChartTheme,
  CrosshairMoveEvent,
  IndicatorAddOptions,
  LinePoint,
  PaneApi,
  PaneOptions,
  SeriesApi,
  SeriesOptions,
  SeriesPoint,
  SeriesType,
  PriceScaleConfiguration,
  PriceScaleOptions,
  PriceScaleRange,
  PriceScaleState,
  VolumePoint,
  AsyncScriptIndicatorOptions,
} from "./types.js";
import { parseWorkspace, WorkspaceCompatibilityError, type WorkspaceCorporateActions, type WorkspaceDocument, type WorkspaceMetadata, type WorkspaceOrderFlow, type WorkspaceRestoreOptions, type WorkspaceRestoreResult } from "./workspace.js";
import type { JsonValue } from "./extensions/types.js";
import type { StrategyMarker } from "./backtesting/markers.js";
import type { PaperTradingMarker } from "./paper-trading/markers.js";
import { validatePaperTradingMarkers } from "./paper-trading/markers.js";
import {
  calculateEstimatedVolumeProfile,
  resolveVolumeProfileOptions,
  type AnchoredVwapApi,
  type AnchoredVwapChartOptions,
  type AnchoredVwapPriceSource,
  type EstimatedVolumeProfileResult,
  type ResolvedVolumeProfileOptions,
  type VolumeProfileApi,
  type VolumeProfileOptions,
  type VolumeProfileOptionsPatch,
} from "./volume-analytics.js";
import {
  calculateMultiTimeframeIndicator,
  calculatePreviousTimeframeLevels,
  mapMultiTimeframeIndicatorToSourceTimes,
  mapMultiTimeframeReferenceToSourceTimes,
  type MultiTimeframeAggregationOptions,
  type MultiTimeframeIndicatorApi,
  type MultiTimeframeIndicatorOptions,
  type MultiTimeframeIndicatorResult,
  type MultiTimeframeReferenceApi,
  type MultiTimeframeReferenceOptions,
  type MultiTimeframeReferenceResult,
  type MultiTimeframeReferenceStyle,
} from "./multi-timeframe.js";
import {
  defaultTradingCalendarDisplayOptions,
  isTradingCalendarEngine,
  renderTradingCalendarOverlay,
  resolveTradingCalendarDisplayOptions,
  toWorkspaceTradingCalendar,
  type ResolvedTradingCalendarDisplayOptions,
  type TradingCalendarApi,
  type TradingCalendarDisplayOptions,
} from "./session-visualization.js";
import type { TradingCalendarEngine } from "./trading-calendar.js";
import {
  mapSessionIndicatorToSourceTimes,
  mapSessionReferenceToSourceTimes,
  type SessionIndicatorApi,
  type SessionIndicatorChartOptions,
  type SessionIndicatorResult,
  type SessionReferenceApi,
  type SessionReferenceChartOptions,
  type SessionReferenceResult,
} from "./session-aggregation.js";
import { SessionIndicatorRuntime, SessionReferenceRuntime } from "./session-analytics-runtime.js";
import {
  adjustCorporateActionData,
  normalizeCorporateActionDataset,
  type CorporateActionAdjustmentResult,
  type CorporateActionDataset,
  type CorporateActionDisplayOptions,
  type CorporateActionVolumePolicy,
} from "./corporate-actions.js";
import {
  MarketTradeStore,
  type MarketTrade,
  type MarketTradeDatafeed,
  type MarketTradeDataset,
  type MarketTradeQuery,
} from "./market-trades.js";
import {
  OrderBookController,
  type OrderBookDatafeed,
  type OrderBookDelta,
  type OrderBookQuery,
  type OrderBookSnapshot,
  type OrderBookState,
} from "./order-book.js";
import { OrderBookHeatmapStore, calculateOrderBookDepthMetrics } from "./market-depth.js";
import {
  calculateCumulativeVolumeDelta,
  calculateFootprint,
  calculateTradeFlow,
  getTimeAndSales,
  CumulativeVolumeDeltaCalculator,
  type CvdDisplayOptions,
  type CvdResult,
  type DepthDisplayOptions,
  type FootprintDisplayOptions,
  type FootprintResult,
  type OrderFlowState,
  type TimeAndSalesOptions,
} from "./order-flow.js";

interface ManagedChartIndicator {
  id: string;
  indicatorId: string;
  paneId: string;
  instance: IndicatorInstance;
  outputSeriesIds: string[];
  parameters: Record<string, unknown>;
  outputStyles: Record<string, import("./types.js").SeriesStyle>;
  script?: { readonly programId: string; readonly source: string };
  worker?: ManagedWorkerScript;
}

interface ManagedWorkerScript {
  readonly runtime: KlineScriptWorkerRuntime;
  readonly sessionId: string;
  generation: number;
  initialized: boolean;
  result?: KlineScriptExecutionResult;
  resultGeneration: number;
  disposed: boolean;
  pending: Set<KlineScriptWorkerTask<KlineScriptExecutionResult>>;
  readonly signal?: AbortSignal;
}

interface ManagedVolumeProfile {
  readonly id: string;
  options: ResolvedVolumeProfileOptions;
  cache: { readonly key: string; readonly result: EstimatedVolumeProfileResult } | undefined;
  api?: VolumeProfileApi;
}

interface ManagedTradingCalendar {
  readonly calendar: TradingCalendarEngine;
  display: ResolvedTradingCalendarDisplayOptions;
}

interface ManagedMultiTimeframeIndicator {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  options: MultiTimeframeIndicatorOptions & { readonly id: string };
  outputSeriesIds: string[];
  outputStyles: Record<string, import("./types.js").SeriesStyle>;
  visible: boolean;
  result: MultiTimeframeIndicatorResult;
}

interface ManagedMultiTimeframeReference {
  readonly id: string;
  options: MultiTimeframeReferenceOptions & { readonly id: string };
  visible: boolean;
  result: MultiTimeframeReferenceResult;
}

interface ManagedSessionIndicator {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  options: SessionIndicatorChartOptions & { readonly id: string };
  outputSeriesIds: string[];
  outputStyles: Record<string, import("./types.js").SeriesStyle>;
  visible: boolean;
  result: SessionIndicatorResult;
  runtime: SessionIndicatorRuntime;
}

interface ManagedSessionReference {
  readonly id: string;
  options: SessionReferenceChartOptions & { readonly id: string };
  visible: boolean;
  result: SessionReferenceResult;
  runtime: SessionReferenceRuntime;
}

interface FootprintRenderCache {
  readonly key: string;
  readonly result: FootprintResult | null;
  readonly commands?: readonly PluginRenderCommand[];
  readonly error?: string;
}

export interface ChartMarketReplayOptions extends MarketReplayControllerOptions {
  /** Instrument whose completed candles should be attached to this chart. */
  readonly instrumentId?: string;
}

const DEFAULT_FOOTPRINT_DISPLAY: Required<FootprintDisplayOptions> = {
  visible: false,
  intervalMs: 60_000,
  tickSize: 1,
  offTickPolicy: "reject",
  showLabels: true,
  opacity: 0.55,
  buyColor: "#22c55e",
  sellColor: "#ef4444",
  unknownColor: "#94a3b8",
  maxCells: 20_000,
};

const DEFAULT_CVD_DISPLAY: Required<CvdDisplayOptions> = {
  visible: false,
  intervalMs: 60_000,
  reset: "continuous",
  pane: "new",
  color: "#38bdf8",
  lineWidth: 2,
  baselineColor: "#64748b",
  sourceCoverage: "unknown",
};

const DEFAULT_DEPTH_DISPLAY: Required<DepthDisplayOptions> = {
  visible: false,
  maxLevels: 10,
  showLabels: true,
  showHeatmap: false,
  opacity: 0.5,
  bidColor: "#22c55e",
  askColor: "#ef4444",
  maxHistory: 2_000,
};

const LIGHT_THEME: ChartTheme = {
  background: "#ffffff",
  text: "#52606d",
  grid: "#e6eaf0",
  border: "#d9e0e8",
  upCandle: "#16a34a",
  downCandle: "#dc2626",
  crosshair: "#64748b",
  volumeUp: "#16a34a",
  volumeDown: "#dc2626",
  bandFill: "#2563eb",
  bandFillOpacity: 0.16,
};

const DARK_THEME: ChartTheme = {
  background: "#111827",
  text: "#aab7c4",
  grid: "#263244",
  border: "#334155",
  upCandle: "#22c55e",
  downCandle: "#ef4444",
  crosshair: "#94a3b8",
  volumeUp: "#22c55e",
  volumeDown: "#ef4444",
  bandFill: "#60a5fa",
  bandFillOpacity: 0.2,
};

function syncInteractionSize(canvas: HTMLCanvasElement, currentWidth: number, currentHeight: number, resize: (width: number, height: number) => void): void {
  const bounds = canvas.getBoundingClientRect();
  const width = Math.floor(bounds.width);
  const height = Math.floor(bounds.height);
  if (width <= 0 || height <= 0 || (width === currentWidth && height === currentHeight)) return;
  resize(width, height);
}

export class Chart {
  private readonly canvas: HTMLCanvasElement;
  private readonly model = new ChartModel();
  /** Canonical executable chart input; adjusted views never replace this copy. */
  private rawCandles: Candle[] = [];
  private corporateActionDataset: CorporateActionDataset | null = null;
  private corporateActionMode: NonNullable<CorporateActionDisplayOptions["mode"]> = "raw";
  private corporateActionContext: NonNullable<CorporateActionDisplayOptions["context"]> = "retrospective";
  private corporateActionAsOfTime: number | undefined;
  private corporateActionSourceDurationMs: number | undefined;
  private corporateActionVolumePolicy: CorporateActionVolumePolicy = "equivalent-shares";
  private corporateActionMarkersVisible = true;
  private corporateActionWorkspaceReference: WorkspaceCorporateActions | null = null;
  private marketTradeStore = new MarketTradeStore({ maxTrades: 1_000_000 });
  private marketTradeDatafeedCleanup: (() => void) | null = null;
  private marketTradeAbortController: AbortController | null = null;
  private marketTradeRequestId = 0;
  private orderBookController: OrderBookController | null = null;
  private orderBookDatafeedCleanup: (() => void) | null = null;
  private orderBookAbortController: AbortController | null = null;
  private orderBookRequestId = 0;
  private orderBookHeatmap: OrderBookHeatmapStore | null = null;
  private latestMarketTrade: MarketTrade | null = null;
  private marketTradeSourceReference: NonNullable<WorkspaceOrderFlow["tradeSource"]> | null = null;
  private footprintDisplay: Required<FootprintDisplayOptions> = { ...DEFAULT_FOOTPRINT_DISPLAY };
  private cvdDisplay: Required<CvdDisplayOptions> = { ...DEFAULT_CVD_DISPLAY };
  private depthDisplay: Required<DepthDisplayOptions> = { ...DEFAULT_DEPTH_DISPLAY };
  private orderFlowWorkspaceReference: import("./workspace.js").WorkspaceOrderFlow | null = null;
  private orderFlowRevision = 0;
  private chartDataRevision = 0;
  private footprintRenderCache: FootprintRenderCache | null = null;
  private cvdCalculator: CumulativeVolumeDeltaCalculator | null = null;
  private cvdCalculatorOptionsKey: string | null = null;
  private cvdCalculatorCalendar: TradingCalendarEngine | null = null;
  private cvdSeriesId: string | null = null;
  private cvdPaneId: string | null = null;
  private cvdPaneOwned = false;
  private cvdSeriesLatestBucketStart: number | null = null;
  private cvdSeriesStyleKey: string | null = null;
  private readonly renderer: CanvasRenderer;
  private readonly indicatorRegistry = createDefaultIndicatorRegistry();
  private readonly indicators = new Map<string, ManagedChartIndicator>();
  private readonly anchoredVwaps = new Map<string, AnchoredVwapApi>();
  private nextIndicatorId = 1;
  private readonly volumeProfiles = new Map<string, ManagedVolumeProfile>();
  private nextVolumeProfileId = 1;
  private volumeAnalyticsRevision = 0;
  private readonly multiTimeframeIndicators = new Map<string, ManagedMultiTimeframeIndicator>();
  private readonly multiTimeframeReferences = new Map<string, ManagedMultiTimeframeReference>();
  private nextMultiTimeframeId = 1;
  private readonly sessionIndicators = new Map<string, ManagedSessionIndicator>();
  private readonly sessionReferences = new Map<string, ManagedSessionReference>();
  private nextSessionAnalysisId = 1;
  private tradingCalendar: ManagedTradingCalendar | null = null;
  private readonly drawingEngine = new DrawingEngine();
  private readonly overlays = new Map<string, PluginOverlayDefinition>();
  private strategyMarkers: StrategyMarker[] = [];
  private paperTradingMarkers: PaperTradingMarker[] = [];
  private readonly pluginRegistry: PluginRegistry;
  private readonly alertEngine = new AlertEngine();
  private readonly extensionDisposers = new Set<() => void>();
  private readonly workerRuntimes = new Set<KlineScriptWorkerRuntime>();
  private readonly listeners = new Map<ChartEventName, Set<ChartEventHandler<ChartEventName>>>();
  private readonly resizeObserver: ResizeObserver | null;
  private resizeFrame: number | null = null;
  private viewportRenderFrame: number | null = null;
  private pendingObservedResize: { readonly width: number; readonly height: number } | null = null;
  private theme: ChartTheme;
  private locale: string;
  private timeZone: string;
  private pricePrecision: number;
  private direction: ChartDirection;
  private priceScale: PriceScaleConfiguration;
  private interaction: Required<ChartInteractionOptions>;
  private width: number;
  private height: number;
  private devicePixelRatio = 1;
  private crosshair: { x: number; y: number } | null = null;
  private baseFrame: ImageData | null = null;
  private baseFrameWidth = 0;
  private baseFrameHeight = 0;
  private dragging = false;
  private lastPointerX = 0;
  private selectedDrawingId: string | null = null;
  private pendingDrawing: { type: string; options: DrawingStartOptions; points: DrawingPoint[] } | null = null;
  private pendingAnchoredVwapId: string | null = null;
  private suppressNextPointerDown = false;
  private activeDrawing: { id: string; pointIndex: number | null; time: number; price: number } | null = null;
  private datafeedCleanup: (() => void) | null = null;
  private datafeedRequestId = 0;
  private datafeedSession: { readonly datafeed: Datafeed; readonly query: Omit<GetBarsQuery, "signal"> } | null = null;
  private replayController: ReplayController | null = null;
  private replayBaseWorkspace: WorkspaceDocument | null = null;
  private replayRawSource: Candle[] | null = null;
  private replayCursorIndex: number | null = null;
  private replayRestoring = false;
  private marketReplayController: MarketReplayController | null = null;
  private marketReplayUnsubscribe: (() => void) | null = null;
  private marketReplayBaseCandles: Candle[] | null = null;
  private marketReplayBaseTrades: MarketTrade[] | null = null;
  private marketReplayBaseOrderBook: OrderBookSnapshot | null = null;
  private marketReplayInstrumentId: string | null = null;
  private marketReplayApplying = false;
  private destroyed = false;

  public constructor(private readonly container: HTMLElement, options: ChartOptions = {}) {
    this.theme = resolveTheme(options.theme);
    this.locale = options.locale ?? "en-US";
    this.timeZone = options.timeZone ?? "UTC";
    this.pricePrecision = normalizePricePrecision(options.pricePrecision ?? 2);
    this.direction = options.direction ?? "ltr";
    this.priceScale = normalizePriceScaleOptions(options.priceScale);
    this.interaction = resolveInteraction(options.interaction);
    this.width = options.width ?? container.clientWidth;
    this.height = options.height ?? container.clientHeight;

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Financial price chart");
    this.canvas.tabIndex = 0;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.touchAction = "none";
    this.container.appendChild(this.canvas);
    this.renderer = new CanvasRenderer(this.canvas);
    this.pluginRegistry = new PluginRegistry({
      registerIndicator: (definition) => {
        this.registerIndicator(definition);
        return () => {
          if (this.indicatorRegistry.has(definition.metadata.id)) this.unregisterIndicator(definition.metadata.id);
        };
      },
      registerDrawingTool: (definition) => {
        this.registerDrawingTool(definition);
        return () => this.unregisterDrawingTool(definition.type);
      },
      registerOverlay: (definition) => {
        this.registerOverlay(definition);
        return () => this.unregisterOverlay(definition.id);
      },
      subscribe: (name, handler) => this.subscribe(name, handler),
    });
    this.alertEngine.subscribe((event) => this.emit("alertTriggered", event));
    this.alertEngine.subscribeDiagnostics((diagnostic) => this.emit("alertError", diagnostic));

    this.attachInteractions();
    this.resize(this.width, this.height);

    this.resizeObserver = options.autoSize === false || typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry !== undefined) {
            this.scheduleObservedResize(entry.contentRect.width, entry.contentRect.height);
          }
        });
    this.resizeObserver?.observe(this.container);
    registerInteractiveDrawingCancellation(this, () => {
      if (!this.destroyed) this.cancelDrawing();
    });
    queueMicrotask(() => {
      if (!this.destroyed) this.emit("chartReady", { timestamp: Date.now() });
    });
  }

  public setData(candles: readonly Candle[]): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.replaceRawCandles(candles);
    this.chartDataRevision += 1;
    this.invalidateVolumeAnalytics();
    this.refreshIndicatorsFromInput();
    this.refreshMultiTimeframe();
    this.refreshSessionAnalysisFromInput();
    this.refreshWorkerIndicatorsFromInput();
    this.resetLiveAlerts(candles.at(-1));
    this.emit("dataUpdated", { kind: "set", time: candles.at(-1)?.time ?? null, appendOnly: false });
    this.render();
  }

  public update(candle: Candle): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    const lastTime = this.rawCandles.at(-1)?.time;
    const appendOnly = lastTime === undefined || candle.time > lastTime;
    this.updateRawCandle(candle);
    this.chartDataRevision += 1;
    this.invalidateVolumeAnalytics();
    const adjustedView = this.corporateActionDataset !== null && this.corporateActionMode !== "raw";
    if (adjustedView) {
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();
    } else {
      this.refreshIndicatorsFromUpdate(candle, appendOnly);
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromUpdate(candle);
      this.refreshWorkerIndicatorsFromUpdate(candle);
    }
    const alertCandle = adjustedView ? this.model.allCandles.at(-1) ?? candle : candle;
    this.evaluateLiveAlerts(alertCandle, appendOnly ? "append" : "correction");
    this.emit("dataUpdated", { kind: "update", time: candle.time, appendOnly });
    this.render();
  }

  /** Replace the bounded trade-print source used by Footprint, CVD, and Time & Sales. */
  public setMarketTrades(values: readonly MarketTrade[] | MarketTradeDataset): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.stopMarketTradeSource();
    this.replaceMarketTrades(values);
    this.orderFlowRevision += 1;
    this.refreshOrderFlowPresentation();
    this.render();
  }

  /** Insert or revise one provider-normalized trade print. */
  public updateMarketTrade(value: MarketTrade): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    const update = this.ingestMarketTrade(value);
    if (!update.changed) return;
    this.orderFlowRevision += 1;
    this.refreshOrderFlowPresentation(update.appendOnly);
    this.scheduleViewportRender();
  }

  /** Return defensive trade prints, optionally restricted to an event-time range. */
  public getMarketTrades(options: { readonly from?: number; readonly to?: number; readonly asOfTime?: number; readonly limit?: number } = {}): MarketTrade[] {
    this.assertAlive();
    const trades = this.getOrderFlowTradesForReplay();
    const filtered = options.from === undefined && options.to === undefined
      ? options.asOfTime === undefined
        ? trades
        : trades.filter((trade) => trade.time <= options.asOfTime!)
      : options.from !== undefined && options.to !== undefined
        ? getTimeAndSales(trades, { from: options.from, to: options.to, ...(options.asOfTime === undefined ? {} : { asOfTime: options.asOfTime }), limit: options.limit ?? 10_000 })
        : (() => { throw new Error("Market-trade range requires both from and to"); })();
    return options.limit === undefined || options.from !== undefined
      ? filtered.map((trade) => ({ ...trade, source: { ...trade.source } }))
      : filtered.slice(-options.limit).map((trade) => ({ ...trade, source: { ...trade.source } }));
  }

  /** Return stable event-time ordered Time & Sales records. */
  public getTimeAndSales(options: TimeAndSalesOptions): MarketTrade[] {
    this.assertAlive();
    const trades = this.getOrderFlowTradesForReplay();
    return getTimeAndSales(trades, this.clampOrderFlowAsOf(options));
  }

  /** Load historical trade prints and attach an optional live subscription. */
  public async setMarketTradeSource(datafeed: MarketTradeDatafeed, query: MarketTradeQuery): Promise<void> {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.stopMarketTradeSource();
    const requestId = ++this.marketTradeRequestId;
    const abortController = new AbortController();
    this.marketTradeAbortController = abortController;
    const abortExternal = (): void => abortController.abort();
    query.signal?.addEventListener("abort", abortExternal, { once: true });
    try {
      const result = await datafeed.getTrades({ ...query, signal: abortController.signal });
      if (this.destroyed || requestId !== this.marketTradeRequestId || abortController.signal.aborted) return;
      this.replaceMarketTrades(result);
      this.orderFlowRevision += 1;
      this.refreshOrderFlowPresentation();
      if (datafeed.subscribeTrades !== undefined) {
        this.marketTradeDatafeedCleanup = datafeed.subscribeTrades({
          instrumentId: query.instrumentId,
          ...(query.venueId === undefined ? {} : { venueId: query.venueId }),
          onTrade: (trade) => {
            if (this.destroyed || requestId !== this.marketTradeRequestId || this.isAnyReplayActive()) return;
            const update = this.ingestMarketTrade(trade);
            if (!update.changed) return;
            this.orderFlowRevision += 1;
            this.refreshOrderFlowPresentation(update.appendOnly);
            this.scheduleViewportRender();
          },
          onError: (error) => {
            if (!this.destroyed && requestId === this.marketTradeRequestId) this.emit("datafeedError", error);
          },
        });
      }
      this.render();
    } catch (error) {
      if (this.destroyed || requestId !== this.marketTradeRequestId || abortController.signal.aborted || isAbortError(error)) return;
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.emit("datafeedError", normalized);
      throw normalized;
    } finally {
      query.signal?.removeEventListener("abort", abortExternal);
    }
  }

  /** Replace the current Level-2 snapshot and refresh depth-derived displays. */
  public setOrderBookSnapshot(snapshot: OrderBookSnapshot): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    const current = this.orderBookController?.getState();
    if (current !== undefined && (current.instrumentId !== snapshot.instrumentId || (current.source !== null && (current.source.id !== snapshot.source.id || current.source.version !== snapshot.source.version)))) {
      this.stopOrderBookSource();
      this.orderBookController?.dispose();
      this.orderBookController = null;
      this.orderBookHeatmap?.dispose();
      this.orderBookHeatmap = null;
    }
    this.orderBookController ??= new OrderBookController({ instrumentId: snapshot.instrumentId, ...(snapshot.venueId === undefined ? {} : { venueId: snapshot.venueId }), ...(snapshot.tickSize === undefined ? {} : { defaultTickSize: snapshot.tickSize }), source: snapshot.source });
    this.applyOrderBookSnapshot(snapshot);
  }

  /** Apply one sequenced or unsequenced Level-2 delta. */
  public applyOrderBookDelta(delta: OrderBookDelta): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.orderBookController ??= new OrderBookController({ instrumentId: delta.instrumentId, ...(delta.venueId === undefined ? {} : { venueId: delta.venueId }), source: delta.source });
    this.applyOrderBookDeltaInternal(delta);
  }

  /** Load a Level-2 snapshot/history and subscribe to provider updates. */
  public async setOrderBookSource(datafeed: OrderBookDatafeed, query: OrderBookQuery): Promise<void> {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.stopOrderBookSource();
    this.orderBookController?.dispose();
    this.orderBookController = new OrderBookController({ instrumentId: query.instrumentId, ...(query.venueId === undefined ? {} : { venueId: query.venueId }), ...(query.maxDepth === undefined ? {} : { maxDepth: query.maxDepth }) });
    this.orderBookHeatmap?.dispose();
    this.orderBookHeatmap = new OrderBookHeatmapStore({ maxObservations: this.depthDisplay.maxHistory, maxLevels: this.depthDisplay.maxLevels });
    const requestId = ++this.orderBookRequestId;
    const abortController = new AbortController();
    this.orderBookAbortController = abortController;
    const abortExternal = (): void => abortController.abort();
    query.signal?.addEventListener("abort", abortExternal, { once: true });
    try {
      const result = await datafeed.getOrderBook({ ...query, signal: abortController.signal });
      if (this.destroyed || requestId !== this.orderBookRequestId || abortController.signal.aborted) return;
      if ("snapshot" in result) {
        this.applyOrderBookSnapshot(result.snapshot);
        for (const delta of result.deltas ?? []) this.applyOrderBookDeltaInternal(delta);
      } else {
        this.applyOrderBookSnapshot(result);
      }
      if (datafeed.subscribeOrderBook !== undefined) {
        this.orderBookController.disconnect();
        this.orderBookDatafeedCleanup = datafeed.subscribeOrderBook({
          instrumentId: query.instrumentId,
          ...(query.venueId === undefined ? {} : { venueId: query.venueId }),
          onSnapshot: (snapshot) => {
            if (!this.destroyed && requestId === this.orderBookRequestId && !this.isAnyReplayActive()) this.applyOrderBookSnapshot(snapshot);
          },
          onDelta: (delta) => {
            if (!this.destroyed && requestId === this.orderBookRequestId && !this.isAnyReplayActive()) this.applyOrderBookDeltaInternal(delta);
          },
          onError: (error) => {
            if (!this.destroyed && requestId === this.orderBookRequestId) this.emit("datafeedError", error);
          },
        });
      }
      this.render();
    } catch (error) {
      if (this.destroyed || requestId !== this.orderBookRequestId || abortController.signal.aborted || isAbortError(error)) return;
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.emit("datafeedError", normalized);
      throw normalized;
    } finally {
      query.signal?.removeEventListener("abort", abortExternal);
    }
  }

  public getDepthState(asOfTime?: number): OrderBookState | null {
    this.assertAlive();
    if (this.orderBookController === null) return null;
    const cutoff = this.model.getReplayCutoff();
    if (cutoff === Number.NEGATIVE_INFINITY) return null;
    if (asOfTime !== undefined) return this.orderBookController.getStateAt(cutoff === null ? asOfTime : Math.min(asOfTime, cutoff));
    return cutoff === null ? this.orderBookController.getState(this.depthDisplay.maxLevels) : this.orderBookController.getStateAt(cutoff);
  }

  public getDepthMetrics(): ReturnType<typeof calculateOrderBookDepthMetrics> | null {
    this.assertAlive();
    const state = this.getDepthState();
    return state === null ? null : calculateOrderBookDepthMetrics(state, { topN: this.depthDisplay.maxLevels });
  }

  public setFootprintOptions(options: FootprintDisplayOptions): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.footprintDisplay = normalizeFootprintDisplay({ ...this.footprintDisplay, ...options });
    this.updateOrderFlowWorkspaceReference();
    this.render();
  }

  public getFootprintOptions(): Required<FootprintDisplayOptions> {
    this.assertAlive();
    return { ...this.footprintDisplay };
  }

  public setCvdOptions(options: CvdDisplayOptions): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const previousPane = this.cvdDisplay.pane;
    this.cvdDisplay = normalizeCvdDisplay({ ...this.cvdDisplay, ...options });
    if (previousPane !== this.cvdDisplay.pane && this.cvdSeriesId !== null) this.removeCvdSeries();
    if (this.cvdDisplay.visible) this.ensureCvdSeries();
    else this.removeCvdSeries();
    this.updateOrderFlowWorkspaceReference();
    this.refreshCvdSeries();
    this.render();
  }

  public getCvdOptions(): Required<CvdDisplayOptions> {
    this.assertAlive();
    return { ...this.cvdDisplay };
  }

  public getCvdResult(): CvdResult | null {
    this.assertAlive();
    return this.calculateCvdResult();
  }

  public setDepthOptions(options: DepthDisplayOptions): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.depthDisplay = normalizeDepthDisplay({ ...this.depthDisplay, ...options });
    if (this.orderBookHeatmap !== null) {
      const previous = this.orderBookHeatmap.getAll();
      this.orderBookHeatmap.dispose();
      this.orderBookHeatmap = new OrderBookHeatmapStore({ maxObservations: this.depthDisplay.maxHistory, maxLevels: this.depthDisplay.maxLevels });
      for (const observation of previous) this.orderBookHeatmap.add({ status: observation.status, integrity: observation.integrity, instrumentId: null, venueId: null, source: null, bids: observation.side === "bid" ? observation.levels : [], asks: observation.side === "ask" ? observation.levels : [], tickSize: null, lastEventTime: observation.time, lastSynchronizedTime: observation.time, lastSequence: null, pendingDeltaCount: 0 }, observation.time);
    }
    this.updateOrderFlowWorkspaceReference();
    this.render();
  }

  public getDepthOptions(): Required<DepthDisplayOptions> {
    this.assertAlive();
    return { ...this.depthDisplay };
  }

  public getOrderFlowState(): OrderFlowState {
    this.assertAlive();
    const trades = this.getOrderFlowTradesForReplay();
    const range = this.resolveOrderFlowRange(trades);
    const tradeFlow = range === null ? null : calculateTradeFlow(trades, { ...range, sourceCoverage: this.cvdDisplay.sourceCoverage });
    return {
      tradeCount: trades.length,
      tradeCoverage: tradeFlow?.coverage ?? "empty",
      footprint: range === null ? null : this.calculateFootprintResult(trades, this.getVisibleOrderFlowRange(trades) ?? range),
      cvd: this.calculateCvdResult(),
      depth: this.getDepthState(),
      depthMetrics: this.getDepthMetrics(),
    };
  }

  /** Remove all order-flow data, subscriptions, derived series, and overlays. */
  public removeOrderFlow(): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.stopMarketTradeSource();
    this.stopOrderBookSource();
    this.marketTradeStore.dispose();
    this.marketTradeStore = new MarketTradeStore({ maxTrades: 1_000_000 });
    this.latestMarketTrade = null;
    this.marketTradeSourceReference = null;
    this.resetCvdCalculator();
    this.orderBookController?.dispose();
    this.orderBookController = null;
    this.orderBookHeatmap?.dispose();
    this.orderBookHeatmap = null;
    this.orderFlowWorkspaceReference = null;
    this.removeCvdSeries();
    this.orderFlowRevision += 1;
    this.render();
  }

  /** Add a local, deterministic alert definition and return its management API. */
  public addAlert(definition: AlertDefinition): AlertApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const api = this.alertEngine.add(definition);
    this.seedAlert(api.id);
    return this.wrapAlertApi(api.id);
  }

  public updateAlert(id: string, patch: AlertDefinitionPatch): AlertDefinition {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const definition = this.alertEngine.update(id, patch);
    this.seedAlert(id);
    return definition;
  }

  public removeAlert(id: string): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.alertEngine.remove(id);
  }

  public getAlert(id: string): AlertApi {
    this.assertAlive();
    this.alertEngine.get(id);
    return this.wrapAlertApi(id);
  }

  public getAlerts(): AlertDefinition[] {
    this.assertAlive();
    return this.alertEngine.list();
  }

  public getAlertStatus(id: string, mode: AlertEvaluationMode = "live") {
    this.assertAlive();
    return this.alertEngine.getStatus(id, mode);
  }

  public getAlertHistory(mode?: AlertEvaluationMode): AlertEvent[] {
    this.assertAlive();
    return this.alertEngine.historyFor(mode);
  }

  public clearAlertHistory(mode?: AlertEvaluationMode): void {
    this.assertAlive();
    this.alertEngine.clearHistory(mode);
  }

  public addCandlestickSeries(options: SeriesOptions = {}): SeriesApi<Candle> {
    return this.createSeriesApi("candlestick", options);
  }

  public addOhlcSeries(options: SeriesOptions = {}): SeriesApi<Candle> {
    return this.createSeriesApi("ohlc", options);
  }

  public addHollowCandlestickSeries(options: SeriesOptions = {}): SeriesApi<Candle> {
    return this.createSeriesApi("hollow-candlestick", options);
  }

  /** Add a display-only Heikin-Ashi projection; `getData` remains raw OHLCV. */
  public addHeikinAshiSeries(options: SeriesOptions = {}): SeriesApi<Candle> {
    return this.createSeriesApi("heikin-ashi", options);
  }

  public addLineSeries(options: SeriesOptions = {}): SeriesApi<LinePoint> {
    return this.createSeriesApi("line", options);
  }

  public addAreaSeries(options: SeriesOptions = {}): SeriesApi<AreaPoint> {
    return this.createSeriesApi("area", options);
  }

  public addBaselineSeries(options: SeriesOptions = {}): SeriesApi<LinePoint> {
    return this.createSeriesApi("baseline", options);
  }

  public addVolumeSeries(options: SeriesOptions = {}): SeriesApi<VolumePoint> {
    return this.createSeriesApi("volume", options);
  }

  public addHistogramSeries(options: SeriesOptions = {}): SeriesApi<VolumePoint> {
    return this.createSeriesApi("histogram", options);
  }

  public addPane(options: PaneOptions = {}): PaneApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const id = this.model.addPane(options);
    this.render();
    return {
      id,
      setHeight: (height) => {
        this.assertAlive();
        this.model.setPaneHeight(id, height);
        this.render();
      },
      getHeight: () => {
        this.assertAlive();
        return this.model.getPaneHeight(id);
      },
      remove: () => {
        this.assertAlive();
        this.model.removePane(id);
        this.render();
      },
    };
  }

  public getPaneIds(): string[] {
    this.assertAlive();
    return this.model.getPaneIds();
  }

  /**
   * Returns the primary drawing pane bounds in chart logical pixels.
   * Drawing tools only accept anchors inside this rectangle.
   */
  public getPrimaryDrawingPaneBounds(): {
    readonly id: string;
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly chartWidth: number;
    readonly chartHeight: number;
  } | null {
    this.assertAlive();
    const context = this.getPrimaryScaleContext();
    if (context === null) return null;
    return {
      id: "main",
      left: context.bounds.left,
      right: context.bounds.right,
      top: context.bounds.top,
      bottom: context.bounds.bottom,
      chartWidth: this.width,
      chartHeight: this.height,
    };
  }

  public registerIndicator(definition: IndicatorDefinition): void {
    this.assertAlive();
    this.indicatorRegistry.register(definition);
  }

  public unregisterIndicator(id: string): boolean {
    this.assertAlive();
    return this.indicatorRegistry.unregister(id);
  }

  public installExtension(extension: OpenKlineExtension): ExtensionHandle {
    this.assertAlive();
    let disposed = false;
    const cleanup = extension.activate({
      apiVersion: 1,
      registerIndicator: (definition) => {
        this.registerIndicator(definition);
        return () => {
          if (!disposed) this.unregisterIndicator(definition.metadata.id);
        };
      },
      registerDrawingTool: (definition) => {
        this.registerDrawingTool(definition);
        return () => {
          if (!disposed) this.unregisterDrawingTool(definition.type);
        };
      },
    });
    const dispose = (): void => {
      if (disposed) return;
      cleanup?.();
      disposed = true;
      this.extensionDisposers.delete(dispose);
    };
    this.extensionDisposers.add(dispose);
    return {
      metadata: { ...extension.metadata },
      dispose,
    };
  }

  /** Install a scoped, trusted application plugin. */
  public installPlugin(plugin: OpenKlinePlugin): PluginHandle {
    this.assertAlive();
    return this.pluginRegistry.install(plugin);
  }

  public uninstallPlugin(id: string): boolean {
    this.assertAlive();
    return this.pluginRegistry.uninstall(id);
  }

  public getPlugins(): InstalledPluginMetadata[] {
    this.assertAlive();
    return this.pluginRegistry.list();
  }

  public executeCommand(id: string, args?: unknown): unknown | Promise<unknown> {
    this.assertAlive();
    return this.pluginRegistry.executeCommand(id, args);
  }

  public executeShortcut(shortcut: string, args?: unknown): unknown | Promise<unknown> {
    this.assertAlive();
    return this.pluginRegistry.executeShortcut(shortcut, args);
  }

  public getCommands(): readonly PluginCommandMetadata[] {
    this.assertAlive();
    return this.pluginRegistry.listCommands();
  }

  public getPluginState(id: string): Readonly<Record<string, import("./extensions/types.js").JsonValue>> | undefined {
    this.assertAlive();
    return this.pluginRegistry.getStateSnapshot(id);
  }

  public restorePluginState(id: string, snapshot: unknown): boolean {
    this.assertAlive();
    return this.pluginRegistry.restoreState(id, snapshot);
  }

  /** Serialize chart data, layout, indicators, drawings, viewport, and plugin state. */
  public serializeWorkspace(metadata?: WorkspaceMetadata): WorkspaceDocument {
    this.assertAlive();
    const indicatorSeriesIds = new Set(
      [
        ...[...this.indicators.values()].flatMap((indicator) => indicator.outputSeriesIds),
        ...[...this.multiTimeframeIndicators.values()].flatMap((indicator) => indicator.outputSeriesIds),
        ...[...this.sessionIndicators.values()].flatMap((indicator) => indicator.outputSeriesIds),
      ],
    );
    if (this.cvdSeriesId !== null) indicatorSeriesIds.add(this.cvdSeriesId);
    const panes = this.model.getPaneConfigs().map((pane) => ({
      id: pane.id,
      height: pane.preferredHeight,
      minHeight: pane.minHeight,
    }));
    const series = this.model.getAllSeries()
      .filter((item) => !indicatorSeriesIds.has(item.id))
      .map((item) => ({
        id: item.id,
        type: item.type,
        paneId: item.paneId,
        ...(item.title === undefined ? {} : { title: item.title }),
        style: { ...item.style },
        ...(item.band === undefined ? {} : { band: { ...item.band } }),
        data: this.model.isPrimaryCandleSeries(item.id)
          ? this.getData().map((candle) => ({ ...candle }))
          : item.data.map((point) => ({ ...point })),
      }));
    const indicators = [...this.indicators.values()].map((indicator) => ({
      id: indicator.id,
      indicatorId: indicator.indicatorId,
      paneId: indicator.paneId,
      parameters: toJsonObject(indicator.parameters, `indicator ${indicator.id} parameters`),
      outputStyles: Object.fromEntries(
        Object.entries(indicator.outputStyles).map(([outputId, style]) => [outputId, { ...style }]),
      ),
      ...(indicator.script === undefined ? {} : { script: { ...indicator.script } }),
    }));
    const multiTimeframeIndicators = [...this.multiTimeframeIndicators.values()].map((indicator) => ({
      id: indicator.id,
      indicatorId: indicator.indicatorId,
      paneId: indicator.paneId,
      sourceTimeframe: indicator.options.sourceTimeframe,
      targetTimeframe: indicator.options.targetTimeframe,
      parameters: toJsonObject(indicator.options.parameters ?? {}, `multi-timeframe indicator ${indicator.id} parameters`),
      coveragePolicy: indicator.options.coveragePolicy ?? "unknown",
      missingVolumePolicy: indicator.options.missingVolumePolicy ?? "ignore",
      finalityPolicy: indicator.options.finalityPolicy ?? "time-closed",
      outputStyles: cloneSeriesStyles(indicator.outputStyles),
      visible: indicator.visible,
    }));
    const multiTimeframeReferences = [...this.multiTimeframeReferences.values()].map((reference) => ({
      id: reference.id,
      sourceTimeframe: reference.options.sourceTimeframe,
      targetTimeframe: reference.options.targetTimeframe,
      levels: [...(reference.options.levels ?? ["open", "high", "low", "close"])],
      coveragePolicy: reference.options.coveragePolicy ?? "unknown",
      missingVolumePolicy: reference.options.missingVolumePolicy ?? "ignore",
      finalityPolicy: reference.options.finalityPolicy ?? "time-closed",
      visible: reference.visible,
      labels: reference.options.labels ?? true,
      labelPrefix: reference.options.labelPrefix ?? "Previous",
      style: { ...(reference.options.style ?? {}) },
    }));
    const sessionIndicators = [...this.sessionIndicators.values()].map((indicator) => ({
      id: indicator.id,
      indicatorId: indicator.indicatorId,
      paneId: indicator.paneId,
      sourceTimeframe: indicator.options.sourceTimeframe,
      targetPeriod: indicator.options.targetPeriod,
      calendarId: indicator.options.calendar.definition.id,
      calendarVersion: indicator.options.calendar.definition.version,
      parameters: toJsonObject(indicator.options.parameters ?? {}, `session indicator ${indicator.id} parameters`),
      coveragePolicy: indicator.options.coveragePolicy ?? "unknown",
      missingVolumePolicy: indicator.options.missingVolumePolicy ?? "ignore",
      finalityPolicy: indicator.options.finalityPolicy ?? "time-closed",
      outputStyles: cloneSeriesStyles(indicator.outputStyles),
      visible: indicator.visible,
    }));
    const sessionReferences = [...this.sessionReferences.values()].map((reference) => ({
      id: reference.id,
      sourceTimeframe: reference.options.sourceTimeframe,
      targetPeriod: reference.options.targetPeriod,
      calendarId: reference.options.calendar.definition.id,
      calendarVersion: reference.options.calendar.definition.version,
      levels: [...(reference.options.levels ?? ["open", "high", "low", "close"])],
      visible: reference.visible,
      labels: reference.options.labels ?? true,
      labelPrefix: reference.options.labelPrefix ?? "Previous",
      style: { ...(reference.options.style ?? {}) },
    }));
    const plugins = this.pluginRegistry.list().map((plugin) => ({
      id: plugin.id,
      version: plugin.version,
      state: this.pluginRegistry.getStateSnapshot(plugin.id) ?? {},
    }));
    const viewport = this.model.getViewportState();
    const replay = this.replayController?.getStatus();
    const replayActive = replay !== undefined
      && replay.state !== "idle"
      && replay.state !== "disposed";
    const alerts = this.alertEngine.exportDefinitions();
    const orderFlow = this.getOrderFlowWorkspaceReference();
    return {
      version: 1,
      ...(metadata === undefined ? {} : { metadata: { ...metadata } }),
      chart: {
        theme: { ...this.theme },
        locale: this.locale,
        timeZone: this.timeZone,
        pricePrecision: this.pricePrecision,
        direction: this.direction,
        priceScale: this.getPriceScaleOptions(),
      },
      panes,
      series,
      indicators,
      drawings: this.getReplayVisibleDrawingDocument(),
      viewport,
      plugins,
      ...(this.volumeProfiles.size === 0 ? {} : {
        volumeAnalytics: {
          volumeProfiles: [...this.volumeProfiles.values()].map((profile) => ({
            ...profile.options,
            ...(profile.options.range === undefined ? {} : { range: { ...profile.options.range } }),
          })),
        },
      }),
      ...(multiTimeframeIndicators.length === 0 && multiTimeframeReferences.length === 0 ? {} : {
        multiTimeframe: { indicators: multiTimeframeIndicators, references: multiTimeframeReferences },
      }),
      ...(this.tradingCalendar === null ? {} : {
        tradingCalendar: toWorkspaceTradingCalendar(this.tradingCalendar.calendar, this.tradingCalendar.display),
      }),
      ...(sessionIndicators.length === 0 && sessionReferences.length === 0 ? {} : {
        sessionAnalysis: { indicators: sessionIndicators, references: sessionReferences },
      }),
      ...(this.getCorporateActionWorkspaceReference() === null ? {} : { corporateActions: this.getCorporateActionWorkspaceReference()! }),
      ...(orderFlow === null ? {} : { orderFlow }),
      ...(alerts.alerts.length === 0 ? {} : { alerts }),
      ...(replayActive && replay !== undefined ? {
        replay: {
          active: true as const,
          currentIndex: replay.currentIndex,
          currentTimestamp: replay.currentTimestamp,
          totalBars: replay.totalBars,
        },
      } : {}),
    };
  }

  /** Validate and restore a versioned workspace document. */
  public restoreWorkspace(document: unknown, options: WorkspaceRestoreOptions = {}): WorkspaceRestoreResult {
    this.assertAlive();
    if (this.isReplayActive() && !this.replayRestoring) this.replayController?.exit();
    const parsed = parseWorkspace(document);
    if (parsed.replay !== undefined) {
      throw new WorkspaceCompatibilityError("A replay-visible workspace is a partial snapshot; restore the complete source through ReplayApi");
    }
    const missingPlugins: string[] = [];
    for (const plugin of parsed.plugins) {
      const installed = this.pluginRegistry.get(plugin.id);
      if (installed === undefined) {
        if ((options.missingPlugins ?? "skip") === "error") {
          throw new WorkspaceCompatibilityError(`Workspace requires missing plugin: ${plugin.id}`);
        }
        missingPlugins.push(plugin.id);
      } else if (installed.version !== plugin.version) {
        throw new WorkspaceCompatibilityError(`Workspace plugin version mismatch: ${plugin.id}; expected ${plugin.version}, found ${installed.version}`);
      }
    }
    const missingIndicators: string[] = [];
    const scriptPrograms = new Map<string, KlineScriptCompiledProgram>();
    for (const indicator of parsed.indicators) {
      if (indicator.script !== undefined) {
        const result = compileKlineScript(indicator.script.source);
        if (!result.success || result.program.id !== indicator.script.programId || result.program.id !== indicator.indicatorId) {
          throw new WorkspaceCompatibilityError(`Workspace contains an invalid or incompatible KlineScript: ${indicator.id}`);
        }
        scriptPrograms.set(indicator.id, result.program);
      }
      if (indicator.script === undefined && !this.indicatorRegistry.has(indicator.indicatorId)) {
        if ((options.missingIndicators ?? "skip") === "error") {
          throw new WorkspaceCompatibilityError(`Workspace requires missing indicator: ${indicator.indicatorId}`);
        }
        missingIndicators.push(indicator.id);
      }
    }
    this.drawingEngine.validate(parsed.drawings);
    const attachedCorporateActions = this.corporateActionDataset;
    const attachedMarketTrades = this.marketTradeStore.getAll();
    const attachedMarketTradeDataset = attachedMarketTrades.length === 0 ? null : this.marketTradeStore.getDataset();
    const attachedOrderBook = this.orderBookController;
    const attachedOrderFlowReference = this.getOrderFlowWorkspaceReference();

    this.stopDatafeed();
    this.clearVolumeProfiles();
    this.tradingCalendar = null;
    this.anchoredVwaps.clear();
    this.pendingAnchoredVwapId = null;
    this.clearMultiTimeframe();
    this.clearSessionAnalysis();
    for (const indicator of this.indicators.values()) indicator.instance.dispose();
    this.indicators.clear();
    this.nextIndicatorId = 1;
    this.model.destroy();
    this.chartDataRevision += 1;
    this.cvdSeriesId = null;
    this.cvdPaneId = null;
    this.cvdPaneOwned = false;
    this.rawCandles = [];
    this.corporateActionDataset = null;
    this.corporateActionWorkspaceReference = null;
    this.corporateActionMode = "raw";
    this.corporateActionContext = "retrospective";
    this.corporateActionAsOfTime = undefined;
    this.corporateActionSourceDurationMs = undefined;
    this.corporateActionVolumePolicy = "equivalent-shares";
    this.corporateActionMarkersVisible = true;
    this.drawingEngine.restore({ version: 1, drawings: [] });
    this.selectedDrawingId = null;
    this.pendingDrawing = null;
    this.activeDrawing = null;
    this.crosshair = null;
    this.theme = { ...parsed.chart.theme };
    this.locale = parsed.chart.locale;
    this.timeZone = parsed.chart.timeZone;
    this.pricePrecision = normalizePricePrecision(parsed.chart.pricePrecision);
    this.direction = parsed.chart.direction;
    this.priceScale = parsed.chart.priceScale === undefined
      ? normalizePriceScaleOptions()
      : {
          ...parsed.chart.priceScale,
          ...(parsed.chart.priceScale.range === undefined ? {} : { range: { ...parsed.chart.priceScale.range } }),
        };

    for (const pane of parsed.panes) {
      if (pane.id !== "main") {
        this.model.addPane({
          id: pane.id,
          ...(pane.height === null ? {} : { height: pane.height }),
          minHeight: pane.minHeight,
        });
      }
    }
    for (const item of parsed.series) {
      this.model.addSeries(item.type, {
        id: item.id,
        pane: item.paneId,
        ...(item.title === undefined ? {} : { title: item.title }),
        style: { ...item.style },
        ...(item.band === undefined ? {} : { band: { ...item.band } }),
      });
      this.model.setSeriesData(item.id, item.data as SeriesData);
      if (this.model.isPrimaryCandleSeries(item.id)) this.rawCandles = item.data.map((point) => ({ ...(point as Candle) }));
    }
    if (parsed.corporateActions !== undefined) {
      this.corporateActionWorkspaceReference = { ...parsed.corporateActions };
      const sameSource = attachedCorporateActions !== null
        && attachedCorporateActions.instrumentId === parsed.corporateActions.instrumentId
        && attachedCorporateActions.source.id === parsed.corporateActions.sourceId
        && attachedCorporateActions.source.version === parsed.corporateActions.sourceVersion;
      if (sameSource) {
        this.corporateActionDataset = attachedCorporateActions;
      } else {
        console.warn(`OpenKline corporate-action source is unresolved: ${parsed.corporateActions.sourceId}@${parsed.corporateActions.sourceVersion}`);
      }
      this.corporateActionMode = parsed.corporateActions.mode;
      this.corporateActionContext = parsed.corporateActions.context;
      this.corporateActionAsOfTime = parsed.corporateActions.asOfTime ?? undefined;
      this.corporateActionSourceDurationMs = parsed.corporateActions.sourceDurationMs;
      this.corporateActionVolumePolicy = parsed.corporateActions.volumePolicy;
      this.corporateActionMarkersVisible = parsed.corporateActions.markersVisible;
      this.applyCorporateActionDisplay();
    }
    this.restoreOrderFlowRuntime(parsed.orderFlow, attachedMarketTradeDataset, attachedOrderBook, attachedOrderFlowReference);
    for (const indicator of parsed.indicators) {
      if (missingIndicators.includes(indicator.id)) continue;
      const script = scriptPrograms.get(indicator.id);
      const anchoredParameters = indicator.indicatorId === "ANCHORED_VWAP"
        && typeof indicator.parameters.anchorTime === "number"
        && (indicator.parameters.priceSource === undefined || indicator.parameters.priceSource === "typical" || indicator.parameters.priceSource === "close")
        ? {
            id: indicator.id,
            anchorTime: indicator.parameters.anchorTime,
            priceSource: indicator.parameters.priceSource === "close" ? "close" as const : "typical" as const,
            ...(indicator.outputStyles.value === undefined ? {} : { style: { ...indicator.outputStyles.value } }),
          }
        : null;
      const api = anchoredParameters !== null
        ? this.addAnchoredVwap(anchoredParameters)
        : script === undefined
          ? this.addIndicator(indicator.indicatorId, { id: indicator.id, pane: indicator.paneId, parameters: { ...indicator.parameters } })
          : this.addScriptIndicator(script, { id: indicator.id, pane: indicator.paneId, parameters: { ...indicator.parameters } });
      for (const [outputId, style] of Object.entries(indicator.outputStyles)) api.setOutputStyle(outputId, style);
    }
    for (const indicator of parsed.multiTimeframe?.indicators ?? []) {
      const api = this.addMultiTimeframeIndicator({
        id: indicator.id,
        indicatorId: indicator.indicatorId,
        pane: indicator.paneId,
        sourceTimeframe: indicator.sourceTimeframe,
        targetTimeframe: indicator.targetTimeframe,
        parameters: { ...indicator.parameters },
        coveragePolicy: indicator.coveragePolicy,
        missingVolumePolicy: indicator.missingVolumePolicy,
        finalityPolicy: indicator.finalityPolicy,
        outputStyles: indicator.outputStyles,
        visible: indicator.visible,
      });
      api.setVisible(indicator.visible);
    }
    for (const reference of parsed.multiTimeframe?.references ?? []) {
      this.addMultiTimeframeReference({
        id: reference.id,
        sourceTimeframe: reference.sourceTimeframe,
        targetTimeframe: reference.targetTimeframe,
        levels: reference.levels,
        coveragePolicy: reference.coveragePolicy,
        missingVolumePolicy: reference.missingVolumePolicy,
        finalityPolicy: reference.finalityPolicy,
        visible: reference.visible,
        labels: reference.labels,
        labelPrefix: reference.labelPrefix,
        style: reference.style,
      });
    }
    this.drawingEngine.restore(parsed.drawings);
    this.model.setViewportState(parsed.viewport);
    for (const profile of parsed.volumeAnalytics?.volumeProfiles ?? []) this.addVolumeProfile(profile);
    if (parsed.tradingCalendar !== undefined) {
      const calendar = options.tradingCalendarResolver?.(parsed.tradingCalendar.calendarId, parsed.tradingCalendar.version);
      if (calendar !== undefined) this.setTradingCalendar(calendar, parsed.tradingCalendar.display);
    }
    for (const indicator of parsed.sessionAnalysis?.indicators ?? []) {
      const calendar = options.tradingCalendarResolver?.(indicator.calendarId, indicator.calendarVersion);
      if (calendar === undefined) continue;
      this.addSessionIndicator({
        id: indicator.id,
        indicatorId: indicator.indicatorId,
        pane: indicator.paneId,
        sourceTimeframe: indicator.sourceTimeframe,
        targetPeriod: indicator.targetPeriod,
        calendar,
        parameters: { ...indicator.parameters },
        coveragePolicy: indicator.coveragePolicy,
        missingVolumePolicy: indicator.missingVolumePolicy,
        finalityPolicy: indicator.finalityPolicy,
        outputStyles: indicator.outputStyles,
        visible: indicator.visible,
      });
    }
    for (const reference of parsed.sessionAnalysis?.references ?? []) {
      const calendar = options.tradingCalendarResolver?.(reference.calendarId, reference.calendarVersion);
      if (calendar === undefined) continue;
      this.addSessionReference({
        id: reference.id,
        sourceTimeframe: reference.sourceTimeframe,
        targetPeriod: reference.targetPeriod,
        calendar,
        levels: reference.levels,
        visible: reference.visible,
        labels: reference.labels,
        labelPrefix: reference.labelPrefix,
        style: reference.style,
      });
    }
    for (const plugin of parsed.plugins) {
      if (!missingPlugins.includes(plugin.id)) this.pluginRegistry.restoreState(plugin.id, plugin.state);
    }
    if (!this.replayRestoring) this.alertEngine.replaceDefinitions(parsed.alerts?.alerts ?? []);
    this.render();
    return { skippedPlugins: missingPlugins, skippedIndicators: missingIndicators };
  }

  public addIndicator(indicatorId: string, options: IndicatorAddOptions = {}): ChartIndicatorApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const { id: requestedId, pane, parameters, ...directParameters } = options;
    const normalizedParameters = parameters ?? directParameters;
    const id = requestedId ?? this.nextIndicatorIdValue();
    if (this.indicators.has(id)) throw new Error(`Indicator id already exists: ${id}`);
    const explicitNumber = /^indicator-(\d+)$/.exec(id)?.[1];
    if (explicitNumber !== undefined) this.nextIndicatorId = Math.max(this.nextIndicatorId, Number(explicitNumber) + 1);
    const instance = this.indicatorRegistry.create(indicatorId, normalizedParameters);
    const paneId = pane === "new" ? this.model.addPane({ height: 180 }) : pane ?? "main";
    const state: ManagedChartIndicator = {
      id,
      indicatorId: instance.id,
      paneId,
      instance,
      outputSeriesIds: [],
      parameters: { ...instance.getResult().parameters },
      outputStyles: {},
    };
    instance.setInput(this.model.allCandles);
    let bandIndex = 0;
    for (const output of instance.getResult().outputs) {
      const seriesId = `${id}:${output.id}`;
      const band = output.kind === "band"
        ? {
            group: id,
            role: output.bandRole ?? (bandIndex++ === 0 ? "upper" : "lower"),
          }
        : undefined;
      this.model.addSeries(output.kind === "histogram" ? "histogram" : "line", {
        id: seriesId,
        title: `${instance.metadata.name} ${output.title}`,
        pane: paneId,
        ...(band === undefined ? {} : { band }),
      });
      state.outputSeriesIds.push(seriesId);
    }
    this.indicators.set(id, state);
    this.syncIndicator(state);
    this.emit("indicatorChange", { action: "add", id, indicatorId: state.indicatorId });
    this.render();
    return {
      id,
      indicatorId: instance.id,
      paneId,
      getResult: () => {
        this.assertAlive();
        const worker = state.worker;
        const workerResult = worker !== undefined && worker.resultGeneration === worker.generation ? worker.result : undefined;
        return workerResult ?? instance.getResult();
      },
      setParameters: (nextParameters) => {
        this.assertAlive();
        instance.setParameters(nextParameters);
        state.parameters = { ...instance.getResult().parameters };
        if (state.worker !== undefined) state.worker.initialized = false;
        this.syncIndicator(state);
        if (state.worker !== undefined) void this.scheduleWorkerIndicator(state, this.model.allCandles);
        this.emit("indicatorChange", { action: "update", id, indicatorId: state.indicatorId });
        this.render();
      },
      setOutputStyle: (outputId, style) => {
        this.assertAlive();
        const outputIndex = instance.metadata.outputs.findIndex((output) => output.id === outputId);
        const seriesId = outputIndex < 0 ? undefined : state.outputSeriesIds[outputIndex];
        if (seriesId === undefined) throw new Error(`Unknown indicator output: ${instance.id}:${outputId}`);
        this.model.setSeriesStyle(seriesId, style);
        state.outputStyles[outputId] = { ...style };
        this.emit("indicatorChange", { action: "update", id, indicatorId: state.indicatorId });
        this.render();
      },
      remove: () => {
        this.removeIndicator(id);
      },
    };
  }

  /** Add a main-pane Anchored VWAP using the normal indicator lifecycle. */
  public addAnchoredVwap(options: AnchoredVwapChartOptions): AnchoredVwapApi {
    this.assertAlive();
    const priceSource = options.priceSource ?? "typical";
    const indicator = this.addIndicator("ANCHORED_VWAP", {
      ...(options.id === undefined ? {} : { id: options.id }),
      pane: "main",
      parameters: { anchorTime: options.anchorTime, priceSource },
    });
    const state = { anchorTime: options.anchorTime, priceSource };
    indicator.setOutputStyle("value", {
      color: "#f59e0b",
      lineWidth: 2,
      ...(options.style ?? {}),
    });
    const api: AnchoredVwapApi = {
      ...indicator,
      getOptions: () => ({ ...state }),
      setAnchor: (time) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        const nextTime = validateAnalyticsTimestamp(time, "Anchored VWAP anchorTime");
        state.anchorTime = nextTime;
        indicator.setParameters({ anchorTime: nextTime, priceSource: state.priceSource });
      },
      setPriceSource: (source: AnchoredVwapPriceSource) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        if (source !== "typical" && source !== "close") throw new Error(`Unsupported Anchored VWAP price source: ${String(source)}`);
        state.priceSource = source;
        indicator.setParameters({ anchorTime: state.anchorTime, priceSource: source });
      },
      startPlacement: () => {
        this.startAnchoredVwapPlacement(indicator.id);
      },
    };
    this.anchoredVwaps.set(indicator.id, api);
    return api;
  }

  /** Start visible-candle timestamp snapping for an existing Anchored VWAP. */
  public startAnchoredVwapPlacement(id: string): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    if (!this.anchoredVwaps.has(id)) throw new Error(`Unknown Anchored VWAP: ${id}`);
    this.pendingAnchoredVwapId = id;
    this.emit("toolActivation", { type: "anchored-vwap", active: true });
  }

  /** Return the chart-owned Anchored VWAP APIs created through the additive API. */
  public getAnchoredVwaps(): AnchoredVwapApi[] {
    this.assertAlive();
    return [...this.anchoredVwaps.values()];
  }

  /** Add a chart-owned estimated Volume Profile overlay. */
  public addVolumeProfile(options: VolumeProfileOptions = {}): VolumeProfileApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const fallbackId = `volume-profile-${this.nextVolumeProfileId++}`;
    const resolved = resolveVolumeProfileOptions(options, fallbackId);
    if (this.volumeProfiles.has(resolved.id)) throw new Error(`Volume Profile id already exists: ${resolved.id}`);
    const state: ManagedVolumeProfile = { id: resolved.id, options: resolved, cache: undefined };
    this.volumeProfiles.set(state.id, state);
    const api: VolumeProfileApi = {
      id: state.id,
      getOptions: () => ({ ...state.options, ...(state.options.range === undefined ? {} : { range: { ...state.options.range } }) }),
      getResult: () => this.getVolumeProfileResult(state),
      setOptions: (patch) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        state.options = resolveVolumeProfileOptions({ ...state.options, ...patch, id: state.id }, state.id);
        state.cache = undefined;
        this.invalidateVolumeAnalytics();
        this.render();
      },
      setMode: (mode, range) => {
        const next: VolumeProfileOptionsPatch = { mode, ...(range === undefined ? {} : { range }) };
        api.setOptions(next);
      },
      setRange: (range) => api.setOptions({ mode: "fixed", range }),
      setVisible: (visible) => api.setOptions({ visible }),
      remove: () => {
        this.assertAlive();
        if (!this.volumeProfiles.delete(state.id)) return;
        state.cache = undefined;
        this.invalidateVolumeAnalytics();
        this.render();
      },
    };
    state.api = api;
    this.render();
    return api;
  }

  /** Return defensive APIs for chart-owned Volume Profiles. */
  public getVolumeProfiles(): VolumeProfileApi[] {
    this.assertAlive();
    return [...this.volumeProfiles.values()].map((state) => state.api!).filter((api): api is VolumeProfileApi => api !== undefined);
  }

  /** Attach a resolved IANA trading calendar to the chart's shared viewport. */
  public setTradingCalendar(calendar: TradingCalendarEngine, options: TradingCalendarDisplayOptions = {}): TradingCalendarApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    if (!isTradingCalendarEngine(calendar)) throw new TypeError("setTradingCalendar requires a TradingCalendarEngine");
    const previous = this.tradingCalendar;
    this.tradingCalendar = {
      calendar,
      display: resolveTradingCalendarDisplayOptions({ ...(previous?.display ?? defaultTradingCalendarDisplayOptions()), ...options }),
    };
    this.render();
    return this.wrapTradingCalendarApi(this.tradingCalendar);
  }

  /** Return the resolved calendar and display controls currently attached to this chart. */
  public getTradingCalendar(): TradingCalendarApi | null {
    this.assertAlive();
    return this.tradingCalendar === null ? null : this.wrapTradingCalendarApi(this.tradingCalendar);
  }

  public removeTradingCalendar(): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    if (this.tradingCalendar === null) return;
    this.tradingCalendar = null;
    this.render();
  }

  /** Add a causal session/week/month indicator using the selected calendar. */
  public addSessionIndicator(options: SessionIndicatorChartOptions): SessionIndicatorApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    if (!isTradingCalendarEngine(options.calendar)) throw new TypeError("Session indicators require a TradingCalendarEngine");
    const id = options.id ?? `session-indicator-${this.nextSessionAnalysisId++}`;
    if (this.sessionIndicators.has(id) || this.sessionReferences.has(id) || this.multiTimeframeIndicators.has(id) || this.indicators.has(id)) throw new Error(`Indicator id already exists: ${id}`);
    const paneId = options.pane === "new" ? this.model.addPane({ height: 180 }) : options.pane ?? "main";
    if (!this.model.getPaneIds().includes(paneId)) throw new Error(`Unknown pane id: ${paneId}`);
    const normalizedOptions: SessionIndicatorChartOptions & { readonly id: string } = {
      ...options,
      id,
      pane: paneId,
      parameters: options.parameters === undefined ? {} : { ...options.parameters },
      outputStyles: options.outputStyles === undefined ? {} : cloneSeriesStyles(options.outputStyles),
      visible: options.visible ?? true,
    };
    const runtime = new SessionIndicatorRuntime(normalizedOptions, this.indicatorRegistry);
    const result = runtime.setData(this.model.allCandles, this.resolveSessionAsOf(normalizedOptions, this.model.allCandles));
    const state: ManagedSessionIndicator = {
      id,
      indicatorId: result.indicatorId,
      paneId,
      options: normalizedOptions,
      outputSeriesIds: [],
      outputStyles: cloneSeriesStyles(options.outputStyles ?? {}),
      visible: normalizedOptions.visible ?? true,
      result,
      runtime,
    };
    for (const output of result.outputs) {
      const seriesId = `${id}:${output.id}`;
      const band = output.kind === "band" ? { group: id, role: output.bandRole ?? "upper" } : undefined;
      this.model.addSeries(output.kind === "histogram" ? "histogram" : "line", {
        id: seriesId,
        title: `${options.indicatorId} ${output.title} (${options.targetPeriod})`,
        pane: paneId,
        ...(band === undefined ? {} : { band }),
        style: { ...(state.outputStyles[output.id] ?? {}), visible: state.visible },
      });
      state.outputSeriesIds.push(seriesId);
    }
    this.sessionIndicators.set(id, state);
    this.applySessionIndicatorResult(state);
    this.emit("indicatorChange", { action: "add", id, indicatorId: state.indicatorId });
    this.render();
    return this.wrapSessionIndicatorApi(state);
  }

  public getSessionIndicators(): SessionIndicatorApi[] {
    this.assertAlive();
    return [...this.sessionIndicators.values()].map((state) => this.wrapSessionIndicatorApi(state));
  }

  /** Add previous completed session/week/month OHLC reference levels. */
  public addSessionReference(options: SessionReferenceChartOptions): SessionReferenceApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    if (!isTradingCalendarEngine(options.calendar)) throw new TypeError("Session references require a TradingCalendarEngine");
    const id = options.id ?? `session-reference-${this.nextSessionAnalysisId++}`;
    if (this.sessionReferences.has(id) || this.sessionIndicators.has(id) || this.multiTimeframeReferences.has(id) || this.indicators.has(id)) throw new Error(`Reference id already exists: ${id}`);
    const normalizedOptions: SessionReferenceChartOptions & { readonly id: string } = {
      ...options,
      id,
      levels: options.levels === undefined ? ["open", "high", "low", "close"] : [...options.levels],
      visible: options.visible ?? true,
      labels: options.labels ?? true,
      labelPrefix: options.labelPrefix ?? "Previous",
      style: { color: "#f59e0b", lineWidth: 1.5, lineStyle: "dashed", alpha: 0.9, ...(options.style ?? {}) },
    };
    const runtime = new SessionReferenceRuntime(normalizedOptions);
    const state: ManagedSessionReference = {
      id,
      options: normalizedOptions,
      visible: normalizedOptions.visible ?? true,
      result: runtime.setData(this.model.allCandles, this.resolveSessionAsOf(normalizedOptions, this.model.allCandles)),
      runtime,
    };
    this.sessionReferences.set(id, state);
    this.render();
    return this.wrapSessionReferenceApi(state);
  }

  public getSessionReferences(): SessionReferenceApi[] {
    this.assertAlive();
    return [...this.sessionReferences.values()].map((state) => this.wrapSessionReferenceApi(state));
  }

  /** Add a causal higher-timeframe indicator backed by the existing registry. */
  public addMultiTimeframeIndicator(options: MultiTimeframeIndicatorOptions): MultiTimeframeIndicatorApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const id = options.id ?? `multi-timeframe-${this.nextMultiTimeframeId++}`;
    if (this.multiTimeframeIndicators.has(id) || this.multiTimeframeReferences.has(id) || this.indicators.has(id)) throw new Error(`Indicator id already exists: ${id}`);
    const paneId = options.pane === "new" ? this.model.addPane({ height: 180 }) : options.pane ?? "main";
    if (!this.model.getPaneIds().includes(paneId)) throw new Error(`Unknown pane id: ${paneId}`);
    const normalizedOptions: MultiTimeframeIndicatorOptions & { readonly id: string } = {
      ...options,
      id,
      pane: paneId,
      parameters: options.parameters === undefined ? {} : { ...options.parameters },
      outputStyles: options.outputStyles === undefined ? {} : cloneSeriesStyles(options.outputStyles),
      visible: options.visible ?? true,
    };
    const result = calculateMultiTimeframeIndicator(this.model.allCandles, normalizedOptions, this.indicatorRegistry);
    const state: ManagedMultiTimeframeIndicator = {
      id,
      indicatorId: result.indicatorId,
      paneId,
      options: normalizedOptions,
      outputSeriesIds: [],
      outputStyles: cloneSeriesStyles(options.outputStyles ?? {}),
      visible: normalizedOptions.visible ?? true,
      result,
    };
    for (const output of result.outputs) {
      const seriesId = `${id}:${output.id}`;
      const band = output.kind === "band" ? { group: id, role: output.bandRole ?? "upper" } : undefined;
      this.model.addSeries(output.kind === "histogram" ? "histogram" : "line", {
        id: seriesId,
        title: `${options.indicatorId} ${output.title} (${options.targetTimeframe})`,
        pane: paneId,
        ...(band === undefined ? {} : { band }),
        style: { ...(state.outputStyles[output.id] ?? {}), visible: state.visible },
      });
      state.outputSeriesIds.push(seriesId);
    }
    this.multiTimeframeIndicators.set(id, state);
    this.syncMultiTimeframeIndicator(state);
    this.emit("indicatorChange", { action: "add", id, indicatorId: state.indicatorId });
    this.render();
    return this.wrapMultiTimeframeIndicatorApi(state);
  }

  /** Return defensive APIs for chart-owned higher-timeframe indicators. */
  public getMultiTimeframeIndicators(): MultiTimeframeIndicatorApi[] {
    this.assertAlive();
    return [...this.multiTimeframeIndicators.values()].map((state) => this.wrapMultiTimeframeIndicatorApi(state));
  }

  /** Add previous completed higher-timeframe OHLC reference levels. */
  public addMultiTimeframeReference(options: MultiTimeframeReferenceOptions): MultiTimeframeReferenceApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const id = options.id ?? `multi-timeframe-reference-${this.nextMultiTimeframeId++}`;
    if (this.multiTimeframeReferences.has(id) || this.multiTimeframeIndicators.has(id) || this.indicators.has(id)) throw new Error(`Reference id already exists: ${id}`);
    const normalizedOptions: MultiTimeframeReferenceOptions & { readonly id: string } = {
      ...options,
      id,
      levels: options.levels === undefined ? ["open", "high", "low", "close"] : [...options.levels],
      visible: options.visible ?? true,
      labels: options.labels ?? true,
      labelPrefix: options.labelPrefix ?? "Previous",
      style: { color: "#f59e0b", lineWidth: 1.5, lineStyle: "dashed", alpha: 0.9, ...(options.style ?? {}) },
    };
    const state: ManagedMultiTimeframeReference = {
      id,
      options: normalizedOptions,
      visible: normalizedOptions.visible ?? true,
      result: calculatePreviousTimeframeLevels(this.model.allCandles, normalizedOptions),
    };
    this.multiTimeframeReferences.set(id, state);
    this.syncMultiTimeframeReference(state);
    this.render();
    return this.wrapMultiTimeframeReferenceApi(state);
  }

  /** Return defensive APIs for chart-owned higher-timeframe reference levels. */
  public getMultiTimeframeReferences(): MultiTimeframeReferenceApi[] {
    this.assertAlive();
    return [...this.multiTimeframeReferences.values()].map((state) => this.wrapMultiTimeframeReferenceApi(state));
  }

  /** Add a validated KlineScript program through the existing indicator lifecycle. */
  public addScriptIndicator(program: KlineScriptCompiledProgram, options: IndicatorAddOptions = {}): ChartIndicatorApi {
    this.assertAlive();
    if (!this.indicatorRegistry.has(program.id)) this.indicatorRegistry.register(program.createIndicatorDefinition());
    const nextOptions: IndicatorAddOptions = options.pane === undefined && !program.metadata.overlay
      ? { ...options, pane: "new" }
      : options;
    const api = this.addIndicator(program.id, nextOptions);
    const state = this.indicators.get(api.id);
    if (state !== undefined) state.script = { programId: program.id, source: program.source };
    for (const output of program.metadata.outputs) {
      const style = {
        ...(output.color === undefined ? {} : { color: output.color }),
        ...(output.width === undefined ? {} : { lineWidth: output.width }),
        ...(output.visible === undefined ? {} : { visible: output.visible }),
      };
      if (Object.keys(style).length > 0) api.setOutputStyle(output.id, style);
    }
    return api;
  }

  /**
   * Compile and execute a script through a dedicated Worker while retaining
   * the existing indicator, series, replay, and alert lifecycle as the
   * correctness-first synchronous fallback.
   */
  public async addScriptIndicatorAsync(source: string, options: AsyncScriptIndicatorOptions = {}): Promise<ChartIndicatorApi> {
    this.assertAlive();
    const { timeoutMs, signal, ...indicatorOptions } = options;
    const runtime = new KlineScriptWorkerRuntime(timeoutMs === undefined ? {} : { timeoutMs });
    this.workerRuntimes.add(runtime);
    let createdIndicatorId: string | undefined;
    try {
      const compileTask = runtime.compile(source);
      const removeCompileAbort = bindWorkerAbort(signal, compileTask);
      let compiled;
      try {
        compiled = await compileTask.promise;
      } finally {
        removeCompileAbort();
      }
      if (!compiled.success || compiled.program === undefined) {
        throw new KlineScriptWorkerError("COMPILE_FAILED", "KlineScript compilation failed in Worker", compiled.diagnostics);
      }
      const local = compileKlineScript(source);
      if (!local.success || local.program.id !== compiled.program.id) {
        throw new KlineScriptWorkerError("COMPILE_FAILED", "KlineScript compiler results differ between Worker and host", local.success ? [] : local.diagnostics);
      }
      const api = this.addScriptIndicator(local.program, indicatorOptions);
      createdIndicatorId = api.id;
      const state = this.indicators.get(api.id);
      if (state === undefined) throw new Error(`Async KlineScript state was not created: ${api.id}`);
      state.worker = {
        runtime,
        sessionId: `chart-script-${api.id}`,
        generation: 0,
        initialized: false,
        resultGeneration: -1,
        disposed: false,
        pending: new Set(),
        ...(signal === undefined ? {} : { signal }),
      };
      const result = await this.scheduleWorkerIndicator(state, this.model.allCandles);
      if (result === undefined) throw new KlineScriptWorkerError("EXECUTION_FAILED", "KlineScript Worker returned no result");
      return api;
    } catch (error) {
      if (createdIndicatorId !== undefined && !this.destroyed && this.indicators.has(createdIndicatorId)) {
        this.removeIndicator(createdIndicatorId);
      }
      runtime.dispose();
      this.workerRuntimes.delete(runtime);
      throw error;
    }
  }

  public removeIndicator(id: string): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const state = this.indicators.get(id);
    if (state === undefined) throw new Error(`Unknown indicator: ${id}`);
    this.disposeManagedIndicator(state);
    this.emit("indicatorChange", { action: "remove", id, indicatorId: state.indicatorId });
    this.render();
  }

  /** Dispose indicator instances, workers, and output series without emitting events. */
  private clearManagedIndicators(): void {
    for (const state of [...this.indicators.values()]) {
      this.disposeManagedIndicator(state);
      this.emit("indicatorChange", { action: "remove", id: state.id, indicatorId: state.indicatorId });
    }
    this.anchoredVwaps.clear();
    this.pendingAnchoredVwapId = null;
  }

  private disposeManagedIndicator(state: ManagedChartIndicator): void {
    this.disposeWorkerIndicator(state);
    for (const seriesId of state.outputSeriesIds) {
      if (this.model.getSeriesIds().includes(seriesId)) this.model.removeSeries(seriesId);
    }
    state.instance.dispose();
    this.indicators.delete(state.id);
  }

  public registerDrawingTool(tool: DrawingToolDefinition): void {
    this.assertAlive();
    this.drawingEngine.registerTool(tool);
  }

  public unregisterDrawingTool(type: string): boolean {
    this.assertAlive();
    return this.drawingEngine.unregisterTool(type);
  }

  public addDrawing(type: string, options: DrawingOptions): DrawingApi {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const drawing = this.drawingEngine.create(type, options);
    this.selectedDrawingId = drawing.id;
    this.emit("drawingSelection", { id: drawing.id });
    this.render();
    return drawing;
  }

  public removeDrawing(id: string): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.drawingEngine.remove(id);
    if (this.selectedDrawingId === id) this.selectedDrawingId = null;
    this.emit("drawingSelection", { id: this.selectedDrawingId });
    this.render();
  }

  public setDrawingStyle(id: string, style: DrawingStyle): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.drawingEngine.setStyle(id, style);
    this.emit("drawingSelection", { id: this.selectedDrawingId });
    this.render();
  }

  public setDrawingVisibility(id: string, visible: boolean): void {
    this.setDrawingStyle(id, { visible });
  }

  public setDrawingLocked(id: string, locked: boolean): void {
    this.setDrawingStyle(id, { locked });
  }

  public getDrawings(): DrawingSnapshot[] {
    this.assertAlive();
    return this.drawingEngine.getAll().filter((drawing) => this.isDrawingReplayVisible(drawing));
  }

  public selectDrawing(id: string | null): void {
    this.assertAlive();
    if (id !== null && !this.isDrawingReplayVisible(this.drawingEngine.get(id))) {
      throw new Error("Drawing is not available at the current replay cursor");
    }
    this.selectedDrawingId = id;
    this.emit("drawingSelection", { id });
    this.render();
  }

  public getSelectedDrawingId(): string | null {
    this.assertAlive();
    return this.selectedDrawingId;
  }

  /** Start an interactive drawing; the next one or two clicks create its anchors. */
  public startDrawing(type: string, options: DrawingStartOptions = {}): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const tool = this.drawingEngine.getTool(type);
    if (options.snap !== undefined && options.snap !== "none" && options.snap !== "visible-ohlc") throw new Error(`Unsupported drawing snap mode: ${options.snap}`);
    this.cancelDrawing();
    this.pendingDrawing = { type, options: { ...options }, points: [] };
    this.emit("toolActivation", { type, active: true });
    if (tool.minPoints === 0) {
      throw new Error(`Drawing tool must require at least one point: ${type}`);
    }
  }

  /**
   * Cancel a pending interactive drawing.
   * Invoked only through the internal drawing-cancellation registry; not part of the public API.
   */
  private cancelDrawing(): void {
    this.assertAlive();
    const pending = this.pendingDrawing;
    if (pending === null) return;
    this.pendingDrawing = null;
    this.emit("toolActivation", { type: pending.type, active: false });
    this.render();
  }

  public undoDrawing(): boolean {
    this.assertAlive();
    const changed = this.drawingEngine.undo();
    if (this.selectedDrawingId !== null && !this.getDrawings().some((drawing) => drawing.id === this.selectedDrawingId)) {
      this.selectedDrawingId = null;
    }
    if (changed) this.render();
    return changed;
  }

  public redoDrawing(): boolean {
    this.assertAlive();
    const changed = this.drawingEngine.redo();
    if (this.selectedDrawingId !== null && !this.getDrawings().some((drawing) => drawing.id === this.selectedDrawingId)) {
      this.selectedDrawingId = null;
    }
    if (changed) this.render();
    return changed;
  }

  public serializeDrawings(): DrawingDocument {
    this.assertAlive();
    return this.getReplayVisibleDrawingDocument();
  }

  public restoreDrawings(document: unknown): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.drawingEngine.restore(document);
    this.selectedDrawingId = null;
    this.render();
  }

  public removeSeries(id: string): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const wasPrimaryCandleSeries = this.model.isPrimaryCandleSeries(id);
    this.model.removeSeries(id);
    this.chartDataRevision += 1;
    this.invalidateVolumeAnalytics();
    if (wasPrimaryCandleSeries) {
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
    }
    this.render();
  }

  /** Return the IDs of all live series in insertion order. */
  public getSeriesIds(): string[] {
    this.assertAlive();
    return this.model.getSeriesIds();
  }

  /** Return defensive metadata for every live series without exposing stores. */
  public getSeriesInfo(): ChartSeriesInfo[] {
    this.assertAlive();
    return this.model.getAllSeries().map((series) => ({
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      ...(series.title === undefined ? {} : { title: series.title }),
      style: { ...series.style },
      dataLength: series.data.length,
    }));
  }

  /** Update a live series appearance without recreating data, panes, or viewport. */
  public setSeriesStyle(id: string, style: SeriesOptions["style"]): void {
    this.assertAlive();
    this.model.setSeriesStyle(id, style ?? {});
    this.render();
  }

  /** Create a chart-owned replay controller without exposing the source history. */
  public createReplay(options: ReplayOptions): ReplayApi {
    this.assertAlive();
    if (this.replayController !== null && this.replayController.getStatus().state !== "disposed") {
      throw new Error("A replay controller already exists; exit or dispose it before creating another");
    }
    const host: ReplayControllerHost = {
      beginReplay: (source) => this.beginReplay(source),
      applyReplayCursor: (cursor) => this.applyReplayCursor(cursor),
      exitReplay: () => this.exitReplay(),
      disposeReplay: () => this.disposeReplay(),
    };
    const controller = new ReplayController(options, host, (status) => this.handleReplayStatus(status));
    this.replayController = controller;
    return controller;
  }

  /**
   * Attach the additive multi-stream historical replay controller to this
   * chart. The chart displays completed candles and eligible trade-derived
   * order flow for one selected instrument; the controller remains the
   * authoritative multi-instrument research snapshot.
   */
  public createMarketReplay(options: ChartMarketReplayOptions): MarketReplayController {
    this.assertAlive();
    if (this.isReplayActive()) throw new Error("Exit the legacy candle replay before creating a unified market replay");
    if (this.marketReplayController !== null && this.marketReplayController.getState().state !== "disposed") {
      throw new Error("A unified market replay already exists; exit or dispose it before creating another");
    }
    this.marketReplayBaseCandles = this.rawCandles.map((candle) => ({ ...candle }));
    this.marketReplayBaseTrades = this.marketTradeStore.getAll();
    this.marketReplayBaseOrderBook = this.orderBookController?.getSnapshot() ?? null;
    this.marketReplayInstrumentId = options.instrumentId ?? options.tape.instrumentIds[0] ?? null;
    const controller = new MarketReplayController(options);
    this.marketReplayController = controller;
    this.marketReplayUnsubscribe = controller.subscribe((state) => this.handleMarketReplayState(state));
    return controller;
  }

  /** Return the currently attached unified replay controller, if any. */
  public getMarketReplay(): MarketReplayController | null {
    this.assertAlive();
    return this.marketReplayController;
  }

  /** Load historical bars and optionally subscribe to future bar updates. */
  public async setDatafeed(datafeed: Datafeed, query: GetBarsQuery): Promise<void> {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.stopDatafeed();
    this.datafeedSession = {
      datafeed,
      query: { symbol: query.symbol, timeframe: query.timeframe, from: query.from, to: query.to },
    };
    // Symbol/session changes discard managed indicators; remove series and workers too.
    this.clearManagedIndicators();
    const requestId = this.datafeedRequestId;
    try {
      await datafeed.resolveSymbol(query.symbol, query.signal);
      if (this.destroyed || requestId !== this.datafeedRequestId) {
        return;
      }
      const bars = await datafeed.getBars(query);
      if (this.destroyed || requestId !== this.datafeedRequestId) {
        return;
      }
      this.setData(bars);
      if (datafeed.subscribeBars !== undefined) {
        this.datafeedCleanup = datafeed.subscribeBars({
          symbol: query.symbol,
          timeframe: query.timeframe,
          onBar: (bar) => {
            // Ignore callbacks after stopDatafeed()/replacement increments the request id.
            if (this.destroyed || requestId !== this.datafeedRequestId) return;
            if (!this.isAnyReplayActive()) this.update(bar);
          },
          onError: (error) => {
            if (this.destroyed || requestId !== this.datafeedRequestId) return;
            this.emit("datafeedError", error);
          },
        });
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (this.destroyed || requestId !== this.datafeedRequestId) {
        return;
      }
      this.emit("datafeedError", normalized);
      throw normalized;
    }
  }

  /** Stop any active datafeed subscription. */
  public stopDatafeed(): void {
    this.datafeedRequestId += 1;
    this.datafeedCleanup?.();
    this.datafeedCleanup = null;
    this.datafeedSession = null;
  }

  private replaceMarketTrades(values: readonly MarketTrade[] | MarketTradeDataset): void {
    const next = new MarketTradeStore({ maxTrades: 1_000_000 });
    next.setData(values);
    this.marketTradeStore.dispose();
    this.marketTradeStore = next;
    this.latestMarketTrade = next.getAll().at(-1) ?? null;
    if ("trades" in values) {
      this.marketTradeSourceReference = {
        instrumentId: values.instrumentId,
        sourceId: values.source.id,
        sourceVersion: values.source.version,
        ...(values.venueId === undefined ? {} : { venueId: values.venueId }),
      };
    } else {
      const first = values[0];
      this.marketTradeSourceReference = first === undefined ? null : createChartTradeSourceReference(first);
    }
    this.resetCvdCalculator();
    this.updateOrderFlowWorkspaceReference();
  }

  private resetCvdCalculator(): void {
    this.cvdCalculator?.dispose();
    this.cvdCalculator = null;
    this.cvdCalculatorOptionsKey = null;
    this.cvdCalculatorCalendar = null;
    this.cvdSeriesLatestBucketStart = null;
    this.cvdSeriesStyleKey = null;
  }

  private ingestMarketTrade(value: MarketTrade): { readonly changed: boolean; readonly appendOnly: boolean } {
    const previous = this.latestMarketTrade;
    const status = this.marketTradeStore.update(value);
    if (status === "duplicate") return { changed: false, appendOnly: false };
    const normalized = this.marketTradeStore.get(value.id);
    if (this.marketTradeSourceReference === null && normalized !== undefined) this.marketTradeSourceReference = createChartTradeSourceReference(normalized);
    this.cvdCalculator?.update(value);
    const appendOnly = status === "inserted"
      && normalized !== undefined
      && (previous === null || compareChartMarketTrades(previous, normalized) < 0);
    this.latestMarketTrade = appendOnly
      ? normalized ?? null
      : this.marketTradeStore.getAll().at(-1) ?? null;
    return { changed: true, appendOnly };
  }

  private stopMarketTradeSource(): void {
    this.marketTradeRequestId += 1;
    this.marketTradeAbortController?.abort();
    this.marketTradeAbortController = null;
    this.marketTradeDatafeedCleanup?.();
    this.marketTradeDatafeedCleanup = null;
  }

  private stopOrderBookSource(): void {
    this.orderBookRequestId += 1;
    this.orderBookAbortController?.abort();
    this.orderBookAbortController = null;
    this.orderBookDatafeedCleanup?.();
    this.orderBookDatafeedCleanup = null;
    this.orderBookController?.disconnect();
  }

  private applyOrderBookSnapshot(snapshot: OrderBookSnapshot): void {
    if (this.orderBookController === null) return;
    const result = this.orderBookController.applySnapshot(snapshot);
    const state = this.orderBookController.getState(this.depthDisplay.maxLevels);
    this.orderBookHeatmap ??= new OrderBookHeatmapStore({ maxObservations: this.depthDisplay.maxHistory, maxLevels: this.depthDisplay.maxLevels });
    if (result.kind === "applied") this.orderBookHeatmap.add(state);
    this.orderFlowRevision += 1;
    this.updateOrderFlowWorkspaceReference();
    this.scheduleViewportRender();
  }

  private applyOrderBookDeltaInternal(delta: OrderBookDelta): void {
    if (this.orderBookController === null) return;
    const result = this.orderBookController.applyDelta(delta);
    const state = this.orderBookController.getState(this.depthDisplay.maxLevels);
    this.orderBookHeatmap ??= new OrderBookHeatmapStore({ maxObservations: this.depthDisplay.maxHistory, maxLevels: this.depthDisplay.maxLevels });
    if (result.kind === "applied" || result.kind === "stale") this.orderBookHeatmap.add(state);
    this.orderFlowRevision += 1;
    this.updateOrderFlowWorkspaceReference();
    this.scheduleViewportRender();
  }

  private refreshOrderFlowPresentation(incremental = false): void {
    if (this.cvdDisplay.visible) this.ensureCvdSeries();
    else this.removeCvdSeries();
    if (!incremental || !this.refreshCvdSeriesIncremental()) this.refreshCvdSeries();
    this.updateOrderFlowWorkspaceReference();
  }

  private ensureCvdSeries(): void {
    if (this.cvdSeriesId !== null) return;
    let paneId: string;
    if (this.cvdDisplay.pane === "new") {
      paneId = this.model.addPane({ id: "order-flow-cvd", height: 160 });
      this.cvdPaneOwned = true;
    } else {
      paneId = this.cvdDisplay.pane;
      if (!this.model.getPaneIds().includes(paneId)) throw new Error(`Unknown CVD pane: ${paneId}`);
      this.cvdPaneOwned = false;
    }
    this.cvdPaneId = paneId;
    this.cvdSeriesId = this.model.addSeries("line", {
      id: "openkline.cvd",
      pane: paneId,
      title: "Cumulative Volume Delta",
      style: { color: this.cvdDisplay.color, lineWidth: this.cvdDisplay.lineWidth, visible: this.cvdDisplay.visible },
    });
    this.cvdSeriesLatestBucketStart = null;
    this.cvdSeriesStyleKey = null;
  }

  private removeCvdSeries(): void {
    if (this.cvdSeriesId !== null && this.model.getSeriesIds().includes(this.cvdSeriesId)) this.model.removeSeries(this.cvdSeriesId);
    if (this.cvdPaneOwned && this.cvdPaneId !== null && this.model.getPaneIds().includes(this.cvdPaneId)) this.model.removePane(this.cvdPaneId);
    this.cvdSeriesId = null;
    this.cvdPaneId = null;
    this.cvdPaneOwned = false;
    this.cvdSeriesLatestBucketStart = null;
    this.cvdSeriesStyleKey = null;
  }

  private refreshCvdSeries(): void {
    if (this.cvdSeriesId === null) return;
    const result = this.calculateCvdResult();
    const points = result?.observations.map((observation) => ({ time: observation.bucketStart, value: observation.value })) ?? [];
    this.model.setSeriesData(this.cvdSeriesId, points);
    this.cvdSeriesLatestBucketStart = points.at(-1)?.time ?? null;
    this.applyCvdSeriesStyle();
  }

  private refreshCvdSeriesIncremental(): boolean {
    if (this.cvdSeriesId === null || this.cvdCalculator === null || this.model.getReplayCutoff() !== null || this.cvdSeriesLatestBucketStart === null) return false;
    const observation = this.cvdCalculator.getLatestObservation();
    if (observation === null || observation.bucketStart < this.cvdSeriesLatestBucketStart) return false;
    this.model.updateSeries(this.cvdSeriesId, { time: observation.bucketStart, value: observation.value });
    this.cvdSeriesLatestBucketStart = observation.bucketStart;
    return true;
  }

  private applyCvdSeriesStyle(): void {
    if (this.cvdSeriesId === null) return;
    const key = [this.cvdDisplay.color, this.cvdDisplay.lineWidth, this.cvdDisplay.visible].join(":");
    if (this.cvdSeriesStyleKey === key) return;
    this.model.setSeriesStyle(this.cvdSeriesId, {
      color: this.cvdDisplay.color,
      lineWidth: this.cvdDisplay.lineWidth,
      visible: this.cvdDisplay.visible,
    });
    this.cvdSeriesStyleKey = key;
  }

  private calculateCvdResult(): CvdResult | null {
    const trades = this.getOrderFlowTradesForReplay();
    const range = this.resolveOrderFlowRange(trades);
    if (range === null) return null;
    const cutoff = this.model.getReplayCutoff();
    const options = {
      ...range,
      intervalMs: this.cvdDisplay.intervalMs,
      reset: this.cvdDisplay.reset,
      sourceCoverage: this.cvdDisplay.sourceCoverage,
      ...(this.tradingCalendar === null ? {} : { calendar: this.tradingCalendar.calendar }),
    } as const;
    if (cutoff === null) {
      const key = [range.from, options.intervalMs, options.reset, options.sourceCoverage].join(":");
      const liveOptions = { ...options, to: Number.MAX_SAFE_INTEGER } as const;
      if (this.cvdCalculator === null) {
        this.cvdCalculator = new CumulativeVolumeDeltaCalculator(liveOptions, this.marketTradeStore.getAll());
        this.cvdCalculatorOptionsKey = key;
        this.cvdCalculatorCalendar = this.tradingCalendar?.calendar ?? null;
      } else if (this.cvdCalculatorOptionsKey !== key || this.cvdCalculatorCalendar !== (this.tradingCalendar?.calendar ?? null)) {
        this.cvdCalculator.setOptions(liveOptions);
        this.cvdCalculatorOptionsKey = key;
        this.cvdCalculatorCalendar = this.tradingCalendar?.calendar ?? null;
      }
      try {
        const result = this.cvdCalculator.getResult();
        return {
          ...result,
          from: range.from,
          to: range.to,
          observations: result.observations.map((observation) => ({
            ...observation,
            bucketEnd: Math.min(range.to, observation.bucketStart + options.intervalMs),
          })),
        };
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes("trading calendar")) throw error;
        return null;
      }
    }
    try {
      return calculateCumulativeVolumeDelta(trades, {
        ...options,
        asOfTime: cutoff,
      });
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("trading calendar")) throw error;
      return null;
    }
  }

  private calculateFootprintResult(trades: readonly MarketTrade[], range: { readonly from: number; readonly to: number }): FootprintResult | null {
    if (trades.length === 0) return null;
    try {
      return calculateFootprint(trades, {
        ...range,
        intervalMs: this.footprintDisplay.intervalMs,
        tickSize: this.footprintDisplay.tickSize,
        offTickPolicy: this.footprintDisplay.offTickPolicy,
        maxCells: this.footprintDisplay.maxCells,
      });
    } catch {
      return null;
    }
  }

  private getOrderFlowTradesForReplayRange(from: number, to: number): MarketTrade[] {
    const cutoff = this.model.getReplayCutoff();
    if (cutoff === Number.NEGATIVE_INFINITY || from > to) return [];
    return this.marketTradeStore.getRange(from, to, cutoff === null ? undefined : cutoff);
  }

  private getOrderFlowTradesForReplay(): MarketTrade[] {
    const cutoff = this.model.getReplayCutoff();
    const trades = this.marketTradeStore.getAll();
    if (cutoff === null) return trades;
    if (cutoff === Number.NEGATIVE_INFINITY) return [];
    return trades.filter((trade) => trade.time <= cutoff);
  }

  private resolveOrderFlowRange(trades: readonly MarketTrade[]): { readonly from: number; readonly to: number } | null {
    const candles = this.model.allCandles;
    const first = Math.min(candles[0]?.time ?? Number.MAX_SAFE_INTEGER, trades[0]?.time ?? Number.MAX_SAFE_INTEGER);
    const last = Math.max(candles.at(-1)?.time ?? 0, trades.at(-1)?.time ?? 0);
    if (!Number.isSafeInteger(first) || first === Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(last)) return null;
    return { from: first, to: last === Number.MAX_SAFE_INTEGER ? last : Math.min(Number.MAX_SAFE_INTEGER, last + 1) };
  }

  private getVisibleOrderFlowRange(trades: readonly MarketTrade[]): { readonly from: number; readonly to: number } | null {
    const times = this.model.getVisibleData().times;
    if (times.length === 0) return this.resolveOrderFlowRange(trades);
    const from = times[0]!;
    const last = times.at(-1)!;
    return { from, to: Math.min(Number.MAX_SAFE_INTEGER, last + 1) };
  }

  private clampOrderFlowAsOf(options: TimeAndSalesOptions): TimeAndSalesOptions {
    const cutoff = this.model.getReplayCutoff();
    if (cutoff === null || cutoff === Number.NEGATIVE_INFINITY) return options;
    return { ...options, asOfTime: options.asOfTime === undefined ? cutoff : Math.min(options.asOfTime, cutoff) };
  }

  public resize(width: number, height: number): void {
    this.assertAlive();
    const nextWidth = Math.max(0, Math.floor(width));
    const nextHeight = Math.max(0, Math.floor(height));
    const nextDevicePixelRatio = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.floor(nextWidth * nextDevicePixelRatio));
    const pixelHeight = Math.max(1, Math.floor(nextHeight * nextDevicePixelRatio));
    if (this.width === nextWidth && this.height === nextHeight && this.devicePixelRatio === nextDevicePixelRatio && this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return;
    this.width = nextWidth;
    this.height = nextHeight;
    this.devicePixelRatio = nextDevicePixelRatio;
    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }
    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }
    this.model.resize(this.width);
    this.emitViewportChange();
    this.render();
  }

  public setOptions(options: ChartOptions): void {
    this.assertAlive();
    if (options.theme !== undefined) {
      this.theme = resolveTheme(options.theme);
    }
    if (options.locale !== undefined) {
      this.locale = options.locale;
    }
    if (options.timeZone !== undefined) {
      this.timeZone = options.timeZone;
    }
    if (options.pricePrecision !== undefined) {
      this.pricePrecision = normalizePricePrecision(options.pricePrecision);
    }
    if (options.priceScale !== undefined) this.updatePriceScaleOptions(options.priceScale);
    if (options.direction !== undefined) this.direction = options.direction;
    if (options.interaction !== undefined) {
      this.interaction = resolveInteraction({ ...this.interaction, ...options.interaction });
    }
    if (options.theme !== undefined) this.emit("themeChange", { theme: { ...this.theme } });
    if (options.width !== undefined || options.height !== undefined) {
      this.resize(options.width ?? this.width, options.height ?? this.height);
      return;
    }
    this.render();
  }

  /** Configure the primary price pane without duplicating scale logic in consumers. */
  public setPriceScaleOptions(options: PriceScaleOptions): void {
    this.assertAlive();
    this.updatePriceScaleOptions(options);
    this.render();
  }

  /** Freeze the primary price range in raw financial-price coordinates. */
  public setPriceScaleRange(range: PriceScaleRange): void {
    this.assertAlive();
    this.priceScale = {
      ...this.priceScale,
      autoScale: false,
      range: normalizePriceScaleRange(range),
    };
    this.render();
  }

  /** Restore visible-data autoscaling while retaining the selected display mode. */
  public resetPriceScale(): void {
    this.assertAlive();
    const { range: _range, ...configuration } = this.priceScale;
    this.priceScale = { ...configuration, autoScale: true };
    this.render();
  }

  /** Return a defensive snapshot of the selected price-scale configuration. */
  public getPriceScaleOptions(): PriceScaleConfiguration {
    this.assertAlive();
    return { ...this.priceScale, ...(this.priceScale.range === undefined ? {} : { range: { ...this.priceScale.range } }) };
  }

  /** Return the active transform and any deterministic data-domain fallback. */
  public getPriceScaleState(): PriceScaleState {
    this.assertAlive();
    const context = this.getPrimaryScaleContext();
    if (context === null) {
      const configuration = this.getResolvedPriceScaleConfiguration();
      return { ...configuration, activeMode: configuration.mode };
    }
    return context.scale.state;
  }

  /** Return the current visible bar indexes for interaction and diagnostics. */
  public getVisibleRange(): { from: number; to: number } {
    this.assertAlive();
    const { from, to } = this.model.getVisibleData();
    return { from, to };
  }

  /** Return UTC time boundaries for optional cross-chart viewport synchronization. */
  public getVisibleTimeRange(): { from: number | null; to: number | null } {
    this.assertAlive();
    const times = this.model.getVisibleData().times;
    return { from: times[0] ?? null, to: times.at(-1) ?? null };
  }

  /** Apply a UTC time range without assuming that chart indexes match. */
  public setVisibleTimeRange(range: { from: number; to: number }): void {
    this.assertAlive();
    this.model.setVisibleTimeRange(range.from, range.to);
    this.invalidateVolumeAnalytics();
    this.emitViewportChange();
    this.scheduleViewportRender();
  }

  /** Move the crosshair to the nearest visible bar time, or clear it. */
  public setCrosshairAtTime(time: number | null): number | null {
    this.assertAlive();
    if (time === null) {
      this.crosshair = null;
      if (this.interaction.crosshair) this.emitCrosshair(null, null);
      this.renderCrosshairFrame();
      return null;
    }
    if (!Number.isFinite(time)) throw new Error("Crosshair time must be finite or null");
    const context = this.getPrimaryScaleContext();
    const times = this.model.getVisibleData().times;
    if (context === null || times.length === 0) return null;
    const nearest = nearestTime(times, time);
    if (nearest === null) return null;
    const x = context.timeScale.xForTime(nearest);
    const y = (context.bounds.top + context.bounds.bottom) / 2;
    this.crosshair = { x, y };
    if (this.interaction.crosshair) this.emitCrosshair(x, y);
    this.renderCrosshairFrame();
    return nearest;
  }

  /** Pan the shared viewport by a number of bars and redraw. */
  public pan(deltaBars: number): void {
    this.assertAlive();
    this.model.pan(deltaBars);
    this.invalidateVolumeAnalytics();
    this.emitViewportChange();
    this.scheduleViewportRender();
  }

  /** Zoom the shared viewport around an anchor ratio and redraw. */
  public zoom(scale: number, anchorRatio = 0.5): void {
    this.assertAlive();
    this.model.zoom(scale, anchorRatio);
    this.invalidateVolumeAnalytics();
    this.emitViewportChange();
    this.scheduleViewportRender();
  }

  /** Show the complete shared time range without recreating chart resources. */
  public fitContent(): void {
    this.assertAlive();
    this.model.fitContent();
    this.invalidateVolumeAnalytics();
    this.emitViewportChange();
    this.scheduleViewportRender();
  }

  /** Restore default bar density and follow the newest available data. */
  public resetView(): void {
    this.assertAlive();
    this.model.resetView();
    this.invalidateVolumeAnalytics();
    this.emitViewportChange();
    this.scheduleViewportRender();
  }

  /**
   * Return a defensive copy of the source candles.
   *
   * Replay is intentionally the exception to the normal raw-source contract:
   * while a replay is active callers receive the revealed raw prefix. This
   * preserves the long-standing diagnostic behavior without exposing future
   * bars to integrations that consume getData() during playback.
   */
  public getData(): Candle[] {
    this.assertAlive();
    if (this.isReplayActive() && this.replayRawSource !== null) {
      const cutoff = this.model.getReplayCutoff();
      return this.replayRawSource
        .filter((candle) => cutoff === null || cutoff === Number.NEGATIVE_INFINITY || candle.time <= cutoff)
        .map((candle) => ({ ...candle }));
    }
    return this.rawCandles.map((candle) => ({ ...candle }));
  }

  /** Return the candle domain currently rendered by the chart. */
  public getDisplayedData(): Candle[] {
    this.assertAlive();
    return this.model.allCandles;
  }

  /** Attach or replace a validated corporate-action source without mutating raw candles. */
  public setCorporateActions(dataset: CorporateActionDataset, options: CorporateActionDisplayOptions = {}): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const normalized = normalizeCorporateActionDataset(dataset);
    this.corporateActionDataset = normalized;
    this.corporateActionMode = options.mode ?? this.corporateActionMode;
    this.corporateActionContext = options.context ?? this.corporateActionContext;
    this.corporateActionAsOfTime = options.asOfTime;
    this.corporateActionSourceDurationMs = options.sourceDurationMs;
    this.corporateActionVolumePolicy = options.volumePolicy ?? this.corporateActionVolumePolicy;
    this.corporateActionMarkersVisible = options.markersVisible ?? this.corporateActionMarkersVisible;
    this.corporateActionWorkspaceReference = this.createCorporateActionWorkspaceReference(normalized);
    this.applyCorporateActionDisplay();
  }

  public getCorporateActions(): CorporateActionDataset | null {
    this.assertAlive();
    if (this.corporateActionDataset === null) return null;
    return normalizeCorporateActionDataset(this.corporateActionDataset);
  }

  public getCorporateActionDisplayOptions(): Required<Pick<CorporateActionDisplayOptions, "mode" | "context" | "volumePolicy" | "markersVisible">> & Pick<CorporateActionDisplayOptions, "asOfTime" | "sourceDurationMs"> {
    this.assertAlive();
    return {
      mode: this.corporateActionMode,
      context: this.corporateActionContext,
      ...(this.corporateActionAsOfTime === undefined ? {} : { asOfTime: this.corporateActionAsOfTime }),
      ...(this.corporateActionSourceDurationMs === undefined ? {} : { sourceDurationMs: this.corporateActionSourceDurationMs }),
      volumePolicy: this.corporateActionVolumePolicy,
      markersVisible: this.corporateActionMarkersVisible,
    };
  }

  /** Select an explicit raw, split-adjusted, or analytical total-return view. */
  public setCorporateActionDisplayMode(mode: NonNullable<CorporateActionDisplayOptions["mode"]>, options: Omit<CorporateActionDisplayOptions, "mode"> = {}): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    if (mode !== "raw" && mode !== "split-adjusted" && mode !== "total-return") throw new Error(`Unsupported corporate-action display mode: ${String(mode)}`);
    this.corporateActionMode = mode;
    this.corporateActionContext = options.context ?? this.corporateActionContext;
    this.corporateActionAsOfTime = options.asOfTime;
    this.corporateActionSourceDurationMs = options.sourceDurationMs;
    this.corporateActionVolumePolicy = options.volumePolicy ?? this.corporateActionVolumePolicy;
    this.corporateActionMarkersVisible = options.markersVisible ?? this.corporateActionMarkersVisible;
    this.updateCorporateActionWorkspaceReference();
    this.applyCorporateActionDisplay();
  }

  public getCorporateActionAdjustment(): CorporateActionAdjustmentResult | null {
    this.assertAlive();
    return this.computeCorporateActionAdjustment();
  }

  public setCorporateActionMarkersVisible(visible: boolean): void {
    this.assertAlive();
    this.corporateActionMarkersVisible = visible;
    this.updateCorporateActionWorkspaceReference();
    this.render();
  }

  public clearCorporateActions(): void {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    this.corporateActionDataset = null;
    this.corporateActionWorkspaceReference = null;
    this.corporateActionMode = "raw";
    this.corporateActionContext = "retrospective";
    this.corporateActionAsOfTime = undefined;
    this.corporateActionSourceDurationMs = undefined;
    this.corporateActionVolumePolicy = "equivalent-shares";
    this.replaceRawCandles(this.rawCandles);
  }

  /** Set non-persistent strategy signal/fill markers rendered through the existing overlay path. */
  public setStrategyMarkers(markers: readonly StrategyMarker[]): void {
    this.assertAlive();
    this.strategyMarkers = validateStrategyMarkers(markers);
    this.render();
  }

  public getStrategyMarkers(): StrategyMarker[] {
    this.assertAlive();
    const cutoff = this.model.getReplayCutoff();
    return this.strategyMarkers
      .filter((marker) => cutoff === null || marker.time <= cutoff)
      .map((marker) => ({ ...marker }));
  }

  public clearStrategyMarkers(): void {
    this.assertAlive();
    this.strategyMarkers = [];
    this.render();
  }

  /** Set non-persistent simulated paper-order markers without replacing strategy markers. */
  public setPaperTradingMarkers(markers: readonly PaperTradingMarker[]): void {
    this.assertAlive();
    this.paperTradingMarkers = validatePaperTradingMarkers(markers);
    this.render();
  }

  public getPaperTradingMarkers(): PaperTradingMarker[] {
    this.assertAlive();
    const cutoff = this.model.getReplayCutoff();
    return this.paperTradingMarkers.filter((marker) => cutoff === null || marker.time <= cutoff).map((marker) => ({ ...marker }));
  }

  public clearPaperTradingMarkers(): void {
    this.assertAlive();
    this.paperTradingMarkers = [];
    this.render();
  }

  public subscribe<Name extends ChartEventName>(name: Name, handler: ChartEventHandler<Name>): () => void {
    const handlers = this.listeners.get(name) ?? new Set<ChartEventHandler<ChartEventName>>();
    handlers.add(handler as ChartEventHandler<ChartEventName>);
    this.listeners.set(name, handlers);
    return () => handlers.delete(handler as ChartEventHandler<ChartEventName>);
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.emit("chartDestroy", { timestamp: Date.now() });
    this.marketReplayController?.dispose();
    if (this.marketReplayController !== null) this.restoreMarketReplay();
    this.replayController?.dispose();
    this.replayController = null;
    this.alertEngine.dispose();
    this.pluginRegistry.dispose();
    for (const dispose of [...this.extensionDisposers]) dispose();
    this.destroyed = true;
    this.stopDatafeed();
    this.stopMarketTradeSource();
    this.stopOrderBookSource();
    for (const indicator of this.indicators.values()) {
      this.disposeWorkerIndicator(indicator);
      indicator.instance.dispose();
    }
    for (const runtime of this.workerRuntimes) runtime.dispose();
    this.workerRuntimes.clear();
    this.indicators.clear();
    this.anchoredVwaps.clear();
    this.pendingAnchoredVwapId = null;
    this.clearVolumeProfiles();
    this.tradingCalendar = null;
    this.clearMultiTimeframe();
    this.clearSessionAnalysis();
    this.marketTradeStore.dispose();
    this.resetCvdCalculator();
    this.orderBookController?.dispose();
    this.orderBookController = null;
    this.orderBookHeatmap?.dispose();
    this.orderBookHeatmap = null;
    this.cvdSeriesId = null;
    this.cvdPaneId = null;
    this.cvdPaneOwned = false;
    this.orderFlowWorkspaceReference = null;
    this.model.destroy();
    this.rawCandles = [];
    this.corporateActionDataset = null;
    this.corporateActionWorkspaceReference = null;
    this.baseFrame = null;
    this.replayRawSource = null;
    this.replayCursorIndex = null;
    this.drawingEngine.dispose();
    this.overlays.clear();
    this.strategyMarkers = [];
    this.paperTradingMarkers = [];
    this.resizeObserver?.disconnect();
    this.pendingObservedResize = null;
    if (this.resizeFrame !== null) {
      if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(this.resizeFrame);
      else if (typeof window !== "undefined") window.clearTimeout(this.resizeFrame);
      this.resizeFrame = null;
    }
    this.cancelViewportRender();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("touchstart", this.handleTouchStart);
    this.canvas.removeEventListener("touchend", this.handleTouchEnd);
    this.canvas.removeEventListener("touchcancel", this.handleTouchEnd);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
    // Release GPU/backing-store pixels and renderer frame caches before detach.
    this.renderer.dispose();
    this.canvas.width = 0;
    this.canvas.height = 0;
    this.canvas.remove();
    this.listeners.clear();
  }

  private scheduleObservedResize(width: number, height: number): void {
    if (this.destroyed) return;
    this.pendingObservedResize = { width, height };
    if (this.resizeFrame !== null || typeof window === "undefined") return;
    const applyResize = (): void => {
      this.resizeFrame = null;
      const next = this.pendingObservedResize;
      this.pendingObservedResize = null;
      if (!this.destroyed && next !== null) this.resize(next.width, next.height);
    };
    this.resizeFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(applyResize)
      : window.setTimeout(applyResize, 0);
  }

  private snapDrawingPoint(point: DrawingPoint, mode: DrawingSnapMode | undefined): DrawingPoint {
    if (mode !== "visible-ohlc") return point;
    const candles = this.model.getVisibleData().candles;
    const nearest = candles.reduce<{ candle: Candle | undefined; distance: number }>((best, candle) => {
      const distance = Math.abs(candle.time - point.time);
      return distance < best.distance ? { candle, distance } : best;
    }, { candle: undefined, distance: Number.POSITIVE_INFINITY }).candle;
    if (nearest === undefined) return point;
    const price = [nearest.open, nearest.high, nearest.low, nearest.close].reduce((best, candidate) => Math.abs(candidate - point.price) < Math.abs(best - point.price) ? candidate : best, nearest.close);
    return { time: nearest.time, price };
  }

  private pointerPosition(event: PointerEvent): { readonly x: number; readonly y: number } {
    return this.clientPosition(event.clientX, event.clientY);
  }

  private clientPosition(clientX: number, clientY: number): { readonly x: number; readonly y: number } {
    const bounds = this.canvas.getBoundingClientRect();
    const scaleX = bounds.width > 0 ? this.width / bounds.width : 1;
    const scaleY = bounds.height > 0 ? this.height / bounds.height : 1;
    return {
      x: Math.max(0, Math.min(this.width, (clientX - bounds.left) * scaleX)),
      y: Math.max(0, Math.min(this.height, (clientY - bounds.top) * scaleY)),
    };
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    syncInteractionSize(this.canvas, this.width, this.height, (width, height) => this.resize(width, height));
    const position = this.pointerPosition(event);
    if (this.suppressNextPointerDown) {
      this.suppressNextPointerDown = false;
      return;
    }
    if (this.handlePendingAnchoredVwapAnchor(position)) return;
    if (this.handlePendingDrawingPoint(position)) return;

    const drawingContext = this.getDrawingContext();

    if (drawingContext !== null && isInsideBounds(position.x, position.y, drawingContext.bounds)) {
      const hit = this.drawingEngine.hitTest(position.x, position.y, drawingContext.converter, drawingContext.bounds, 6, (drawing) => this.isDrawingReplayVisible(drawing));
      if (hit !== null) {
        this.selectedDrawingId = hit.id;
        this.emit("drawingSelection", { id: hit.id });
        const snapshot = this.drawingEngine.get(hit.id);
        if (snapshot.style.locked !== true) {
          this.activeDrawing = {
            id: hit.id,
            pointIndex: hit.pointIndex,
            time: drawingContext.converter.timeForX(position.x),
            price: drawingContext.converter.priceForY(position.y),
          };
          this.canvas.setPointerCapture(event.pointerId);
        }
        this.render();
        return;
      }
    }

    this.selectedDrawingId = null;
    this.emit("drawingSelection", { id: null });
    this.activeDrawing = null;
    this.dragging = this.interaction.pointerPan;
    this.lastPointerX = position.x;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handleTouchStart = (event: TouchEvent): void => {
    syncInteractionSize(this.canvas, this.width, this.height, (width, height) => this.resize(width, height));
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    const position = this.clientPosition(touch.clientX, touch.clientY);
    if (!this.handlePendingAnchoredVwapAnchor(position) && !this.handlePendingDrawingPoint(position)) return;
    event.preventDefault();
    this.suppressNextPointerDown = true;
  };

  private readonly handleTouchEnd = (): void => {
    this.suppressNextPointerDown = false;
  };

  private handlePendingAnchoredVwapAnchor(position: { readonly x: number; readonly y: number }): boolean {
    const id = this.pendingAnchoredVwapId;
    if (id === null) return false;
    const drawingContext = this.getDrawingContext();
    if (drawingContext === null || !isInsideBounds(position.x, position.y, drawingContext.bounds)) return false;
    const nearest = nearestTime(this.model.getVisibleData().times, drawingContext.converter.timeForX(position.x));
    const api = this.anchoredVwaps.get(id);
    if (nearest === null || api === undefined) return false;
    this.pendingAnchoredVwapId = null;
    api.setAnchor(nearest);
    this.emit("toolActivation", { type: "anchored-vwap", active: false });
    this.render();
    return true;
  }

  private handlePendingDrawingPoint(position: { readonly x: number; readonly y: number }): boolean {
    const drawingContext = this.getDrawingContext();
    if (drawingContext === null || this.pendingDrawing === null || !isInsideBounds(position.x, position.y, drawingContext.bounds)) return false;
    const point = this.snapDrawingPoint({
      time: Math.max(0, Math.round(drawingContext.converter.timeForX(position.x))),
      price: drawingContext.converter.priceForY(position.y),
    }, this.pendingDrawing.options.snap);
    this.pendingDrawing.points.push(point);
    const tool = this.drawingEngine.getTool(this.pendingDrawing.type);
    if (this.pendingDrawing.points.length >= tool.minPoints) {
      const { type, options, points } = this.pendingDrawing;
      const drawing = this.drawingEngine.create(type, {
        points,
        ...(options.style === undefined ? {} : { style: { ...options.style } }),
        ...(options.text === undefined ? {} : { text: options.text }),
        ...(options.zIndex === undefined ? {} : { zIndex: options.zIndex }),
      });
      this.selectedDrawingId = drawing.id;
      this.emit("drawingSelection", { id: drawing.id });
      this.emit("toolActivation", { type, active: false });
      this.pendingDrawing = null;
    }
    this.render();
    return true;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const position = this.pointerPosition(event);
    if (this.activeDrawing !== null) {
      const drawingContext = this.getDrawingContext();
      if (drawingContext !== null) {
        const time = drawingContext.converter.timeForX(position.x);
        const price = drawingContext.converter.priceForY(position.y);
        if (this.activeDrawing.pointIndex === null) {
          this.drawingEngine.move(this.activeDrawing.id, time - this.activeDrawing.time, price - this.activeDrawing.price);
        } else {
          this.drawingEngine.movePoint(this.activeDrawing.id, this.activeDrawing.pointIndex, { time, price });
        }
        this.activeDrawing = { ...this.activeDrawing, time, price };
      }
      if (this.interaction.crosshair) {
        this.crosshair = { x: position.x, y: position.y };
        this.emitCrosshair(position.x, position.y);
      }
      this.render();
      return;
    }

    const viewportChanged = this.dragging;
    if (this.dragging) {
      const delta = position.x - this.lastPointerX;
      this.model.pan(-delta / Math.max(this.model.barSpacing, 1));
      this.emitViewportChange();
      this.lastPointerX = position.x;
    }

    if (this.interaction.crosshair) {
      this.crosshair = { x: position.x, y: position.y };
      this.emitCrosshair(position.x, position.y);
    }
    if (viewportChanged) this.scheduleViewportRender();
    else this.renderCrosshairFrame();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    this.activeDrawing = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private readonly handlePointerLeave = (): void => {
    if (!this.dragging) {
      this.crosshair = null;
      if (this.interaction.crosshair) this.emitCrosshair(null, null);
      this.renderCrosshairFrame();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.interaction.wheelZoom) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 0.8 : 1.25;
    const primary = this.getPrimaryScaleContext();
    const plotLeft = primary?.bounds.left ?? 0;
    const plotWidth = primary === null || primary === undefined ? this.width : primary.bounds.right - primary.bounds.left;
    const visualAnchor = (event.offsetX - plotLeft) / Math.max(plotWidth, 1);
    const logicalAnchor = this.direction === "rtl" ? 1 - visualAnchor : visualAnchor;
    this.model.zoom(factor, logicalAnchor);
    this.emitViewportChange();
    this.scheduleViewportRender();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.interaction.keyboardShortcuts) return;
    const shortcut = keyboardShortcut(event);
    if (shortcut === null) return;
    const result = this.pluginRegistry.executeShortcut(shortcut);
    if (result !== undefined) event.preventDefault();
  };

  private attachInteractions(): void {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.canvas.addEventListener("touchend", this.handleTouchEnd);
    this.canvas.addEventListener("touchcancel", this.handleTouchEnd);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("keydown", this.handleKeyDown);
  }

  private emitCrosshair(x: number | null, y: number | null): void {
    const data = this.model.getVisibleData();
    const event: CrosshairMoveEvent = { time: null, price: null, formattedPrice: null, x: x ?? 0, y: y ?? 0, series: [] };
    const bounds = getPaneBounds(this.width, this.height, data.panes);
    const firstPane = bounds[0];
    const activePane = bounds.find((pane) => y !== null && y >= pane.top && y <= pane.bottom);
    if (
      x !== null
      && y !== null
      && firstPane !== undefined
      && x >= firstPane.left
      && x <= firstPane.right
      && activePane !== undefined
      && data.series.some((series) => series.data.length > 0)
    ) {
      const paneData = data.panes.find((pane) => pane.id === activePane.id);
      const scale = createPanePriceScale(
        paneData?.series ?? [],
        activePane,
        activePane.id === "main" ? this.getResolvedPriceScaleConfiguration() : undefined,
      );
      const timeScale = new TimeScale(data.times, { start: firstPane.left, end: firstPane.right }, this.direction);
      event.time = Math.round(timeScale.timeForX(x));
      event.price = scale.priceForY(y);
      event.formattedPrice = scale.formatPrice(event.price, this.pricePrecision);
      event.priceScaleMode = scale.mode;
      const nearest = nearestTime(data.times, event.time);
      event.series = data.series.map((series) => ({
        id: series.id,
        type: series.type,
        ...(series.title === undefined ? {} : { title: series.title }),
        value: nearest === null
          ? null
          : series.data.find((point) => point.time === nearest) ?? null,
      }));
    }
    this.emit("crosshairMove", event);
  }

  private emitViewportChange(): void {
    const { from, to } = this.model.getVisibleData();
    this.emit("viewportChange", { from, to });
  }

  private emit<Name extends ChartEventName>(name: Name, event: ChartEvents[Name]): void {
    const handlers = this.listeners.get(name);
    handlers?.forEach((handler) => handler(event as never));
  }

  private render(): void {
    this.cancelViewportRender();
    const visibleData = this.model.getVisibleData();
    this.updateCanvasAccessibility(visibleData);
    const drawingContext = this.getDrawingContext();
    this.renderer.render(
      visibleData,
      { width: this.width, height: this.height, devicePixelRatio: this.devicePixelRatio },
      this.theme,
      {
        locale: this.locale,
        timeZone: this.timeZone,
        pricePrecision: this.pricePrecision,
        direction: this.direction,
        priceScale: this.getResolvedPriceScaleConfiguration(),
      },
      null,
        drawingContext === null ? [] : this.drawingEngine.getRenderItems(drawingContext.converter, drawingContext.bounds, (drawing) => this.isDrawingReplayVisible(drawing)),
      this.selectedDrawingId,
      this.getPluginOverlayItems(),
    );
    this.baseFrame = null;
    this.baseFrameWidth = 0;
    this.baseFrameHeight = 0;
    if (this.crosshair !== null) {
      this.captureBaseFrame();
      this.renderer.renderCrosshair(this.crosshair);
    }
  }

  private renderCrosshairFrame(): void {
    // A pending viewport frame owns the next full render. It reads the latest
    // crosshair value, so flushing here would turn rapid pan/zoom plus pointer
    // movement back into redundant synchronous full renders.
    if (this.viewportRenderFrame !== null) return;
    if (this.crosshair === null && this.baseFrame === null) return;
    if (this.baseFrame === null) this.captureBaseFrame();
    if (this.baseFrame !== null && this.baseFrameWidth === this.canvas.width && this.baseFrameHeight === this.canvas.height) {
      const context = this.canvas.getContext("2d");
      if (context !== null) {
        context.putImageData(this.baseFrame, 0, 0);
        this.renderer.renderCrosshair(this.crosshair);
        return;
      }
    }
    this.render();
  }

  private captureBaseFrame(): void {
    const context = this.canvas.getContext("2d");
    if (context === null || this.canvas.width <= 0 || this.canvas.height <= 0) {
      this.baseFrame = null;
      this.baseFrameWidth = 0;
      this.baseFrameHeight = 0;
      return;
    }
    try {
      this.baseFrame = context.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.baseFrameWidth = this.canvas.width;
      this.baseFrameHeight = this.canvas.height;
    } catch {
      // A non-readable rendering surface falls back to the normal full render.
      this.baseFrame = null;
      this.baseFrameWidth = 0;
      this.baseFrameHeight = 0;
    }
  }

  /** Coalesce high-frequency viewport changes while keeping model state synchronous. */
  private scheduleViewportRender(): void {
    if (this.destroyed || this.viewportRenderFrame !== null) return;
    if (typeof window === "undefined") {
      this.render();
      return;
    }
    const renderFrame = (): void => {
      this.viewportRenderFrame = null;
      if (!this.destroyed) this.render();
    };
    this.viewportRenderFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(renderFrame)
      : window.setTimeout(renderFrame, 0);
  }

  private cancelViewportRender(): void {
    if (this.viewportRenderFrame === null) return;
    if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(this.viewportRenderFrame);
    else if (typeof window !== "undefined") window.clearTimeout(this.viewportRenderFrame);
    this.viewportRenderFrame = null;
  }

  /** Keep the Canvas2D chart discoverable to assistive technology without exposing internal stores. */
  private updateCanvasAccessibility(data: VisibleChartData): void {
    if (data.times.length === 0) {
      this.canvas.setAttribute("aria-label", "Financial price chart; no data loaded");
      return;
    }
    const visibleSeries = data.series.filter((series) => series.style.visible !== false).length;
    const visiblePanes = data.panes.filter((pane) => pane.series.some((series) => series.style.visible !== false)).length;
    const unit = data.candles.length > 0 ? `${data.candles.length} visible bars` : `${data.times.length} visible time points`;
    const latest = data.candles.at(-1);
    const latestClose = latest === undefined
      ? ""
      : `; latest close ${latest.close.toLocaleString(this.locale, { maximumFractionDigits: this.pricePrecision })}`;
    this.canvas.setAttribute(
      "aria-label",
      `Financial price chart; ${unit}${latestClose}; ${visibleSeries} visible series; ${Math.max(1, visiblePanes)} panes`,
    );
  }

  private registerOverlay(definition: PluginOverlayDefinition): void {
    this.assertAlive();
    if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(definition.id)) {
      throw new Error(`Invalid plugin overlay id: ${definition.id}`);
    }
    if (this.overlays.has(definition.id)) throw new Error(`Plugin overlay already registered: ${definition.id}`);
    if (definition.title.trim().length === 0 || typeof definition.render !== "function") {
      throw new Error(`Invalid plugin overlay: ${definition.id}`);
    }
    this.overlays.set(definition.id, definition);
  }

  private unregisterOverlay(id: string): boolean {
    return this.overlays.delete(id);
  }

  private getCorporateActionOverlayItem(): PluginOverlayRenderItem | null {
    if (!this.corporateActionMarkersVisible || this.corporateActionDataset === null) return null;
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    if (context === null || context === undefined || pane === undefined) return null;
    const cutoff = this.model.getReplayCutoff();
    const visibleFrom = context.times[0] ?? 0;
    const visibleTo = context.times.at(-1) ?? 0;
    const commands: PluginRenderCommand[] = [];
    for (const action of this.corporateActionDataset.actions) {
      const eventTime = action.kind === "cash-dividend" ? action.exDividendTime : action.effectiveTime;
      if (cutoff !== null && eventTime > cutoff) continue;
      if (eventTime < visibleFrom || eventTime > visibleTo) continue;
      const x = context.xForTime(eventTime);
      const isDividend = action.kind === "cash-dividend";
      const color = isDividend ? "#f59e0b" : "#a855f7";
      const label = isDividend
        ? `DIV ${action.amountPerShare} ${action.currency}`
        : `${action.kind === "reverse-stock-split" ? "REV SPLIT" : "SPLIT"} ${action.newShares}:${action.oldShares}`;
      commands.push({ kind: "line", from: { x, y: pane.top }, to: { x, y: pane.bottom }, color, lineWidth: 1, alpha: 0.55, dash: [4, 3] });
      commands.push({ kind: "text", x: x + 3, y: pane.top + 12, text: label, color, font: "10px system-ui, sans-serif", alpha: 1 });
    }
    return { id: "openkline.corporate-actions", zIndex: 16, commands };
  }

  private getFootprintOverlayItem(): PluginOverlayRenderItem | null {
    if (!this.footprintDisplay.visible) return null;
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    if (context === null || context === undefined || pane === undefined) return null;
    const visibleFrom = context.times[0];
    const visibleLast = context.times.at(-1);
    if (visibleFrom === undefined || visibleLast === undefined) return null;
    const range = { from: visibleFrom, to: Math.min(Number.MAX_SAFE_INTEGER, visibleLast + 1) };
    const cutoff = this.model.getReplayCutoff();
    const key = [
      this.orderFlowRevision,
      cutoff === null ? "live" : cutoff,
      range.from,
      range.to,
      this.footprintDisplay.intervalMs,
      this.footprintDisplay.tickSize,
      this.footprintDisplay.offTickPolicy,
      this.footprintDisplay.maxCells,
      this.chartDataRevision,
      this.footprintDisplay.showLabels,
      this.footprintDisplay.opacity,
      this.footprintDisplay.buyColor,
      this.footprintDisplay.sellColor,
      this.footprintDisplay.unknownColor,
      this.direction,
      context.width,
      context.height,
      context.devicePixelRatio,
      pane.left,
      pane.right,
      pane.top,
      pane.bottom,
      pane.priceForY(pane.top),
      pane.priceForY(pane.bottom),
    ].join(":");
    const warning = (error: string): PluginOverlayRenderItem => ({
      id: "openkline.footprint-warning",
      zIndex: 18,
      commands: [{ kind: "text", x: pane.left + 8, y: pane.top + 8, text: `Footprint unavailable: ${error}`, color: this.footprintDisplay.unknownColor, font: "11px system-ui, sans-serif" }],
    });
    const cached = this.footprintRenderCache?.key === key ? this.footprintRenderCache : null;
    if (cached?.error !== undefined) return warning(cached.error);
    if (cached?.commands !== undefined) return { id: "openkline.footprint", zIndex: 18, commands: cached.commands };

    const renderTrades = this.getOrderFlowTradesForReplayRange(range.from, range.to);
    if (renderTrades.length > 5_000) {
      const lod = renderFootprintLod(context, pane, renderTrades, this.footprintDisplay);
      this.footprintRenderCache = lod.error === undefined
        ? { key, result: null, commands: lod.commands }
        : { key, result: null, error: lod.error };
      if (lod.error !== undefined) return warning(lod.error);
      return { id: "openkline.footprint", zIndex: 18, commands: lod.commands };
    }

    let result: FootprintResult;
    try {
      result = calculateFootprint(renderTrades, {
        ...range,
        intervalMs: this.footprintDisplay.intervalMs,
        tickSize: this.footprintDisplay.tickSize,
        offTickPolicy: this.footprintDisplay.offTickPolicy,
        maxCells: this.footprintDisplay.maxCells,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.footprintRenderCache = { key, result: null, error: message };
      return warning(message);
    }
    const commands: PluginRenderCommand[] = [];
    for (const bucket of result.buckets) {
      const left = Math.min(context.xForTime(bucket.start), context.xForTime(bucket.end));
      const right = Math.max(context.xForTime(bucket.start), context.xForTime(bucket.end));
      for (const cell of bucket.cells) {
        const top = Math.min(pane.yForPrice(cell.price + result.tickSize / 2), pane.yForPrice(cell.price - result.tickSize / 2));
        const bottom = Math.max(pane.yForPrice(cell.price + result.tickSize / 2), pane.yForPrice(cell.price - result.tickSize / 2));
        const fillColor = cell.unknownSideVolume > 0 && cell.buyVolume === 0 && cell.sellVolume === 0
          ? this.footprintDisplay.unknownColor
          : cell.delta >= 0 ? this.footprintDisplay.buyColor : this.footprintDisplay.sellColor;
        commands.push({ kind: "rectangle", left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), fillColor, color: fillColor, alpha: this.footprintDisplay.opacity, lineWidth: 0.5 });
        if (this.footprintDisplay.showLabels && right - left >= 20 && bottom - top >= 10) {
          commands.push({ kind: "text", x: left + 2, y: top + 1, text: formatOrderFlowQuantity(cell.totalVolume), color: this.footprintDisplay.unknownColor, font: "9px system-ui, sans-serif", alpha: 0.95 });
        }
      }
    }
    this.footprintRenderCache = { key, result, commands };
    return { id: "openkline.footprint", zIndex: 18, commands };
  }

  private getDepthOverlayItem(): PluginOverlayRenderItem | null {
    if (!this.depthDisplay.visible || this.orderBookController === null) return null;
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    if (context === null || context === undefined || pane === undefined) return null;
    const state = this.getDepthState();
    const metrics = this.getDepthMetrics();
    if (state === null || metrics === null) return null;
    const commands: PluginRenderCommand[] = [];
    if (metrics.quality !== "available") {
      commands.push({ kind: "text", x: pane.left + 8, y: pane.top + 24, text: `Depth ${metrics.quality}${metrics.reason === undefined ? "" : `: ${metrics.reason}`}`, color: this.depthDisplay.askColor, font: "11px system-ui, sans-serif" });
    } else {
      const levels = [...state.bids.slice(0, this.depthDisplay.maxLevels), ...state.asks.slice(0, this.depthDisplay.maxLevels)];
      const maxQuantity = Math.max(1, ...levels.map((level) => level.quantity));
      const barMax = Math.min(140, Math.max(40, (pane.right - pane.left) * 0.22));
      const drawLevels = (levelsToDraw: readonly { readonly price: number; readonly quantity: number }[], color: string, direction: 1 | -1): void => {
        levelsToDraw.forEach((level, index) => {
          const y = pane.yForPrice(level.price);
          const width = barMax * level.quantity / maxQuantity;
          const left = direction > 0 ? pane.right - width - 4 : pane.right - 4;
          commands.push({ kind: "rectangle", left, top: y - 2, width, height: 4, fillColor: color, color, alpha: this.depthDisplay.opacity, lineWidth: 0.5 });
          if (this.depthDisplay.showLabels && index < 3) commands.push({ kind: "text", x: left + (direction > 0 ? 2 : width + 4), y: y - 7, text: `${level.price} · ${formatOrderFlowQuantity(level.quantity)}`, color, font: "9px system-ui, sans-serif", alpha: 0.9 });
        });
      };
      drawLevels(state.bids, this.depthDisplay.bidColor, 1);
      drawLevels(state.asks, this.depthDisplay.askColor, -1);
      if (this.depthDisplay.showLabels) commands.push({ kind: "text", x: pane.left + 8, y: pane.top + 8, text: `Spread ${metrics.spread} · Imbalance ${(metrics.imbalance ?? 0).toFixed(3)}`, color: this.depthDisplay.bidColor, font: "11px system-ui, sans-serif" });
    }
    if (this.depthDisplay.showHeatmap && this.orderBookHeatmap !== null) {
      const visible = this.getVisibleOrderFlowRange([]);
      if (visible !== null) {
        const observations = this.orderBookHeatmap.getRange(visible.from, visible.to);
        const heatmapCommandBudget = 8_000;
        const levelsPerObservation = Math.max(1, Math.floor(heatmapCommandBudget / Math.max(1, observations.length)));
        for (const observation of observations) {
          const color = observation.side === "bid" ? this.depthDisplay.bidColor : this.depthDisplay.askColor;
          const x = context.xForTime(observation.time);
          if (!Number.isFinite(x) || x < pane.left || x > pane.right) continue;
          const levels = observation.levels.slice(0, this.depthDisplay.maxLevels);
          const stride = Math.max(1, Math.ceil(levels.length / levelsPerObservation));
          for (let levelIndex = 0; levelIndex < levels.length; levelIndex += stride) {
            const level = levels[levelIndex]!;
            const y = pane.yForPrice(level.price);
            if (!Number.isFinite(y) || y < pane.top || y > pane.bottom) continue;
            commands.push({ kind: "line", from: { x, y }, to: { x: Math.min(pane.right, x + 5), y }, color, lineWidth: Math.max(1, Math.min(4, level.quantity)), alpha: this.depthDisplay.opacity * 0.35 });
          }
        }
      }
    }
    return { id: "openkline.depth", zIndex: 19, commands };
  }

  private getPluginOverlayItems(): PluginOverlayRenderItem[] {
    const items: PluginOverlayRenderItem[] = [];
    const strategyMarkers = this.getStrategyMarkerOverlay();
    if (strategyMarkers !== null) items.push(strategyMarkers);
    const paperTradingMarkers = this.getPaperTradingMarkerOverlay();
    if (paperTradingMarkers !== null) items.push(paperTradingMarkers);
    const tradingCalendar = this.getTradingCalendarOverlayItem();
    if (tradingCalendar !== null) items.push(tradingCalendar);
    items.push(...this.getVolumeProfileOverlayItems());
    items.push(...this.getMultiTimeframeReferenceOverlayItems());
    items.push(...this.getSessionReferenceOverlayItems());
    const corporateActions = this.getCorporateActionOverlayItem();
    if (corporateActions !== null) items.push(corporateActions);
    const footprint = this.getFootprintOverlayItem();
    if (footprint !== null) items.push(footprint);
    const depth = this.getDepthOverlayItem();
    if (depth !== null) items.push(depth);
    if (this.overlays.size === 0) return items;
    const context = this.getPluginRenderContext();
    if (context === null) return items;
    items.push(...[...this.overlays.values()]
      .sort((left, right) => (left.zIndex ?? 0) - (right.zIndex ?? 0))
      .map((definition) => {
        try {
          return {
            id: definition.id,
            zIndex: definition.zIndex ?? 0,
            commands: normalizePluginCommands(definition.render(context)),
          };
        } catch (error) {
          // A faulty overlay must not take down chart rendering. The plugin can
          // still be uninstalled or corrected by the host application.
          console.error(`OpenKline plugin overlay failed: ${definition.id}`, error);
          return { id: definition.id, zIndex: definition.zIndex ?? 0, commands: [] };
        }
      }));
    return items;
  }

  private getTradingCalendarOverlayItem(): PluginOverlayRenderItem | null {
    if (this.tradingCalendar === null) return null;
    const context = this.getPluginRenderContext();
    if (context === null) return null;
    return renderTradingCalendarOverlay(this.tradingCalendar.calendar, this.tradingCalendar.display, context, this.locale);
  }

  private getVolumeProfileOverlayItems(): PluginOverlayRenderItem[] {
    const visibleProfiles = [...this.volumeProfiles.values()].filter((profile) => profile.options.visible);
    if (visibleProfiles.length === 0) return [];
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    if (context === null || context === undefined || pane === undefined) return [];
    return visibleProfiles.map((profile) => {
      const result = this.getVolumeProfileResult(profile);
      const options = profile.options;
      const width = options.width <= 1 ? (pane.right - pane.left) * options.width : Math.min(options.width, pane.right - pane.left);
      const left = options.position === "left" ? pane.left : pane.right - width;
      const right = left + width;
      const maxVolume = result.bins.reduce((maximum, bin) => Math.max(maximum, bin.estimatedVolume), 0);
      const commands: PluginRenderCommand[] = [];
      if (result.status === "empty") {
        if (options.showLabels) commands.push({ kind: "text", x: left + 4, y: pane.top + 4, text: "Estimated Volume Profile: no positive volume", color: options.color, font: "11px system-ui, sans-serif", alpha: options.opacity });
        return { id: `openkline.${profile.id}`, zIndex: 12, commands };
      }
      for (const bin of result.bins) {
        if (maxVolume <= 0 || bin.estimatedVolume <= 0) continue;
        const barWidth = width * (bin.estimatedVolume / maxVolume);
        const yTop = Math.min(pane.yForPrice(bin.upperBound), pane.yForPrice(bin.lowerBound));
        const yBottom = Math.max(pane.yForPrice(bin.upperBound), pane.yForPrice(bin.lowerBound));
        const inValueArea = result.valueArea !== null && bin.index >= result.valueArea.lowIndex && bin.index <= result.valueArea.highIndex;
        const barLeft = options.position === "left" ? left : right - barWidth;
        commands.push({
          kind: "rectangle",
          left: barLeft,
          top: yTop,
          width: Math.max(1, barWidth),
          height: Math.max(1, yBottom - yTop),
          fillColor: inValueArea && options.showValueArea ? options.valueAreaColor : options.color,
          color: inValueArea && options.showValueArea ? options.valueAreaColor : options.color,
          lineWidth: 1,
          alpha: options.opacity,
        });
      }
      if (options.showPoc && result.pointOfControl !== null) {
        const y = pane.yForPrice(result.pointOfControl.price);
        commands.push({ kind: "line", from: { x: left, y }, to: { x: right, y }, color: options.pocColor, lineWidth: 2, alpha: Math.min(1, options.opacity + 0.25) });
        if (options.showLabels) commands.push({ kind: "text", x: left + 4, y: y - 16, text: `Estimated POC ${result.pointOfControl.price.toPrecision(6)}`, color: options.pocColor, font: "11px system-ui, sans-serif", alpha: 1 });
      }
      if (options.showValueArea && result.valueArea !== null) {
        const lowY = pane.yForPrice(result.valueArea.low);
        const highY = pane.yForPrice(result.valueArea.high);
        commands.push({ kind: "line", from: { x: left, y: lowY }, to: { x: right, y: lowY }, color: options.valueAreaColor, lineWidth: 1, alpha: options.opacity });
        commands.push({ kind: "line", from: { x: left, y: highY }, to: { x: right, y: highY }, color: options.valueAreaColor, lineWidth: 1, alpha: options.opacity });
        if (options.showLabels) {
          commands.push({ kind: "text", x: left + 4, y: highY + 2, text: `Estimated VAH ${result.valueArea.high.toPrecision(6)}`, color: options.valueAreaColor, font: "11px system-ui, sans-serif", alpha: 1 });
          commands.push({ kind: "text", x: left + 4, y: lowY - 14, text: `Estimated VAL ${result.valueArea.low.toPrecision(6)}`, color: options.valueAreaColor, font: "11px system-ui, sans-serif", alpha: 1 });
        }
      }
      return { id: `openkline.${profile.id}`, zIndex: 12, commands };
    });
  }

  private getMultiTimeframeReferenceOverlayItems(): PluginOverlayRenderItem[] {
    const visibleReferences = [...this.multiTimeframeReferences.values()].filter((reference) => reference.visible);
    if (visibleReferences.length === 0) return [];
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    const visibleTimes = this.model.getVisibleData().times;
    if (context === null || context === undefined || pane === undefined || visibleTimes.length === 0) return [];
    const visibleFrom = visibleTimes[0]!;
    const visibleTo = visibleTimes.at(-1)! + 1;
    return visibleReferences.map((reference) => {
      const options = reference.options;
      const style = options.style ?? {};
      const mapped = mapMultiTimeframeReferenceToSourceTimes(reference.result, visibleTimes);
      const commands: PluginRenderCommand[] = [];
      const points = reference.result.points.filter((point) => point.availableAt !== null && Object.keys(point.levels).length > 0);
      points.forEach((point, index) => {
        const start = Math.max(visibleFrom, point.bucketStart);
        const end = Math.min(visibleTo, points[index + 1]?.bucketStart ?? visibleTo);
        if (end <= start) return;
        const fromX = context.xForTime(start);
        const toX = context.xForTime(end);
        for (const level of options.levels ?? ["open", "high", "low", "close"]) {
          const value = point.levels[level];
          if (value === undefined || !Number.isFinite(value)) continue;
          const dash = lineStyleDash(style.lineStyle);
          commands.push({
            kind: "line",
            from: { x: fromX, y: pane.yForPrice(value) },
            to: { x: toX, y: pane.yForPrice(value) },
            ...(style.color === undefined ? {} : { color: style.color }),
            ...(style.lineWidth === undefined ? {} : { lineWidth: style.lineWidth }),
            ...(style.alpha === undefined ? {} : { alpha: style.alpha }),
            ...(dash === undefined ? {} : { dash }),
          } as PluginRenderCommand);
        }
      });
      if (options.labels !== false) {
        const latest = mapped.at(-1);
        if (latest !== undefined) {
          for (const level of options.levels ?? ["open", "high", "low", "close"]) {
            const value = latest.levels[level];
            if (value === undefined || !Number.isFinite(value)) continue;
            commands.push({
              kind: "text",
              x: pane.right - 74,
              y: pane.yForPrice(value) - 7,
              text: `${options.labelPrefix ?? "Previous"} ${level.toUpperCase()}`,
              ...(style.color === undefined ? {} : { color: style.color }),
              font: "10px system-ui, sans-serif",
              ...(style.alpha === undefined ? {} : { alpha: style.alpha }),
            });
          }
        }
      }
      return { id: `openkline.${reference.id}`, zIndex: 13, commands };
    });
  }

  private getSessionReferenceOverlayItems(): PluginOverlayRenderItem[] {
    const visibleReferences = [...this.sessionReferences.values()].filter((reference) => reference.visible);
    if (visibleReferences.length === 0) return [];
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    const visibleTimes = this.model.getVisibleData().times;
    if (context === null || context === undefined || pane === undefined || visibleTimes.length === 0) return [];
    const visibleFrom = visibleTimes[0]!;
    const visibleTo = visibleTimes.at(-1)! + 1;
    return visibleReferences.map((reference) => {
      const options = reference.options;
      const style = options.style ?? {};
      const mapped = mapSessionReferenceToSourceTimes(reference.result, visibleTimes);
      const commands: PluginRenderCommand[] = [];
      const points = reference.result.points.filter((point) => point.availableAt !== null && Object.keys(point.levels).length > 0);
      points.forEach((point, index) => {
        const start = Math.max(visibleFrom, point.periodStart);
        const end = Math.min(visibleTo, points[index + 1]?.periodStart ?? visibleTo);
        if (end <= start) return;
        const fromX = context.xForTime(start);
        const toX = context.xForTime(end);
        for (const level of options.levels ?? ["open", "high", "low", "close"]) {
          const value = point.levels[level];
          if (value === undefined || !Number.isFinite(value)) continue;
          const dash = lineStyleDash(style.lineStyle);
          commands.push({
            kind: "line",
            from: { x: fromX, y: pane.yForPrice(value) },
            to: { x: toX, y: pane.yForPrice(value) },
            ...(style.color === undefined ? {} : { color: style.color }),
            ...(style.lineWidth === undefined ? {} : { lineWidth: style.lineWidth }),
            ...(style.alpha === undefined ? {} : { alpha: style.alpha }),
            ...(dash === undefined ? {} : { dash }),
          } as PluginRenderCommand);
        }
      });
      if (options.labels !== false) {
        const latest = mapped.at(-1);
        if (latest !== undefined) {
          for (const level of options.levels ?? ["open", "high", "low", "close"]) {
            const value = latest.levels[level];
            if (value === undefined || !Number.isFinite(value)) continue;
            commands.push({
              kind: "text",
              x: pane.right - 74,
              y: pane.yForPrice(value) - 7,
              text: `${options.labelPrefix ?? "Previous"} ${level.toUpperCase()}`,
              ...(style.color === undefined ? {} : { color: style.color }),
              font: "10px system-ui, sans-serif",
              ...(style.alpha === undefined ? {} : { alpha: style.alpha }),
            });
          }
        }
      }
      return { id: `openkline.${reference.id}`, zIndex: 14, commands };
    });
  }

  private getVolumeProfileResult(profile: ManagedVolumeProfile): EstimatedVolumeProfileResult {
    const visible = this.model.getVisibleData();
    const lastVisibleTime = visible.times.at(-1);
    const visibleFrom = visible.times[0] ?? 0;
    const visibleTo = lastVisibleTime === undefined
      ? 1
      : Math.min(Number.MAX_SAFE_INTEGER, Math.max(visibleFrom + 1, lastVisibleTime + 1));
    const range = profile.options.mode === "fixed" && profile.options.range !== undefined
      ? profile.options.range
      : { from: visibleFrom, to: visibleTo };
    const key = [
      this.volumeAnalyticsRevision,
      this.model.getReplayCutoff() ?? "none",
      profile.options.mode,
      range.from,
      range.to,
      profile.options.binCount,
      profile.options.allocation,
      profile.options.valueAreaPercentage,
    ].join(":");
    if (profile.cache?.key === key) return profile.cache.result;
    const result = calculateEstimatedVolumeProfile(this.model.allCandles, {
      from: range.from,
      to: range.to,
      binCount: profile.options.binCount,
      allocation: profile.options.allocation,
      valueAreaPercentage: profile.options.valueAreaPercentage,
    });
    profile.cache = { key, result };
    return result;
  }

  private invalidateVolumeAnalytics(): void {
    this.volumeAnalyticsRevision += 1;
    for (const profile of this.volumeProfiles.values()) profile.cache = undefined;
  }

  private clearVolumeProfiles(): void {
    this.volumeProfiles.clear();
    this.nextVolumeProfileId = 1;
    this.invalidateVolumeAnalytics();
  }

  private getStrategyMarkerOverlay(): PluginOverlayRenderItem | null {
    if (this.strategyMarkers.length === 0) return null;
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    if (context === null || context === undefined || pane === undefined) return null;
    return {
      id: "openkline.strategy-markers",
      zIndex: 20,
      commands: this.getStrategyMarkers().map((marker) => ({
        kind: "text" as const,
        x: context.xForTime(marker.time) - 7,
        y: pane.yForPrice(marker.price) - 8,
        text: marker.kind === "entry-signal" ? "▲" : marker.kind === "exit-signal" ? "▼" : marker.kind === "entry-fill" ? "◆" : "◇",
        font: "bold 14px system-ui, sans-serif",
        ...(marker.color === undefined ? {} : { color: marker.color }),
      })),
    };
  }

  private getPaperTradingMarkerOverlay(): PluginOverlayRenderItem | null {
    if (this.paperTradingMarkers.length === 0) return null;
    const context = this.getPluginRenderContext();
    const pane = context?.pane("main");
    if (context === null || context === undefined || pane === undefined) return null;
    return {
      id: "openkline.paper-trading-markers",
      zIndex: 21,
      commands: this.getPaperTradingMarkers().map((marker) => ({
        kind: "text" as const,
        x: context.xForTime(marker.time) - 7,
        y: pane.yForPrice(marker.price) - 8,
        text: marker.kind === "entry-fill" ? "◆" : "◇",
        font: "bold 14px system-ui, sans-serif",
        color: marker.color ?? "#fbbf24",
      })),
    };
  }

  private getPluginRenderContext(): PluginRenderContext | null {
    const data = this.model.getVisibleData();
    if (data.times.length === 0) return null;
    const paneBounds = getPaneBounds(this.width, this.height, data.panes);
    const firstPane = paneBounds[0];
    if (firstPane === undefined) return null;
    const timeScale = new TimeScale(data.times, { start: firstPane.left, end: firstPane.right }, this.direction);
    const paneContexts = new Map<string, PluginPaneRenderContext>();
    for (const pane of paneBounds) {
      const paneData = data.panes.find((candidate) => candidate.id === pane.id);
      const priceScale = createPanePriceScale(
        paneData?.series ?? [],
        pane,
        pane.id === "main" ? this.getResolvedPriceScaleConfiguration() : undefined,
      );
      paneContexts.set(pane.id, {
        ...pane,
        xForTime: (time) => timeScale.xForTime(time),
        timeForX: (x) => timeScale.timeForX(x),
        yForPrice: (price) => priceScale.yForPrice(price),
        priceForY: (y) => priceScale.priceForY(y),
      });
    }
    return {
      width: this.width,
      height: this.height,
      devicePixelRatio: this.devicePixelRatio,
      theme: { ...this.theme },
      series: data.series.map((series) => ({
        id: series.id,
        type: series.type,
        paneId: series.paneId,
        ...(series.title === undefined ? {} : { title: series.title }),
        style: { ...series.style },
        data: series.data.map((point) => ({ ...point })),
      })),
      panes: paneBounds.map(({ id, left, right, top, bottom }) => ({ id, left, right, top, bottom })),
      times: [...data.times],
      xForTime: (time) => timeScale.xForTime(time),
      timeForX: (x) => timeScale.timeForX(x),
      pane: (id) => paneContexts.get(id ?? "main"),
    };
  }

  private getDrawingContext(): { bounds: { left: number; right: number; top: number; bottom: number }; converter: DrawingCoordinateConverter } | null {
    const context = this.getPrimaryScaleContext();
    if (context === null) return null;
    return {
      bounds: context.bounds,
      converter: {
        xForTime: (time) => context.timeScale.xForTime(time),
        yForPrice: (price) => context.scale.yForPrice(price),
        timeForX: (x) => context.timeScale.timeForX(x),
        priceForY: (y) => context.scale.priceForY(y),
      },
    };
  }

  private updatePriceScaleOptions(options: PriceScaleOptions): void {
    const base: PriceScaleOptions = {
      mode: this.priceScale.mode,
      autoScale: this.priceScale.autoScale,
      ...(this.priceScale.referencePrice === undefined ? {} : { referencePrice: this.priceScale.referencePrice }),
      marginTop: this.priceScale.marginTop,
      marginBottom: this.priceScale.marginBottom,
      axisVisible: this.priceScale.axisVisible,
      ...options,
    };
    const normalized = normalizePriceScaleOptions(base);
    const autoScale = normalized.autoScale;
    const existingRange = this.priceScale.range;
    const range = autoScale
      ? undefined
      : existingRange ?? this.getCurrentPrimaryRange();
    this.priceScale = {
      ...normalized,
      ...(range === undefined ? {} : { range }),
    };
  }

  private getCurrentPrimaryRange(): PriceScaleRange | undefined {
    const data = this.model.getVisibleData();
    const main = data.panes.find((pane) => pane.id === "main") ?? data.panes[0];
    return main === undefined || main.series.length === 0
      ? undefined
      : getPaneScaleRange(main.series);
  }

  private getResolvedPriceScaleConfiguration(): PriceScaleConfiguration {
    if (this.priceScale.referencePrice !== undefined || (this.priceScale.mode !== "percentage" && this.priceScale.mode !== "indexed")) {
      return this.priceScale;
    }
    const referencePrice = this.model.allCandles.find((candle) => candle.close > 0)?.close;
    return {
      ...this.priceScale,
      ...(referencePrice === undefined ? {} : { referencePrice }),
    };
  }

  private getPrimaryScaleContext(): { bounds: { left: number; right: number; top: number; bottom: number }; timeScale: TimeScale; scale: import("./core/scales.js").PriceScale } | null {
    const data = this.model.getVisibleData();
    if (data.times.length === 0) return null;
    const paneBounds = getPaneBounds(this.width, this.height, data.panes);
    const bounds = paneBounds.find((pane) => pane.id === "main") ?? paneBounds[0];
    if (bounds === undefined) return null;
    const series = data.panes.find((pane) => pane.id === bounds.id)?.series ?? data.series;
    return {
      bounds,
      timeScale: new TimeScale(data.times, { start: bounds.left, end: bounds.right }, this.direction),
      scale: createPanePriceScale(series, bounds, this.getResolvedPriceScaleConfiguration()),
    };
  }

  private replaceRawCandles(candles: readonly Candle[]): void {
    this.model.setData(candles);
    // Keep the executable source separate from the model snapshot, but do not
    // read the model back here. `model.allCandles` is a defensive snapshot and
    // would turn every full replacement into a second full-history clone.
    this.rawCandles = candles.map((candle) => ({ ...candle }));
    this.applyCorporateActionDisplay(false);
  }

  private updateRawCandle(candle: Candle): void {
    if (this.corporateActionDataset === null || this.corporateActionMode === "raw") {
      this.model.update(candle);
      // CandleStore already performs the validated update. Update the
      // canonical source with the same timestamp semantics instead of asking
      // the model for an O(N) defensive snapshot on every realtime tick.
      upsertRawCandleInPlace(this.rawCandles, candle);
      return;
    }
    if (this.corporateActionMode === "split-adjusted" && this.tryUpdateSplitAdjustedCandle(candle)) return;
    const next = [...this.rawCandles];
    upsertRawCandleInPlace(next, candle);
    this.model.setData(next);
    this.rawCandles = next;
    this.applyCorporateActionDisplay(false);
  }

  private tryUpdateSplitAdjustedCandle(candle: Candle): boolean {
    if (this.corporateActionDataset === null || this.corporateActionMode !== "split-adjusted") return false;
    const adjustment = adjustCorporateActionData([candle], this.corporateActionDataset, {
      mode: "split-adjusted",
      context: this.corporateActionContext,
      ...(this.corporateActionAsOfTime === undefined ? {} : { asOfTime: this.corporateActionAsOfTime }),
      ...(this.corporateActionSourceDurationMs === undefined ? {} : { sourceDurationMs: this.corporateActionSourceDurationMs }),
      volumePolicy: this.corporateActionVolumePolicy,
    });
    const adjusted = adjustment.candles?.[0];
    upsertRawCandleInPlace(this.rawCandles, candle);
    // A candle beyond a fixed causal completion frontier is retained in the
    // raw source but must not enter the displayed model yet.
    if (adjusted !== undefined) this.model.update(adjusted);
    return true;
  }

  private computeCorporateActionAdjustment(): CorporateActionAdjustmentResult | null {
    if (this.corporateActionDataset === null) return null;
    const replayActive = this.isReplayActive() && this.replayRawSource !== null;
    const replayCutoff = replayActive ? this.model.getReplayCutoff() : null;
    const replaySource = replayActive ? this.replayRawSource! : this.rawCandles;
    const replayAsOfTime: number = replayCutoff === Number.NEGATIVE_INFINITY
      ? Math.max(0, (replaySource[0]?.time ?? 0) - 1)
      : replayCutoff ?? 0;
    return adjustCorporateActionData(replaySource, this.corporateActionDataset, {
      mode: this.corporateActionMode,
      context: replayActive ? "causal-as-of" : this.corporateActionContext,
      ...(replayActive
        ? { asOfTime: replayAsOfTime }
        : this.corporateActionAsOfTime === undefined ? {} : { asOfTime: this.corporateActionAsOfTime }),
      ...(this.corporateActionSourceDurationMs === undefined ? {} : { sourceDurationMs: this.corporateActionSourceDurationMs }),
      volumePolicy: this.corporateActionVolumePolicy,
    });
  }

  private createCorporateActionWorkspaceReference(dataset: CorporateActionDataset): WorkspaceCorporateActions {
    return {
      instrumentId: dataset.instrumentId,
      sourceId: dataset.source.id,
      sourceVersion: dataset.source.version,
      mode: this.corporateActionMode,
      context: this.corporateActionContext,
      asOfTime: this.corporateActionAsOfTime ?? null,
      ...(this.corporateActionSourceDurationMs === undefined ? {} : { sourceDurationMs: this.corporateActionSourceDurationMs }),
      volumePolicy: this.corporateActionVolumePolicy,
      markersVisible: this.corporateActionMarkersVisible,
    };
  }

  private updateCorporateActionWorkspaceReference(): void {
    if (this.corporateActionDataset !== null) this.corporateActionWorkspaceReference = this.createCorporateActionWorkspaceReference(this.corporateActionDataset);
    else if (this.corporateActionWorkspaceReference !== null) {
      const next = { ...this.corporateActionWorkspaceReference };
      delete next.sourceDurationMs;
      this.corporateActionWorkspaceReference = {
      ...next,
      mode: this.corporateActionMode,
      context: this.corporateActionContext,
      asOfTime: this.corporateActionAsOfTime ?? null,
      ...(this.corporateActionSourceDurationMs === undefined ? {} : { sourceDurationMs: this.corporateActionSourceDurationMs }),
      volumePolicy: this.corporateActionVolumePolicy,
      markersVisible: this.corporateActionMarkersVisible,
      };
    }
  }

  private getCorporateActionWorkspaceReference(): WorkspaceCorporateActions | null {
    this.updateCorporateActionWorkspaceReference();
    return this.corporateActionWorkspaceReference === null ? null : { ...this.corporateActionWorkspaceReference };
  }

  private updateOrderFlowWorkspaceReference(): void {
    const depth = this.orderBookController?.getState(this.depthDisplay.maxLevels);
    const tradeSource = this.marketTradeSourceReference ?? this.orderFlowWorkspaceReference?.tradeSource;
    const hasRuntime = tradeSource !== undefined || depth !== undefined || this.footprintDisplay.visible || this.cvdDisplay.visible || this.depthDisplay.visible;
    if (!hasRuntime && this.orderFlowWorkspaceReference === null) return;
    const orderBookSource = depth?.source === null || depth === undefined ? this.orderFlowWorkspaceReference?.orderBookSource : {
      instrumentId: depth.instrumentId ?? "unknown",
      sourceId: depth.source.id,
      sourceVersion: depth.source.version,
      ...(depth.venueId === null ? {} : { venueId: depth.venueId }),
    };
    this.orderFlowWorkspaceReference = {
      ...(tradeSource === undefined ? {} : { tradeSource }),
      ...(orderBookSource === undefined ? {} : { orderBookSource }),
      footprint: { ...this.footprintDisplay },
      cvd: {
        visible: this.cvdDisplay.visible,
        intervalMs: this.cvdDisplay.intervalMs,
        reset: this.cvdDisplay.reset,
        paneId: this.cvdPaneId ?? this.cvdDisplay.pane,
        color: this.cvdDisplay.color,
        lineWidth: this.cvdDisplay.lineWidth,
        baselineColor: this.cvdDisplay.baselineColor,
        sourceCoverage: this.cvdDisplay.sourceCoverage,
      },
      depth: { ...this.depthDisplay },
    };
  }

  private getOrderFlowWorkspaceReference(): WorkspaceOrderFlow | null {
    this.updateOrderFlowWorkspaceReference();
    if (this.orderFlowWorkspaceReference === null) return null;
    return {
      ...(this.orderFlowWorkspaceReference.tradeSource === undefined ? {} : { tradeSource: { ...this.orderFlowWorkspaceReference.tradeSource } }),
      ...(this.orderFlowWorkspaceReference.orderBookSource === undefined ? {} : { orderBookSource: { ...this.orderFlowWorkspaceReference.orderBookSource } }),
      ...(this.orderFlowWorkspaceReference.footprint === undefined ? {} : { footprint: { ...this.orderFlowWorkspaceReference.footprint } }),
      ...(this.orderFlowWorkspaceReference.cvd === undefined ? {} : { cvd: { ...this.orderFlowWorkspaceReference.cvd } }),
      ...(this.orderFlowWorkspaceReference.depth === undefined ? {} : { depth: { ...this.orderFlowWorkspaceReference.depth } }),
    };
  }

  private restoreOrderFlowRuntime(
    persisted: WorkspaceOrderFlow | undefined,
    attachedTrades: MarketTradeDataset | null,
    attachedOrderBook: OrderBookController | null,
    attachedReference: WorkspaceOrderFlow | null,
  ): void {
    if (persisted === undefined) {
      this.stopMarketTradeSource();
      this.stopOrderBookSource();
      this.marketTradeStore.dispose();
      this.marketTradeStore = new MarketTradeStore({ maxTrades: 1_000_000 });
      this.latestMarketTrade = null;
      this.marketTradeSourceReference = null;
      this.resetCvdCalculator();
      attachedOrderBook?.dispose();
      this.orderBookController = null;
      this.orderBookHeatmap?.dispose();
      this.orderBookHeatmap = null;
      this.orderFlowWorkspaceReference = null;
      this.footprintDisplay = { ...DEFAULT_FOOTPRINT_DISPLAY };
      this.cvdDisplay = { ...DEFAULT_CVD_DISPLAY };
      this.depthDisplay = { ...DEFAULT_DEPTH_DISPLAY };
      return;
    }
    const footprint = persisted.footprint;
    const cvd = persisted.cvd;
    const depth = persisted.depth;
    if (footprint !== undefined) this.footprintDisplay = normalizeFootprintDisplay(footprint);
    if (cvd !== undefined) this.cvdDisplay = normalizeCvdDisplay({ ...cvd, pane: cvd.paneId });
    if (depth !== undefined) this.depthDisplay = normalizeDepthDisplay(depth);
    this.orderFlowWorkspaceReference = {
      ...(persisted.tradeSource === undefined ? {} : { tradeSource: { ...persisted.tradeSource } }),
      ...(persisted.orderBookSource === undefined ? {} : { orderBookSource: { ...persisted.orderBookSource } }),
      ...(persisted.footprint === undefined ? {} : { footprint: { ...persisted.footprint } }),
      ...(persisted.cvd === undefined ? {} : { cvd: { ...persisted.cvd } }),
      ...(persisted.depth === undefined ? {} : { depth: { ...persisted.depth } }),
    };
    const tradeMatches = attachedTrades !== null
      && persisted.tradeSource !== undefined
      && attachedTrades.instrumentId === persisted.tradeSource.instrumentId
      && attachedTrades.source.id === persisted.tradeSource.sourceId
      && attachedTrades.source.version === persisted.tradeSource.sourceVersion
      && (persisted.tradeSource.venueId === undefined || attachedTrades.venueId === persisted.tradeSource.venueId);
    if (tradeMatches && attachedTrades !== null) {
      const next = new MarketTradeStore({ maxTrades: 1_000_000 });
      next.setData(attachedTrades);
      this.marketTradeStore.dispose();
      this.marketTradeStore = next;
      this.latestMarketTrade = next.getAll().at(-1) ?? null;
      const first = attachedTrades.trades[0];
      this.marketTradeSourceReference = first === undefined
        ? {
          instrumentId: attachedTrades.instrumentId,
          sourceId: attachedTrades.source.id,
          sourceVersion: attachedTrades.source.version,
          ...(attachedTrades.venueId === undefined ? {} : { venueId: attachedTrades.venueId }),
        }
        : createChartTradeSourceReference(first);
      this.resetCvdCalculator();
    } else {
      this.stopMarketTradeSource();
      this.marketTradeStore.dispose();
      this.marketTradeStore = new MarketTradeStore({ maxTrades: 1_000_000 });
      this.latestMarketTrade = null;
      this.marketTradeSourceReference = null;
      this.resetCvdCalculator();
      if (persisted.tradeSource !== undefined && attachedReference?.tradeSource !== undefined) {
        console.warn(`OpenKline trade source is unresolved: ${persisted.tradeSource.sourceId}@${persisted.tradeSource.sourceVersion}`);
      }
    }
    const depthState = attachedOrderBook?.getState(this.depthDisplay.maxLevels);
    const bookMatches = attachedOrderBook !== null
      && persisted.orderBookSource !== undefined
      && depthState?.source !== null
      && depthState?.instrumentId === persisted.orderBookSource.instrumentId
      && depthState.source.id === persisted.orderBookSource.sourceId
      && depthState.source.version === persisted.orderBookSource.sourceVersion
      && (persisted.orderBookSource.venueId === undefined || depthState.venueId === persisted.orderBookSource.venueId);
    if (bookMatches && attachedOrderBook !== null) {
      this.orderBookController = attachedOrderBook;
      this.orderBookHeatmap ??= new OrderBookHeatmapStore({ maxObservations: this.depthDisplay.maxHistory, maxLevels: this.depthDisplay.maxLevels });
    } else {
      this.stopOrderBookSource();
      attachedOrderBook?.dispose();
      this.orderBookController = null;
      this.orderBookHeatmap?.dispose();
      this.orderBookHeatmap = null;
      if (persisted.orderBookSource !== undefined) console.warn(`OpenKline order-book source is unresolved: ${persisted.orderBookSource.sourceId}@${persisted.orderBookSource.sourceVersion}`);
    }
    if (this.cvdDisplay.visible) this.ensureCvdSeries();
    this.refreshCvdSeries();
  }

  private applyCorporateActionDisplay(refresh = true): void {
    const adjustment = this.computeCorporateActionAdjustment();
    if (adjustment?.candles !== null && adjustment?.candles !== undefined) this.model.setData(adjustment.candles);
    else this.model.setData(this.rawCandles);
    this.chartDataRevision += 1;
    this.invalidateVolumeAnalytics();
    if (refresh) {
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();
      this.render();
    }
  }

  private createSeriesApi<T extends SeriesPoint>(type: SeriesType, options: SeriesOptions): SeriesApi<T> {
    this.assertAlive();
    this.assertReplayStructureMutationAllowed();
    const id = this.model.addSeries(type, options);
    return {
      id,
      type,
      setData: (data) => {
        this.assertAlive();
        this.assertReplayDataMutationAllowed();
        const primaryCandleSeries = this.model.isPrimaryCandleSeries(id);
        if (primaryCandleSeries) this.replaceRawCandles(data as readonly Candle[]);
        else this.model.setSeriesData(id, data as SeriesData);
        this.chartDataRevision += 1;
        if (this.model.isPrimaryCandleSeries(id)) this.invalidateVolumeAnalytics();
        if (this.model.isPrimaryCandleSeries(id)) {
          this.refreshIndicatorsFromInput();
          this.refreshMultiTimeframe();
          this.refreshSessionAnalysisFromInput();
          this.resetLiveAlerts((data.at(-1) as Candle | undefined));
        }
        this.emit("dataUpdated", { kind: "set", time: data.at(-1)?.time ?? null, appendOnly: false });
        this.render();
      },
      update: (point) => {
        this.assertAlive();
        this.assertReplayDataMutationAllowed();
        const primaryCandleSeries = isCandleSeriesType(type) && this.model.isPrimaryCandleSeries(id);
        const lastTime = primaryCandleSeries ? this.rawCandles.at(-1)?.time : undefined;
        const appendOnly = primaryCandleSeries && (lastTime === undefined || point.time > lastTime);
        if (primaryCandleSeries) this.updateRawCandle(point as Candle);
        else this.model.updateSeries(id, point);
        this.chartDataRevision += 1;
        if (primaryCandleSeries) this.invalidateVolumeAnalytics();
        if (primaryCandleSeries) {
          const adjustedView = this.corporateActionDataset !== null && this.corporateActionMode !== "raw";
          if (adjustedView) {
            // The raw point is the executable source, but adjusted views use
            // the displayed domain as their analytical input. A primary
            // SeriesApi update must therefore follow the same rebuild path as
            // Chart.update() rather than feeding a raw point incrementally.
            this.refreshIndicatorsFromInput();
            this.refreshMultiTimeframe();
            this.refreshSessionAnalysisFromInput();
            this.refreshWorkerIndicatorsFromInput();
            this.evaluateLiveAlerts(this.model.allCandles.at(-1) ?? point as Candle, appendOnly ? "append" : "correction");
          } else {
            this.refreshIndicatorsFromUpdate(point as Candle, appendOnly);
            this.refreshMultiTimeframe();
            this.refreshSessionAnalysisFromUpdate(point as Candle);
            this.refreshWorkerIndicatorsFromUpdate(point as Candle);
            this.evaluateLiveAlerts(point as Candle, appendOnly ? "append" : "correction");
          }
        }
        this.emit("dataUpdated", { kind: "update", time: point.time, appendOnly });
        this.render();
      },
      getData: () => {
        this.assertAlive();
        return this.model.getSeries(id).data as T[];
      },
      setStyle: (style) => {
        this.assertAlive();
        this.model.setSeriesStyle(id, style);
        this.render();
      },
      remove: () => {
        this.removeSeries(id);
      },
    };
  }

  private nextIndicatorIdValue(): string {
    let id = `indicator-${this.nextIndicatorId++}`;
    while (this.indicators.has(id)) id = `indicator-${this.nextIndicatorId++}`;
    return id;
  }

  private wrapMultiTimeframeIndicatorApi(state: ManagedMultiTimeframeIndicator): MultiTimeframeIndicatorApi {
    return {
      id: state.id,
      indicatorId: state.indicatorId,
      paneId: state.paneId,
      getOptions: () => ({
        ...state.options,
        parameters: { ...(state.options.parameters ?? {}) },
        outputStyles: cloneSeriesStyles(state.outputStyles),
        visible: state.visible,
      }),
      getResult: () => cloneMultiTimeframeIndicatorResult(state.result),
      setParameters: (parameters) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        state.options = { ...state.options, parameters: { ...parameters } };
        this.syncMultiTimeframeIndicator(state);
        this.emit("indicatorChange", { action: "update", id: state.id, indicatorId: state.indicatorId });
        this.render();
      },
      setOutputStyle: (outputId, style) => {
        this.assertAlive();
        const outputIndex = state.result.outputs.findIndex((output) => output.id === outputId);
        const seriesId = outputIndex < 0 ? undefined : state.outputSeriesIds[outputIndex];
        if (seriesId === undefined) throw new Error(`Unknown multi-timeframe indicator output: ${state.indicatorId}:${outputId}`);
        state.outputStyles[outputId] = { ...(state.outputStyles[outputId] ?? {}), ...style };
        this.model.setSeriesStyle(seriesId, { ...state.outputStyles[outputId], visible: state.visible && (state.outputStyles[outputId]?.visible ?? true) });
        this.render();
      },
      setVisible: (visible) => {
        this.assertAlive();
        state.visible = visible;
        state.options = { ...state.options, visible };
        for (const [index, seriesId] of state.outputSeriesIds.entries()) {
          const output = state.result.outputs[index];
          if (output !== undefined) this.model.setSeriesStyle(seriesId, { ...(state.outputStyles[output.id] ?? {}), visible: visible && (state.outputStyles[output.id]?.visible ?? true) });
        }
        this.render();
      },
      remove: () => {
        this.assertAlive();
        this.removeMultiTimeframeIndicator(state.id);
      },
    };
  }

  private wrapTradingCalendarApi(state: ManagedTradingCalendar): TradingCalendarApi {
    return {
      calendarId: state.calendar.definition.id,
      version: state.calendar.definition.version,
      timeZone: state.calendar.timeZone,
      getSnapshot: () => ({ ...state.calendar.snapshot() }),
      getDisplayOptions: () => ({ ...state.display }),
      setDisplayOptions: (patch) => {
        this.assertAlive();
        if (this.tradingCalendar !== state) return;
        state.display = resolveTradingCalendarDisplayOptions({ ...state.display, ...patch });
        this.render();
      },
      setVisible: (visible) => {
        this.assertAlive();
        if (this.tradingCalendar !== state) return;
        state.display = resolveTradingCalendarDisplayOptions({ ...state.display, visible });
        this.render();
      },
      remove: () => {
        this.assertAlive();
        if (this.tradingCalendar === state) this.removeTradingCalendar();
      },
    };
  }

  private wrapSessionIndicatorApi(state: ManagedSessionIndicator): SessionIndicatorApi {
    return {
      id: state.id,
      indicatorId: state.indicatorId,
      paneId: state.paneId,
      getOptions: () => ({
        ...state.options,
        parameters: { ...(state.options.parameters ?? {}) },
        outputStyles: cloneSeriesStyles(state.outputStyles),
        visible: state.visible,
      }),
      getResult: () => {
        state.result = state.runtime.getResult();
        return cloneSessionIndicatorResult(state.result);
      },
      setParameters: (parameters) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        state.options = { ...state.options, parameters: { ...parameters } };
        const candles = this.model.allCandles;
        state.result = state.runtime.setOptions(state.options, candles, this.resolveSessionAsOf(state.options, candles));
        this.syncSessionIndicator(state);
        this.emit("indicatorChange", { action: "update", id: state.id, indicatorId: state.indicatorId });
        this.render();
      },
      setOutputStyle: (outputId, style) => {
        this.assertAlive();
        const outputIndex = state.result.outputs.findIndex((output) => output.id === outputId);
        const seriesId = outputIndex < 0 ? undefined : state.outputSeriesIds[outputIndex];
        if (seriesId === undefined) throw new Error(`Unknown session indicator output: ${state.indicatorId}:${outputId}`);
        state.outputStyles[outputId] = { ...(state.outputStyles[outputId] ?? {}), ...style };
        this.model.setSeriesStyle(seriesId, { ...state.outputStyles[outputId], visible: state.visible && (state.outputStyles[outputId]?.visible ?? true) });
        this.render();
      },
      setVisible: (visible) => {
        this.assertAlive();
        state.visible = visible;
        state.options = { ...state.options, visible };
        for (const [index, seriesId] of state.outputSeriesIds.entries()) {
          const output = state.result.outputs[index];
          if (output !== undefined) this.model.setSeriesStyle(seriesId, { ...(state.outputStyles[output.id] ?? {}), visible: visible && (state.outputStyles[output.id]?.visible ?? true) });
        }
        this.render();
      },
      remove: () => {
        this.assertAlive();
        this.removeSessionIndicator(state.id);
      },
    };
  }

  private wrapSessionReferenceApi(state: ManagedSessionReference): SessionReferenceApi {
    return {
      id: state.id,
      getOptions: () => ({
        ...state.options,
        levels: [...(state.options.levels ?? [])],
        style: { ...(state.options.style ?? {}) },
        visible: state.visible,
      }),
      getResult: () => {
        state.result = state.runtime.getResult();
        return cloneSessionReferenceResult(state.result);
      },
      setOptions: (patch) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        state.options = { ...state.options, ...patch, id: state.id };
        state.visible = state.options.visible ?? state.visible;
        const candles = this.model.allCandles;
        state.result = state.runtime.setOptions(state.options, candles, this.resolveSessionAsOf(state.options, candles));
        this.syncSessionReference(state);
        this.render();
      },
      setVisible: (visible) => {
        this.assertAlive();
        state.visible = visible;
        state.options = { ...state.options, visible };
        this.render();
      },
      remove: () => {
        this.assertAlive();
        this.removeSessionReference(state.id);
      },
    };
  }

  private wrapMultiTimeframeReferenceApi(state: ManagedMultiTimeframeReference): MultiTimeframeReferenceApi {
    return {
      id: state.id,
      getOptions: () => ({
        ...state.options,
        levels: [...(state.options.levels ?? [])],
        style: { ...(state.options.style ?? {}) },
        visible: state.visible,
      }),
      getResult: () => cloneMultiTimeframeReferenceResult(state.result),
      setOptions: (patch) => {
        this.assertAlive();
        this.assertReplayStructureMutationAllowed();
        state.options = { ...state.options, ...patch, id: state.id };
        state.visible = state.options.visible ?? state.visible;
        this.syncMultiTimeframeReference(state);
        this.render();
      },
      setVisible: (visible) => {
        this.assertAlive();
        state.visible = visible;
        state.options = { ...state.options, visible };
        this.render();
      },
      remove: () => {
        this.assertAlive();
        this.removeMultiTimeframeReference(state.id);
      },
    };
  }

  private removeMultiTimeframeIndicator(id: string): void {
    const state = this.multiTimeframeIndicators.get(id);
    if (state === undefined) return;
    for (const seriesId of state.outputSeriesIds) if (this.model.getSeriesIds().includes(seriesId)) this.model.removeSeries(seriesId);
    this.multiTimeframeIndicators.delete(id);
    this.emit("indicatorChange", { action: "remove", id, indicatorId: state.indicatorId });
    this.render();
  }

  private removeMultiTimeframeReference(id: string): void {
    if (!this.multiTimeframeReferences.delete(id)) return;
    this.render();
  }

  private removeSessionIndicator(id: string): void {
    const state = this.sessionIndicators.get(id);
    if (state === undefined) return;
    for (const seriesId of state.outputSeriesIds) if (this.model.getSeriesIds().includes(seriesId)) this.model.removeSeries(seriesId);
    state.runtime.dispose();
    this.sessionIndicators.delete(id);
    this.emit("indicatorChange", { action: "remove", id, indicatorId: state.indicatorId });
    this.render();
  }

  private removeSessionReference(id: string): void {
    const state = this.sessionReferences.get(id);
    if (state === undefined) return;
    state.runtime.dispose();
    this.sessionReferences.delete(id);
    this.render();
  }

  private syncMultiTimeframeIndicator(state: ManagedMultiTimeframeIndicator): void {
    const candles = this.model.allCandles;
    const asOfTime = this.resolveMultiTimeframeAsOf(state.options, candles);
    state.result = calculateMultiTimeframeIndicator(candles, {
      ...state.options,
      ...(asOfTime === undefined ? {} : { asOfTime }),
    }, this.indicatorRegistry);
    for (const [index, output] of state.result.outputs.entries()) {
      const seriesId = state.outputSeriesIds[index];
      if (seriesId === undefined) continue;
      const points = mapMultiTimeframeIndicatorToSourceTimes(state.result, candles.map((candle) => candle.time), output.id)
        .filter((point) => point.value !== null && point.availableAt !== null)
        .map((point) => ({ time: point.time, value: point.value! }));
      this.model.setSeriesData(seriesId, points);
      this.model.setSeriesStyle(seriesId, { ...(state.outputStyles[output.id] ?? {}), visible: state.visible && (state.outputStyles[output.id]?.visible ?? true) });
    }
  }

  private syncSessionIndicator(state: ManagedSessionIndicator): void {
    state.result = state.runtime.getResult();
    this.applySessionIndicatorResult(state);
  }

  private applySessionIndicatorResult(state: ManagedSessionIndicator): void {
    const sourceTimes = this.model.allCandles.map((candle) => candle.time);
    for (const [index, output] of state.result.outputs.entries()) {
      const seriesId = state.outputSeriesIds[index];
      if (seriesId === undefined) continue;
      const points = mapSessionIndicatorToSourceTimes(state.result, sourceTimes, output.id)
        .filter((point) => point.value !== null && point.availableAt !== null)
        .map((point) => ({ time: point.time, value: point.value! }));
      this.model.setSeriesData(seriesId, points);
      this.model.setSeriesStyle(seriesId, { ...(state.outputStyles[output.id] ?? {}), visible: state.visible && (state.outputStyles[output.id]?.visible ?? true) });
    }
  }

  private syncMultiTimeframeReference(state: ManagedMultiTimeframeReference): void {
    const candles = this.model.allCandles;
    const asOfTime = this.resolveMultiTimeframeAsOf(state.options, candles);
    state.result = calculatePreviousTimeframeLevels(candles, {
      ...state.options,
      ...(asOfTime === undefined ? {} : { asOfTime }),
    });
  }

  private syncSessionReference(state: ManagedSessionReference): void {
    state.result = state.runtime.getResult();
  }

  /** Resolve a safe chart frontier without allowing replay to see beyond its cursor. */
  private resolveMultiTimeframeAsOf(options: MultiTimeframeAggregationOptions, candles: readonly Candle[]): number | undefined {
    const requested = options.asOfTime;
    const latestTime = candles.at(-1)?.time;
    if (this.model.getReplayCutoff() !== null && latestTime !== undefined) {
      return requested === undefined ? latestTime : Math.min(requested, latestTime);
    }
    return requested ?? latestTime;
  }

  /** Resolve a safe session-analysis frontier without allowing replay lookahead. */
  private resolveSessionAsOf(options: { readonly asOfTime?: number }, candles: readonly Candle[]): number | undefined {
    const requested = options.asOfTime;
    const latestTime = candles.at(-1)?.time;
    return this.resolveSessionAsOfTime(requested, latestTime);
  }

  private resolveSessionAsOfTime(requested: number | undefined, latestTime: number | undefined): number | undefined {
    if (this.model.getReplayCutoff() !== null && latestTime !== undefined) {
      return requested === undefined ? latestTime : Math.min(requested, latestTime);
    }
    return requested ?? latestTime;
  }

  private refreshMultiTimeframe(): void {
    for (const state of this.multiTimeframeIndicators.values()) this.syncMultiTimeframeIndicator(state);
    for (const state of this.multiTimeframeReferences.values()) this.syncMultiTimeframeReference(state);
  }

  private refreshSessionAnalysisFromInput(): void {
    const candles = this.model.allCandles;
    for (const state of this.sessionIndicators.values()) {
      state.result = state.runtime.setData(candles, this.resolveSessionAsOf(state.options, candles));
      this.applySessionIndicatorResult(state);
    }
    for (const state of this.sessionReferences.values()) {
      state.result = state.runtime.setData(candles, this.resolveSessionAsOf(state.options, candles));
    }
  }

  private refreshSessionAnalysisFromUpdate(candle: Candle): void {
    const latestTime = this.model.getLatestCandleTime();
    for (const state of this.sessionIndicators.values()) {
      const asOfTime = this.resolveSessionAsOfTime(state.options.asOfTime, latestTime);
      if (state.runtime.update(candle, asOfTime)) {
        state.result = state.runtime.getResult();
        this.applySessionIndicatorResult(state);
      } else {
        this.extendSessionIndicatorSeries(state, candle);
        state.result = { ...state.result, asOfTime: asOfTime ?? state.result.asOfTime };
      }
    }
    for (const state of this.sessionReferences.values()) {
      const asOfTime = this.resolveSessionAsOfTime(state.options.asOfTime, latestTime);
      if (state.runtime.update(candle, asOfTime)) {
        state.result = state.runtime.getResult();
      } else {
        // The previously completed period remains the active reference while
        // the new session is forming. Advancing only the display frontier lets
        // the overlay continue across newly appended source timestamps.
        state.result = { ...state.result, asOfTime: asOfTime ?? state.result.asOfTime };
      }
    }
  }

  private extendSessionIndicatorSeries(state: ManagedSessionIndicator, candle: Candle): void {
    for (const [index, output] of state.result.outputs.entries()) {
      const seriesId = state.outputSeriesIds[index];
      if (seriesId === undefined) continue;
      const point = [...output.points]
        .filter((candidate) => candidate.availableAt !== null && candidate.availableAt <= candle.time && candidate.value !== null)
        .at(-1);
      if (point === undefined) continue;
      this.model.updateSeries(seriesId, { time: candle.time, value: point.value! });
    }
  }

  private clearMultiTimeframe(): void {
    for (const state of this.multiTimeframeIndicators.values()) {
      for (const seriesId of state.outputSeriesIds) if (this.model.getSeriesIds().includes(seriesId)) this.model.removeSeries(seriesId);
    }
    this.multiTimeframeIndicators.clear();
    this.multiTimeframeReferences.clear();
    this.nextMultiTimeframeId = 1;
  }

  private clearSessionAnalysis(): void {
    for (const state of this.sessionIndicators.values()) {
      for (const seriesId of state.outputSeriesIds) if (this.model.getSeriesIds().includes(seriesId)) this.model.removeSeries(seriesId);
      state.runtime.dispose();
    }
    for (const state of this.sessionReferences.values()) state.runtime.dispose();
    this.sessionIndicators.clear();
    this.sessionReferences.clear();
    this.nextSessionAnalysisId = 1;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("Chart has been destroyed");
    }
  }

  private refreshIndicatorsFromInput(): void {
    const input = this.model.allCandles;
    for (const state of this.indicators.values()) {
      state.instance.setInput(input);
      this.syncIndicator(state);
    }
  }

  private refreshWorkerIndicatorsFromInput(): void {
    const input = this.model.allCandles;
    for (const state of this.indicators.values()) {
      if (state.worker === undefined) continue;
      state.worker.initialized = false;
      void this.scheduleWorkerIndicator(state, input).catch(() => undefined);
    }
  }

  private refreshIndicatorsFromUpdate(candle: Candle, appendOnly: boolean): void {
    for (const state of this.indicators.values()) {
      state.instance.update(candle);
      this.syncIndicator(state, appendOnly, state.instance.getResultReference?.() ?? state.instance.getResult());
    }
  }

  private refreshWorkerIndicatorsFromUpdate(candle: Candle): void {
    for (const state of this.indicators.values()) {
      if (state.worker === undefined) continue;
      void this.scheduleWorkerIndicator(state, undefined, candle).catch(() => undefined);
    }
  }

  private scheduleWorkerIndicator(
    state: ManagedChartIndicator,
    input?: readonly Candle[],
    candle?: Candle,
  ): Promise<KlineScriptExecutionResult | undefined> {
    const worker = state.worker;
    if (worker === undefined || worker.disposed || state.script === undefined) return Promise.resolve(undefined);
    const generation = ++worker.generation;
    let task: KlineScriptWorkerTask<KlineScriptExecutionResult>;
    try {
      if (worker.signal?.aborted) return Promise.reject(new KlineScriptWorkerError("CANCELLED", "KlineScript execution was cancelled"));
      task = worker.initialized && candle !== undefined
        ? worker.runtime.updateInput(worker.sessionId, state.script.source, undefined, candle, state.parameters, {}, generation)
        : worker.runtime.updateInput(worker.sessionId, state.script.source, input ?? this.model.allCandles, undefined, state.parameters, {}, generation);
      worker.initialized = true;
    } catch (error) {
      worker.initialized = false;
      return Promise.reject(error);
    }
    worker.pending.add(task);
    const removeAbort = bindWorkerAbort(worker.signal, task);
    return task.promise.then((result) => {
      worker.pending.delete(task);
      if (worker.disposed || this.destroyed || state.worker !== worker || generation !== worker.generation) return undefined;
      worker.result = result;
      worker.resultGeneration = generation;
      this.syncIndicator(state, false, result);
      this.emit("indicatorChange", { action: "update", id: state.id, indicatorId: state.indicatorId });
      this.render();
      return result;
    }).catch((error: unknown) => {
      worker.pending.delete(task);
      if (!worker.disposed && !worker.signal?.aborted && !this.destroyed && state.worker === worker && generation === worker.generation) {
        worker.initialized = false;
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.emit("scriptError", {
          indicatorId: state.id,
          error: normalized,
          diagnostics: error instanceof KlineScriptWorkerError ? [...error.diagnostics] : [],
        });
      }
      throw error;
    }).finally(removeAbort);
  }

  private disposeWorkerIndicator(state: ManagedChartIndicator): void {
    const worker = state.worker;
    if (worker === undefined || worker.disposed) return;
    worker.disposed = true;
    for (const task of worker.pending) task.cancel();
    worker.pending.clear();
    worker.runtime.dispose();
    this.workerRuntimes.delete(worker.runtime);
    delete state.worker;
  }

  private syncIndicator(state: ManagedChartIndicator, appendOnly = false, result = state.instance.getResult()): void {
    const outputs = result.outputs;
    state.outputSeriesIds.forEach((seriesId, index) => {
      const output = outputs[index];
      if (appendOnly && output !== undefined) {
        const lastPoint = output.points[output.points.length - 1];
        if (lastPoint?.value !== null && lastPoint !== undefined) {
          this.model.updateSeries(seriesId, { time: lastPoint.time, value: lastPoint.value });
        }
        return;
      }
      const data = output?.points
        .filter((point): point is { time: number; value: number } => point.value !== null)
        .map((point) => ({ time: point.time, value: point.value })) ?? [];
      if (this.model.getSeriesIds().includes(seriesId)) this.model.setSeriesData(seriesId, data);
    });
  }

  private alertOutputsAt(time: number): AlertOutputSnapshot[] {
    const outputs: AlertOutputSnapshot[] = [];
    for (const state of this.indicators.values()) {
      const worker = state.worker;
      const workerResult = worker !== undefined && worker.resultGeneration === worker.generation ? worker.result : undefined;
      const result = workerResult ?? state.instance.getResultReference?.() ?? state.instance.getResult();
      for (const output of result.outputs) {
        const point = findOutputPointAtTime(output.points, time);
        outputs.push({ sourceId: state.id, outputId: output.id, value: point?.value ?? null, time });
      }
    }
    return outputs;
  }

  private evaluateLiveAlerts(candle: Candle, sourceEvent: "append" | "correction"): void {
    this.alertEngine.evaluate({
      candle,
      outputs: this.alertOutputsAt(candle.time),
      drawings: this.getDrawings(),
      ...(this.datafeedSession === null ? {} : {
        symbol: this.datafeedSession.query.symbol,
        timeframe: this.datafeedSession.query.timeframe,
      }),
      mode: "live",
      sourceEvent,
    });
  }

  private resetLiveAlerts(latest: Candle | undefined): void {
    this.alertEngine.reset("live", true);
    if (latest !== undefined) {
      this.alertEngine.seed({
        candle: latest,
        outputs: this.alertOutputsAt(latest.time),
        drawings: this.getDrawings(),
        ...(this.datafeedSession === null ? {} : {
          symbol: this.datafeedSession.query.symbol,
          timeframe: this.datafeedSession.query.timeframe,
        }),
        mode: "live",
      });
    }
  }

  private seedAlert(id: string): void {
    const latest = this.model.allCandles.at(-1);
    if (latest === undefined) return;
    this.alertEngine.seedRule(id, {
      candle: latest,
      outputs: this.alertOutputsAt(latest.time),
      drawings: this.getDrawings(),
      ...(this.datafeedSession === null ? {} : {
        symbol: this.datafeedSession.query.symbol,
        timeframe: this.datafeedSession.query.timeframe,
      }),
      mode: "live",
    });
  }

  private wrapAlertApi(id: string): AlertApi {
    const api = this.alertEngine.get(id);
    return {
      id,
      getDefinition: () => api.getDefinition(),
      getStatus: (mode) => api.getStatus(mode),
      update: (patch) => this.updateAlert(id, patch),
      setEnabled: (enabled) => this.updateAlert(id, { enabled }),
      reset: (mode) => api.reset(mode),
      remove: () => this.removeAlert(id),
    };
  }

  private evaluateReplayAlerts(candle: Candle, sourceEvent: "seed" | "append"): void {
    this.alertEngine.evaluate({
      candle,
      outputs: this.alertOutputsAt(candle.time),
      drawings: this.getDrawings(),
      ...(this.datafeedSession === null ? {} : {
        symbol: this.datafeedSession.query.symbol,
        timeframe: this.datafeedSession.query.timeframe,
      }),
      mode: "replay",
      sourceEvent,
      isFinal: true,
    });
  }

  private handleMarketReplayState(state: MarketReplayState): void {
    if (state.state === "idle" || state.state === "disposed") {
      this.restoreMarketReplay();
      return;
    }
    if (state.state === "error") {
      this.emit("replayError", new Error(state.error ?? "Unified market replay failed"));
      return;
    }
    const controller = this.marketReplayController;
    if (controller === null || this.destroyed) return;
    this.applyMarketReplaySnapshot(controller.getSnapshot());
  }

  private applyMarketReplaySnapshot(snapshot: MarketReplaySnapshot): void {
    if (this.marketReplayApplying) return;
    this.marketReplayApplying = true;
    try {
      const instrumentId = this.marketReplayInstrumentId;
      const candles = instrumentId === null
        ? snapshot.completedCandles.map(({ instrumentId: _instrumentId, ...candle }) => candle)
        : snapshot.completedCandles.filter((candle) => candle.instrumentId === instrumentId).map(({ instrumentId: _instrumentId, ...candle }) => candle);
      this.rawCandles = candles.map((candle) => ({ ...candle }));
      this.model.setData(this.rawCandles);
      this.chartDataRevision += 1;
      this.invalidateVolumeAnalytics();
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();

      const trades = instrumentId === null ? snapshot.trades : snapshot.trades.filter((trade) => trade.instrumentId === instrumentId);
      this.replaceMarketTrades(trades);
      this.orderFlowRevision += 1;
      this.refreshOrderFlowPresentation();

      const book = instrumentId === null
        ? snapshot.orderBooks[0]
        : snapshot.orderBooks.find((candidate) => candidate.state.instrumentId === instrumentId);
      if (book?.state.status === "live" && book.state.source !== null && book.state.instrumentId !== null) {
        const state = book.state;
        const venueId = state.venueId;
        const source = state.source;
        const instrumentId = state.instrumentId;
        if (source === null || instrumentId === null) return;
        this.orderBookController?.dispose();
        this.orderBookController = new OrderBookController({ instrumentId, ...(venueId === null ? {} : { venueId }), maxDepth: this.depthDisplay.maxLevels, source });
        this.applyOrderBookSnapshot(orderBookSnapshotFromState(state));
      } else if (this.orderBookController !== null) {
        this.orderBookController.dispose();
        this.orderBookController = null;
      }
      this.render();
    } finally {
      this.marketReplayApplying = false;
    }
  }

  private restoreMarketReplay(): void {
    const candles = this.marketReplayBaseCandles;
    const trades = this.marketReplayBaseTrades;
    const orderBook = this.marketReplayBaseOrderBook;
    this.marketReplayUnsubscribe?.();
    this.marketReplayUnsubscribe = null;
    this.marketReplayController = null;
    this.marketReplayBaseCandles = null;
    this.marketReplayBaseTrades = null;
    this.marketReplayBaseOrderBook = null;
    this.marketReplayInstrumentId = null;
    if (candles === null || this.destroyed) return;
    this.marketReplayApplying = true;
    try {
      this.rawCandles = candles.map((candle) => ({ ...candle }));
      this.model.setData(this.rawCandles);
      this.chartDataRevision += 1;
      this.invalidateVolumeAnalytics();
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();
      this.replaceMarketTrades(trades ?? []);
      this.orderFlowRevision += 1;
      this.refreshOrderFlowPresentation();
      this.orderBookController?.dispose();
      this.orderBookController = null;
      if (orderBook !== null) {
        this.orderBookController = new OrderBookController({ instrumentId: orderBook.instrumentId, ...(orderBook.venueId === undefined ? {} : { venueId: orderBook.venueId }), ...(orderBook.tickSize === undefined ? {} : { defaultTickSize: orderBook.tickSize }), source: orderBook.source });
        this.applyOrderBookSnapshot(orderBook);
      }
      this.render();
    } finally {
      this.marketReplayApplying = false;
    }
  }

  private beginReplay(source: readonly Candle[]): void {
    if (this.isReplayActive()) throw new Error("Replay is already active");
    this.replayBaseWorkspace = this.serializeWorkspace();
    this.replayRawSource = source.map((candle) => ({ ...candle }));
    this.suspendDatafeed();
    try {
      this.model.setReplaySource(this.replayRawSource);
      this.model.setReplayCutoff(Number.NEGATIVE_INFINITY);
      this.invalidateVolumeAnalytics();
      this.refreshCvdSeries();
      this.replayCursorIndex = null;
      this.alertEngine.reset("replay", true);
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();
      this.render();
    } catch (error) {
      this.replayBaseWorkspace = null;
      this.replayRawSource = null;
      this.model.setReplayCutoff(null);
      this.replayCursorIndex = null;
      throw error;
    }
  }

  private applyReplayCursor(cursor: ReplayCursor): void {
    if (this.replayBaseWorkspace === null) throw new Error("Replay chart state has not been prepared");
    if (this.replayRawSource !== null && this.corporateActionDataset !== null && this.corporateActionMode === "split-adjusted" && cursor.timestamp !== null) {
      const replayAdjustment = adjustCorporateActionData(this.replayRawSource, this.corporateActionDataset, {
        mode: "split-adjusted",
        context: "causal-as-of",
        asOfTime: cursor.timestamp,
        ...(this.corporateActionSourceDurationMs === undefined ? {} : { sourceDurationMs: this.corporateActionSourceDurationMs }),
        volumePolicy: this.corporateActionVolumePolicy,
      });
      if (replayAdjustment.candles !== null) this.model.setReplaySource(replayAdjustment.candles);
    }
    this.model.setReplayCutoff(cursor.timestamp ?? Number.NEGATIVE_INFINITY);
    this.invalidateVolumeAnalytics();
    this.refreshCvdSeries();
    this.model.resetView();
    const isSequentialAppend = cursor.index !== null
      && this.replayCursorIndex !== null
      && cursor.index === this.replayCursorIndex + 1;
    const visibleLastCandle = isSequentialAppend ? this.model.allCandles.at(-1) : undefined;
    if (visibleLastCandle === undefined) {
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();
      this.alertEngine.reset("replay", true);
      const visibleCandles = this.model.allCandles;
      visibleCandles.forEach((candle, index) => this.evaluateReplayAlerts(candle, index === 0 ? "seed" : "append"));
    } else {
      this.refreshIndicatorsFromUpdate(visibleLastCandle, true);
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromUpdate(visibleLastCandle);
      this.refreshWorkerIndicatorsFromUpdate(visibleLastCandle);
      this.evaluateReplayAlerts(visibleLastCandle, "append");
    }
    this.replayCursorIndex = cursor.index;
    this.emit("dataUpdated", { kind: "set", time: cursor.timestamp, appendOnly: false });
    this.emitViewportChange();
    this.render();
  }

  private exitReplay(): void {
    const baseWorkspace = this.replayBaseWorkspace;
    if (baseWorkspace === null) return;
    const session = this.datafeedSession;
    this.replayRestoring = true;
    try {
      this.restoreWorkspace(baseWorkspace);
    } finally {
      this.replayRestoring = false;
      this.replayBaseWorkspace = null;
      this.replayRawSource = null;
      this.model.setReplayCutoff(null);
      this.invalidateVolumeAnalytics();
      this.refreshCvdSeries();
      this.replayCursorIndex = null;
      this.alertEngine.reset("replay", true);
    }
    if (session !== null && !this.destroyed) {
      void this.setDatafeed(session.datafeed, session.query).catch(() => undefined);
    }
  }

  private disposeReplay(): void {
    this.suspendDatafeed();
    this.datafeedSession = null;
    this.model.setReplayCutoff(null);
    this.invalidateVolumeAnalytics();
    this.replayCursorIndex = null;
    this.replayRawSource = null;
    this.replayBaseWorkspace = null;
  }

  private handleReplayStatus(status: ReplayStatus): void {
    this.emit("replayChange", status);
    if (status.state === "error") this.emit("replayError", new Error(status.error ?? "Replay failed"));
  }

  private getReplayVisibleDrawingDocument(): DrawingDocument {
    return {
      version: 1,
      drawings: this.drawingEngine.getAll().filter((drawing) => this.isDrawingReplayVisible(drawing)),
    };
  }

  private isDrawingReplayVisible(drawing: DrawingSnapshot): boolean {
    const cutoff = this.model.getReplayCutoff();
    return cutoff === null || drawing.points.every((point) => point.time <= cutoff);
  }

  private isReplayActive(): boolean {
    const state = this.replayController?.getStatus().state;
    return this.replayBaseWorkspace !== null
      && state !== undefined
      && state !== "idle"
      && state !== "disposed";
  }

  private isUnifiedReplayActive(): boolean {
    const state = this.marketReplayController?.getState().state;
    return state !== undefined && state !== "idle" && state !== "disposed";
  }

  private isAnyReplayActive(): boolean {
    return this.isReplayActive() || this.isUnifiedReplayActive();
  }

  private assertReplayDataMutationAllowed(): void {
    if (this.isAnyReplayActive() && !this.replayRestoring && !this.marketReplayApplying) {
      throw new Error("Chart data is read-only during replay; exit replay before changing the source");
    }
  }

  private assertReplayStructureMutationAllowed(): void {
    if (this.isAnyReplayActive() && !this.replayRestoring && !this.marketReplayApplying) {
      throw new Error("Chart structure is read-only during replay; exit replay before changing series, indicators, panes, or drawings");
    }
  }

  private suspendDatafeed(): void {
    this.datafeedRequestId += 1;
    this.datafeedCleanup?.();
    this.datafeedCleanup = null;
  }
}

function orderBookSnapshotFromState(state: OrderBookState): OrderBookSnapshot {
  if (state.instrumentId === null || state.source === null) throw new Error("Cannot attach an order-book state without instrument and source identity");
  return {
    version: 1,
    instrumentId: state.instrumentId,
    ...(state.venueId === null ? {} : { venueId: state.venueId }),
    time: state.lastEventTime ?? 0,
    ...(state.lastSequence === null ? {} : { sequence: state.lastSequence }),
    bids: state.bids.map((level) => ({ ...level })),
    asks: state.asks.map((level) => ({ ...level })),
    ...(state.tickSize === null ? {} : { tickSize: state.tickSize }),
    source: { ...state.source },
  };
}

function normalizePricePrecision(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError("pricePrecision must be an integer between 0 and 100");
  }
  return value;
}

function validateAnalyticsTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative safe integer timestamp`);
  return value;
}

function resolveInteraction(options: ChartInteractionOptions | undefined): Required<ChartInteractionOptions> {
  return {
    wheelZoom: options?.wheelZoom ?? true,
    pointerPan: options?.pointerPan ?? true,
    crosshair: options?.crosshair ?? true,
    keyboardShortcuts: options?.keyboardShortcuts ?? true,
  };
}

function keyboardShortcut(event: KeyboardEvent): string | null {
  const key = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (key === "Control" || key === "Shift" || key === "Alt" || key === "Meta") return null;
  const modifiers = [event.ctrlKey ? "Ctrl" : null, event.metaKey ? "Meta" : null, event.altKey ? "Alt" : null, event.shiftKey ? "Shift" : null]
    .filter((modifier): modifier is string => modifier !== null);
  return [...modifiers, key].join("+");
}

function resolveTheme(theme: ChartOptions["theme"]): ChartTheme {
  const base = theme === "dark" ? DARK_THEME : LIGHT_THEME;
  return typeof theme === "object" && theme !== null ? { ...base, ...theme } : { ...base };
}

function validateStrategyMarkers(markers: readonly StrategyMarker[]): StrategyMarker[] {
  const ids = new Set<string>();
  return markers.map((marker) => {
    if (typeof marker.id !== "string" || marker.id.length === 0 || ids.has(marker.id)) throw new Error(`Invalid or duplicate strategy marker id: ${marker.id}`);
    if (marker.kind !== "entry-signal" && marker.kind !== "entry-fill" && marker.kind !== "exit-signal" && marker.kind !== "exit-fill") throw new Error(`Invalid strategy marker kind: ${marker.kind}`);
    if (marker.direction !== "long" && marker.direction !== "short") throw new Error(`Invalid strategy marker direction: ${marker.direction}`);
    if (!Number.isInteger(marker.time) || marker.time < 0 || !Number.isFinite(marker.price) || marker.price <= 0 || typeof marker.label !== "string") throw new Error(`Invalid strategy marker values: ${marker.id}`);
    if (marker.color !== undefined && typeof marker.color !== "string") throw new Error(`Invalid strategy marker color: ${marker.id}`);
    ids.add(marker.id);
    return { ...marker };
  });
}

function cloneSessionIndicatorResult(result: SessionIndicatorResult): SessionIndicatorResult {
  return {
    ...result,
    sourceTimeframe: { ...result.sourceTimeframe },
    calendar: { ...result.calendar, validity: { ...result.calendar.validity } },
    parameters: { ...result.parameters },
    observations: result.observations.map((observation) => ({
      ...observation,
      sessionIds: [...observation.sessionIds],
      tradingDates: [...observation.tradingDates],
      sourceTimes: [...observation.sourceTimes],
      candle: { ...observation.candle },
    })),
    outputs: result.outputs.map((output) => ({
      ...output,
      points: output.points.map((point) => ({
        ...point,
        sessionIds: [...point.sessionIds],
        tradingDates: [...point.tradingDates],
        sourceTimes: [...point.sourceTimes],
      })),
    })),
  };
}

function cloneSessionReferenceResult(result: SessionReferenceResult): SessionReferenceResult {
  return {
    ...result,
    sourceTimeframe: { ...result.sourceTimeframe },
    calendar: { ...result.calendar, validity: { ...result.calendar.validity } },
    points: result.points.map((point) => ({
      ...point,
      sessionIds: [...point.sessionIds],
      tradingDates: [...point.tradingDates],
      sourceTimes: [...point.sourceTimes],
      levels: { ...point.levels },
    })),
  };
}

function nearestTime(times: readonly number[], target: number): number | null {
  if (times.length === 0 || !Number.isFinite(target)) return null;
  return times.reduce((nearest, time) => Math.abs(time - target) < Math.abs(nearest - target) ? time : nearest, times[0] ?? target);
}

function normalizeFootprintDisplay(value: FootprintDisplayOptions): Required<FootprintDisplayOptions> {
  const intervalMs = value.intervalMs ?? DEFAULT_FOOTPRINT_DISPLAY.intervalMs;
  const tickSize = value.tickSize ?? DEFAULT_FOOTPRINT_DISPLAY.tickSize;
  const opacity = value.opacity ?? DEFAULT_FOOTPRINT_DISPLAY.opacity;
  const maxCells = value.maxCells ?? DEFAULT_FOOTPRINT_DISPLAY.maxCells;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 86_400_000) throw new Error("Footprint intervalMs must be a positive safe integer");
  if (!Number.isFinite(tickSize) || tickSize <= 0) throw new Error("Footprint tickSize must be finite and positive");
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error("Footprint opacity must be between 0 and 1");
  if (!Number.isSafeInteger(maxCells) || maxCells < 1 || maxCells > 1_000_000) throw new Error("Footprint maxCells is out of range");
  const offTickPolicy = value.offTickPolicy ?? DEFAULT_FOOTPRINT_DISPLAY.offTickPolicy;
  if (offTickPolicy !== "reject" && offTickPolicy !== "round" && offTickPolicy !== "allow") throw new Error("Unsupported Footprint offTickPolicy");
  const colors = { buyColor: value.buyColor ?? DEFAULT_FOOTPRINT_DISPLAY.buyColor, sellColor: value.sellColor ?? DEFAULT_FOOTPRINT_DISPLAY.sellColor, unknownColor: value.unknownColor ?? DEFAULT_FOOTPRINT_DISPLAY.unknownColor };
  if (Object.values(colors).some((color) => color.trim().length === 0)) throw new Error("Footprint colors must be non-empty");
  return { visible: value.visible ?? DEFAULT_FOOTPRINT_DISPLAY.visible, intervalMs, tickSize, offTickPolicy, showLabels: value.showLabels ?? DEFAULT_FOOTPRINT_DISPLAY.showLabels, opacity, ...colors, maxCells };
}

function normalizeCvdDisplay(value: CvdDisplayOptions): Required<CvdDisplayOptions> {
  const intervalMs = value.intervalMs ?? DEFAULT_CVD_DISPLAY.intervalMs;
  const lineWidth = value.lineWidth ?? DEFAULT_CVD_DISPLAY.lineWidth;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1 || intervalMs > 86_400_000) throw new Error("CVD intervalMs must be a positive safe integer");
  if (!Number.isFinite(lineWidth) || lineWidth <= 0 || lineWidth > 8) throw new Error("CVD lineWidth must be between 0 and 8");
  const pane = value.pane ?? DEFAULT_CVD_DISPLAY.pane;
  const reset = value.reset ?? DEFAULT_CVD_DISPLAY.reset;
  const sourceCoverage = value.sourceCoverage ?? DEFAULT_CVD_DISPLAY.sourceCoverage;
  if (reset !== "continuous" && reset !== "session") throw new Error("Unsupported CVD reset policy");
  if (sourceCoverage !== "complete" && sourceCoverage !== "partial" && sourceCoverage !== "unknown") throw new Error("Unsupported CVD source coverage");
  if (pane !== "new" && pane.trim().length === 0) throw new Error("CVD pane must be non-empty");
  const color = value.color ?? DEFAULT_CVD_DISPLAY.color;
  const baselineColor = value.baselineColor ?? DEFAULT_CVD_DISPLAY.baselineColor;
  if (color.trim().length === 0 || baselineColor.trim().length === 0) throw new Error("CVD colors must be non-empty");
  return { visible: value.visible ?? DEFAULT_CVD_DISPLAY.visible, intervalMs, reset, pane, color, lineWidth, baselineColor, sourceCoverage };
}

function normalizeDepthDisplay(value: DepthDisplayOptions): Required<DepthDisplayOptions> {
  const maxLevels = value.maxLevels ?? DEFAULT_DEPTH_DISPLAY.maxLevels;
  const opacity = value.opacity ?? DEFAULT_DEPTH_DISPLAY.opacity;
  const maxHistory = value.maxHistory ?? DEFAULT_DEPTH_DISPLAY.maxHistory;
  if (!Number.isSafeInteger(maxLevels) || maxLevels < 1 || maxLevels > 10_000) throw new Error("Depth maxLevels is out of range");
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new Error("Depth opacity must be between 0 and 1");
  if (!Number.isSafeInteger(maxHistory) || maxHistory < 1 || maxHistory > 100_000) throw new Error("Depth maxHistory is out of range");
  const bidColor = value.bidColor ?? DEFAULT_DEPTH_DISPLAY.bidColor;
  const askColor = value.askColor ?? DEFAULT_DEPTH_DISPLAY.askColor;
  if (bidColor.trim().length === 0 || askColor.trim().length === 0) throw new Error("Depth colors must be non-empty");
  return { visible: value.visible ?? DEFAULT_DEPTH_DISPLAY.visible, maxLevels, showLabels: value.showLabels ?? DEFAULT_DEPTH_DISPLAY.showLabels, showHeatmap: value.showHeatmap ?? DEFAULT_DEPTH_DISPLAY.showHeatmap, opacity, bidColor, askColor, maxHistory };
}

function formatOrderFlowQuantity(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1000 ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : value.toFixed(2).replace(/\.00$/, "");
}

function compareChartMarketTrades(left: MarketTrade, right: MarketTrade): number {
  return left.time - right.time
    || (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
    || left.revision - right.revision;
}

function createChartTradeSourceReference(value: Pick<MarketTrade, "instrumentId" | "venueId" | "source">): NonNullable<WorkspaceOrderFlow["tradeSource"]> {
  return {
    instrumentId: value.instrumentId,
    sourceId: value.source.id,
    sourceVersion: value.source.version,
    ...(value.venueId === undefined ? {} : { venueId: value.venueId }),
  };
}

interface FootprintLodBin {
  readonly column: number;
  readonly row: number;
  buyVolume: number;
  sellVolume: number;
  unknownSideVolume: number;
  totalVolume: number;
  tradeCount: number;
}

function renderFootprintLod(
  context: PluginRenderContext,
  pane: PluginPaneRenderContext,
  trades: readonly MarketTrade[],
  options: Required<FootprintDisplayOptions>,
): { readonly commands: PluginRenderCommand[]; readonly error?: string } {
  const tickSize = options.tickSize;
  const columns = Math.max(16, Math.min(160, Math.floor((pane.right - pane.left) / 5)));
  const rows = Math.max(8, Math.min(64, Math.floor((pane.bottom - pane.top) / 6)));
  const priceAtTop = pane.priceForY(pane.top);
  const priceAtBottom = pane.priceForY(pane.bottom);
  const lowPrice = Math.min(priceAtTop, priceAtBottom);
  const highPrice = Math.max(priceAtTop, priceAtBottom);
  const bins = new Map<string, FootprintLodBin>();
  for (const trade of trades) {
    const rawIndex = trade.price / tickSize;
    const tickIndex = Math.round(rawIndex);
    const normalized = tickIndex * tickSize;
    const tolerance = Math.max(Number.EPSILON * Math.max(1, Math.abs(trade.price)), tickSize * 1e-9);
    if (Math.abs(normalized - trade.price) > tolerance && options.offTickPolicy === "reject") {
      return { commands: [], error: `Trade ${trade.id} price ${trade.price} is off tick ${tickSize}` };
    }
    const price = options.offTickPolicy === "round" ? normalized : trade.price;
    if (price < lowPrice || price > highPrice) continue;
    const x = context.xForTime(trade.time);
    const y = pane.yForPrice(price);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < pane.left || x > pane.right || y < pane.top || y > pane.bottom) continue;
    const column = Math.max(0, Math.min(columns - 1, Math.floor(((x - pane.left) / Math.max(1, pane.right - pane.left)) * columns)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor(((y - pane.top) / Math.max(1, pane.bottom - pane.top)) * rows)));
    const key = `${column}:${row}`;
    const bin = bins.get(key) ?? { column, row, buyVolume: 0, sellVolume: 0, unknownSideVolume: 0, totalVolume: 0, tradeCount: 0 };
    bin.totalVolume += trade.quantity;
    bin.tradeCount += 1;
    if (trade.aggressorSide === "buy" && trade.sideQuality !== "estimated") bin.buyVolume += trade.quantity;
    else if (trade.aggressorSide === "sell" && trade.sideQuality !== "estimated") bin.sellVolume += trade.quantity;
    else bin.unknownSideVolume += trade.quantity;
    bins.set(key, bin);
  }
  const cellWidth = Math.max(1, (pane.right - pane.left) / columns);
  const cellHeight = Math.max(1, (pane.bottom - pane.top) / rows);
  const commands: PluginRenderCommand[] = [];
  for (const bin of [...bins.values()].sort((left, right) => left.row - right.row || left.column - right.column)) {
    const left = pane.left + bin.column * cellWidth;
    const top = pane.top + bin.row * cellHeight;
    const fillColor = bin.unknownSideVolume > 0 && bin.buyVolume === 0 && bin.sellVolume === 0
      ? options.unknownColor
      : bin.buyVolume - bin.sellVolume >= 0 ? options.buyColor : options.sellColor;
    commands.push({ kind: "rectangle", left, top, width: Math.max(1, cellWidth), height: Math.max(1, cellHeight), fillColor, color: fillColor, alpha: options.opacity, lineWidth: 0.5 });
    if (options.showLabels && cellWidth >= 20 && cellHeight >= 10) {
      commands.push({ kind: "text", x: left + 2, y: top + 1, text: formatOrderFlowQuantity(bin.totalVolume), color: options.unknownColor, font: "9px system-ui, sans-serif", alpha: 0.95 });
    }
  }
  return { commands };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name?: unknown }).name === "AbortError";
}

function isInsideBounds(x: number, y: number, bounds: { left: number; right: number; top: number; bottom: number }): boolean {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function toJsonObject(value: Readonly<Record<string, unknown>>, label: string): Record<string, JsonValue> {
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) result[key] = toJsonValue(item, `${label}.${key}`);
  return result;
}

function toJsonValue(value: unknown, label: string): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => toJsonValue(item, `${label}[${index}]`));
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) {
      const result: Record<string, JsonValue> = {};
      for (const [key, item] of Object.entries(value)) result[key] = toJsonValue(item, `${label}.${key}`);
      return result;
    }
  }
  throw new TypeError(`${label} must contain JSON-compatible values`);
}

function normalizePluginCommands(commands: readonly unknown[]): PluginOverlayRenderItem["commands"] {
  if (!Array.isArray(commands)) return [];
  return commands.filter(isPluginRenderCommand).slice(0, 10_000);
}

function isPluginRenderCommand(value: unknown): value is PluginOverlayRenderItem["commands"][number] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const command = value as Record<string, unknown>;
  const finite = (item: unknown): item is number => typeof item === "number" && Number.isFinite(item);
  const validAlpha = command.alpha === undefined || (finite(command.alpha) && command.alpha >= 0 && command.alpha <= 1);
  const validWidth = command.lineWidth === undefined || (finite(command.lineWidth) && command.lineWidth >= 0 && command.lineWidth <= 32);
  const validDash = command.dash === undefined || (Array.isArray(command.dash) && command.dash.length <= 8 && command.dash.every((item) => finite(item) && item >= 0 && item <= 100));
  if (!validAlpha || !validWidth || !validDash) return false;
  if (command.kind === "line") {
    return isPoint(command.from) && isPoint(command.to)
      && (command.color === undefined || typeof command.color === "string");
  }
  if (command.kind === "rectangle") {
    return finite(command.left) && finite(command.top) && finite(command.width) && finite(command.height)
      && (command.color === undefined || typeof command.color === "string")
      && (command.fillColor === undefined || typeof command.fillColor === "string");
  }
  if (command.kind === "text") {
    return finite(command.x) && finite(command.y) && typeof command.text === "string"
      && command.text.length <= 10_000
      && (command.color === undefined || typeof command.color === "string")
      && (command.font === undefined || typeof command.font === "string");
  }
  return false;
}

function isPoint(value: unknown): value is { x: number; y: number } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return typeof point.x === "number" && Number.isFinite(point.x)
    && typeof point.y === "number" && Number.isFinite(point.y);
}

function lineStyleDash(style: MultiTimeframeReferenceStyle["lineStyle"]): readonly number[] | undefined {
  if (style === "dashed") return [6, 4];
  if (style === "dotted") return [2, 3];
  return undefined;
}

function cloneSeriesStyles(styles: Readonly<Record<string, import("./types.js").SeriesStyle>>): Record<string, import("./types.js").SeriesStyle> {
  return Object.fromEntries(Object.entries(styles).map(([id, style]) => [id, { ...style }]));
}

function cloneMultiTimeframeIndicatorResult(result: MultiTimeframeIndicatorResult): MultiTimeframeIndicatorResult {
  return {
    ...result,
    sourceTimeframe: { ...result.sourceTimeframe },
    targetTimeframe: { ...result.targetTimeframe },
    parameters: { ...result.parameters },
    observations: result.observations.map((observation) => ({
      ...observation,
      candle: { ...observation.candle },
      sourceTimes: [...observation.sourceTimes],
    })),
    outputs: result.outputs.map((output) => ({
      ...output,
      points: output.points.map((point) => ({ ...point, sourceTimes: [...point.sourceTimes] })),
    })),
  };
}

function cloneMultiTimeframeReferenceResult(result: MultiTimeframeReferenceResult): MultiTimeframeReferenceResult {
  return {
    ...result,
    sourceTimeframe: { ...result.sourceTimeframe },
    targetTimeframe: { ...result.targetTimeframe },
    points: result.points.map((point) => ({ ...point, sourceTimes: [...point.sourceTimes], levels: { ...point.levels } })),
  };
}

function findOutputPointAtTime(points: readonly { readonly time: number; readonly value: number | null }[], time: number): { readonly time: number; readonly value: number | null } | undefined {
  const last = points.at(-1);
  if (last?.time === time) return last;
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const point = points[middle];
    if (point === undefined) break;
    if (point.time === time) return point;
    if (point.time < time) low = middle + 1;
    else high = middle - 1;
  }
  return undefined;
}

function lowerBoundCandleTime(candles: readonly Candle[], time: number): number {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (candles[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upsertRawCandleInPlace(candles: Candle[], candle: Candle): void {
  const last = candles.at(-1);
  if (last === undefined || candle.time > last.time) {
    candles.push({ ...candle });
    return;
  }
  const index = lowerBoundCandleTime(candles, candle.time);
  if (candles[index]?.time === candle.time) candles[index] = { ...candle };
  else candles.splice(index, 0, { ...candle });
}

export function createChart(container: HTMLElement, options?: ChartOptions): Chart {
  return new Chart(container, options);
}

function bindWorkerAbort<T>(signal: AbortSignal | undefined, task: KlineScriptWorkerTask<T>): () => void {
  if (signal === undefined) return () => undefined;
  const onAbort = (): void => task.cancel();
  if (signal.aborted) onAbort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return () => signal.removeEventListener("abort", onAbort);
}
