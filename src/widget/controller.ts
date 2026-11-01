import { createChart, type Chart } from "../chart.js";
import type { DrawingStartOptions } from "../drawings/types.js";
import type { OpenKlinePlugin, PluginHandle } from "../extensions/types.js";
import type {
  ChartEventName,
  ChartEvents,
  ChartOptions,
  Candle,
  Datafeed,
  IndicatorAddOptions,
  LinePoint,
  SeriesApi,
  SeriesOptions,
} from "../types.js";
import { parseWorkspace, type WorkspaceMetadata, type WorkspaceDocument, type WorkspaceRestoreResult } from "../workspace.js";
import {
  type InternalWidget,
  type WidgetChartType,
  type WidgetDataIdentity,
  type WidgetDatafeedQuery,
  type WidgetDiagnostics,
  type WidgetEvent,
  type WidgetFeatureVisibility,
  type WidgetIdentityStatus,
  type WidgetLabels,
  type WidgetOptions,
  type WidgetSnapshot,
  type WidgetStatus,
  type WidgetStorage,
} from "./types.js";

const DEFAULT_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
const DEFAULT_INDICATORS = ["SMA", "EMA", "RSI", "MACD", "BOLLINGER_BANDS"] as const;
const DEFAULT_DRAWINGS = ["trend-line", "horizontal-line", "vertical-line", "rectangle", "fibonacci-retracement"] as const;
const BASE_SERIES_ID = "widget-price";
const PRESENTATION_SERIES_ID = "widget-presentation";
const STYLE_MARKER = "data-openkline-widget-style";
let nextWidgetInstanceId = 1;
const widgetStyleRegistry = new WeakMap<Document, { element: HTMLStyleElement; count: number; owned: boolean }>();

const DEFAULT_LABELS: WidgetLabels = {
  widgetLabel: "OpenKline financial chart",
  symbol: "Symbol",
  timeframe: "Timeframe",
  chartType: "Chart type",
  indicators: "Indicators",
  drawings: "Drawings",
  theme: "Theme",
  direction: "Direction",
  saveWorkspace: "Save workspace",
  loadWorkspace: "Load workspace",
  add: "Add",
  start: "Start",
  load: "Load",
  loading: "Loading market data",
  empty: "No chart data loaded",
  ready: "Chart ready",
  error: "Chart error",
};

const WIDGET_CSS = `
[data-openkline-widget] {
  --openkline-widget-bg: #0f172a;
  --openkline-widget-panel: #111827;
  --openkline-widget-border: #334155;
  --openkline-widget-text: #e2e8f0;
  --openkline-widget-muted: #94a3b8;
  --openkline-widget-focus: #38bdf8;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 240px;
  min-height: 280px;
  height: 100%;
  overflow: hidden;
  color: var(--openkline-widget-text);
  background: var(--openkline-widget-bg);
  border: 1px solid var(--openkline-widget-border);
  border-radius: 6px;
  font: 13px/1.4 system-ui, sans-serif;
}
[data-openkline-widget][data-theme="light"] {
  --openkline-widget-bg: #f8fafc;
  --openkline-widget-panel: #ffffff;
  --openkline-widget-border: #cbd5e1;
  --openkline-widget-text: #0f172a;
  --openkline-widget-muted: #475569;
  --openkline-widget-focus: #0369a1;
}
[data-openkline-widget] *, [data-openkline-widget] *::before, [data-openkline-widget] *::after {
  box-sizing: border-box;
}
[data-openkline-widget] [data-openkline-toolbar] {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 7px;
  background: var(--openkline-widget-panel);
  border-bottom: 1px solid var(--openkline-widget-border);
}
[data-openkline-widget] [data-openkline-field] {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
[data-openkline-widget] label {
  color: var(--openkline-widget-muted);
  white-space: nowrap;
}
[data-openkline-widget] button,
[data-openkline-widget] select,
[data-openkline-widget] input {
  min-height: 30px;
  border: 1px solid var(--openkline-widget-border);
  border-radius: 4px;
  color: var(--openkline-widget-text);
  background: var(--openkline-widget-bg);
  font: inherit;
}
[data-openkline-widget] button,
[data-openkline-widget] select {
  padding: 4px 8px;
  cursor: pointer;
}
[data-openkline-widget] input {
  width: 105px;
  padding: 4px 6px;
}
[data-openkline-widget] button:hover:not(:disabled),
[data-openkline-widget] select:hover,
[data-openkline-widget] input:hover {
  border-color: var(--openkline-widget-focus);
}
[data-openkline-widget] button:focus-visible,
[data-openkline-widget] select:focus-visible,
[data-openkline-widget] input:focus-visible {
  outline: 2px solid var(--openkline-widget-focus);
  outline-offset: 1px;
}
[data-openkline-widget] button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
[data-openkline-widget] [data-openkline-chart] {
  position: relative;
  flex: 1 1 auto;
  min-height: 220px;
  min-width: 0;
}
[data-openkline-widget] [data-openkline-status],
[data-openkline-widget] [data-openkline-error],
[data-openkline-widget] [data-openkline-empty] {
  padding: 5px 9px;
  color: var(--openkline-widget-muted);
  background: var(--openkline-widget-panel);
  border-top: 1px solid var(--openkline-widget-border);
}
[data-openkline-widget] [data-openkline-error] {
  color: #fca5a5;
}
[data-openkline-widget] [data-openkline-empty] {
  position: absolute;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
  border: 0;
  background: transparent;
  text-align: center;
  pointer-events: none;
}
@media (max-width: 640px) {
  [data-openkline-widget] [data-openkline-toolbar] {
    gap: 4px;
    padding: 5px;
  }
  [data-openkline-widget] [data-openkline-field] {
    flex: 1 1 auto;
  }
  [data-openkline-widget] [data-openkline-field] label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  [data-openkline-widget] button,
  [data-openkline-widget] select,
  [data-openkline-widget] input {
    min-height: 36px;
  }
}
`;

export class WidgetLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WidgetLifecycleError";
  }
}

export function createOpenKlineWidget(options: WidgetOptions): InternalWidget {
  return new InternalWidgetController(options);
}

export function normalizeWidgetLabels(labels?: Partial<WidgetLabels>): WidgetLabels {
  return { ...DEFAULT_LABELS, ...(labels ?? {}) };
}

class InternalWidgetController implements InternalWidget {
  private readonly root: HTMLElement;
  private readonly chartContainer: HTMLElement;
  private readonly statusElement: HTMLElement;
  private readonly emptyElement: HTMLElement;
  private readonly errorElement: HTMLElement;
  private readonly labels: WidgetLabels;
  private readonly features: WidgetFeatureVisibility;
  private readonly storage: WidgetStorage | null;
  private readonly storageKey: string;
  private readonly domCleanups: Array<() => void> = [];
  private readonly chartSubscriptions: Array<() => void> = [];
  private readonly listeners = new Set<(event: WidgetEvent) => void>();
  private readonly pluginHandles: PluginHandle[] = [];
  private readonly chart: Chart;
  private readonly instanceId: number;
  private readonly releaseStyles: () => void;
  private datafeed: Datafeed | null;
  private datafeedQuery: WidgetDatafeedQuery | null;
  private dataRequest: AbortController | null = null;
  private dataRequestGeneration = 0;
  private storageRequest: AbortController | null = null;
  private controlId = 0;
  private presentation: SeriesApi<Candle> | SeriesApi<LinePoint> | null = null;
  private syncingPresentation = false;
  private destroyed = false;
  private status: WidgetStatus = "idle";
  private error: string | null = null;
  private hasData = false;
  private symbol: string | null;
  private timeframe: string | null;
  private requestedSymbol: string | null;
  private requestedTimeframe: string | null;
  private identityStatus: WidgetIdentityStatus;
  private applyingDirectData = false;
  private chartType: WidgetChartType;
  private theme: "light" | "dark";
  private direction: "ltr" | "rtl";
  private readonly symbolInput: HTMLInputElement | null;
  private readonly timeframeSelect: HTMLSelectElement | null;
  private readonly chartTypeSelect: HTMLSelectElement | null;
  private readonly themeButton: HTMLButtonElement | null;
  private readonly directionButton: HTMLButtonElement | null;

  public constructor(options: WidgetOptions) {
    if (!(options.container instanceof HTMLElement)) throw new WidgetLifecycleError("Widget container must be an HTMLElement");
    this.instanceId = nextWidgetInstanceId++;
    const document = options.container.ownerDocument;
    const directIdentity = normalizeWidgetIdentity(options.dataIdentity);
    const initialQuery = options.datafeedQuery === undefined ? null : normalizeWidgetDatafeedQuery(options.datafeedQuery);
    this.releaseStyles = acquireWidgetStyles(document);
    this.features = normalizeWidgetFeatures(options.features);
    this.labels = normalizeWidgetLabels(options.labels);
    this.storage = options.storage ?? null;
    this.storageKey = options.storageKey ?? "openkline-widget-workspace";
    this.datafeed = options.datafeed ?? null;
    this.datafeedQuery = initialQuery;
    this.symbol = directIdentity?.symbol ?? null;
    this.timeframe = directIdentity?.timeframe ?? null;
    this.requestedSymbol = this.datafeedQuery?.symbol ?? this.symbol;
    this.requestedTimeframe = this.datafeedQuery?.timeframe ?? this.timeframe;
    this.identityStatus = this.datafeedQuery !== null
      ? "loading"
      : options.data !== undefined && options.data.length > 0
        ? directIdentity === undefined ? "unavailable" : "confirmed"
        : directIdentity === undefined ? "unbound" : "confirmed";
    this.chartType = options.chartType ?? "candlestick";
    this.theme = options.chartOptions?.theme === "dark" ? "dark" : "light";
    this.direction = options.chartOptions?.direction ?? "ltr";

    this.root = document.createElement("section");
    this.root.dataset.openklineWidget = "";
    this.root.dataset.status = this.status;
    this.root.dataset.theme = this.theme;
    this.root.dataset.direction = this.direction;
    this.root.dir = this.direction;
    this.root.setAttribute("aria-label", this.labels.widgetLabel);

    const toolbarControls = this.createToolbar(document, options);
    this.symbolInput = toolbarControls.symbolInput;
    this.timeframeSelect = toolbarControls.timeframeSelect;
    this.chartTypeSelect = toolbarControls.chartTypeSelect;
    this.themeButton = toolbarControls.themeButton;
    this.directionButton = toolbarControls.directionButton;

    this.chartContainer = document.createElement("div");
    this.chartContainer.dataset.openklineChart = "";
    this.chartContainer.setAttribute("aria-label", "OpenKline chart area");
    this.statusElement = document.createElement("div");
    this.statusElement.dataset.openklineStatus = "";
    this.statusElement.setAttribute("role", "status");
    this.statusElement.setAttribute("aria-live", "polite");
    this.emptyElement = document.createElement("div");
    this.emptyElement.dataset.openklineEmpty = "";
    this.emptyElement.setAttribute("role", "status");
    this.errorElement = document.createElement("div");
    this.errorElement.dataset.openklineError = "";
    this.errorElement.setAttribute("role", "alert");

    this.root.append(toolbarControls.toolbar, this.chartContainer, this.statusElement, this.errorElement);
    this.chartContainer.append(this.emptyElement);
    options.container.append(this.root);

    const chartOptions: ChartOptions = {
      ...(options.chartOptions ?? {}),
      autoSize: options.chartOptions?.autoSize ?? true,
      theme: options.chartOptions?.theme ?? this.theme,
      direction: this.direction,
    };
    this.chart = createChart(this.chartContainer, chartOptions);
    const base = this.chart.addCandlestickSeries({ id: BASE_SERIES_ID, title: "Price", style: { visible: this.chartType === "candlestick" } });
    if (options.data !== undefined) {
      base.setData(options.data);
    }
    this.attachChartSubscriptions();
    this.attachToolbarListeners(toolbarControls);
    for (const plugin of options.plugins ?? []) this.pluginHandles.push(this.chart.installPlugin(plugin));
    this.hasData = this.chart.getData().length > 0;
    this.syncPresentationForChartType();
    this.setStatus(this.hasData ? "ready" : "empty");
    if (this.datafeed !== null && this.datafeedQuery !== null) {
      void this.setDatafeed(this.datafeed, this.datafeedQuery).catch(() => undefined);
    } else if (this.datafeed !== null) {
      this.fail(new Error("A datafeed query is required when a datafeed is supplied"));
    }
  }

  public getChart(): Chart {
    this.assertAlive();
    return this.chart;
  }

  public getState(): WidgetSnapshot {
    return {
      status: this.status,
      symbol: this.symbol,
      timeframe: this.timeframe,
      requestedSymbol: this.requestedSymbol,
      requestedTimeframe: this.requestedTimeframe,
      identityStatus: this.identityStatus,
      chartType: this.chartType,
      theme: this.theme,
      direction: this.direction,
      hasData: this.hasData,
      error: this.error,
      features: { ...this.features },
    };
  }

  public getDiagnostics(): WidgetDiagnostics {
    return {
      destroyed: this.destroyed,
      domListeners: this.domCleanups.length,
      chartSubscriptions: this.chartSubscriptions.length,
      pendingDataRequest: this.dataRequest !== null,
      canvasCount: this.root.querySelectorAll("canvas").length,
      styleElementCount: this.root.ownerDocument.querySelectorAll(`style[${STYLE_MARKER}]`).length,
    };
  }

  public setData(candles: readonly Candle[], identity?: WidgetDataIdentity): void {
    this.assertAlive();
    let normalizedIdentity: WidgetDataIdentity | undefined;
    try {
      normalizedIdentity = normalizeWidgetIdentity(identity);
    } catch (error) {
      this.fail(error);
      throw error;
    }
    if (candles.length > 0 && !hasWidgetIdentity(normalizedIdentity) && (this.hasData || this.identityStatus === "confirmed")) {
      throw this.fail(new WidgetLifecycleError("A data identity is required when replacing displayed candles"));
    }
    this.dataRequest?.abort();
    this.dataRequest = null;
    this.dataRequestGeneration += 1;
    if (this.datafeed !== null) {
      this.chart.stopDatafeed();
      this.datafeed = null;
      this.datafeedQuery = null;
    }
    try {
      this.applyingDirectData = true;
      try {
        this.chart.setData(candles);
      } finally {
        this.applyingDirectData = false;
      }
      this.hasData = candles.length > 0;
      if (normalizedIdentity !== undefined && hasWidgetIdentity(normalizedIdentity)) {
        this.symbol = normalizedIdentity.symbol ?? null;
        this.timeframe = normalizedIdentity.timeframe ?? null;
        this.requestedSymbol = this.symbol;
        this.requestedTimeframe = this.timeframe;
        this.identityStatus = "confirmed";
      } else if (candles.length > 0) {
        this.symbol = null;
        this.timeframe = null;
        this.requestedSymbol = null;
        this.requestedTimeframe = null;
        this.identityStatus = "unavailable";
      } else if (this.identityStatus !== "confirmed") {
        this.symbol = null;
        this.timeframe = null;
        this.requestedSymbol = null;
        this.requestedTimeframe = null;
        this.identityStatus = "unbound";
      }
      this.error = null;
      this.setStatus(this.hasData ? "ready" : "empty");
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public async setDatafeed(datafeed: Datafeed, query: WidgetDatafeedQuery): Promise<void> {
    this.assertAlive();
    const normalizedQuery = normalizeWidgetDatafeedQuery(query);
    const controller = new AbortController();
    this.dataRequest?.abort();
    this.dataRequest = controller;
    const generation = ++this.dataRequestGeneration;
    this.datafeed = datafeed;
    this.datafeedQuery = { ...normalizedQuery };
    this.requestedSymbol = normalizedQuery.symbol;
    this.requestedTimeframe = normalizedQuery.timeframe;
    this.identityStatus = "loading";
    this.error = null;
    this.setStatus("loading");
    try {
      await this.chart.setDatafeed(datafeed, { ...normalizedQuery, signal: controller.signal });
      if (this.destroyed || generation !== this.dataRequestGeneration || controller.signal.aborted) return;
      this.symbol = normalizedQuery.symbol;
      this.timeframe = normalizedQuery.timeframe;
      this.requestedSymbol = this.symbol;
      this.requestedTimeframe = this.timeframe;
      this.identityStatus = "confirmed";
      this.hasData = this.chart.getData().length > 0;
      this.syncPresentationForChartType();
      this.setStatus(this.hasData ? "ready" : "empty");
    } catch (error) {
      if (controller.signal.aborted || generation !== this.dataRequestGeneration || isAbortError(error)) return;
      this.identityStatus = "failed";
      this.fail(error);
      throw error;
    } finally {
      if (generation === this.dataRequestGeneration) this.dataRequest = null;
    }
  }

  public async setSymbol(symbol: string): Promise<void> {
    this.assertAlive();
    const next = symbol.trim();
    if (next.length === 0) throw this.fail(new Error("Symbol must not be empty"));
    if (this.datafeed === null || this.datafeedQuery === null) {
      if (this.hasData) throw this.fail(new WidgetLifecycleError("Cannot change symbol while direct candles are displayed; replace them with setData(candles, { symbol, timeframe })"));
      this.requestedSymbol = next;
      this.renderState();
      return;
    }
    if (next === this.requestedSymbol && this.identityStatus === "loading") return;
    await this.setDatafeed(this.datafeed, { ...this.datafeedQuery, symbol: next });
  }

  public async setTimeframe(timeframe: string): Promise<void> {
    this.assertAlive();
    const next = timeframe.trim();
    if (next.length === 0) throw this.fail(new Error("Timeframe must not be empty"));
    if (this.datafeed === null || this.datafeedQuery === null) {
      if (this.hasData) throw this.fail(new WidgetLifecycleError("Cannot change timeframe while direct candles are displayed; replace them with setData(candles, { symbol, timeframe })"));
      this.requestedTimeframe = next;
      this.renderState();
      return;
    }
    if (next === this.requestedTimeframe && this.identityStatus === "loading") return;
    await this.setDatafeed(this.datafeed, { ...this.datafeedQuery, timeframe: next });
  }

  public setChartType(type: WidgetChartType): void {
    this.assertAlive();
    if (this.chartType === type) return;
    this.chartType = type;
    this.syncPresentationForChartType();
    this.renderState();
  }

  public setTheme(theme: "light" | "dark"): void {
    this.assertAlive();
    this.theme = theme;
    this.chart.setOptions({ theme });
    this.renderState();
  }

  public setDirection(direction: "ltr" | "rtl"): void {
    this.assertAlive();
    this.direction = direction;
    this.chart.setOptions({ direction });
    this.root.dir = direction;
    this.renderState();
  }

  public addIndicator(indicatorId: string, options: IndicatorAddOptions = {}): string {
    this.assertAlive();
    try {
      return this.chart.addIndicator(indicatorId, options).id;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public startDrawing(type: string, options: { readonly snap?: "none" | "visible-ohlc" } = {}): void {
    this.assertAlive();
    try {
      const drawingOptions: DrawingStartOptions = options.snap === undefined ? {} : { snap: options.snap };
      this.chart.startDrawing(type, drawingOptions);
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public async saveWorkspace(key = this.storageKey): Promise<void> {
    this.assertAlive();
    if (this.storage === null) throw this.fail(new Error("Widget storage is not configured"));
    this.storageRequest?.abort();
    const controller = new AbortController();
    this.storageRequest = controller;
    const metadata: WorkspaceMetadata = {
      ...(this.symbol === null ? {} : { symbol: this.symbol }),
      ...(this.timeframe === null ? {} : { timeframe: this.timeframe }),
    };
    try {
      const document = this.chart.serializeWorkspace(metadata);
      await this.storage.save(key, JSON.stringify(document), controller.signal);
      if (controller.signal.aborted || this.destroyed) return;
    } catch (error) {
      if (controller.signal.aborted || this.destroyed) return;
      this.fail(error);
      throw error;
    } finally {
      if (this.storageRequest === controller) this.storageRequest = null;
    }
  }

  public async loadWorkspace(key = this.storageKey): Promise<WorkspaceRestoreResult> {
    this.assertAlive();
    if (this.storage === null) throw this.fail(new Error("Widget storage is not configured"));
    this.storageRequest?.abort();
    const controller = new AbortController();
    this.storageRequest = controller;
    try {
      const value = await this.storage.load(key, controller.signal);
      if (controller.signal.aborted || this.destroyed) throw new WidgetLifecycleError("Workspace load was cancelled");
      if (value === null) throw new Error(`No workspace stored for key ${key}`);
      const document = typeof value === "string" ? JSON.parse(value) as unknown : value;
      return this.importWorkspace(document);
    } catch (error) {
      if (controller.signal.aborted || this.destroyed) throw new WidgetLifecycleError("Workspace load was cancelled");
      this.fail(error);
      throw error;
    } finally {
      if (this.storageRequest === controller) this.storageRequest = null;
    }
  }

  public exportWorkspace(): WorkspaceDocument {
    this.assertAlive();
    return this.chart.serializeWorkspace({
      ...(this.symbol === null ? {} : { symbol: this.symbol }),
      ...(this.timeframe === null ? {} : { timeframe: this.timeframe }),
    });
  }

  public importWorkspace(value: unknown): WorkspaceRestoreResult {
    this.assertAlive();
    try {
      const parsed = parseWorkspace(value);
      const identity = normalizeWidgetIdentity(parsed.metadata);
      this.dataRequest?.abort();
      this.dataRequest = null;
      this.dataRequestGeneration += 1;
      if (this.datafeed !== null) this.chart.stopDatafeed();
      this.datafeed = null;
      this.datafeedQuery = null;
      const result = this.chart.restoreWorkspace(value, { missingPlugins: "skip", missingIndicators: "skip" });
      this.rebindRestoredPresentation();
      this.symbol = identity?.symbol ?? null;
      this.timeframe = identity?.timeframe ?? null;
      this.requestedSymbol = this.symbol;
      this.requestedTimeframe = this.timeframe;
      this.hasData = this.chart.getData().length > 0;
      this.identityStatus = this.hasData
        ? hasWidgetIdentity(identity) ? "confirmed" : "unavailable"
        : hasWidgetIdentity(identity) ? "confirmed" : "unbound";
      this.error = null;
      this.setStatus(this.hasData ? "ready" : "empty");
      return result;
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  public installPlugin(plugin: OpenKlinePlugin): PluginHandle {
    this.assertAlive();
    const handle = this.chart.installPlugin(plugin);
    this.pluginHandles.push(handle);
    return handle;
  }

  public subscribe(listener: (event: WidgetEvent) => void): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.dataRequestGeneration += 1;
    this.dataRequest?.abort();
    this.dataRequest = null;
    this.storageRequest?.abort();
    this.storageRequest = null;
    for (const cleanup of this.domCleanups.splice(0)) cleanup();
    for (const unsubscribe of this.chartSubscriptions.splice(0)) unsubscribe();
    for (const handle of this.pluginHandles.splice(0)) handle.dispose();
    this.chart.destroy();
    this.releaseStyles();
    this.root.remove();
    this.status = "destroyed";
    this.error = null;
    this.hasData = false;
    this.listeners.clear();
  }

  private createToolbar(document: Document, options: WidgetOptions): {
    toolbar: HTMLElement;
    symbolInput: HTMLInputElement | null;
    timeframeSelect: HTMLSelectElement | null;
    chartTypeSelect: HTMLSelectElement | null;
    indicatorSelect: HTMLSelectElement | null;
    drawingSelect: HTMLSelectElement | null;
    saveButton: HTMLButtonElement | null;
    loadButton: HTMLButtonElement | null;
    themeButton: HTMLButtonElement | null;
    directionButton: HTMLButtonElement | null;
    loadSymbolButton: HTMLButtonElement | null;
    addIndicatorButton: HTMLButtonElement | null;
    startDrawingButton: HTMLButtonElement | null;
  } {
    const toolbar = document.createElement("div");
    toolbar.dataset.openklineToolbar = "";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", this.labels.widgetLabel);
    if (!this.features.header) toolbar.hidden = true;

    let symbolInput: HTMLInputElement | null = null;
    let timeframeSelect: HTMLSelectElement | null = null;
    let chartTypeSelect: HTMLSelectElement | null = null;
    let indicatorSelect: HTMLSelectElement | null = null;
    let drawingSelect: HTMLSelectElement | null = null;
    let saveButton: HTMLButtonElement | null = null;
    let loadButton: HTMLButtonElement | null = null;
    let themeButton: HTMLButtonElement | null = null;
    let directionButton: HTMLButtonElement | null = null;
    let loadSymbolButton: HTMLButtonElement | null = null;
    let addIndicatorButton: HTMLButtonElement | null = null;
    let startDrawingButton: HTMLButtonElement | null = null;

    if (this.features.symbol) {
      symbolInput = document.createElement("input");
      symbolInput.value = this.requestedSymbol ?? this.symbol ?? "";
      symbolInput.placeholder = "BTC-USD";
      symbolInput.setAttribute("aria-label", this.labels.symbol);
      loadSymbolButton = this.button(document, this.labels.load, this.labels.load);
      toolbar.append(this.field(document, this.labels.symbol, symbolInput), loadSymbolButton);
    }
    if (this.features.timeframe) {
      timeframeSelect = document.createElement("select");
      timeframeSelect.setAttribute("aria-label", this.labels.timeframe);
      const initialTimeframe = this.requestedTimeframe ?? this.timeframe ?? DEFAULT_TIMEFRAMES[3];
      const timeframes = new Set<string>([...DEFAULT_TIMEFRAMES, initialTimeframe]);
      for (const timeframe of timeframes) {
        const option = document.createElement("option");
        option.value = timeframe;
        option.textContent = timeframe;
        timeframeSelect.append(option);
      }
      timeframeSelect.value = initialTimeframe;
      toolbar.append(this.field(document, this.labels.timeframe, timeframeSelect));
    }
    if (this.features.chartType) {
      chartTypeSelect = document.createElement("select");
      chartTypeSelect.setAttribute("aria-label", this.labels.chartType);
      for (const type of ["candlestick", "ohlc", "hollow-candlestick", "heikin-ashi", "line", "area", "baseline"] as const) {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type === "hollow-candlestick" ? "Hollow candles" : type.replace("-", " ");
        chartTypeSelect.append(option);
      }
      chartTypeSelect.value = this.chartType;
      toolbar.append(this.field(document, this.labels.chartType, chartTypeSelect));
    }
    if (this.features.indicators) {
      indicatorSelect = this.select(document, this.labels.indicators, options.indicatorChoices ?? DEFAULT_INDICATORS);
      addIndicatorButton = this.button(document, this.labels.add, this.labels.add);
      toolbar.append(this.field(document, this.labels.indicators, indicatorSelect), addIndicatorButton);
    }
    if (this.features.drawings) {
      drawingSelect = this.select(document, this.labels.drawings, options.drawingChoices ?? DEFAULT_DRAWINGS);
      startDrawingButton = this.button(document, this.labels.start, this.labels.start);
      toolbar.append(this.field(document, this.labels.drawings, drawingSelect), startDrawingButton);
    }
    if (this.features.theme) {
      themeButton = this.button(document, this.labels.theme, this.labels.theme);
      toolbar.append(themeButton);
    }
    if (this.features.direction) {
      directionButton = this.button(document, this.labels.direction, this.labels.direction);
      toolbar.append(directionButton);
    }
    if (this.features.workspace && this.storage !== null) {
      saveButton = this.button(document, this.labels.saveWorkspace, this.labels.saveWorkspace);
      loadButton = this.button(document, this.labels.loadWorkspace, this.labels.loadWorkspace);
      toolbar.append(saveButton, loadButton);
    }
    return { toolbar, symbolInput, timeframeSelect, chartTypeSelect, indicatorSelect, drawingSelect, saveButton, loadButton, themeButton, directionButton, loadSymbolButton, addIndicatorButton, startDrawingButton };
  }

  private attachToolbarListeners(controls: ReturnType<InternalWidgetController["createToolbar"]>): void {
    if (controls.loadSymbolButton !== null && controls.symbolInput !== null) {
      this.onDom(controls.loadSymbolButton, "click", () => { void this.setSymbol(controls.symbolInput!.value).catch(() => undefined); });
      this.onDom(controls.symbolInput, "keydown", (event) => {
        if ((event as KeyboardEvent).key === "Enter") void this.setSymbol(controls.symbolInput!.value).catch(() => undefined);
      });
    }
    if (controls.timeframeSelect !== null) this.onDom(controls.timeframeSelect, "change", () => { void this.setTimeframe(controls.timeframeSelect!.value).catch(() => undefined); });
    if (controls.chartTypeSelect !== null) this.onDom(controls.chartTypeSelect, "change", () => this.setChartType(controls.chartTypeSelect!.value as WidgetChartType));
    if (controls.indicatorSelect !== null && controls.addIndicatorButton !== null) {
      this.onDom(controls.addIndicatorButton, "click", () => {
        const indicatorId = controls.indicatorSelect!.value;
        const pane = ["RSI", "MACD"].includes(indicatorId) ? "new" : "main";
        this.addIndicator(indicatorId, { pane, period: 14 });
      });
    }
    if (controls.drawingSelect !== null && controls.startDrawingButton !== null) {
      this.onDom(controls.startDrawingButton, "click", () => this.startDrawing(controls.drawingSelect!.value, { snap: "visible-ohlc" }));
    }
    if (controls.themeButton !== null) this.onDom(controls.themeButton, "click", () => this.setTheme(this.theme === "dark" ? "light" : "dark"));
    if (controls.directionButton !== null) this.onDom(controls.directionButton, "click", () => this.setDirection(this.direction === "rtl" ? "ltr" : "rtl"));
    if (controls.saveButton !== null) this.onDom(controls.saveButton, "click", () => { void this.saveWorkspace().catch(() => undefined); });
    if (controls.loadButton !== null) this.onDom(controls.loadButton, "click", () => { void this.loadWorkspace().catch(() => undefined); });
  }

  private attachChartSubscriptions(): void {
    this.subscribeChart("dataUpdated", (event) => {
      this.hasData = this.chart.getData().length > 0;
      if (!this.syncingPresentation && event.kind === "set") this.syncPresentationForChartType();
      if (!this.syncingPresentation && event.kind === "update") this.syncPresentationForChartType();
      if (!this.applyingDirectData && this.status !== "loading" && this.status !== "destroyed") this.setStatus(this.hasData ? "ready" : "empty");
    });
    this.subscribeChart("datafeedError", (event) => this.fail(event));
    this.subscribeChart("chartReady", () => this.emitChartState());
    this.subscribeChart("themeChange", () => this.renderState());
    this.subscribeChart("chartDestroy", () => {
      if (!this.destroyed) {
        this.status = "destroyed";
        this.renderState();
      }
    });
    for (const name of ["viewportChange", "indicatorChange", "drawingSelection", "toolActivation", "crosshairMove", "replayChange", "replayError", "scriptError", "alertTriggered", "alertError"] as const) {
      this.subscribeChart(name);
    }
  }

  private subscribeChart<Name extends ChartEventName>(name: Name, callback?: (event: ChartEvents[Name]) => void): void {
    const unsubscribe = this.chart.subscribe(name, (event) => {
      callback?.(event);
      this.emit({ type: "chart", name, payload: event });
    });
    this.chartSubscriptions.push(unsubscribe);
  }

  private syncPresentationForChartType(): void {
    if (this.chartType === "candlestick") {
      this.presentation?.remove();
      this.presentation = null;
      this.chart.setSeriesStyle(BASE_SERIES_ID, { visible: true });
      return;
    }
    this.chart.setSeriesStyle(BASE_SERIES_ID, { visible: false });
    this.presentation?.remove();
    const options: SeriesOptions = { id: PRESENTATION_SERIES_ID, title: "Price", style: { visible: true } };
    const presentation = this.createPresentationSeries(options);
    const candles = this.chart.getData();
    this.syncingPresentation = true;
    try {
      const values = this.chartType === "ohlc" || this.chartType === "hollow-candlestick" || this.chartType === "heikin-ashi"
        ? candles
        : candles.map(toClosePoint);
      presentation.setData(values as never);
    } finally {
      this.syncingPresentation = false;
    }
    this.presentation = presentation;
  }

  private createPresentationSeries(options: SeriesOptions): SeriesApi<Candle> | SeriesApi<LinePoint> {
    switch (this.chartType) {
      case "ohlc": return this.chart.addOhlcSeries(options);
      case "hollow-candlestick": return this.chart.addHollowCandlestickSeries(options);
      case "heikin-ashi": return this.chart.addHeikinAshiSeries(options);
      case "line": return this.chart.addLineSeries(options);
      case "area": return this.chart.addAreaSeries(options);
      case "baseline": return this.chart.addBaselineSeries(options);
      case "candlestick": return this.chart.addCandlestickSeries(options);
    }
  }

  private rebindRestoredPresentation(): void {
    const info = this.chart.getSeriesInfo();
    const restored = info.find((series) => series.id === PRESENTATION_SERIES_ID);
    if (restored !== undefined && isWidgetChartType(restored.type)) {
      this.chartType = restored.type;
      this.chart.removeSeries(PRESENTATION_SERIES_ID);
    } else {
      this.chartType = "candlestick";
      if (restored !== undefined) this.chart.removeSeries(PRESENTATION_SERIES_ID);
    }
    this.presentation = null;
    const base = info.find((series) => series.id === BASE_SERIES_ID);
    if (base === undefined) {
      const series = this.chart.addCandlestickSeries({ id: BASE_SERIES_ID, title: "Price", style: { visible: this.chartType === "candlestick" } });
      series.setData(this.chart.getData());
    }
    this.syncPresentationForChartType();
  }

  private setStatus(status: WidgetStatus): void {
    this.status = status;
    this.renderState();
  }

  private renderState(): void {
    this.root.dataset.status = this.status;
    this.root.dataset.theme = this.theme;
    this.root.dataset.direction = this.direction;
    this.root.dir = this.direction;
    const displaySymbol = this.requestedSymbol ?? this.symbol ?? "";
    const displayTimeframe = this.requestedTimeframe ?? this.timeframe ?? DEFAULT_TIMEFRAMES[3];
    if (this.symbolInput !== null && this.symbolInput.value !== displaySymbol) this.symbolInput.value = displaySymbol;
    if (this.timeframeSelect !== null && this.timeframeSelect.value !== displayTimeframe) this.timeframeSelect.value = displayTimeframe;
    if (this.chartTypeSelect !== null && this.chartTypeSelect.value !== this.chartType) this.chartTypeSelect.value = this.chartType;
    if (this.themeButton !== null) this.themeButton.textContent = `${this.labels.theme}: ${this.theme}`;
    if (this.themeButton !== null) this.themeButton.setAttribute("aria-pressed", String(this.theme === "dark"));
    if (this.directionButton !== null) {
      this.directionButton.textContent = `${this.labels.direction}: ${this.direction}`;
      this.directionButton.setAttribute("aria-pressed", String(this.direction === "rtl"));
    }
    this.statusElement.hidden = !this.features.status;
    this.errorElement.hidden = this.status !== "error";
    this.emptyElement.hidden = this.status !== "empty";
    this.statusElement.textContent = this.status === "loading"
      ? this.labels.loading
      : this.status === "ready"
        ? `${this.labels.ready}${this.symbol === null ? "" : `: ${this.symbol}`}`
        : this.status === "empty"
          ? this.labels.empty
          : this.status === "destroyed"
            ? "Widget destroyed"
            : "";
    this.emptyElement.textContent = this.labels.empty;
    this.errorElement.textContent = this.error === null ? "" : `${this.labels.error}: ${this.error}`;
    this.emitChartState();
  }

  private emitChartState(): void {
    this.emit({ type: "state", snapshot: this.getState() });
  }

  private emit(event: WidgetEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A host listener must not break chart lifecycle cleanup or other listeners.
      }
    }
  }

  private fail(error: unknown): WidgetLifecycleError {
    const normalized = error instanceof WidgetLifecycleError
      ? error
      : new WidgetLifecycleError(error instanceof Error ? error.message : String(error));
    this.error = normalized.message;
    if (!this.destroyed) this.status = "error";
    this.renderState();
    this.emit({ type: "error", error: normalized });
    return normalized;
  }

  private field(document: Document, labelText: string, control: HTMLElement): HTMLElement {
    const field = document.createElement("span");
    field.dataset.openklineField = "";
    const label = document.createElement("label");
    label.textContent = labelText;
    const id = `openkline-widget-${this.instanceId}-${++this.controlId}`;
    control.id = id;
    label.htmlFor = id;
    field.append(label, control);
    return field;
  }

  private select(document: Document, label: string, values: readonly string[]): HTMLSelectElement {
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    return select;
  }

  private button(document: Document, label: string, text: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.textContent = text;
    return button;
  }

  private onDom(target: EventTarget, name: string, handler: (event: Event) => void): void {
    target.addEventListener(name, handler);
    this.domCleanups.push(() => target.removeEventListener(name, handler));
  }

  private assertAlive(): void {
    if (this.destroyed) throw new WidgetLifecycleError("Widget has been destroyed");
  }
}

function acquireWidgetStyles(document: Document): () => void {
  let record = widgetStyleRegistry.get(document);
  if (record === undefined) {
    const existing = Array.from(document.querySelectorAll<HTMLStyleElement>(`style[${STYLE_MARKER}]`))
      .find((style) => style.textContent === WIDGET_CSS);
    const element = existing ?? document.createElement("style");
    const owned = existing === undefined;
    if (owned) {
      element.setAttribute(STYLE_MARKER, "");
      element.textContent = WIDGET_CSS;
      document.head.append(element);
    }
    record = { element, count: 0, owned };
    widgetStyleRegistry.set(document, record);
  }
  record.count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const current = widgetStyleRegistry.get(document);
    if (current === undefined) return;
    current.count -= 1;
    if (current.count <= 0) {
      if (current.owned) current.element.remove();
      widgetStyleRegistry.delete(document);
    }
  };
}

export function normalizeWidgetFeatures(features?: Partial<WidgetFeatureVisibility>): WidgetFeatureVisibility {
  return {
    header: true,
    symbol: true,
    timeframe: true,
    chartType: true,
    indicators: true,
    drawings: true,
    theme: true,
    direction: true,
    workspace: true,
    status: true,
    ...(features ?? {}),
  };
}

function toClosePoint(candle: Candle): LinePoint {
  return { time: candle.time, value: candle.close };
}

function isWidgetChartType(type: string): type is WidgetChartType {
  return ["candlestick", "ohlc", "hollow-candlestick", "heikin-ashi", "line", "area", "baseline"].includes(type);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function normalizeWidgetIdentity(identity?: WidgetDataIdentity): WidgetDataIdentity | undefined {
  if (identity === undefined) return undefined;
  const symbol = normalizeIdentityValue(identity.symbol, "symbol");
  const timeframe = normalizeIdentityValue(identity.timeframe, "timeframe");
  return {
    ...(symbol === undefined ? {} : { symbol }),
    ...(timeframe === undefined ? {} : { timeframe }),
  };
}

function normalizeIdentityValue(value: string | undefined, field: "symbol" | "timeframe"): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) throw new WidgetLifecycleError(`Widget ${field} must not be empty`);
  return normalized;
}

function hasWidgetIdentity(identity: WidgetDataIdentity | undefined | null): identity is WidgetDataIdentity & { readonly symbol?: string; readonly timeframe?: string } {
  return identity?.symbol !== undefined || identity?.timeframe !== undefined;
}

function normalizeWidgetDatafeedQuery(query: WidgetDatafeedQuery): WidgetDatafeedQuery {
  const symbol = normalizeIdentityValue(query.symbol, "symbol");
  const timeframe = normalizeIdentityValue(query.timeframe, "timeframe");
  if (symbol === undefined || timeframe === undefined) throw new WidgetLifecycleError("A datafeed query requires symbol and timeframe");
  return { ...query, symbol, timeframe };
}
