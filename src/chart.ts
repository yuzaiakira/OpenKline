import { ChartModel } from "./core/chart-model.js";
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

export class Chart {
  private readonly canvas: HTMLCanvasElement;
  private readonly model = new ChartModel();
  private readonly renderer: CanvasRenderer;
  private readonly indicatorRegistry = createDefaultIndicatorRegistry();
  private readonly indicators = new Map<string, ManagedChartIndicator>();
  private nextIndicatorId = 1;
  private readonly drawingEngine = new DrawingEngine();
  private readonly overlays = new Map<string, PluginOverlayDefinition>();
  private strategyMarkers: StrategyMarker[] = [];
  private readonly pluginRegistry: PluginRegistry;
  private readonly alertEngine = new AlertEngine();
  private readonly extensionDisposers = new Set<() => void>();
  private readonly workerRuntimes = new Set<KlineScriptWorkerRuntime>();
  private readonly listeners = new Map<ChartEventName, Set<ChartEventHandler<ChartEventName>>>();
  private readonly resizeObserver: ResizeObserver | null;
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
  private dragging = false;
  private lastPointerX = 0;
  private selectedDrawingId: string | null = null;
  private pendingDrawing: { type: string; options: DrawingStartOptions; points: DrawingPoint[] } | null = null;
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
            this.resize(entry.contentRect.width, entry.contentRect.height);
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
    this.refreshIndicatorsFromInput();
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
    this.refreshIndicatorsFromUpdate(candle, appendOnly);
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
      [...this.indicators.values()].flatMap((indicator) => indicator.outputSeriesIds),
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
      const api = script === undefined
        ? this.addIndicator(indicator.indicatorId, { id: indicator.id, pane: indicator.paneId, parameters: { ...indicator.parameters } })
        : this.addScriptIndicator(script, { id: indicator.id, pane: indicator.paneId, parameters: { ...indicator.parameters } });
      for (const [outputId, style] of Object.entries(indicator.outputStyles)) api.setOutputStyle(outputId, style);
    }
    this.drawingEngine.restore(parsed.drawings);
    this.model.setViewportState(parsed.viewport);
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
    this.disposeWorkerIndicator(state);
    for (const seriesId of state.outputSeriesIds) {
      if (this.model.getSeriesIds().includes(seriesId)) this.model.removeSeries(seriesId);
    }
    state.instance.dispose();
    this.indicators.delete(id);
    this.emit("indicatorChange", { action: "remove", id, indicatorId: state.indicatorId });
    this.render();
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
    if (wasPrimaryCandleSeries) this.refreshIndicatorsFromInput();
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
    for (const indicator of this.indicators.values()) indicator.instance.dispose();
    this.indicators.clear();
    const requestId = this.datafeedRequestId;
    try {
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
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    this.devicePixelRatio = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.floor(this.width * this.devicePixelRatio));
    const pixelHeight = Math.max(1, Math.floor(this.height * this.devicePixelRatio));
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
    this.emitViewportChange();
    this.render();
  }

  /** Move the crosshair to the nearest visible bar time, or clear it. */
  public setCrosshairAtTime(time: number | null): number | null {
    this.assertAlive();
    if (time === null) {
      this.crosshair = null;
      if (this.interaction.crosshair) this.emitCrosshair(null, null);
      this.render();
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
    this.render();
    return nearest;
  }

  /** Pan the shared viewport by a number of bars and redraw. */
  public pan(deltaBars: number): void {
    this.assertAlive();
    this.model.pan(deltaBars);
    this.emitViewportChange();
    this.render();
  }

  /** Zoom the shared viewport around an anchor ratio and redraw. */
  public zoom(scale: number, anchorRatio = 0.5): void {
    this.assertAlive();
    this.model.zoom(scale, anchorRatio);
    this.emitViewportChange();
    this.render();
  }

  /** Show the complete shared time range without recreating chart resources. */
  public fitContent(): void {
    this.assertAlive();
    this.model.fitContent();
    this.emitViewportChange();
    this.render();
  }

  /** Restore default bar density and follow the newest available data. */
  public resetView(): void {
    this.assertAlive();
    this.model.resetView();
    this.emitViewportChange();
    this.render();
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
    this.model.destroy();
    this.replayCursorIndex = null;
    this.drawingEngine.dispose();
    this.overlays.clear();
    this.strategyMarkers = [];
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
    this.canvas.remove();
    this.listeners.clear();
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

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const drawingContext = this.getDrawingContext();
    if (drawingContext !== null && this.pendingDrawing !== null && isInsideBounds(event.offsetX, event.offsetY, drawingContext.bounds)) {
      const point = this.snapDrawingPoint({
        time: Math.max(0, Math.round(drawingContext.converter.timeForX(event.offsetX))),
        price: drawingContext.converter.priceForY(event.offsetY),
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
      return;
    }

    if (drawingContext !== null && isInsideBounds(event.offsetX, event.offsetY, drawingContext.bounds)) {
      const hit = this.drawingEngine.hitTest(event.offsetX, event.offsetY, drawingContext.converter, drawingContext.bounds, 6, (drawing) => this.isDrawingReplayVisible(drawing));
      if (hit !== null) {
        this.selectedDrawingId = hit.id;
        this.emit("drawingSelection", { id: hit.id });
        const snapshot = this.drawingEngine.get(hit.id);
        if (snapshot.style.locked !== true) {
          this.activeDrawing = {
            id: hit.id,
            pointIndex: hit.pointIndex,
            time: drawingContext.converter.timeForX(event.offsetX),
            price: drawingContext.converter.priceForY(event.offsetY),
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
    this.lastPointerX = event.offsetX;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.activeDrawing !== null) {
      const drawingContext = this.getDrawingContext();
      if (drawingContext !== null) {
        const time = drawingContext.converter.timeForX(event.offsetX);
        const price = drawingContext.converter.priceForY(event.offsetY);
        if (this.activeDrawing.pointIndex === null) {
          this.drawingEngine.move(this.activeDrawing.id, time - this.activeDrawing.time, price - this.activeDrawing.price);
        } else {
          this.drawingEngine.movePoint(this.activeDrawing.id, this.activeDrawing.pointIndex, { time, price });
        }
        this.activeDrawing = { ...this.activeDrawing, time, price };
      }
      if (this.interaction.crosshair) {
        this.crosshair = { x: event.offsetX, y: event.offsetY };
        this.emitCrosshair(event.offsetX, event.offsetY);
      }
      this.render();
      return;
    }

    if (this.dragging) {
      const delta = event.offsetX - this.lastPointerX;
      this.model.pan(-delta / Math.max(this.model.barSpacing, 1));
      this.emitViewportChange();
      this.lastPointerX = event.offsetX;
    }

    if (this.interaction.crosshair) {
      this.crosshair = { x: event.offsetX, y: event.offsetY };
      this.emitCrosshair(event.offsetX, event.offsetY);
    }
    this.render();
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
      this.render();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (!this.interaction.wheelZoom) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 0.8 : 1.25;
    this.model.zoom(factor, event.offsetX / Math.max(this.width, 1));
    this.emitViewportChange();
    this.render();
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
    const drawingContext = this.getDrawingContext();
    this.renderer.render(
      this.model.getVisibleData(),
      { width: this.width, height: this.height, devicePixelRatio: this.devicePixelRatio },
      this.theme,
      {
        locale: this.locale,
        timeZone: this.timeZone,
        pricePrecision: this.pricePrecision,
        direction: this.direction,
        priceScale: this.getResolvedPriceScaleConfiguration(),
      },
      this.crosshair,
        drawingContext === null ? [] : this.drawingEngine.getRenderItems(drawingContext.converter, drawingContext.bounds, (drawing) => this.isDrawingReplayVisible(drawing)),
      this.selectedDrawingId,
      this.getPluginOverlayItems(),
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
        if (this.model.isPrimaryCandleSeries(id)) {
          this.refreshIndicatorsFromInput();
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
        if (primaryCandleSeries) {
          this.refreshIndicatorsFromUpdate(point as Candle, appendOnly);
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
      this.replayCursorIndex = null;
      this.alertEngine.reset("replay", true);
      this.refreshIndicatorsFromInput();
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
    this.model.resetView();
    const isSequentialAppend = cursor.index !== null
      && this.replayCursorIndex !== null
      && cursor.index === this.replayCursorIndex + 1;
    const visibleLastCandle = isSequentialAppend ? this.model.allCandles.at(-1) : undefined;
    if (visibleLastCandle === undefined) {
      this.refreshIndicatorsFromInput();
      this.refreshWorkerIndicatorsFromInput();
      this.alertEngine.reset("replay", true);
      const visibleCandles = this.model.allCandles;
      visibleCandles.forEach((candle, index) => this.evaluateReplayAlerts(candle, index === 0 ? "seed" : "append"));
    } else {
      this.refreshIndicatorsFromUpdate(visibleLastCandle, true);
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
  if (!validAlpha || !validWidth) return false;
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
