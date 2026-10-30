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
import { parseWorkspace, WorkspaceCompatibilityError, type WorkspaceDocument, type WorkspaceMetadata, type WorkspaceRestoreOptions, type WorkspaceRestoreResult } from "./workspace.js";
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
  private replayCursorIndex: number | null = null;
  private replayRestoring = false;
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
    queueMicrotask(() => {
      if (!this.destroyed) this.emit("chartReady", { timestamp: Date.now() });
    });
  }

  public setData(candles: readonly Candle[]): void {
    this.assertAlive();
    this.assertReplayDataMutationAllowed();
    this.model.setData(candles);
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
    const lastTime = this.model.getLatestCandleTime();
    const appendOnly = lastTime === undefined || candle.time > lastTime;
    this.model.update(candle);
    this.invalidateVolumeAnalytics();
    this.refreshIndicatorsFromUpdate(candle, appendOnly);
    this.refreshMultiTimeframe();
    this.refreshSessionAnalysisFromUpdate(candle);
    this.refreshWorkerIndicatorsFromUpdate(candle);
    this.evaluateLiveAlerts(candle, appendOnly ? "append" : "correction");
    this.emit("dataUpdated", { kind: "update", time: candle.time, appendOnly });
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
        data: item.data.map((point) => ({ ...point })),
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
    }
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
    this.pendingDrawing = { type, options: { ...options }, points: [] };
    this.emit("toolActivation", { type, active: true });
    if (tool.minPoints === 0) {
      throw new Error(`Drawing tool must require at least one point: ${type}`);
    }
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
            if (!this.isReplayActive()) this.update(bar);
          },
          onError: (error) => this.emit("datafeedError", error),
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

  /** Return a defensive copy of the currently stored candles. */
  public getData(): Candle[] {
    this.assertAlive();
    return this.model.allCandles;
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
    this.replayController?.dispose();
    this.replayController = null;
    this.alertEngine.dispose();
    this.pluginRegistry.dispose();
    for (const dispose of [...this.extensionDisposers]) dispose();
    this.destroyed = true;
    this.stopDatafeed();
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
    this.model.destroy();
    this.baseFrame = null;
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
        this.model.setSeriesData(id, data as SeriesData);
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
        const lastTime = primaryCandleSeries ? this.model.getLatestCandleTime() : undefined;
        const appendOnly = primaryCandleSeries && (lastTime === undefined || point.time > lastTime);
        this.model.updateSeries(id, point);
        if (primaryCandleSeries) this.invalidateVolumeAnalytics();
        if (primaryCandleSeries) {
          this.refreshIndicatorsFromUpdate(point as Candle, appendOnly);
          this.refreshMultiTimeframe();
          this.refreshSessionAnalysisFromUpdate(point as Candle);
          this.evaluateLiveAlerts(point as Candle, appendOnly ? "append" : "correction");
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

  private beginReplay(source: readonly Candle[]): void {
    if (this.isReplayActive()) throw new Error("Replay is already active");
    this.replayBaseWorkspace = this.serializeWorkspace();
    this.suspendDatafeed();
    try {
      this.model.setReplaySource(source);
      this.model.setReplayCutoff(Number.NEGATIVE_INFINITY);
      this.invalidateVolumeAnalytics();
      this.replayCursorIndex = null;
      this.alertEngine.reset("replay", true);
      this.refreshIndicatorsFromInput();
      this.refreshMultiTimeframe();
      this.refreshSessionAnalysisFromInput();
      this.refreshWorkerIndicatorsFromInput();
      this.render();
    } catch (error) {
      this.replayBaseWorkspace = null;
      this.model.setReplayCutoff(null);
      this.replayCursorIndex = null;
      throw error;
    }
  }

  private applyReplayCursor(cursor: ReplayCursor): void {
    if (this.replayBaseWorkspace === null) throw new Error("Replay chart state has not been prepared");
    this.model.setReplayCutoff(cursor.timestamp ?? Number.NEGATIVE_INFINITY);
    this.invalidateVolumeAnalytics();
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
      this.model.setReplayCutoff(null);
      this.invalidateVolumeAnalytics();
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

  private assertReplayDataMutationAllowed(): void {
    if (this.isReplayActive() && !this.replayRestoring) {
      throw new Error("Chart data is read-only during replay; exit replay before changing the source");
    }
  }

  private assertReplayStructureMutationAllowed(): void {
    if (this.isReplayActive() && !this.replayRestoring) {
      throw new Error("Chart structure is read-only during replay; exit replay before changing series, indicators, panes, or drawings");
    }
  }

  private suspendDatafeed(): void {
    this.datafeedRequestId += 1;
    this.datafeedCleanup?.();
    this.datafeedCleanup = null;
  }
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
