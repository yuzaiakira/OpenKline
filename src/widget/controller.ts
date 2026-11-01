import { createChart, type Chart } from "../chart.js";
import type { DrawingStartOptions, DrawingStyle } from "../drawings/types.js";
import type { OpenKlinePlugin, PluginHandle } from "../extensions/types.js";
import { builtInIndicatorDefinitions } from "../indicators/index.js";
import type { IndicatorMetadata, IndicatorParameterDefinition } from "../indicators/types.js";
import type {
  ChartIndicatorApi,
  ChartEventName,
  ChartEvents,
  ChartOptions,
  Candle,
  Datafeed,
  IndicatorAddOptions,
  LinePoint,
  PriceScaleMode,
  PriceScaleOptions,
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
const DEFAULT_DRAWINGS = [
  "trend-line",
  "ray",
  "extended-line",
  "horizontal-line",
  "vertical-line",
  "parallel-channel",
  "rectangle",
  "fibonacci-retracement",
  "fibonacci-extension",
  "price-range",
  "date-range",
  "long-position",
  "short-position",
  "text",
] as const;
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
  indicatorExplorer: "Indicator explorer",
  drawingToolbar: "Drawing tools",
  objectTree: "Object tree",
  drawingProperties: "Drawing properties",
  chartSettings: "Chart settings",
  close: "Close",
  cancel: "Cancel",
  undo: "Undo",
  redo: "Redo",
  update: "Update",
  remove: "Remove",
  apply: "Apply",
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
[data-openkline-widget] [data-openkline-panel-strip] {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  max-height: min(46vh, 420px);
  overflow: auto;
  background: var(--openkline-widget-bg);
}
[data-openkline-widget] [data-openkline-panel] {
  border-bottom: 1px solid var(--openkline-widget-border);
  padding: 9px;
}
[data-openkline-widget] [data-openkline-panel] [data-openkline-panel-header] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}
[data-openkline-widget] [data-openkline-panel-title] {
  font-weight: 600;
}
[data-openkline-widget] [data-openkline-panel-search] {
  width: 100%;
  margin-bottom: 7px;
}
[data-openkline-widget] [data-openkline-panel-list] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 5px;
}
[data-openkline-widget] [data-openkline-panel-list] button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  text-align: start;
}
[data-openkline-widget] [data-openkline-panel-list] button[aria-pressed="true"] {
  border-color: var(--openkline-widget-focus);
  box-shadow: inset 0 0 0 1px var(--openkline-widget-focus);
}
[data-openkline-widget] [data-openkline-panel-description] {
  display: block;
  color: var(--openkline-widget-muted);
  font-size: 12px;
  margin: 2px 0 7px;
}
[data-openkline-widget] [data-openkline-panel-form] {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 6px;
  margin: 7px 0;
}
[data-openkline-widget] [data-openkline-panel-form] [data-openkline-field] {
  flex: 0 1 140px;
}
[data-openkline-widget] [data-openkline-panel-subtitle] {
  display: block;
  margin: 9px 0 5px;
  color: var(--openkline-widget-muted);
  font-weight: 600;
}
[data-openkline-widget] [data-openkline-tool-grid] {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
[data-openkline-widget] [data-openkline-tool-grid] button[data-active="true"] {
  border-color: var(--openkline-widget-focus);
  background: color-mix(in srgb, var(--openkline-widget-focus) 18%, var(--openkline-widget-bg));
}
[data-openkline-widget] [data-openkline-object-row] {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 32px;
  padding: 3px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--openkline-widget-border) 65%, transparent);
}
[data-openkline-widget] [data-openkline-object-row] > span {
  flex: 1 1 150px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-openkline-widget] [data-openkline-settings-grid] {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 7px;
}
[data-openkline-widget] [data-openkline-settings-grid] [data-openkline-field] {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 3px;
}
[data-openkline-widget] [data-openkline-panel-empty] {
  color: var(--openkline-widget-muted);
  padding: 4px 0;
}
[data-openkline-widget] [data-openkline-panel-error] {
  color: #fca5a5;
  margin-top: 5px;
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

interface WidgetProfessionalControls {
  readonly panelStrip: HTMLElement;
  readonly indicatorPanel: HTMLElement | null;
  readonly drawingPanel: HTMLElement | null;
  readonly objectPanel: HTMLElement | null;
  readonly drawingPropertiesPanel: HTMLElement | null;
  readonly settingsPanel: HTMLElement | null;
}

interface WidgetIndicatorEntry {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
}

interface WidgetDrawingChoice {
  readonly type: string;
  readonly label: string;
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
  private pricePrecision: number | null;
  private readonly symbolInput: HTMLInputElement | null;
  private readonly timeframeSelect: HTMLSelectElement | null;
  private readonly chartTypeSelect: HTMLSelectElement | null;
  private readonly themeButton: HTMLButtonElement | null;
  private readonly directionButton: HTMLButtonElement | null;
  private readonly availableIndicators: readonly IndicatorMetadata[];
  private readonly availableDrawings: readonly WidgetDrawingChoice[];
  private readonly indicatorPanel: HTMLElement | null;
  private readonly drawingPanel: HTMLElement | null;
  private readonly objectPanel: HTMLElement | null;
  private readonly drawingPropertiesPanel: HTMLElement | null;
  private readonly settingsPanel: HTMLElement | null;
  private readonly indicatorApis = new Map<string, ChartIndicatorApi>();
  private readonly indicatorKinds = new Map<string, string>();
  private selectedIndicatorId: string | null = null;
  private selectedIndicatorInstanceId: string | null = null;
  private activeDrawingType: string | null = null;
  private openPanelState: { readonly panel: HTMLElement; readonly trigger: HTMLButtonElement } | null = null;

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
    this.pricePrecision = options.chartOptions?.pricePrecision ?? null;
    this.availableIndicators = resolveWidgetIndicatorMetadata(options.indicatorChoices);
    this.availableDrawings = resolveWidgetDrawingChoices(options.drawingChoices);

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
    this.indicatorPanel = toolbarControls.professional.indicatorPanel;
    this.drawingPanel = toolbarControls.professional.drawingPanel;
    this.objectPanel = toolbarControls.professional.objectPanel;
    this.drawingPropertiesPanel = toolbarControls.professional.drawingPropertiesPanel;
    this.settingsPanel = toolbarControls.professional.settingsPanel;

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

    this.root.append(toolbarControls.toolbar, toolbarControls.professional.panelStrip, this.chartContainer, this.statusElement, this.errorElement);
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
    this.refreshProfessionalUi();
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
      const api = this.chart.addIndicator(indicatorId, options);
      this.indicatorApis.set(api.id, api);
      this.indicatorKinds.set(api.id, api.indicatorId);
      this.selectedIndicatorId = api.indicatorId;
      this.selectedIndicatorInstanceId = api.id;
      this.refreshProfessionalUi();
      return api.id;
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
      this.indicatorApis.clear();
      this.indicatorKinds.clear();
      this.selectedIndicatorInstanceId = null;
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
    professional: WidgetProfessionalControls;
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
    const professional = this.createProfessionalUi(document, toolbar, options);
    return { toolbar, symbolInput, timeframeSelect, chartTypeSelect, indicatorSelect, drawingSelect, saveButton, loadButton, themeButton, directionButton, loadSymbolButton, addIndicatorButton, startDrawingButton, professional };
  }

  private createProfessionalUi(document: Document, toolbar: HTMLElement, _options: WidgetOptions): WidgetProfessionalControls {
    const panelStrip = document.createElement("div");
    panelStrip.dataset.openklinePanelStrip = "";

    const createPanel = (key: string, label: string): { readonly panel: HTMLElement; readonly body: HTMLElement; readonly trigger: HTMLButtonElement } => {
      const trigger = this.button(document, label, label);
      trigger.dataset.openklinePanelTrigger = key;
      trigger.setAttribute("aria-expanded", "false");
      toolbar.append(trigger);

      const panel = document.createElement("section");
      panel.dataset.openklinePanel = key;
      panel.hidden = true;
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-modal", "true");
      panel.setAttribute("aria-label", label);
      const header = document.createElement("div");
      header.dataset.openklinePanelHeader = "";
      const title = document.createElement("span");
      title.dataset.openklinePanelTitle = "";
      title.textContent = label;
      const close = this.button(document, this.labels.close, this.labels.close);
      close.dataset.openklinePanelClose = key;
      header.append(title, close);
      const body = document.createElement("div");
      body.dataset.openklinePanelBody = "";
      panel.append(header, body);
      panelStrip.append(panel);
      this.onDom(trigger, "click", () => this.togglePanel(panel, trigger));
      this.onDom(close, "click", () => this.closePanel(panel, trigger));
      return { panel, body, trigger };
    };

    const indicator = this.features.indicatorExplorer && this.features.indicators
      ? createPanel("indicator-explorer", this.labels.indicatorExplorer)
      : null;
    const drawing = this.features.drawingToolbar && this.features.drawings
      ? createPanel("drawing-toolbar", this.labels.drawingToolbar)
      : null;
    const objects = this.features.objectTree && (this.features.drawings || this.features.indicators)
      ? createPanel("object-tree", this.labels.objectTree)
      : null;
    const properties = this.features.drawingProperties && this.features.drawings
      ? createPanel("drawing-properties", this.labels.drawingProperties)
      : null;
    const settings = this.features.chartSettings
      ? createPanel("chart-settings", this.labels.chartSettings)
      : null;

    if (indicator !== null) {
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
      indicator.body.append(search, list, form, activeTitle, active);
      this.onDom(search, "input", () => this.renderIndicatorExplorer(indicator.panel));
      this.onDom(indicator.panel, "click", (event) => this.handleIndicatorPanelClick(event, indicator.panel));
    }

    if (drawing !== null) {
      const tools = document.createElement("div");
      tools.dataset.openklineToolGrid = "";
      const actions = document.createElement("div");
      actions.dataset.openklineToolGrid = "";
      for (const [label, action] of [[this.labels.cancel, "cancel"], [this.labels.undo, "undo"], [this.labels.redo, "redo"]] as const) {
        const button = this.button(document, label, label);
        button.dataset.openklineDrawingAction = action;
        actions.append(button);
      }
      drawing.body.append(tools, actions);
      this.onDom(drawing.panel, "click", (event) => this.handleDrawingPanelClick(event, drawing.panel));
    }

    if (objects !== null) {
      this.onDom(objects.panel, "click", (event) => this.handleObjectPanelClick(event));
    }

    if (properties !== null) {
      this.onDom(properties.panel, "click", (event) => this.handleDrawingPropertyClick(event, properties.panel));
    }

    if (settings !== null) {
      const grid = document.createElement("div");
      grid.dataset.openklineSettingsGrid = "";
      const theme = this.select(document, this.labels.theme, ["light", "dark"]);
      theme.dataset.openklineSetting = "theme";
      const direction = this.select(document, this.labels.direction, ["ltr", "rtl"]);
      direction.dataset.openklineSetting = "direction";
      const scale = this.select(document, "Price scale", ["linear", "logarithmic", "percentage", "indexed"]);
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
        this.field(document, this.labels.theme, theme),
        this.field(document, this.labels.direction, direction),
        this.field(document, "Price scale", scale),
        this.field(document, "Auto scale", autoScale),
        this.field(document, "Price axis", axisVisible),
        this.field(document, "Precision", precision),
      );
      const apply = this.button(document, this.labels.apply, this.labels.apply);
      apply.dataset.openklineSettingsAction = "apply";
      settings.body.append(grid, apply);
      this.onDom(settings.panel, "click", (event) => this.handleSettingsPanelClick(event, settings.panel));
    }

    this.onDom(this.root, "keydown", (event) => {
      if ((event as KeyboardEvent).key === "Escape" && this.openPanelState !== null) {
        event.preventDefault();
        this.closePanel(this.openPanelState.panel, this.openPanelState.trigger);
      }
    });
    return {
      panelStrip,
      indicatorPanel: indicator?.panel ?? null,
      drawingPanel: drawing?.panel ?? null,
      objectPanel: objects?.panel ?? null,
      drawingPropertiesPanel: properties?.panel ?? null,
      settingsPanel: settings?.panel ?? null,
    };
  }

  private togglePanel(panel: HTMLElement, trigger: HTMLButtonElement): void {
    if (this.openPanelState?.panel === panel) {
      this.closePanel(panel, trigger);
      return;
    }
    if (this.openPanelState !== null) this.closePanel(this.openPanelState.panel, this.openPanelState.trigger);
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    this.openPanelState = { panel, trigger };
    this.refreshProfessionalUi();
    const focusTarget = panel.querySelector<HTMLElement>("input, select, button");
    focusTarget?.focus();
  }

  private closePanel(panel: HTMLElement, trigger: HTMLButtonElement): void {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (this.openPanelState?.panel === panel) this.openPanelState = null;
    trigger.focus();
  }

  private refreshProfessionalUi(): void {
    if (this.destroyed) return;
    if (this.indicatorPanel !== null) this.renderIndicatorExplorer(this.indicatorPanel);
    if (this.drawingPanel !== null) this.renderDrawingToolbar(this.drawingPanel);
    if (this.objectPanel !== null) this.renderObjectTree(this.objectPanel);
    if (this.drawingPropertiesPanel !== null) this.renderDrawingProperties(this.drawingPropertiesPanel);
    if (this.settingsPanel !== null) this.renderSettingsPanel(this.settingsPanel);
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
      const button = this.button(panel.ownerDocument, metadata.name, metadata.name);
      button.dataset.openklineIndicatorAction = "select";
      button.dataset.openklineIndicatorId = metadata.id;
      button.setAttribute("aria-pressed", String(metadata.id === this.selectedIndicatorId));
      const category = panel.ownerDocument.createElement("small");
      category.textContent = metadata.category ?? "custom";
      button.append(category);
      list.append(button);
    }
    if (filtered.length === 0) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "No indicators match the search";
      list.append(empty);
    }

    form.replaceChildren();
    const metadata = this.availableIndicators.find((item) => item.id === this.selectedIndicatorId);
    if (metadata !== undefined) {
      const description = panel.ownerDocument.createElement("span");
      description.dataset.openklinePanelDescription = "";
      description.textContent = metadata.description;
      form.append(description);
      let existingParameters: Readonly<Record<string, unknown>> | undefined;
      if (this.selectedIndicatorInstanceId !== null) {
        try {
          existingParameters = this.indicatorApis.get(this.selectedIndicatorInstanceId)?.getResult().parameters;
        } catch {
          this.selectedIndicatorInstanceId = null;
        }
      }
      for (const parameter of metadata.parameters) {
        form.append(this.createIndicatorParameterField(panel.ownerDocument, parameter, existingParameters?.[parameter.name]));
      }
      const action = this.button(panel.ownerDocument, this.selectedIndicatorInstanceId === null ? this.labels.add : this.labels.update, this.selectedIndicatorInstanceId === null ? this.labels.add : this.labels.update);
      action.dataset.openklineIndicatorAction = this.selectedIndicatorInstanceId === null ? "add" : "update";
      action.dataset.openklineIndicatorId = metadata.id;
      form.append(action);
    }

    active.replaceChildren();
    const entries = this.getIndicatorEntries();
    if (entries.length === 0) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "No active indicators";
      active.append(empty);
      return;
    }
    for (const entry of entries) {
      const row = panel.ownerDocument.createElement("div");
      row.dataset.openklineObjectRow = "";
      const label = panel.ownerDocument.createElement("span");
      label.textContent = `${entry.indicatorId} · ${entry.id} · ${entry.paneId}`;
      const edit = this.button(panel.ownerDocument, `Edit ${entry.id}`, "Edit");
      edit.dataset.openklineIndicatorAction = "edit";
      edit.dataset.openklineIndicatorInstance = entry.id;
      edit.dataset.openklineIndicatorId = entry.indicatorId;
      const remove = this.button(panel.ownerDocument, `${this.labels.remove} ${entry.id}`, this.labels.remove);
      remove.dataset.openklineIndicatorAction = "remove";
      remove.dataset.openklineIndicatorInstance = entry.id;
      row.append(label, edit, remove);
      active.append(row);
    }
  }

  private createIndicatorParameterField(document: Document, parameter: IndicatorParameterDefinition, currentValue?: unknown): HTMLElement {
    const value = currentValue ?? parameter.defaultValue ?? defaultIndicatorParameter(parameter, this.chart.getData());
    let control: HTMLInputElement | HTMLSelectElement;
    if (parameter.type === "enum") {
      const select = document.createElement("select");
      for (const optionValue of parameter.values ?? []) {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        select.append(option);
      }
      select.value = String(value);
      control = select;
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
    return this.field(document, parameter.name, control);
  }

  private handleIndicatorPanelClick(event: Event, panel: HTMLElement): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-indicator-action]") : null;
    if (target === null) return;
    const action = target.dataset.openklineIndicatorAction;
    const indicatorId = target.dataset.openklineIndicatorId;
    const instanceId = target.dataset.openklineIndicatorInstance;
    if (action === "select" && indicatorId !== undefined) {
      this.selectedIndicatorId = indicatorId;
      this.selectedIndicatorInstanceId = null;
      this.renderIndicatorExplorer(panel);
      return;
    }
    if (action === "edit" && indicatorId !== undefined && instanceId !== undefined) {
      this.selectedIndicatorId = indicatorId;
      this.selectedIndicatorInstanceId = instanceId;
      this.renderIndicatorExplorer(panel);
      return;
    }
    if (action === "remove" && instanceId !== undefined) {
      try {
        this.chart.removeIndicator(instanceId);
        if (this.selectedIndicatorInstanceId === instanceId) this.selectedIndicatorInstanceId = null;
      } catch (error) {
        this.fail(error);
      }
      return;
    }
    if ((action === "add" || action === "update") && indicatorId !== undefined) {
      this.applyIndicatorPanel(indicatorId, action === "update", panel);
    }
  }

  private applyIndicatorPanel(indicatorId: string, update: boolean, panel: HTMLElement): void {
    const metadata = this.availableIndicators.find((item) => item.id === indicatorId);
    if (metadata === undefined) return;
    try {
      const parameters = this.readIndicatorParameters(panel, metadata);
      if (update) {
        if (this.selectedIndicatorInstanceId === null) throw new WidgetLifecycleError("Select an active indicator before updating it");
        const api = this.indicatorApis.get(this.selectedIndicatorInstanceId);
        if (api === undefined) throw new WidgetLifecycleError("This restored indicator does not expose an editable widget handle");
        api.setParameters(parameters);
      } else {
        const id = this.addIndicator(indicatorId, {
          pane: metadata.overlay === false ? "new" : "main",
          parameters,
        });
        this.selectedIndicatorInstanceId = id;
      }
      this.error = null;
      this.setStatus(this.hasData ? "ready" : "empty");
    } catch (error) {
      this.fail(error);
    }
  }

  private readIndicatorParameters(panel: HTMLElement, metadata: IndicatorMetadata): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};
    for (const definition of metadata.parameters) {
      const control = Array.from(panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-openkline-indicator-parameter]"))
        .find((item) => item.dataset.openklineIndicatorParameter === definition.name);
      if (control === undefined) continue;
      if (definition.type === "boolean" && control instanceof HTMLInputElement) parameters[definition.name] = control.checked;
      else if (definition.type === "integer") parameters[definition.name] = Number(control.value);
      else if (definition.type === "number") parameters[definition.name] = Number(control.value);
      else parameters[definition.name] = control.value;
    }
    return parameters;
  }

  private getIndicatorEntries(): WidgetIndicatorEntry[] {
    const entries = new Map<string, WidgetIndicatorEntry>();
    for (const series of this.chart.getSeriesInfo()) {
      const separator = series.id.indexOf(":");
      if (separator <= 0) continue;
      const id = series.id.slice(0, separator);
      if (!entries.has(id)) {
        entries.set(id, { id, indicatorId: this.indicatorKinds.get(id) ?? id, paneId: series.paneId });
      }
    }
    for (const [id, api] of this.indicatorApis) {
      if (!entries.has(id)) entries.set(id, { id, indicatorId: api.indicatorId, paneId: api.paneId });
    }
    return [...entries.values()];
  }

  private renderDrawingToolbar(panel: HTMLElement): void {
    const tools = panel.querySelector<HTMLElement>("[data-openkline-tool-grid]");
    if (tools === null) return;
    tools.replaceChildren();
    for (const choice of this.availableDrawings) {
      const button = this.button(panel.ownerDocument, choice.label, choice.label);
      button.dataset.openklineDrawingTool = choice.type;
      button.dataset.active = String(choice.type === this.activeDrawingType);
      button.setAttribute("aria-pressed", String(choice.type === this.activeDrawingType));
      tools.append(button);
    }
  }

  private handleDrawingPanelClick(event: Event, _panel: HTMLElement): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-drawing-tool], [data-openkline-drawing-action]") : null;
    if (target === null) return;
    const type = target.dataset.openklineDrawingTool;
    const action = target.dataset.openklineDrawingAction;
    try {
      if (type !== undefined) this.startDrawing(type, { snap: "visible-ohlc" });
      else if (action === "cancel") this.cancelInteractiveDrawing();
      else if (action === "undo") this.chart.undoDrawing();
      else if (action === "redo") this.chart.redoDrawing();
    } catch (error) {
      this.fail(error);
    }
  }

  private renderObjectTree(panel: HTMLElement): void {
    let tree = panel.querySelector<HTMLElement>("[data-openkline-object-tree-list]");
    if (tree === null) {
      tree = panel.ownerDocument.createElement("div");
      tree.dataset.openklineObjectTreeList = "";
      panel.querySelector("[data-openkline-panel-body]")?.append(tree);
    }
    tree.replaceChildren();
    const series = this.chart.getSeriesInfo();
    const drawings = this.chart.getDrawings();
    const indicators = this.getIndicatorEntries();
    if (series.length === 0 && drawings.length === 0 && indicators.length === 0) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "No chart objects";
      tree.append(empty);
      return;
    }
    for (const item of series) {
      const row = this.createObjectRow(panel.ownerDocument, `${item.title ?? item.id} · ${item.type}`, "series", item.id);
      const visibility = this.button(panel.ownerDocument, item.style.visible === false ? "Show" : "Hide", item.style.visible === false ? "Show" : "Hide");
      visibility.dataset.openklineObjectAction = "series-visibility";
      row.append(visibility);
      tree.append(row);
    }
    for (const entry of indicators) {
      const row = this.createObjectRow(panel.ownerDocument, `${entry.indicatorId} · ${entry.id} · ${entry.paneId}`, "indicator", entry.id);
      const remove = this.button(panel.ownerDocument, `${this.labels.remove} ${entry.id}`, this.labels.remove);
      remove.dataset.openklineObjectAction = "indicator-remove";
      row.append(remove);
      tree.append(row);
    }
    for (const drawing of drawings) {
      const row = this.createObjectRow(panel.ownerDocument, `${drawing.type} · ${drawing.id}`, "drawing", drawing.id);
      if (drawing.id === this.chart.getSelectedDrawingId()) row.setAttribute("aria-current", "true");
      const select = this.button(panel.ownerDocument, "Select", "Select");
      select.dataset.openklineObjectAction = "drawing-select";
      const visibility = this.button(panel.ownerDocument, drawing.style.visible === false ? "Show" : "Hide", drawing.style.visible === false ? "Show" : "Hide");
      visibility.dataset.openklineObjectAction = "drawing-visibility";
      const lock = this.button(panel.ownerDocument, drawing.style.locked === true ? "Unlock" : "Lock", drawing.style.locked === true ? "Unlock" : "Lock");
      lock.dataset.openklineObjectAction = "drawing-lock";
      const remove = this.button(panel.ownerDocument, this.labels.remove, this.labels.remove);
      remove.dataset.openklineObjectAction = "drawing-remove";
      row.append(select, visibility, lock, remove);
      tree.append(row);
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
    return row;
  }

  private handleObjectPanelClick(event: Event): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-object-action]") : null;
    const row = target?.closest<HTMLElement>("[data-openkline-object-row]");
    if (target === null || row === null || row === undefined) return;
    const action = target.dataset.openklineObjectAction;
    const id = row.dataset.openklineObjectId;
    if (id === undefined) return;
    try {
      if (action === "series-visibility") {
        const series = this.chart.getSeriesInfo().find((item) => item.id === id);
        if (series !== undefined) this.chart.setSeriesStyle(id, { visible: series.style.visible === false });
      } else if (action === "indicator-remove") {
        this.chart.removeIndicator(id);
      } else if (action === "drawing-select") {
        this.chart.selectDrawing(id);
      } else if (action === "drawing-visibility") {
        const drawing = this.chart.getDrawings().find((item) => item.id === id);
        if (drawing !== undefined) this.chart.setDrawingVisibility(id, drawing.style.visible === false);
      } else if (action === "drawing-lock") {
        const drawing = this.chart.getDrawings().find((item) => item.id === id);
        if (drawing !== undefined) this.chart.setDrawingLocked(id, drawing.style.locked !== true);
      } else if (action === "drawing-remove") {
        this.chart.removeDrawing(id);
      }
    } catch (error) {
      this.fail(error);
    }
  }

  private renderDrawingProperties(panel: HTMLElement): void {
    const body = panel.querySelector<HTMLElement>("[data-openkline-panel-body]");
    if (body === null) return;
    body.replaceChildren();
    const selectedId = this.chart.getSelectedDrawingId();
    const drawing = selectedId === null ? undefined : this.chart.getDrawings().find((item) => item.id === selectedId);
    if (drawing === undefined) {
      const empty = panel.ownerDocument.createElement("div");
      empty.dataset.openklinePanelEmpty = "";
      empty.textContent = "Select a drawing to edit its properties";
      body.append(empty);
      return;
    }
    const grid = panel.ownerDocument.createElement("div");
    grid.dataset.openklineSettingsGrid = "";
    const color = panel.ownerDocument.createElement("input");
    color.type = "color";
    color.value = toColorInputValue(drawing.style.color);
    color.dataset.openklineDrawingProperty = "color";
    const lineWidth = panel.ownerDocument.createElement("input");
    lineWidth.type = "number";
    lineWidth.min = "1";
    lineWidth.max = "8";
    lineWidth.step = "1";
    lineWidth.value = String(drawing.style.lineWidth ?? 1);
    lineWidth.dataset.openklineDrawingProperty = "lineWidth";
    const visible = panel.ownerDocument.createElement("input");
    visible.type = "checkbox";
    visible.checked = drawing.style.visible !== false;
    visible.dataset.openklineDrawingProperty = "visible";
    const locked = panel.ownerDocument.createElement("input");
    locked.type = "checkbox";
    locked.checked = drawing.style.locked === true;
    locked.dataset.openklineDrawingProperty = "locked";
    grid.append(
      this.field(panel.ownerDocument, "Color", color),
      this.field(panel.ownerDocument, "Line width", lineWidth),
      this.field(panel.ownerDocument, "Visible", visible),
      this.field(panel.ownerDocument, "Locked", locked),
    );
    const actions = panel.ownerDocument.createElement("div");
    actions.dataset.openklineToolGrid = "";
    const apply = this.button(panel.ownerDocument, this.labels.apply, this.labels.apply);
    apply.dataset.openklineDrawingAction = "apply-properties";
    const remove = this.button(panel.ownerDocument, this.labels.remove, this.labels.remove);
    remove.dataset.openklineDrawingAction = "remove-selected";
    actions.append(apply, remove);
    body.append(grid, actions);
  }

  private handleDrawingPropertyClick(event: Event, panel: HTMLElement): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-drawing-action]") : null;
    if (target === null) return;
    const action = target.dataset.openklineDrawingAction;
    const id = this.chart.getSelectedDrawingId();
    if (id === null) return;
    try {
      if (action === "remove-selected") {
        this.chart.removeDrawing(id);
        return;
      }
      if (action !== "apply-properties") return;
      const value = (name: string): HTMLInputElement | null => panel.querySelector<HTMLInputElement>(`[data-openkline-drawing-property="${name}"]`);
      const color = value("color");
      const lineWidth = value("lineWidth");
      const visible = value("visible");
      const locked = value("locked");
      const style: DrawingStyle = {
        ...(color === null ? {} : { color: color.value }),
        ...(lineWidth === null ? {} : { lineWidth: Number(lineWidth.value) }),
        ...(visible === null ? {} : { visible: visible.checked }),
        ...(locked === null ? {} : { locked: locked.checked }),
      };
      this.chart.setDrawingStyle(id, style);
    } catch (error) {
      this.fail(error);
    }
  }

  private renderSettingsPanel(panel: HTMLElement): void {
    const theme = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="theme"]');
    const direction = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="direction"]');
    const scale = panel.querySelector<HTMLSelectElement>('[data-openkline-setting="priceScaleMode"]');
    const autoScale = panel.querySelector<HTMLInputElement>('[data-openkline-setting="autoScale"]');
    const axisVisible = panel.querySelector<HTMLInputElement>('[data-openkline-setting="axisVisible"]');
    const precision = panel.querySelector<HTMLInputElement>('[data-openkline-setting="pricePrecision"]');
    if (theme === null || direction === null || scale === null || autoScale === null || axisVisible === null || precision === null) return;
    const priceScale = this.chart.getPriceScaleOptions();
    theme.value = this.theme;
    direction.value = this.direction;
    scale.value = priceScale.mode;
    autoScale.checked = priceScale.autoScale;
    axisVisible.checked = priceScale.axisVisible;
    precision.value = this.pricePrecision === null ? "" : String(this.pricePrecision);
  }

  private handleSettingsPanelClick(event: Event, panel: HTMLElement): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-openkline-settings-action]") : null;
    if (target === null || target.dataset.openklineSettingsAction !== "apply") return;
    try {
      const read = (name: string): HTMLInputElement | HTMLSelectElement | null => panel.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-openkline-setting="${name}"]`);
      const theme = read("theme") as HTMLSelectElement | null;
      const direction = read("direction") as HTMLSelectElement | null;
      const scale = read("priceScaleMode") as HTMLSelectElement | null;
      const autoScale = read("autoScale") as HTMLInputElement | null;
      const axisVisible = read("axisVisible") as HTMLInputElement | null;
      const precision = read("pricePrecision") as HTMLInputElement | null;
      const nextTheme = theme?.value as "light" | "dark" | undefined;
      const nextDirection = direction?.value as "ltr" | "rtl" | undefined;
      const nextScale = scale?.value as PriceScaleMode | undefined;
      const nextAutoScale = autoScale?.checked;
      const nextAxisVisible = axisVisible?.checked;
      const nextPrecision = precision?.value.trim() ?? "";
      if (nextTheme !== undefined) this.setTheme(nextTheme);
      if (nextDirection !== undefined) this.setDirection(nextDirection);
      if (nextScale !== undefined && nextAutoScale !== undefined && nextAxisVisible !== undefined) {
        const options: PriceScaleOptions = {
          mode: nextScale,
          autoScale: nextAutoScale,
          axisVisible: nextAxisVisible,
        };
        this.chart.setPriceScaleOptions(options);
        if (nextAutoScale) this.chart.resetPriceScale();
      }
      if (nextPrecision.length > 0) {
        const parsedPrecision = Number(nextPrecision);
        this.chart.setOptions({ pricePrecision: parsedPrecision });
        this.pricePrecision = parsedPrecision;
      }
    } catch (error) {
      this.fail(error);
    }
  }

  private cancelInteractiveDrawing(): void {
    this.activeDrawingType = null;
    const internalChart = this.chart as unknown as { cancelDrawing?: () => void };
    internalChart.cancelDrawing?.();
    this.refreshProfessionalUi();
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
    this.subscribeChart("indicatorChange", (event) => {
      if (event.action === "add") this.indicatorKinds.set(event.id, event.indicatorId);
      if (event.action === "remove") {
        this.indicatorKinds.delete(event.id);
        this.indicatorApis.delete(event.id);
        if (this.selectedIndicatorInstanceId === event.id) this.selectedIndicatorInstanceId = null;
      }
      this.refreshProfessionalUi();
    });
    this.subscribeChart("drawingSelection", () => this.refreshProfessionalUi());
    this.subscribeChart("toolActivation", (event) => {
      this.activeDrawingType = event.active ? event.type : null;
      this.refreshProfessionalUi();
    });
    for (const name of ["viewportChange", "crosshairMove", "replayChange", "replayError", "scriptError", "alertTriggered", "alertError"] as const) {
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
    this.refreshProfessionalUi();
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
  const supplied = features ?? {};
  const indicators = supplied.indicators ?? true;
  const drawings = supplied.drawings ?? true;
  return {
    header: true,
    symbol: true,
    timeframe: true,
    chartType: true,
    indicators,
    drawings,
    theme: true,
    direction: true,
    workspace: true,
    status: true,
    indicatorExplorer: supplied.indicatorExplorer ?? indicators,
    drawingToolbar: supplied.drawingToolbar ?? drawings,
    objectTree: supplied.objectTree ?? (drawings || indicators),
    drawingProperties: supplied.drawingProperties ?? drawings,
    chartSettings: supplied.chartSettings ?? true,
    ...supplied,
  };
}

function toClosePoint(candle: Candle): LinePoint {
  return { time: candle.time, value: candle.close };
}

function resolveWidgetIndicatorMetadata(choices?: readonly string[]): readonly IndicatorMetadata[] {
  const definitions = new Map(builtInIndicatorDefinitions.map((definition) => [definition.metadata.id, definition.metadata]));
  const ids = choices === undefined ? [...definitions.keys()] : [...choices];
  const seen = new Set<string>();
  const result: IndicatorMetadata[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const known = definitions.get(id);
    if (known !== undefined) {
      result.push(known);
      continue;
    }
    result.push({
      id,
      name: id,
      version: 1,
      description: "Host-registered indicator",
      category: "custom",
      parameters: [],
      outputs: [],
    });
  }
  return result;
}

function resolveWidgetDrawingChoices(choices?: readonly string[]): readonly WidgetDrawingChoice[] {
  const types = choices === undefined ? DEFAULT_DRAWINGS : choices;
  const seen = new Set<string>();
  return types.filter((type) => {
    if (seen.has(type)) return false;
    seen.add(type);
    return true;
  }).map((type) => ({ type, label: formatWidgetName(type) }));
}

function formatWidgetName(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function defaultIndicatorParameter(parameter: IndicatorParameterDefinition, candles: readonly Candle[]): unknown {
  switch (parameter.name) {
    case "fastPeriod": return 12;
    case "slowPeriod": return 26;
    case "signalPeriod": return 9;
    case "kPeriod": return 14;
    case "dPeriod": return 3;
    case "standardDeviations": return 2;
    case "multiplier": return 2;
    case "constant": return 0.015;
    case "anchorTime": return candles[candles.length - 1]?.time ?? 0;
    case "priceSource": return "typical";
    case "session": return "none";
    case "period": return 14;
    default:
      if (parameter.defaultValue !== undefined) return parameter.defaultValue;
      if (parameter.type === "boolean") return false;
      if (parameter.type === "enum") return parameter.values?.[0] ?? "";
      if (parameter.type === "integer" || parameter.type === "number") return parameter.min ?? 0;
      return "";
  }
}

function toColorInputValue(value: string | undefined): string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value) ? value : "#38bdf8";
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
