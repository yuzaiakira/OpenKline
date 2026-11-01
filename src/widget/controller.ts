import type { Chart } from "../chart.js";
import type { DrawingStyle } from "../drawings/types.js";
import type { OpenKlinePlugin, PluginHandle } from "../extensions/types.js";
import type { IndicatorMetadata, IndicatorParameterDefinition } from "../indicators/types.js";
import type {
  Candle,
  Datafeed,
  IndicatorAddOptions,
  PriceScaleMode,
  PriceScaleOptions,
} from "../types.js";
import { ChartSynchronizationController } from "../synchronization.js";
import { ComparisonEngine, type ComparisonNormalizationMode } from "../comparison.js";
import {
  WatchlistModel,
  parseWatchlistDocument,
  type QuoteProvider,
  type WatchlistDocument,
  type WatchlistQuote,
} from "../studio/watchlist.js";
import type { WorkspaceDocument, WorkspaceRestoreResult } from "../workspace.js";
import type { ReplayApi } from "../replay/types.js";
import { ChartSlot } from "./chart-slot.js";
import {
  chartCountForLayout,
  parseWidgetComposition,
  type WidgetCompositionDocument,
} from "./composition.js";
import {
  COMPARISON_SERIES_PREFIX,
  DEFAULT_TIMEFRAMES,
  MAX_COMPARISON_ASSETS,
  MAX_WATCHLIST_SYMBOLS,
  normalizeWidgetFeatures,
  normalizeWidgetLabels,
} from "./defaults.js";
import { button, field, select } from "./dom.js";
import { WidgetLifecycleError } from "./errors.js";
import { openModalFocus, type ModalFocusSession } from "./focus.js";
import {
  defaultIndicatorParameter,
  formatWidgetName,
  normalizeWidgetDatafeedQuery,
  normalizeWidgetIdentity,
  resolveWidgetDrawingChoices,
  resolveWidgetIndicatorMetadata,
  stableChartIds,
  toColorInputValue,
  type WidgetDrawingChoice,
} from "./helpers.js";
import { acquireWidgetStyles, countWidgetStyleElements } from "./styles.js";
import type {
  InternalWidget,
  WidgetChartType,
  WidgetDataIdentity,
  WidgetDatafeedQuery,
  WidgetDiagnostics,
  WidgetEvent,
  WidgetFeatureVisibility,
  WidgetLabels,
  WidgetLayout,
  WidgetOptions,
  WidgetSnapshot,
  WidgetStatus,
  WidgetStorage,
  WidgetSyncOptions,
} from "./types.js";

export { WidgetLifecycleError } from "./errors.js";
export { normalizeWidgetFeatures, normalizeWidgetLabels } from "./defaults.js";

const COMPARISON_COLORS = ["#f59e0b", "#60a5fa", "#34d399", "#f472b6", "#a78bfa", "#fb7185", "#2dd4bf", "#facc15"] as const;

export function createOpenKlineWidget(options: WidgetOptions): InternalWidget {
  return new InternalWidgetController(options);
}

class InternalWidgetController implements InternalWidget {
  private readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private readonly chartGrid: HTMLElement;
  private readonly modalLayer: HTMLElement;
  private readonly modalBackdrop: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly errorElement: HTMLElement;
  private readonly labels: WidgetLabels;
  private readonly features: WidgetFeatureVisibility;
  private readonly storage: WidgetStorage | null;
  private readonly storageKey: string;
  private readonly chartOptionsBase: WidgetOptions["chartOptions"];
  private readonly initialPlugins: readonly OpenKlinePlugin[];
  private readonly availableIndicators: readonly IndicatorMetadata[];
  private readonly availableDrawings: readonly WidgetDrawingChoice[];
  private readonly domCleanups: Array<() => void> = [];
  private readonly listeners = new Set<(event: WidgetEvent) => void>();
  private readonly releaseStyles: () => void;
  private readonly slots = new Map<string, ChartSlot>();
  private readonly syncController: ChartSynchronizationController;
  private readonly syncUnregisters = new Map<string, () => void>();
  private readonly comparisonEngine = new ComparisonEngine({ mode: "percentage" });
  private readonly comparisonSeriesIds = new Set<string>();
  private watchlistModel: WatchlistModel;
  private quoteProvider: QuoteProvider | null;
  private quoteUnsubscribe: (() => void) | null = null;
  private quotes: readonly WatchlistQuote[] = [];
  private layout: WidgetLayout;
  private activeChartId: string;
  private syncOptions: Required<WidgetSyncOptions>;
  private storageRequest: AbortController | null = null;
  private destroyed = false;
  private status: WidgetStatus = "idle";
  private error: string | null = null;
  private chartType: WidgetChartType;
  private theme: "light" | "dark";
  private direction: "ltr" | "rtl";
  private pricePrecision: number | null;
  private symbolInput: HTMLInputElement | null = null;
  private timeframeSelect: HTMLSelectElement | null = null;
  private chartTypeSelect: HTMLSelectElement | null = null;
  private themeButton: HTMLButtonElement | null = null;
  private directionButton: HTMLButtonElement | null = null;
  private layoutSelect: HTMLSelectElement | null = null;
  private readonly panels = new Map<string, { panel: HTMLElement; trigger: HTMLButtonElement }>();
  private openModal: ModalFocusSession | null = null;
  private selectedIndicatorId: string | null = null;
  private selectedIndicatorInstanceId: string | null = null;
  private comparisonBaselineMaxAgeMs = 0;
  private archivedSlots = new Map<string, { workspace: WorkspaceDocument; symbol: string | null; timeframe: string | null; chartType: WidgetChartType }>();

  public constructor(options: WidgetOptions) {
    if (!(options.container instanceof HTMLElement)) throw new WidgetLifecycleError("Widget container must be an HTMLElement");
    const document = options.container.ownerDocument;
    this.releaseStyles = acquireWidgetStyles(document);
    this.features = normalizeWidgetFeatures(options.features);
    this.labels = normalizeWidgetLabels(options.labels);
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? "openkline-widget-workspace";
    this.chartOptionsBase = options.chartOptions;
    this.initialPlugins = options.plugins ?? [];
    this.chartType = options.chartType ?? "candlestick";
    this.theme = options.chartOptions?.theme === "dark" ? "dark" : "light";
    this.direction = options.chartOptions?.direction ?? "ltr";
    this.pricePrecision = options.chartOptions?.pricePrecision ?? null;
    this.availableIndicators = resolveWidgetIndicatorMetadata(options.indicatorChoices);
    this.availableDrawings = resolveWidgetDrawingChoices(options.drawingChoices);
    this.layout = options.layout ?? "single";
    this.syncOptions = {
      enabled: options.synchronization?.enabled ?? false,
      crosshair: options.synchronization?.crosshair ?? false,
      visibleRange: options.synchronization?.visibleRange ?? false,
    };
    this.syncController = new ChartSynchronizationController({
      enabled: this.syncOptions.enabled,
      crosshair: this.syncOptions.crosshair,
      visibleRange: this.syncOptions.visibleRange,
    });
    this.watchlistModel = new WatchlistModel(options.watchlist ?? { version: 1, selectedWatchlistId: null, lists: [] });
    this.quoteProvider = options.quoteProvider ?? null;

    this.root = document.createElement("section");
    this.root.dataset.openklineWidget = "";
    this.root.dataset.status = this.status;
    this.root.dataset.theme = this.theme;
    this.root.dataset.direction = this.direction;
    this.root.dir = this.direction;
    this.root.setAttribute("aria-label", this.labels.widgetLabel);

    this.content = document.createElement("div");
    this.content.dataset.openklineContent = "";
    this.chartGrid = document.createElement("div");
    this.chartGrid.dataset.openklineChartGrid = "";
    this.chartGrid.dataset.layout = this.layout;
    this.modalLayer = document.createElement("div");
    this.modalLayer.dataset.openklineModalLayer = "";
    this.modalLayer.hidden = true;
    this.modalBackdrop = document.createElement("div");
    this.modalBackdrop.dataset.openklineModalBackdrop = "";
    this.modalLayer.append(this.modalBackdrop);
    this.statusElement = document.createElement("div");
    this.statusElement.dataset.openklineStatus = "";
    this.statusElement.setAttribute("role", "status");
    this.statusElement.setAttribute("aria-live", "polite");
    this.errorElement = document.createElement("div");
    this.errorElement.dataset.openklineError = "";
    this.errorElement.setAttribute("role", "alert");
    const toolbar = this.createToolbar(document, options);
    this.content.append(this.chartGrid, this.statusElement, this.errorElement, this.modalLayer);
    this.root.append(toolbar, this.content);
    options.container.append(this.root);

    const ids = stableChartIds(chartCountForLayout(this.layout));
    this.activeChartId = ids[0]!;
    for (const id of ids) {
      const seed: {
        data?: readonly Candle[];
        dataIdentity?: WidgetDataIdentity;
        datafeed?: Datafeed | null;
        datafeedQuery?: WidgetDatafeedQuery | null;
      } = {};
      if (id === this.activeChartId) {
        if (options.data !== undefined) seed.data = options.data;
        const identity = normalizeWidgetIdentity(options.dataIdentity);
        if (identity !== undefined) seed.dataIdentity = identity;
        if (options.datafeed !== undefined) seed.datafeed = options.datafeed;
        if (options.datafeedQuery !== undefined) seed.datafeedQuery = normalizeWidgetDatafeedQuery(options.datafeedQuery);
      }
      this.createSlot(id, seed);
    }
    this.refreshActiveMarkers();
    this.attachQuoteProvider();
    this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
  }

  public getChart(): Chart {
    return this.activeSlot().chart;
  }

  public getCharts(): ReadonlyMap<string, Chart> {
    this.assertAlive();
    return new Map([...this.slots.entries()].map(([id, slot]) => [id, slot.chart]));
  }

  public getActiveChartId(): string {
    this.assertAlive();
    return this.activeChartId;
  }

  public setActiveChartId(id: string): void {
    this.assertAlive();
    if (!this.slots.has(id)) throw new WidgetLifecycleError(`Unknown chart id: ${id}`);
    this.activeChartId = id;
    this.refreshActiveMarkers();
    this.refreshOpenPanels();
    this.emitState();
  }

  public getLayout(): WidgetLayout {
    this.assertAlive();
    return this.layout;
  }

  public setLayout(layout: WidgetLayout): void {
    this.assertAlive();
    if (layout === this.layout) return;
    const nextCount = chartCountForLayout(layout);
    const currentIds = [...this.slots.keys()];
    const nextIds = stableChartIds(nextCount);

    // Archive slots that will be removed so layout switches can restore them.
    for (const id of currentIds) {
      if (nextIds.includes(id)) continue;
      const slot = this.slots.get(id)!;
      this.archivedSlots.set(id, {
        workspace: slot.exportWorkspace(),
        symbol: slot.symbol,
        timeframe: slot.timeframe,
        chartType: slot.chartType,
      });
      this.unregisterSync(id);
      slot.destroy();
      this.slots.delete(id);
    }

    for (const id of nextIds) {
      if (this.slots.has(id)) continue;
      const archived = this.archivedSlots.get(id);
      this.createSlot(id, {});
      if (archived !== undefined) {
        const slot = this.slots.get(id)!;
        slot.chartType = archived.chartType;
        slot.importWorkspace(archived.workspace);
        this.archivedSlots.delete(id);
      }
    }

    this.layout = layout;
    this.chartGrid.dataset.layout = layout;
    if (!this.slots.has(this.activeChartId)) this.activeChartId = nextIds[0]!;
    if (this.layoutSelect !== null) this.layoutSelect.value = layout;
    this.refreshActiveMarkers();
    this.emitState();
  }

  public getSynchronization(): Required<WidgetSyncOptions> {
    this.assertAlive();
    return { ...this.syncOptions };
  }

  public setSynchronization(options: WidgetSyncOptions): void {
    this.assertAlive();
    this.syncOptions = {
      enabled: options.enabled ?? this.syncOptions.enabled,
      crosshair: options.crosshair ?? this.syncOptions.crosshair,
      visibleRange: options.visibleRange ?? this.syncOptions.visibleRange,
    };
    this.syncController.setOptions(this.syncOptions);
    this.emitState();
  }

  public getState(): WidgetSnapshot {
    const active = this.slots.get(this.activeChartId);
    return {
      status: this.status,
      symbol: active?.symbol ?? null,
      timeframe: active?.timeframe ?? null,
      requestedSymbol: active?.requestedSymbol ?? null,
      requestedTimeframe: active?.requestedTimeframe ?? null,
      identityStatus: active?.identityStatus ?? "unbound",
      chartType: active?.chartType ?? this.chartType,
      theme: this.theme,
      direction: this.direction,
      hasData: active?.hasData ?? false,
      error: this.error ?? active?.error ?? null,
      features: this.features,
      layout: this.layout,
      activeChartId: this.activeChartId,
      charts: [...this.slots.values()].map((slot) => ({
        id: slot.id,
        active: slot.id === this.activeChartId,
        symbol: slot.symbol,
        timeframe: slot.timeframe,
        requestedSymbol: slot.requestedSymbol,
        requestedTimeframe: slot.requestedTimeframe,
        identityStatus: slot.identityStatus,
        hasData: slot.hasData,
        error: slot.error,
        replay: slot.getReplayStatus(),
      })),
      synchronization: { ...this.syncOptions },
    };
  }

  public getDiagnostics(): WidgetDiagnostics {
    return {
      destroyed: this.destroyed,
      domListeners: this.domCleanups.length,
      chartSubscriptions: [...this.slots.values()].reduce((total, slot) => total + slot.getSubscriptionCount(), 0),
      pendingDataRequest: [...this.slots.values()].some((slot) => slot.hasPendingDataRequest()),
      canvasCount: this.destroyed ? 0 : this.root.querySelectorAll("canvas").length,
      styleElementCount: countWidgetStyleElements(this.root.ownerDocument),
      chartCount: this.slots.size,
      syncEnabled: this.syncOptions.enabled,
    };
  }

  public setData(candles: readonly Candle[], identity?: WidgetDataIdentity): void {
    this.assertAlive();
    try {
      this.activeSlot().setData(candles, identity === undefined ? undefined : normalizeWidgetIdentity(identity));
      this.chartType = this.activeSlot().chartType;
      this.error = null;
      this.setStatus(candles.length > 0 ? "ready" : "empty");
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public async setDatafeed(datafeed: Datafeed, query: WidgetDatafeedQuery): Promise<void> {
    this.assertAlive();
    this.setStatus("loading");
    try {
      await this.activeSlot().setDatafeed(datafeed, normalizeWidgetDatafeedQuery(query));
      this.error = null;
      this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public async setSymbol(symbol: string): Promise<void> {
    this.assertAlive();
    this.setStatus("loading");
    try {
      await this.activeSlot().setSymbol(symbol);
      this.error = null;
      this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public async setTimeframe(timeframe: string): Promise<void> {
    this.assertAlive();
    this.setStatus("loading");
    try {
      await this.activeSlot().setTimeframe(timeframe);
      this.error = null;
      this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public setChartType(type: WidgetChartType): void {
    this.assertAlive();
    this.chartType = type;
    this.activeSlot().setChartType(type);
    this.emitState();
  }

  public setTheme(theme: "light" | "dark"): void {
    this.assertAlive();
    this.theme = theme;
    for (const slot of this.slots.values()) slot.chart.setOptions({ theme });
    this.renderShell();
    this.emitState();
  }

  public setDirection(direction: "ltr" | "rtl"): void {
    this.assertAlive();
    this.direction = direction;
    for (const slot of this.slots.values()) slot.chart.setOptions({ direction });
    this.renderShell();
    this.emitState();
  }

  public addIndicator(indicatorId: string, options: IndicatorAddOptions = {}): string {
    this.assertAlive();
    try {
      return this.activeSlot().addIndicator(indicatorId, options);
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public startDrawing(type: string, options: { readonly snap?: "none" | "visible-ohlc" } = {}): void {
    this.assertAlive();
    this.activeSlot().startDrawing(type, options);
  }

  public async saveWorkspace(key = this.storageKey): Promise<void> {
    this.assertAlive();
    if (this.storage === null) throw new WidgetLifecycleError("Widget storage is not configured");
    this.storageRequest?.abort();
    this.storageRequest = new AbortController();
    const payload = JSON.stringify(this.exportComposition());
    await this.storage.save(key, payload, this.storageRequest.signal);
  }

  public async loadWorkspace(key = this.storageKey): Promise<WorkspaceRestoreResult> {
    this.assertAlive();
    if (this.storage === null) throw new WidgetLifecycleError("Widget storage is not configured");
    this.storageRequest?.abort();
    this.storageRequest = new AbortController();
    const raw = await this.storage.load(key, this.storageRequest.signal);
    if (raw === null || raw === undefined) throw new WidgetLifecycleError("Workspace storage entry was empty");
    const value = typeof raw === "string" ? JSON.parse(raw) as unknown : raw;
    if (isCompositionLike(value)) {
      this.importComposition(value);
      return this.activeSlot().importWorkspace(this.activeSlot().exportWorkspace());
    }
    return this.importWorkspace(value);
  }

  public exportWorkspace(): WorkspaceDocument {
    this.assertAlive();
    return this.activeSlot().exportWorkspace();
  }

  public importWorkspace(value: unknown): WorkspaceRestoreResult {
    this.assertAlive();
    try {
      const result = this.activeSlot().importWorkspace(value);
      this.chartType = this.activeSlot().chartType;
      this.error = null;
      this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
      return result;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public exportComposition(): WidgetCompositionDocument {
    this.assertAlive();
    return parseWidgetComposition({
      version: 1,
      layout: this.layout,
      activeChartId: this.activeChartId,
      charts: [...this.slots.values()].map((slot) => ({
        id: slot.id,
        symbol: slot.symbol,
        timeframe: slot.timeframe,
        workspace: slot.exportWorkspace(),
      })),
      synchronization: { ...this.syncOptions },
      watchlist: this.watchlistModel.getDocument(),
      comparison: {
        active: this.comparisonSeriesIds.size > 0,
        mode: this.comparisonEngine.getMode(),
        baselineTime: this.comparisonEngine.getBaseline()?.time ?? null,
        baselineMaxAgeMs: this.comparisonEngine.getBaseline()?.maxAgeMs ?? this.comparisonBaselineMaxAgeMs,
        assetIds: this.comparisonEngine.getAssetIds(),
      },
    });
  }

  public importComposition(value: unknown): void {
    this.assertAlive();
    const parsed = parseWidgetComposition(value);
    this.setLayout(parsed.layout);
    for (const chart of parsed.charts) {
      const slot = this.slots.get(chart.id);
      if (slot === undefined) continue;
      slot.importWorkspace(chart.workspace);
    }
    this.setActiveChartId(parsed.activeChartId);
    this.setSynchronization(parsed.synchronization);
    this.watchlistModel = new WatchlistModel(parsed.watchlist);
    this.attachQuoteProvider();
    if (parsed.comparison !== undefined) {
      this.clearComparison();
      this.comparisonEngine.setMode(parsed.comparison.mode);
      this.comparisonBaselineMaxAgeMs = parsed.comparison.baselineMaxAgeMs;
      this.comparisonEngine.setBaseline(parsed.comparison.baselineTime, { maxAgeMs: parsed.comparison.baselineMaxAgeMs });
      // Asset candles are host-owned; composition restores configuration only.
    }
    this.error = null;
    this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
  }

  public getWatchlist(): WatchlistDocument {
    this.assertAlive();
    return this.watchlistModel.getDocument();
  }

  public setWatchlist(document: WatchlistDocument): void {
    this.assertAlive();
    this.watchlistModel = new WatchlistModel(parseWatchlistDocument(document));
    this.attachQuoteProvider();
    this.refreshOpenPanels();
    this.emitState();
  }

  public setQuoteProvider(provider: QuoteProvider | null): void {
    this.assertAlive();
    this.quoteProvider = provider;
    this.attachQuoteProvider();
    this.refreshOpenPanels();
  }

  public getQuotes(): readonly WatchlistQuote[] {
    this.assertAlive();
    return this.quotes.map((quote) => ({ ...quote }));
  }

  public setComparisonMode(mode: ComparisonNormalizationMode): void {
    this.assertAlive();
    this.comparisonEngine.setMode(mode);
    this.applyComparisonSeries();
    this.refreshOpenPanels();
  }

  public setComparisonBaseline(time: number | null, options: { readonly maxAgeMs?: number } = {}): void {
    this.assertAlive();
    if (options.maxAgeMs !== undefined) this.comparisonBaselineMaxAgeMs = options.maxAgeMs;
    this.comparisonEngine.setBaseline(time, { maxAgeMs: this.comparisonBaselineMaxAgeMs });
    this.applyComparisonSeries();
    this.refreshOpenPanels();
  }

  public addComparisonAsset(id: string, candles: readonly Candle[], options: { readonly label?: string; readonly color?: string } = {}): void {
    this.assertAlive();
    if (this.comparisonEngine.getAssetIds().length >= MAX_COMPARISON_ASSETS) {
      throw new WidgetLifecycleError(`Comparison supports at most ${MAX_COMPARISON_ASSETS} assets`);
    }
    const color = options.color ?? COMPARISON_COLORS[this.comparisonEngine.getAssetIds().length % COMPARISON_COLORS.length]!;
    this.comparisonEngine.addAsset({
      id,
      label: options.label ?? id,
      ...(color === undefined ? {} : { color }),
      data: candles.map((candle) => ({ time: candle.time, price: candle.close })),
    });
    this.applyComparisonSeries();
    this.refreshOpenPanels();
  }

  public removeComparisonAsset(id: string): void {
    this.assertAlive();
    this.comparisonEngine.removeAsset(id);
    this.applyComparisonSeries();
    this.refreshOpenPanels();
  }

  public clearComparison(): void {
    this.assertAlive();
    this.comparisonEngine.clear();
    this.applyComparisonSeries();
    this.refreshOpenPanels();
  }

  public getReplay(): ReplayApi | null {
    this.assertAlive();
    return this.activeSlot().getReplay();
  }

  public enterReplay(options: { readonly startAt?: number; readonly speed?: number } = {}): ReplayApi {
    this.assertAlive();
    try {
      return this.activeSlot().enterReplay(options);
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public exitReplay(): void {
    this.assertAlive();
    this.activeSlot().exitReplay();
  }

  public installPlugin(plugin: OpenKlinePlugin): PluginHandle {
    this.assertAlive();
    return this.activeSlot().chart.installPlugin(plugin);
  }

  public subscribe(listener: (event: WidgetEvent) => void): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.closeOpenModal();
    this.storageRequest?.abort();
    this.storageRequest = null;
    this.quoteUnsubscribe?.();
    this.quoteUnsubscribe = null;
    for (const cleanup of this.domCleanups.splice(0)) cleanup();
    for (const id of [...this.slots.keys()]) {
      this.unregisterSync(id);
      this.slots.get(id)?.destroy();
      this.slots.delete(id);
    }
    this.syncController.destroy();
    this.comparisonEngine.dispose();
    this.releaseStyles();
    this.root.remove();
    this.status = "destroyed";
    this.error = null;
    this.listeners.clear();
  }

  private createSlot(
    id: string,
    seed: {
      data?: readonly Candle[];
      dataIdentity?: WidgetDataIdentity;
      datafeed?: Datafeed | null;
      datafeedQuery?: WidgetDatafeedQuery | null;
    },
  ): ChartSlot {
    const document = this.root.ownerDocument;
    const chartOptions = {
      ...(this.chartOptionsBase ?? {}),
      autoSize: this.chartOptionsBase?.autoSize ?? true,
      theme: this.chartOptionsBase?.theme ?? this.theme,
      direction: this.direction,
    };
    const slot = new ChartSlot({
      id,
      document,
      grid: this.chartGrid,
      chartOptions,
      chartType: this.chartType,
      ...(seed.data === undefined ? {} : { data: seed.data }),
      ...(seed.dataIdentity === undefined ? {} : { dataIdentity: seed.dataIdentity }),
      ...(seed.datafeed === undefined ? {} : { datafeed: seed.datafeed }),
      ...(seed.datafeedQuery === undefined ? {} : { datafeedQuery: seed.datafeedQuery }),
      plugins: this.initialPlugins,
      onEvent: (chartId, name, payload) => {
        this.emit({ type: "chart", name, payload, chartId });
        if (chartId === this.activeChartId) this.refreshOpenPanels();
      },
      onStateChange: () => {
        if (this.destroyed) return;
        const active = this.activeSlot();
        if (active.error !== null) this.error = active.error;
        this.renderShell();
        this.emitState();
      },
    });
    this.onDom(slot.slotElement, "pointerdown", () => {
      if (this.activeChartId !== id) this.setActiveChartId(id);
    });
    this.slots.set(id, slot);
    this.registerSync(id, slot);
    return slot;
  }

  private registerSync(id: string, slot: ChartSlot): void {
    this.unregisterSync(id);
    const unregister = this.syncController.addChart(id, slot.chart);
    this.syncUnregisters.set(id, unregister);
  }

  private unregisterSync(id: string): void {
    const unregister = this.syncUnregisters.get(id);
    if (unregister === undefined) return;
    unregister();
    this.syncUnregisters.delete(id);
  }

  private activeSlot(): ChartSlot {
    this.assertAlive();
    const slot = this.slots.get(this.activeChartId);
    if (slot === undefined) throw new WidgetLifecycleError("Active chart slot is missing");
    return slot;
  }

  private refreshActiveMarkers(): void {
    for (const slot of this.slots.values()) slot.setActive(slot.id === this.activeChartId);
  }

  private createToolbar(document: Document, options: WidgetOptions): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.dataset.openklineToolbar = "";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", this.labels.widgetLabel);
    if (!this.features.header) toolbar.hidden = true;

    if (this.features.symbol) {
      this.symbolInput = document.createElement("input");
      this.symbolInput.placeholder = "BTC-USD";
      this.symbolInput.setAttribute("aria-label", this.labels.symbol);
      const load = button(document, this.labels.load, this.labels.load);
      toolbar.append(field(document, this.labels.symbol, this.symbolInput), load);
      this.onDom(load, "click", () => { void this.setSymbol(this.symbolInput!.value).catch(() => undefined); });
      this.onDom(this.symbolInput, "keydown", (event) => {
        if ((event as KeyboardEvent).key === "Enter") void this.setSymbol(this.symbolInput!.value).catch(() => undefined);
      });
    }
    if (this.features.timeframe) {
      this.timeframeSelect = select(document, this.labels.timeframe, [...DEFAULT_TIMEFRAMES]);
      toolbar.append(field(document, this.labels.timeframe, this.timeframeSelect));
      this.onDom(this.timeframeSelect, "change", () => { void this.setTimeframe(this.timeframeSelect!.value).catch(() => undefined); });
    }
    if (this.features.chartType) {
      this.chartTypeSelect = select(document, this.labels.chartType, ["candlestick", "ohlc", "hollow-candlestick", "heikin-ashi", "line", "area", "baseline"]);
      this.chartTypeSelect.value = this.chartType;
      toolbar.append(field(document, this.labels.chartType, this.chartTypeSelect));
      this.onDom(this.chartTypeSelect, "change", () => this.setChartType(this.chartTypeSelect!.value as WidgetChartType));
    }
    if (this.features.layout) {
      this.layoutSelect = select(document, this.labels.layout, ["single", "two-horizontal", "two-vertical", "four-grid"]);
      this.layoutSelect.value = this.layout;
      toolbar.append(field(document, this.labels.layout, this.layoutSelect));
      this.onDom(this.layoutSelect, "change", () => this.setLayout(this.layoutSelect!.value as WidgetLayout));
    }
    if (this.features.indicators) {
      const indicatorSelect = select(document, this.labels.indicators, options.indicatorChoices ?? ["SMA", "EMA", "RSI", "MACD", "BOLLINGER_BANDS"]);
      const addIndicatorButton = button(document, this.labels.add, this.labels.add);
      toolbar.append(field(document, this.labels.indicators, indicatorSelect), addIndicatorButton);
      this.onDom(addIndicatorButton, "click", () => {
        const indicatorId = indicatorSelect.value;
        const pane = ["RSI", "MACD"].includes(indicatorId) ? "new" : "main";
        this.addIndicator(indicatorId, { pane, period: 14 });
      });
    }
    if (this.features.drawings) {
      const drawingSelect = select(document, this.labels.drawings, this.availableDrawings.map((item) => item.type));
      const startDrawingButton = button(document, this.labels.start, this.labels.start);
      toolbar.append(field(document, this.labels.drawings, drawingSelect), startDrawingButton);
      this.onDom(startDrawingButton, "click", () => this.startDrawing(drawingSelect.value, { snap: "visible-ohlc" }));
    }
    if (this.features.theme) {
      this.themeButton = button(document, this.labels.theme, this.labels.theme);
      toolbar.append(this.themeButton);
      this.onDom(this.themeButton, "click", () => this.setTheme(this.theme === "dark" ? "light" : "dark"));
    }
    if (this.features.direction) {
      this.directionButton = button(document, this.labels.direction, this.labels.direction);
      toolbar.append(this.directionButton);
      this.onDom(this.directionButton, "click", () => this.setDirection(this.direction === "rtl" ? "ltr" : "rtl"));
    }
    if (this.features.workspace && this.storage !== null) {
      const saveButton = button(document, this.labels.saveWorkspace, this.labels.saveWorkspace);
      const loadButton = button(document, this.labels.loadWorkspace, this.labels.loadWorkspace);
      toolbar.append(saveButton, loadButton);
      this.onDom(saveButton, "click", () => { void this.saveWorkspace().catch(() => undefined); });
      this.onDom(loadButton, "click", () => { void this.loadWorkspace().catch(() => undefined); });
    }

    this.createPanelTriggers(document, toolbar);
    return toolbar;
  }

  private createPanelTriggers(document: Document, toolbar: HTMLElement): void {
    const specs: Array<{ key: string; label: string; enabled: boolean; build: (body: HTMLElement) => void }> = [
      { key: "indicator-explorer", label: this.labels.indicatorExplorer, enabled: this.features.indicatorExplorer && this.features.indicators, build: (body) => this.buildIndicatorPanel(body) },
      { key: "drawing-toolbar", label: this.labels.drawingToolbar, enabled: this.features.drawingToolbar && this.features.drawings, build: (body) => this.buildDrawingPanel(body) },
      { key: "object-tree", label: this.labels.objectTree, enabled: this.features.objectTree && (this.features.drawings || this.features.indicators), build: () => undefined },
      { key: "drawing-properties", label: this.labels.drawingProperties, enabled: this.features.drawingProperties && this.features.drawings, build: () => undefined },
      { key: "chart-settings", label: this.labels.chartSettings, enabled: this.features.chartSettings, build: (body) => this.buildSettingsPanel(body) },
      { key: "synchronization", label: this.labels.synchronization, enabled: this.features.synchronization, build: (body) => this.buildSyncPanel(body) },
      { key: "watchlist", label: this.labels.watchlist, enabled: this.features.watchlist, build: (body) => this.buildWatchlistPanel(body) },
      { key: "comparison", label: this.labels.comparison, enabled: this.features.comparison, build: (body) => this.buildComparisonPanel(body) },
      { key: "replay", label: this.labels.replay, enabled: this.features.replay, build: (body) => this.buildReplayPanel(body) },
    ];

    for (const spec of specs) {
      if (!spec.enabled) continue;
      const trigger = button(document, spec.label, spec.label);
      trigger.dataset.openklinePanelTrigger = spec.key;
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-haspopup", "dialog");
      toolbar.append(trigger);
      const panel = document.createElement("section");
      panel.dataset.openklinePanel = spec.key;
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", spec.label);
      const header = document.createElement("div");
      header.dataset.openklinePanelHeader = "";
      const title = document.createElement("span");
      title.dataset.openklinePanelTitle = "";
      title.textContent = spec.label;
      const close = button(document, this.labels.close, this.labels.close);
      close.dataset.openklinePanelClose = spec.key;
      header.append(title, close);
      const body = document.createElement("div");
      body.dataset.openklinePanelBody = "";
      panel.append(header, body);
      spec.build(body);
      this.modalLayer.append(panel);
      this.panels.set(spec.key, { panel, trigger });
      this.onDom(trigger, "click", () => this.togglePanel(spec.key));
      this.onDom(close, "click", () => this.closePanel(spec.key));
      this.onDom(panel, "click", (event) => this.handlePanelClick(spec.key, event));
    }
    this.onDom(this.modalBackdrop, "click", () => {
      const openKey = [...this.panels.entries()].find(([, value]) => !value.panel.hidden)?.[0];
      if (openKey !== undefined) this.closePanel(openKey);
    });
  }

  private togglePanel(key: string): void {
    const entry = this.panels.get(key);
    if (entry === undefined) return;
    if (!entry.panel.hidden) {
      this.closePanel(key);
      return;
    }
    for (const [otherKey, other] of this.panels) {
      if (!other.panel.hidden) this.closePanel(otherKey);
    }
    entry.panel.hidden = false;
    entry.trigger.setAttribute("aria-expanded", "true");
    this.modalLayer.hidden = false;
    const keepChartInteractive = key === "drawing-toolbar" || key === "replay";
    this.modalLayer.dataset.chartInteractive = String(keepChartInteractive);
    this.refreshPanel(key);
    this.openModal = openModalFocus(entry.panel, entry.trigger, () => this.closePanel(key), {
      keepChartInteractive,
    });
  }

  private closePanel(key: string): void {
    const entry = this.panels.get(key);
    if (entry === undefined) return;
    entry.panel.hidden = true;
    entry.trigger.setAttribute("aria-expanded", "false");
    const release = this.openModal;
    this.openModal = null;
    release?.release();
    if ([...this.panels.values()].every((item) => item.panel.hidden)) this.modalLayer.hidden = true;
  }

  private closeOpenModal(): void {
    for (const key of this.panels.keys()) {
      if (!this.panels.get(key)!.panel.hidden) this.closePanel(key);
    }
  }

  private refreshOpenPanels(): void {
    for (const [key, entry] of this.panels) {
      if (!entry.panel.hidden) this.refreshPanel(key);
    }
  }

  private refreshPanel(key: string): void {
    const entry = this.panels.get(key);
    if (entry === undefined) return;
    if (key === "indicator-explorer") this.renderIndicatorExplorer(entry.panel);
    if (key === "drawing-toolbar") this.renderDrawingToolbar(entry.panel);
    if (key === "object-tree") this.renderObjectTree(entry.panel);
    if (key === "drawing-properties") this.renderDrawingProperties(entry.panel);
    if (key === "chart-settings") this.renderSettingsPanel(entry.panel);
    if (key === "synchronization") this.renderSyncPanel(entry.panel);
    if (key === "watchlist") this.renderWatchlistPanel(entry.panel);
    if (key === "comparison") this.renderComparisonPanel(entry.panel);
    if (key === "replay") this.renderReplayPanel(entry.panel);
  }

  private handlePanelClick(key: string, event: Event): void {
    if (key === "indicator-explorer") this.handleIndicatorPanelClick(event);
    if (key === "drawing-toolbar") this.handleDrawingPanelClick(event);
    if (key === "object-tree") this.handleObjectPanelClick(event);
    if (key === "drawing-properties") this.handleDrawingPropertyClick(event);
    if (key === "chart-settings") this.handleSettingsPanelClick(event);
    if (key === "synchronization") this.handleSyncPanelClick(event);
    if (key === "watchlist") this.handleWatchlistPanelClick(event);
    if (key === "comparison") this.handleComparisonPanelClick(event);
    if (key === "replay") this.handleReplayPanelClick(event);
  }

  private buildIndicatorPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    const search = document.createElement("input");
    search.type = "search";
    search.dataset.openklinePanelSearch = "";
    search.placeholder = "Search indicators";
    search.setAttribute("aria-label", "Search indicators");
    const list = document.createElement("div");
    list.dataset.openklinePanelList = "";
    const form = document.createElement("div");
    form.dataset.openklinePanelForm = "";
    const activeTitle = document.createElement("span");
    activeTitle.dataset.openklinePanelSubtitle = "";
    activeTitle.textContent = "Active indicators";
    const active = document.createElement("div");
    active.dataset.openklineIndicatorActive = "";
    body.append(search, list, form, activeTitle, active);
    this.onDom(search, "input", () => this.renderIndicatorExplorer(body.parentElement as HTMLElement));
  }

  private buildDrawingPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    const tools = document.createElement("div");
    tools.dataset.openklineToolGrid = "";
    const actions = document.createElement("div");
    actions.dataset.openklineToolGrid = "";
    for (const [label, action] of [[this.labels.cancel, "cancel"], [this.labels.undo, "undo"], [this.labels.redo, "redo"]] as const) {
      const item = button(document, label, label);
      item.dataset.openklineDrawingAction = action;
      actions.append(item);
    }
    body.append(tools, actions);
  }

  private buildSettingsPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    const grid = document.createElement("div");
    grid.dataset.openklineSettingsGrid = "";
    const theme = select(document, this.labels.theme, ["light", "dark"]);
    theme.dataset.openklineSetting = "theme";
    const direction = select(document, this.labels.direction, ["ltr", "rtl"]);
    direction.dataset.openklineSetting = "direction";
    const scale = select(document, "Price scale", ["linear", "logarithmic", "percentage", "indexed"]);
    scale.dataset.openklineSetting = "priceScaleMode";
    const autoScale = document.createElement("input");
    autoScale.type = "checkbox";
    autoScale.dataset.openklineSetting = "autoScale";
    autoScale.setAttribute("aria-label", "Auto scale");
    const axisVisible = document.createElement("input");
    axisVisible.type = "checkbox";
    axisVisible.dataset.openklineSetting = "axisVisible";
    axisVisible.setAttribute("aria-label", "Price axis visible");
    const precision = document.createElement("input");
    precision.type = "number";
    precision.min = "0";
    precision.max = "12";
    precision.step = "1";
    precision.dataset.openklineSetting = "pricePrecision";
    grid.append(
      field(document, this.labels.theme, theme),
      field(document, this.labels.direction, direction),
      field(document, "Price scale", scale),
      field(document, "Auto scale", autoScale),
      field(document, "Price axis", axisVisible),
      field(document, "Precision", precision),
    );
    const apply = button(document, this.labels.apply, this.labels.apply);
    apply.dataset.openklineSettingsAction = "apply";
    body.append(grid, apply);
  }

  private buildSyncPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    for (const [label, key] of [
      [this.labels.syncEnabled, "enabled"],
      [this.labels.syncCrosshair, "crosshair"],
      [this.labels.syncVisibleRange, "visibleRange"],
    ] as const) {
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.openklineSyncOption = key;
      input.setAttribute("aria-label", label);
      body.append(field(document, label, input));
    }
  }

  private buildWatchlistPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    const form = document.createElement("div");
    form.dataset.openklinePanelForm = "";
    const symbol = document.createElement("input");
    symbol.dataset.openklineWatchlistInput = "symbol";
    symbol.placeholder = "BTC-USD";
    symbol.setAttribute("aria-label", "Watchlist symbol");
    const add = button(document, this.labels.add, this.labels.add);
    add.dataset.openklineWatchlistAction = "add";
    form.append(field(document, this.labels.symbol, symbol), add);
    const list = document.createElement("div");
    list.dataset.openklineWatchlistList = "";
    const empty = document.createElement("div");
    empty.dataset.openklinePanelEmpty = "";
    empty.textContent = "No watchlist symbols";
    body.append(form, list, empty);
  }

  private buildComparisonPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    const form = document.createElement("div");
    form.dataset.openklinePanelForm = "";
    const asset = document.createElement("input");
    asset.dataset.openklineComparisonInput = "asset";
    asset.placeholder = "ETH-USD";
    asset.setAttribute("aria-label", "Comparison asset id");
    const mode = select(document, this.labels.normalization, ["percentage", "indexed"]);
    mode.dataset.openklineComparisonInput = "mode";
    const add = button(document, this.labels.add, this.labels.add);
    add.dataset.openklineComparisonAction = "add-active";
    const clear = button(document, this.labels.remove, "Clear");
    clear.dataset.openklineComparisonAction = "clear";
    form.append(field(document, "Asset", asset), field(document, this.labels.normalization, mode), add, clear);
    const list = document.createElement("div");
    list.dataset.openklineComparisonList = "";
    body.append(form, list);
  }

  private buildReplayPanel(body: HTMLElement): void {
    const document = body.ownerDocument;
    const grid = document.createElement("div");
    grid.dataset.openklineReplayGrid = "";
    const status = document.createElement("div");
    status.dataset.openklineReplayStatus = "";
    status.setAttribute("role", "status");
    const actions = document.createElement("div");
    actions.dataset.openklineToolGrid = "";
    for (const [label, action] of [
      ["Enter", "enter"],
      [this.labels.play, "play"],
      [this.labels.pause, "pause"],
      [this.labels.stepBackward, "step-backward"],
      [this.labels.stepForward, "step-forward"],
      [this.labels.exitReplay, "exit"],
    ] as const) {
      const item = button(document, label, label);
      item.dataset.openklineReplayAction = action;
      actions.append(item);
    }
    const speed = document.createElement("input");
    speed.type = "number";
    speed.min = "0.25";
    speed.max = "16";
    speed.step = "0.25";
    speed.value = "1";
    speed.dataset.openklineReplayInput = "speed";
    speed.setAttribute("aria-label", this.labels.speed);
    const seek = document.createElement("input");
    seek.type = "number";
    seek.min = "0";
    seek.step = "1";
    seek.dataset.openklineReplayInput = "seek";
    seek.setAttribute("aria-label", this.labels.seek);
    const applySeek = button(document, this.labels.seek, this.labels.seek);
    applySeek.dataset.openklineReplayAction = "seek";
    grid.append(field(document, this.labels.speed, speed), field(document, this.labels.seek, seek), applySeek);
    body.append(status, actions, grid);
  }

  private renderIndicatorExplorer(panel: HTMLElement): void {
    const search = panel.querySelector<HTMLInputElement>("[data-openkline-panel-search]");
    const list = panel.querySelector<HTMLElement>("[data-openkline-panel-list]");
    const form = panel.querySelector<HTMLElement>("[data-openkline-panel-form]");
    const active = panel.querySelector<HTMLElement>("[data-openkline-indicator-active]");
    if (search === null || list === null || form === null || active === null) return;
    const query = search.value.trim().toLowerCase();
    const filtered = this.availableIndicators.filter((metadata) => {
      if (query.length === 0) return true;
      return `${metadata.id} ${metadata.name} ${metadata.description} ${metadata.category ?? ""}`.toLowerCase().includes(query);
    });
    if (this.selectedIndicatorId === null || !this.availableIndicators.some((metadata) => metadata.id === this.selectedIndicatorId)) {
      this.selectedIndicatorId = filtered[0]?.id ?? this.availableIndicators[0]?.id ?? null;
      this.selectedIndicatorInstanceId = null;
    }
    list.replaceChildren();
    for (const metadata of filtered) {
      const item = button(panel.ownerDocument, metadata.name, metadata.name);
      item.dataset.openklineIndicatorAction = "select";
      item.dataset.openklineIndicatorId = metadata.id;
      item.setAttribute("aria-pressed", String(metadata.id === this.selectedIndicatorId));
      const category = panel.ownerDocument.createElement("small");
      category.textContent = metadata.category ?? "custom";
      item.append(category);
      list.append(item);
    }
    form.replaceChildren();
    const metadata = this.availableIndicators.find((item) => item.id === this.selectedIndicatorId);
    if (metadata !== undefined) {
      const description = panel.ownerDocument.createElement("span");
      description.dataset.openklinePanelDescription = "";
      description.textContent = metadata.description;
      form.append(description);
      for (const parameter of metadata.parameters) {
        form.append(this.createIndicatorParameterField(panel.ownerDocument, parameter));
      }
      const add = button(panel.ownerDocument, this.labels.add, this.labels.add);
      add.dataset.openklineIndicatorAction = "add";
      const update = button(panel.ownerDocument, this.labels.update, this.labels.update);
      update.dataset.openklineIndicatorAction = "update";
      form.append(add, update);
    }
    active.replaceChildren();
    for (const [id, kind] of this.activeSlot().indicatorKinds) {
      const row = panel.ownerDocument.createElement("div");
      row.dataset.openklineObjectRow = "";
      const label = panel.ownerDocument.createElement("span");
      label.textContent = `${kind} (${id})`;
      const edit = button(panel.ownerDocument, this.labels.update, this.labels.update);
      edit.dataset.openklineIndicatorAction = "edit";
      edit.dataset.openklineIndicatorInstance = id;
      edit.dataset.openklineIndicatorId = kind;
      const remove = button(panel.ownerDocument, this.labels.remove, this.labels.remove);
      remove.dataset.openklineIndicatorAction = "remove";
      remove.dataset.openklineIndicatorInstance = id;
      row.append(label, edit, remove);
      active.append(row);
    }
    if (this.activeSlot().indicatorKinds.size === 0) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "No active indicators";
      active.append(empty);
    }
  }

  private createIndicatorParameterField(document: Document, parameter: IndicatorParameterDefinition, currentValue?: unknown): HTMLElement {
    const value = currentValue ?? parameter.defaultValue ?? defaultIndicatorParameter(parameter, this.activeSlot().chart.getData());
    let control: HTMLInputElement | HTMLSelectElement;
    if (parameter.type === "enum") {
      const selectControl = document.createElement("select");
      for (const optionValue of parameter.values ?? []) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        selectControl.append(option);
      }
      selectControl.value = String(value);
      control = selectControl;
    } else {
      const input = document.createElement("input");
      input.type = parameter.type === "boolean" ? "checkbox" : parameter.type === "string" ? "text" : "number";
      if (input.type === "number") {
        input.step = parameter.type === "integer" ? "1" : "any";
        if (parameter.min !== undefined) input.min = String(parameter.min);
        if (parameter.max !== undefined) input.max = String(parameter.max);
      }
      if (input.type === "checkbox") input.checked = value === true;
      else input.value = String(value);
      control = input;
    }
    control.dataset.openklineIndicatorParameter = parameter.name;
    control.setAttribute("aria-label", parameter.name);
    return field(document, parameter.name, control);
  }

  private handleIndicatorPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-indicator-action]") : null;
    if (target === null) return;
    const action = target.dataset.openklineIndicatorAction;
    const panel = target.closest<HTMLElement>("[data-openkline-panel]");
    if (panel === null) return;
    if (action === "select") {
      this.selectedIndicatorId = target.dataset.openklineIndicatorId ?? null;
      this.selectedIndicatorInstanceId = null;
      this.renderIndicatorExplorer(panel);
      return;
    }
    if (action === "edit") {
      this.selectedIndicatorId = target.dataset.openklineIndicatorId ?? null;
      this.selectedIndicatorInstanceId = target.dataset.openklineIndicatorInstance ?? null;
      this.renderIndicatorExplorer(panel);
      return;
    }
    if (action === "remove") {
      const instanceId = target.dataset.openklineIndicatorInstance;
      if (instanceId === undefined) return;
      this.activeSlot().chart.removeIndicator(instanceId);
      this.activeSlot().indicatorApis.delete(instanceId);
      this.activeSlot().indicatorKinds.delete(instanceId);
      this.renderIndicatorExplorer(panel);
      return;
    }
    if (action === "add" || action === "update") {
      const metadata = this.availableIndicators.find((item) => item.id === this.selectedIndicatorId);
      if (metadata === undefined) return;
      try {
        const parameters = this.readIndicatorParameters(panel, metadata);
        if (action === "update" && this.selectedIndicatorInstanceId !== null) {
          const api = this.activeSlot().indicatorApis.get(this.selectedIndicatorInstanceId);
          api?.setParameters(parameters);
        } else {
          const pane = metadata.category === "oscillator" || ["RSI", "MACD"].includes(metadata.id) ? "new" : "main";
          this.addIndicator(metadata.id, { pane, ...parameters });
        }
        this.error = null;
        this.setStatus(this.activeSlot().hasData ? "ready" : "empty");
      } catch (error) {
        this.fail(error);
      }
      this.renderIndicatorExplorer(panel);
    }
  }

  private readIndicatorParameters(panel: HTMLElement, metadata: IndicatorMetadata): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};
    for (const parameter of metadata.parameters) {
      const control = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-openkline-indicator-parameter]"))
        .find((element) => element.dataset.openklineIndicatorParameter === parameter.name);
      if (control === undefined) continue;
      if (control instanceof HTMLInputElement && control.type === "checkbox") parameters[parameter.name] = control.checked;
      else if (control instanceof HTMLInputElement && control.type === "number") parameters[parameter.name] = Number(control.value);
      else parameters[parameter.name] = control.value;
    }
    return parameters;
  }

  private renderDrawingToolbar(panel: HTMLElement): void {
    const tools = panel.querySelector<HTMLElement>("[data-openkline-tool-grid]");
    if (tools === null) return;
    tools.replaceChildren();
    const active = this.activeSlot().activeDrawingType;
    for (const drawing of this.availableDrawings) {
      const item = button(panel.ownerDocument, drawing.label, drawing.label);
      item.dataset.openklineDrawingTool = drawing.type;
      item.dataset.active = String(drawing.type === active);
      tools.append(item);
    }
  }

  private handleDrawingPanelClick(event: Event): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-openkline-drawing-tool], [data-openkline-drawing-action]")
      : null;
    if (target === null) return;
    if (target.dataset.openklineDrawingTool !== undefined) {
      this.startDrawing(target.dataset.openklineDrawingTool, { snap: "visible-ohlc" });
      return;
    }
    const action = target.dataset.openklineDrawingAction;
    if (action === "cancel") this.activeSlot().cancelDrawing();
    if (action === "undo") this.activeSlot().chart.undoDrawing();
    if (action === "redo") this.activeSlot().chart.redoDrawing();
  }

  private renderObjectTree(panel: HTMLElement): void {
    let tree = panel.querySelector<HTMLElement>("[data-openkline-object-tree-list]");
    if (tree === null) {
      tree = panel.ownerDocument.createElement("div");
      tree.dataset.openklineObjectTreeList = "";
      panel.querySelector("[data-openkline-panel-body]")?.append(tree);
    }
    tree.replaceChildren();
    const chart = this.activeSlot().chart;
    for (const series of chart.getSeriesInfo()) {
      tree.append(this.createObjectRow(panel.ownerDocument, `${series.title ?? series.id} (${series.type})`, "series", series.id));
    }
    for (const [id, kind] of this.activeSlot().indicatorKinds) {
      tree.append(this.createObjectRow(panel.ownerDocument, `${kind} (${id})`, "indicator", id));
    }
    for (const drawing of chart.getDrawings()) {
      tree.append(this.createObjectRow(panel.ownerDocument, `${formatWidgetName(drawing.type)} (${drawing.id})`, "drawing", drawing.id));
    }
  }

  private createObjectRow(document: Document, labelText: string, kind: string, id: string): HTMLElement {
    const row = document.createElement("div");
    row.dataset.openklineObjectRow = "";
    row.dataset.openklineObjectKind = kind;
    row.dataset.openklineObjectId = id;
    const label = document.createElement("span");
    label.textContent = labelText;
    row.append(label);
    if (kind === "drawing") {
      for (const [text, action] of [["Select", "drawing-select"], ["Lock", "drawing-lock"], ["Hide", "drawing-hide"], [this.labels.remove, "drawing-remove"]] as const) {
        const item = button(document, text, text);
        item.dataset.openklineObjectAction = action;
        row.append(item);
      }
    } else if (kind === "indicator") {
      const remove = button(document, this.labels.remove, this.labels.remove);
      remove.dataset.openklineObjectAction = "indicator-remove";
      row.append(remove);
    }
    return row;
  }

  private handleObjectPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-object-action]") : null;
    const row = target?.closest<HTMLElement>("[data-openkline-object-row]") ?? null;
    if (target === null || row === null) return;
    const id = row.dataset.openklineObjectId;
    if (id === undefined) return;
    const chart = this.activeSlot().chart;
    const action = target.dataset.openklineObjectAction;
    if (action === "drawing-select") chart.selectDrawing(id);
    if (action === "drawing-lock") {
      const drawing = chart.getDrawings().find((item) => item.id === id);
      if (drawing !== undefined) chart.setDrawingStyle(id, { locked: !drawing.style.locked });
    }
    if (action === "drawing-hide") {
      const drawing = chart.getDrawings().find((item) => item.id === id);
      if (drawing !== undefined) chart.setDrawingStyle(id, { visible: drawing.style.visible === false ? true : false });
    }
    if (action === "drawing-remove") chart.removeDrawing(id);
    if (action === "indicator-remove") {
      chart.removeIndicator(id);
      this.activeSlot().indicatorApis.delete(id);
      this.activeSlot().indicatorKinds.delete(id);
    }
    this.refreshOpenPanels();
  }

  private renderDrawingProperties(panel: HTMLElement): void {
    const body = panel.querySelector<HTMLElement>("[data-openkline-panel-body]");
    if (body === null) return;
    body.replaceChildren();
    const selectedId = this.activeSlot().chart.getSelectedDrawingId();
    const drawing = this.activeSlot().chart.getDrawings().find((item) => item.id === selectedId);
    if (drawing === undefined) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "Select a drawing";
      body.append(empty);
      return;
    }
    const color = panel.ownerDocument.createElement("input");
    color.type = "color";
    color.value = toColorInputValue(drawing.style.color);
    color.dataset.openklineDrawingProperty = "color";
    const width = panel.ownerDocument.createElement("input");
    width.type = "number";
    width.min = "1";
    width.max = "8";
    width.value = String(drawing.style.lineWidth ?? 2);
    width.dataset.openklineDrawingProperty = "lineWidth";
    const visible = panel.ownerDocument.createElement("input");
    visible.type = "checkbox";
    visible.checked = drawing.style.visible !== false;
    visible.dataset.openklineDrawingProperty = "visible";
    const locked = panel.ownerDocument.createElement("input");
    locked.type = "checkbox";
    locked.checked = drawing.style.locked === true;
    locked.dataset.openklineDrawingProperty = "locked";
    const apply = button(panel.ownerDocument, this.labels.apply, this.labels.apply);
    apply.dataset.openklineDrawingAction = "apply-properties";
    body.append(
      field(panel.ownerDocument, "Color", color),
      field(panel.ownerDocument, "Width", width),
      field(panel.ownerDocument, "Visible", visible),
      field(panel.ownerDocument, "Locked", locked),
      apply,
    );
  }

  private handleDrawingPropertyClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-drawing-action]") : null;
    const panel = target?.closest<HTMLElement>("[data-openkline-panel]") ?? null;
    if (target?.dataset.openklineDrawingAction !== "apply-properties" || panel === null) return;
    const selectedId = this.activeSlot().chart.getSelectedDrawingId();
    if (selectedId === null) return;
    const color = panel.querySelector<HTMLInputElement>('[data-openkline-drawing-property="color"]');
    const width = panel.querySelector<HTMLInputElement>('[data-openkline-drawing-property="lineWidth"]');
    const visible = panel.querySelector<HTMLInputElement>('[data-openkline-drawing-property="visible"]');
    const locked = panel.querySelector<HTMLInputElement>('[data-openkline-drawing-property="locked"]');
    const style: DrawingStyle = {
      ...(color === null ? {} : { color: color.value }),
      ...(width === null ? {} : { lineWidth: Number(width.value) }),
      ...(visible === null ? {} : { visible: visible.checked }),
      ...(locked === null ? {} : { locked: locked.checked }),
    };
    this.activeSlot().chart.setDrawingStyle(selectedId, style);
  }

  private renderSettingsPanel(panel: HTMLElement): void {
    const theme = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="theme"]');
    const direction = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="direction"]');
    const mode = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="priceScaleMode"]');
    const autoScale = panel.querySelector<HTMLInputElement>('[data-openkline-setting="autoScale"]');
    const axisVisible = panel.querySelector<HTMLInputElement>('[data-openkline-setting="axisVisible"]');
    const precision = panel.querySelector<HTMLInputElement>('[data-openkline-setting="pricePrecision"]');
    const priceScale = this.activeSlot().chart.getPriceScaleOptions();
    if (theme !== null) theme.value = this.theme;
    if (direction !== null) direction.value = this.direction;
    if (mode !== null) mode.value = priceScale.mode;
    if (autoScale !== null) autoScale.checked = priceScale.autoScale !== false;
    if (axisVisible !== null) axisVisible.checked = priceScale.axisVisible !== false;
    if (precision !== null) precision.value = String(this.pricePrecision ?? 2);
  }

  private handleSettingsPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-settings-action]") : null;
    const panel = target?.closest<HTMLElement>("[data-openkline-panel]") ?? null;
    if (target?.dataset.openklineSettingsAction !== "apply" || panel === null) return;
    try {
      const theme = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="theme"]')?.value as "light" | "dark" | undefined;
      const direction = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="direction"]')?.value as "ltr" | "rtl" | undefined;
      const mode = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="priceScaleMode"]')?.value as PriceScaleMode | undefined;
      const autoScale = panel.querySelector<HTMLInputElement>('[data-openkline-setting="autoScale"]')?.checked;
      const axisVisible = panel.querySelector<HTMLInputElement>('[data-openkline-setting="axisVisible"]')?.checked;
      const precisionRaw = panel.querySelector<HTMLInputElement>('[data-openkline-setting="pricePrecision"]')?.value;
      if (theme !== undefined) this.setTheme(theme);
      if (direction !== undefined) this.setDirection(direction);
      const patch: PriceScaleOptions = {
        ...(mode === undefined ? {} : { mode }),
        ...(autoScale === undefined ? {} : { autoScale }),
        ...(axisVisible === undefined ? {} : { axisVisible }),
      };
      this.activeSlot().chart.setPriceScaleOptions(patch);
      if (precisionRaw !== undefined && precisionRaw.length > 0) {
        const parsedPrecision = Number(precisionRaw);
        this.activeSlot().chart.setOptions({ pricePrecision: parsedPrecision });
        this.pricePrecision = parsedPrecision;
      }
    } catch (error) {
      this.fail(error);
    }
  }

  private renderSyncPanel(panel: HTMLElement): void {
    const enabled = panel.querySelector<HTMLInputElement>('[data-openkline-sync-option="enabled"]');
    const crosshair = panel.querySelector<HTMLInputElement>('[data-openkline-sync-option="crosshair"]');
    const visibleRange = panel.querySelector<HTMLInputElement>('[data-openkline-sync-option="visibleRange"]');
    if (enabled !== null) enabled.checked = this.syncOptions.enabled;
    if (crosshair !== null) crosshair.checked = this.syncOptions.crosshair;
    if (visibleRange !== null) visibleRange.checked = this.syncOptions.visibleRange;
  }

  private handleSyncPanelClick(event: Event): void {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (target === null || target.dataset.openklineSyncOption === undefined) return;
    this.setSynchronization({
      enabled: (this.root.querySelector<HTMLInputElement>('[data-openkline-sync-option="enabled"]')?.checked) ?? this.syncOptions.enabled,
      crosshair: (this.root.querySelector<HTMLInputElement>('[data-openkline-sync-option="crosshair"]')?.checked) ?? this.syncOptions.crosshair,
      visibleRange: (this.root.querySelector<HTMLInputElement>('[data-openkline-sync-option="visibleRange"]')?.checked) ?? this.syncOptions.visibleRange,
    });
  }

  private renderWatchlistPanel(panel: HTMLElement): void {
    const list = panel.querySelector<HTMLElement>("[data-openkline-watchlist-list]");
    const empty = panel.querySelector<HTMLElement>("[data-openkline-panel-empty]");
    if (list === null || empty === null) return;
    list.replaceChildren();
    const document = this.watchlistModel.getDocument();
    const selected = document.lists.find((item) => item.id === document.selectedWatchlistId) ?? document.lists[0];
    const symbols = selected?.symbols ?? [];
    empty.hidden = symbols.length > 0;
    for (const [index, symbol] of symbols.entries()) {
      const row = panel.ownerDocument.createElement("div");
      row.dataset.openklineWatchlistRow = "";
      row.dataset.openklineWatchlistSymbol = symbol.id;
      const label = panel.ownerDocument.createElement("span");
      label.textContent = `${symbol.displaySymbol} · ${symbol.name}`;
      const quote = this.quotes.find((item) => item.symbolId === symbol.id);
      const quoteLabel = panel.ownerDocument.createElement("small");
      if (quote === undefined) {
        quoteLabel.dataset.openklineQuoteError = "";
        quoteLabel.textContent = "No quote";
      } else if (quote.status === "stale") {
        quoteLabel.dataset.openklineQuoteStale = "";
        quoteLabel.textContent = `Stale ${quote.last ?? "—"}`;
      } else if (quote.status === "error") {
        quoteLabel.dataset.openklineQuoteError = "";
        quoteLabel.textContent = quote.error ?? "Quote error";
      } else if (quote.status === "loading") {
        quoteLabel.textContent = "Loading";
      } else {
        quoteLabel.textContent = quote.last === null ? "Missing" : String(quote.last);
      }
      const selectSymbol = button(panel.ownerDocument, "Select", "Select");
      selectSymbol.dataset.openklineWatchlistAction = "select";
      const favorite = button(panel.ownerDocument, this.labels.favorite, symbol.favorite ? "★" : "☆");
      favorite.dataset.openklineWatchlistAction = "favorite";
      const up = button(panel.ownerDocument, this.labels.reorder, "↑");
      up.dataset.openklineWatchlistAction = "up";
      up.disabled = index === 0;
      const down = button(panel.ownerDocument, this.labels.reorder, "↓");
      down.dataset.openklineWatchlistAction = "down";
      down.disabled = index === symbols.length - 1;
      const remove = button(panel.ownerDocument, this.labels.remove, this.labels.remove);
      remove.dataset.openklineWatchlistAction = "remove";
      row.append(label, quoteLabel, selectSymbol, favorite, up, down, remove);
      list.append(row);
    }
  }

  private handleWatchlistPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-watchlist-action]") : null;
    if (target === null) return;
    const action = target.dataset.openklineWatchlistAction;
    const document = this.watchlistModel.getDocument();
    let listId = document.selectedWatchlistId ?? document.lists[0]?.id;
    if (listId === null || listId === undefined) {
      listId = this.watchlistModel.create("Watchlist").id;
    }
    if (action === "add") {
      const panel = target.closest<HTMLElement>("[data-openkline-panel]");
      const input = panel?.querySelector<HTMLInputElement>('[data-openkline-watchlist-input="symbol"]');
      const value = input?.value.trim() ?? "";
      if (value.length === 0) return;
      const current = this.watchlistModel.getDocument().lists.find((item) => item.id === listId);
      if ((current?.symbols.length ?? 0) >= MAX_WATCHLIST_SYMBOLS) {
        this.fail(new WidgetLifecycleError(`Watchlist supports at most ${MAX_WATCHLIST_SYMBOLS} symbols`));
        return;
      }
      try {
        this.watchlistModel.addSymbol(listId, { id: value, displaySymbol: value, name: value });
        if (input !== null && input !== undefined) input.value = "";
        this.attachQuoteProvider();
        this.refreshOpenPanels();
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    const row = target.closest<HTMLElement>("[data-openkline-watchlist-row]");
    const symbolId = row?.dataset.openklineWatchlistSymbol;
    if (symbolId === undefined) return;
    const list = this.watchlistModel.getDocument().lists.find((item) => item.id === listId);
    const index = list?.symbols.findIndex((symbol) => symbol.id === symbolId) ?? -1;
    try {
      if (action === "select") void this.setSymbol(symbolId).catch(() => undefined);
      if (action === "favorite") this.watchlistModel.setFavorite(listId, symbolId, !(list?.symbols[index]?.favorite ?? false));
      if (action === "remove") this.watchlistModel.removeSymbol(listId, symbolId);
      if (action === "up" && index > 0) this.watchlistModel.reorderSymbol(listId, symbolId, index - 1);
      if (action === "down" && list !== undefined && index >= 0 && index < list.symbols.length - 1) {
        this.watchlistModel.reorderSymbol(listId, symbolId, index + 1);
      }
      this.attachQuoteProvider();
      this.refreshOpenPanels();
    } catch (error) {
      this.fail(error);
    }
  }

  private renderComparisonPanel(panel: HTMLElement): void {
    const list = panel.querySelector<HTMLElement>("[data-openkline-comparison-list]");
    const mode = panel.querySelector<HTMLSelectElement>('[data-openkline-comparison-input="mode"]');
    if (mode !== null) mode.value = this.comparisonEngine.getMode();
    if (list === null) return;
    list.replaceChildren();
    for (const status of this.comparisonEngine.getStatus()) {
      const row = panel.ownerDocument.createElement("div");
      row.dataset.openklineComparisonRow = "";
      row.dataset.openklineComparisonAsset = status.id;
      const label = panel.ownerDocument.createElement("span");
      label.textContent = `${status.label} · ${status.eligible ? "ready" : "ineligible"} · ${status.pointCount} pts`;
      const baseline = button(panel.ownerDocument, this.labels.baseline, this.labels.baseline);
      baseline.dataset.openklineComparisonAction = "baseline";
      const remove = button(panel.ownerDocument, this.labels.remove, this.labels.remove);
      remove.dataset.openklineComparisonAction = "remove";
      row.append(label, baseline, remove);
      list.append(row);
    }
    if (this.comparisonEngine.getAssetIds().length === 0) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "No comparison assets";
      list.append(empty);
    }
  }

  private handleComparisonPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-comparison-action]") : null;
    const panel = (target ?? (event.target instanceof Element ? event.target : null))?.closest<HTMLElement>("[data-openkline-panel]");
    if (panel === null || panel === undefined) return;
    const mode = panel.querySelector<HTMLSelectElement>('[data-openkline-comparison-input="mode"]');
    if (mode !== null && mode.value !== this.comparisonEngine.getMode()) {
      this.setComparisonMode(mode.value as ComparisonNormalizationMode);
    }
    if (target === null) return;
    const action = target.dataset.openklineComparisonAction;
    if (action === "add-active") {
      const input = panel.querySelector<HTMLInputElement>('[data-openkline-comparison-input="asset"]');
      const id = (input?.value.trim() || this.activeSlot().symbol || `asset-${this.comparisonEngine.getAssetIds().length + 1}`);
      try {
        this.addComparisonAsset(id, this.activeSlot().chart.getData(), { label: id });
        if (input !== null) input.value = "";
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    if (action === "clear") {
      this.clearComparison();
      return;
    }
    const row = target.closest<HTMLElement>("[data-openkline-comparison-row]");
    const assetId = row?.dataset.openklineComparisonAsset;
    if (assetId === undefined) return;
    if (action === "remove") this.removeComparisonAsset(assetId);
    if (action === "baseline") {
      const first = this.comparisonEngine.getRawData(assetId)[0]?.time ?? null;
      this.setComparisonBaseline(first, { maxAgeMs: this.comparisonBaselineMaxAgeMs });
    }
  }

  private renderReplayPanel(panel: HTMLElement): void {
    const status = panel.querySelector<HTMLElement>("[data-openkline-replay-status]");
    const replay = this.activeSlot().getReplayStatus();
    if (status !== null) {
      status.textContent = replay === null
        ? `Idle on ${this.activeChartId}`
        : `${replay.state} · bar ${replay.currentIndex ?? "—"} / ${replay.totalBars} · speed ${replay.speed}${replay.error === undefined ? "" : ` · ${replay.error}`}`;
    }
  }

  private handleReplayPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-replay-action]") : null;
    if (target === null) return;
    const panel = target.closest<HTMLElement>("[data-openkline-panel]");
    const action = target.dataset.openklineReplayAction;
    try {
      if (action === "enter") this.enterReplay();
      const replay = this.getReplay();
      if (action === "play") replay?.play();
      if (action === "pause") replay?.pause();
      if (action === "step-forward") replay?.stepForward();
      if (action === "step-backward") replay?.stepBackward();
      if (action === "exit") this.exitReplay();
      if (action === "seek" && replay !== null && panel !== null) {
        const speed = panel.querySelector<HTMLInputElement>('[data-openkline-replay-input="speed"]');
        const seek = panel.querySelector<HTMLInputElement>('[data-openkline-replay-input="seek"]');
        if (speed !== null) replay.setSpeed(Number(speed.value));
        if (seek !== null && seek.value.length > 0) replay.seekToBar(Number(seek.value));
      }
      this.refreshOpenPanels();
    } catch (error) {
      this.fail(error);
    }
  }

  private applyComparisonSeries(): void {
    const chart = this.activeSlot().chart;
    for (const id of [...this.comparisonSeriesIds]) {
      if (chart.getSeriesIds().includes(id)) chart.removeSeries(id);
      this.comparisonSeriesIds.delete(id);
    }
    const replayCutoff = this.activeSlot().getReplayStatus()?.currentTimestamp ?? null;
    for (const asset of this.comparisonEngine.getNormalizedData()) {
      const seriesId = `${COMPARISON_SERIES_PREFIX}${encodeURIComponent(asset.id)}`;
      const data = replayCutoff === null ? asset.data : asset.data.filter((point) => point.time <= replayCutoff);
      if (data.length === 0) continue;
      const series = chart.addLineSeries({
        id: seriesId,
        title: asset.label,
        style: { color: asset.color ?? "#60a5fa", lineWidth: 2, visible: true },
      });
      series.setData(data);
      this.comparisonSeriesIds.add(seriesId);
    }
  }

  private attachQuoteProvider(): void {
    this.quoteUnsubscribe?.();
    this.quoteUnsubscribe = null;
    this.quotes = [];
    if (this.quoteProvider === null) return;
    const document = this.watchlistModel.getDocument();
    const selected = document.lists.find((item) => item.id === document.selectedWatchlistId) ?? document.lists[0];
    const symbolIds = (selected?.symbols ?? []).map((symbol) => symbol.id);
    if (symbolIds.length === 0) return;
    this.quoteUnsubscribe = this.quoteProvider.subscribe(symbolIds, (quotes) => {
      this.quotes = quotes;
      this.refreshOpenPanels();
    });
  }

  private setStatus(status: WidgetStatus): void {
    this.status = status;
    this.renderShell();
    this.emitState();
  }

  private renderShell(): void {
    this.root.dataset.status = this.status;
    this.root.dataset.theme = this.theme;
    this.root.dataset.direction = this.direction;
    this.root.dir = this.direction;
    const active = this.slots.get(this.activeChartId);
    const displaySymbol = active?.requestedSymbol ?? active?.symbol ?? "";
    const displayTimeframe = active?.requestedTimeframe ?? active?.timeframe ?? DEFAULT_TIMEFRAMES[3];
    if (this.symbolInput !== null && this.symbolInput.value !== displaySymbol) this.symbolInput.value = displaySymbol;
    if (this.timeframeSelect !== null && this.timeframeSelect.value !== displayTimeframe) this.timeframeSelect.value = displayTimeframe;
    if (this.chartTypeSelect !== null && this.chartTypeSelect.value !== (active?.chartType ?? this.chartType)) {
      this.chartTypeSelect.value = active?.chartType ?? this.chartType;
    }
    if (this.themeButton !== null) {
      this.themeButton.textContent = `${this.labels.theme}: ${this.theme}`;
      this.themeButton.setAttribute("aria-pressed", String(this.theme === "dark"));
    }
    if (this.directionButton !== null) {
      this.directionButton.textContent = `${this.labels.direction}: ${this.direction}`;
      this.directionButton.setAttribute("aria-pressed", String(this.direction === "rtl"));
    }
    this.statusElement.hidden = !this.features.status;
    this.errorElement.hidden = this.status !== "error";
    this.statusElement.textContent = this.status === "loading"
      ? this.labels.loading
      : this.status === "empty"
        ? this.labels.empty
        : this.status === "error"
          ? this.labels.error
          : this.labels.ready;
    this.errorElement.textContent = this.error ?? "";
    for (const slot of this.slots.values()) {
      slot.emptyElement.hidden = slot.hasData;
      slot.emptyElement.textContent = this.labels.empty;
      slot.renderHeader();
    }
  }

  private emitState(): void {
    this.emit({ type: "state", snapshot: this.getState() });
  }

  private emit(event: WidgetEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private fail(error: unknown): WidgetLifecycleError {
    const normalized = error instanceof WidgetLifecycleError
      ? error
      : new WidgetLifecycleError(error instanceof Error ? error.message : String(error));
    this.error = normalized.message;
    this.status = "error";
    this.renderShell();
    this.emit({ type: "error", error: normalized });
    this.emitState();
    return normalized;
  }

  private onDom(target: EventTarget, name: string, handler: (event: Event) => void): void {
    target.addEventListener(name, handler);
    this.domCleanups.push(() => target.removeEventListener(name, handler));
  }

  private assertAlive(): void {
    if (this.destroyed) throw new WidgetLifecycleError("Widget has been destroyed");
  }
}

function isCompositionLike(value: unknown): boolean {
  return typeof value === "object" && value !== null && "version" in value && "layout" in value && "charts" in value && "activeChartId" in value;
}
