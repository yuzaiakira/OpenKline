import { ChartModel } from "./core/chart-model.js";
import { PriceScale, TimeScale } from "./core/scales.js";
import { CanvasRenderer, getPaneBounds, getPaneScaleRange } from "./renderer/canvas-renderer.js";
import { createDefaultIndicatorRegistry } from "./indicators/index.js";
import { DrawingEngine } from "./drawings/engine.js";
import { PluginRegistry } from "./extensions/registry.js";
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
  DrawingStartOptions,
  DrawingToolDefinition,
} from "./drawings/types.js";
import type { IndicatorDefinition, IndicatorInstance } from "./indicators/types.js";
import type { KlineScriptCompiledProgram } from "./klinescript/compiler.js";
import { compileKlineScript } from "./klinescript/compiler.js";
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
  VolumePoint,
} from "./types.js";
import { parseWorkspace, WorkspaceCompatibilityError, type WorkspaceDocument, type WorkspaceMetadata, type WorkspaceRestoreOptions, type WorkspaceRestoreResult } from "./workspace.js";
import type { JsonValue } from "./extensions/types.js";

interface ManagedChartIndicator {
  id: string;
  indicatorId: string;
  paneId: string;
  instance: IndicatorInstance;
  outputSeriesIds: string[];
  parameters: Record<string, unknown>;
  outputStyles: Record<string, import("./types.js").SeriesStyle>;
  script?: { readonly programId: string; readonly source: string };
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
  private readonly pluginRegistry: PluginRegistry;
  private readonly extensionDisposers = new Set<() => void>();
  private readonly listeners = new Map<ChartEventName, Set<ChartEventHandler<ChartEventName>>>();
  private readonly resizeObserver: ResizeObserver | null;
  private theme: ChartTheme;
  private locale: string;
  private timeZone: string;
  private pricePrecision: number;
  private direction: ChartDirection;
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
  private destroyed = false;

  public constructor(private readonly container: HTMLElement, options: ChartOptions = {}) {
    this.theme = resolveTheme(options.theme);
    this.locale = options.locale ?? "en-US";
    this.timeZone = options.timeZone ?? "UTC";
    this.pricePrecision = normalizePricePrecision(options.pricePrecision ?? 2);
    this.direction = options.direction ?? "ltr";
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
    this.model.setData(candles);
    this.refreshIndicatorsFromInput();
    this.emit("dataUpdated", { kind: "set", time: candles.at(-1)?.time ?? null, appendOnly: false });
    this.render();
  }

  public update(candle: Candle): void {
    this.assertAlive();
    const lastTime = this.model.getLatestCandleTime();
    const appendOnly = lastTime === undefined || candle.time > lastTime;
    this.model.update(candle);
    this.refreshIndicatorsFromUpdate(candle, appendOnly);
    this.emit("dataUpdated", { kind: "update", time: candle.time, appendOnly });
    this.render();
  }

  public addCandlestickSeries(options: SeriesOptions = {}): SeriesApi<Candle> {
    return this.createSeriesApi("candlestick", options);
  }

  public addLineSeries(options: SeriesOptions = {}): SeriesApi<LinePoint> {
    return this.createSeriesApi("line", options);
  }

  public addAreaSeries(options: SeriesOptions = {}): SeriesApi<AreaPoint> {
    return this.createSeriesApi("area", options);
  }

  public addVolumeSeries(options: SeriesOptions = {}): SeriesApi<VolumePoint> {
    return this.createSeriesApi("volume", options);
  }

  public addHistogramSeries(options: SeriesOptions = {}): SeriesApi<VolumePoint> {
    return this.createSeriesApi("histogram", options);
  }

  public addPane(options: PaneOptions = {}): PaneApi {
    this.assertAlive();
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
    return {
      version: 1,
      ...(metadata === undefined ? {} : { metadata: { ...metadata } }),
      chart: {
        theme: { ...this.theme },
        locale: this.locale,
        timeZone: this.timeZone,
        pricePrecision: this.pricePrecision,
        direction: this.direction,
      },
      panes,
      series,
      indicators,
      drawings: this.drawingEngine.serialize(),
      viewport,
      plugins,
    };
  }

  /** Validate and restore a versioned workspace document. */
  public restoreWorkspace(document: unknown, options: WorkspaceRestoreOptions = {}): WorkspaceRestoreResult {
    this.assertAlive();
    const parsed = parseWorkspace(document);
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
    this.render();
    return { skippedPlugins: missingPlugins, skippedIndicators: missingIndicators };
  }

  public addIndicator(indicatorId: string, options: IndicatorAddOptions = {}): ChartIndicatorApi {
    this.assertAlive();
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
        return instance.getResult();
      },
      setParameters: (nextParameters) => {
        this.assertAlive();
        instance.setParameters(nextParameters);
        state.parameters = { ...instance.getResult().parameters };
        this.syncIndicator(state);
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

  public removeIndicator(id: string): void {
    this.assertAlive();
    const state = this.indicators.get(id);
    if (state === undefined) throw new Error(`Unknown indicator: ${id}`);
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
    const drawing = this.drawingEngine.create(type, options);
    this.selectedDrawingId = drawing.id;
    this.emit("drawingSelection", { id: drawing.id });
    this.render();
    return drawing;
  }

  public removeDrawing(id: string): void {
    this.assertAlive();
    this.drawingEngine.remove(id);
    if (this.selectedDrawingId === id) this.selectedDrawingId = null;
    this.emit("drawingSelection", { id: this.selectedDrawingId });
    this.render();
  }

  public getDrawings(): DrawingSnapshot[] {
    this.assertAlive();
    return this.drawingEngine.getAll();
  }

  public selectDrawing(id: string | null): void {
    this.assertAlive();
    if (id !== null) this.drawingEngine.get(id);
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
    const tool = this.drawingEngine.getTool(type);
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
    return this.drawingEngine.serialize();
  }

  public restoreDrawings(document: unknown): void {
    this.assertAlive();
    this.drawingEngine.restore(document);
    this.selectedDrawingId = null;
    this.render();
  }

  public removeSeries(id: string): void {
    this.assertAlive();
    this.model.removeSeries(id);
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

  /** Load historical bars and optionally subscribe to future bar updates. */
  public async setDatafeed(datafeed: Datafeed, query: GetBarsQuery): Promise<void> {
    this.assertAlive();
    this.stopDatafeed();
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
          onBar: (bar) => this.update(bar),
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

  /** Return the current visible bar indexes for interaction and diagnostics. */
  public getVisibleRange(): { from: number; to: number } {
    this.assertAlive();
    const { from, to } = this.model.getVisibleData();
    return { from, to };
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
    this.pluginRegistry.dispose();
    for (const dispose of [...this.extensionDisposers]) dispose();
    this.destroyed = true;
    this.stopDatafeed();
    for (const indicator of this.indicators.values()) indicator.instance.dispose();
    this.indicators.clear();
    this.model.destroy();
    this.drawingEngine.dispose();
    this.overlays.clear();
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

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const drawingContext = this.getDrawingContext();
    if (drawingContext !== null && this.pendingDrawing !== null && isInsideBounds(event.offsetX, event.offsetY, drawingContext.bounds)) {
      const point = {
        time: Math.max(0, Math.round(drawingContext.converter.timeForX(event.offsetX))),
        price: drawingContext.converter.priceForY(event.offsetY),
      };
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
      const hit = this.drawingEngine.hitTest(event.offsetX, event.offsetY, drawingContext.converter, drawingContext.bounds);
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
    const event: CrosshairMoveEvent = { time: null, price: null, x: x ?? 0, y: y ?? 0, series: [] };
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
      const prices = getPaneScaleRange(paneData?.series ?? []);
      const scale = new PriceScale(prices.min, prices.max, { start: activePane.top, end: activePane.bottom });
      const timeScale = new TimeScale(data.times, { start: firstPane.left, end: firstPane.right }, this.direction);
      event.time = Math.round(timeScale.timeForX(x));
      event.price = scale.priceForY(y);
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
      { locale: this.locale, timeZone: this.timeZone, pricePrecision: this.pricePrecision, direction: this.direction },
      this.crosshair,
      drawingContext === null ? [] : this.drawingEngine.getRenderItems(drawingContext.converter, drawingContext.bounds),
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
    if (this.overlays.size === 0) return [];
    const context = this.getPluginRenderContext();
    if (context === null) return [];
    return [...this.overlays.values()]
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
      });
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
      const range = getPaneScaleRange(paneData?.series ?? []);
      const priceScale = new PriceScale(range.min, range.max, { start: pane.top, end: pane.bottom });
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
    const data = this.model.getVisibleData();
    if (data.times.length === 0) return null;
    const paneBounds = getPaneBounds(this.width, this.height, data.panes);
    const bounds = paneBounds.find((pane) => pane.id === "main") ?? paneBounds[0];
    if (bounds === undefined) return null;
    const mainSeries = data.panes.find((pane) => pane.id === bounds.id)?.series ?? data.series;
    const range = getPaneScaleRange(mainSeries);
    const timeScale = new TimeScale(data.times, { start: bounds.left, end: bounds.right }, this.direction);
    const priceScale = new PriceScale(range.min, range.max, { start: bounds.top, end: bounds.bottom });
    return {
      bounds,
      converter: {
        xForTime: (time) => timeScale.xForTime(time),
        yForPrice: (price) => priceScale.yForPrice(price),
        timeForX: (x) => timeScale.timeForX(x),
        priceForY: (y) => priceScale.priceForY(y),
      },
    };
  }

  private createSeriesApi<T extends SeriesPoint>(type: SeriesType, options: SeriesOptions): SeriesApi<T> {
    this.assertAlive();
    const id = this.model.addSeries(type, options);
    return {
      id,
      type,
      setData: (data) => {
        this.assertAlive();
        this.model.setSeriesData(id, data as SeriesData);
        this.refreshIndicatorsFromInput();
        this.emit("dataUpdated", { kind: "set", time: data.at(-1)?.time ?? null, appendOnly: false });
        this.render();
      },
      update: (point) => {
        this.assertAlive();
        const lastTime = type === "candlestick" ? this.model.getLatestCandleTime() : undefined;
        const appendOnly = type === "candlestick" && (lastTime === undefined || point.time > lastTime);
        this.model.updateSeries(id, point);
        if (type === "candlestick") this.refreshIndicatorsFromUpdate(point as Candle, appendOnly);
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

  private refreshIndicatorsFromUpdate(candle: Candle, appendOnly: boolean): void {
    for (const state of this.indicators.values()) {
      state.instance.update(candle);
      this.syncIndicator(state, appendOnly, state.instance.getResultReference?.() ?? state.instance.getResult());
    }
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

export function createChart(container: HTMLElement, options?: ChartOptions): Chart {
  return new Chart(container, options);
}
