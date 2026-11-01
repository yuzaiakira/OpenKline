import { createChart, type Chart } from "../chart.js";
import type { OpenKlinePlugin, PluginHandle } from "../extensions/types.js";
import type {
  ChartIndicatorApi,
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
import { parseWorkspace, type WorkspaceDocument, type WorkspaceRestoreResult } from "../workspace.js";
import type { ReplayApi, ReplayOptions, ReplayStatus } from "../replay/types.js";
import { cancelInteractiveDrawing } from "../internal/drawing-cancellation.js";
import { BASE_SERIES_ID, PRESENTATION_SERIES_ID } from "./defaults.js";
import { WidgetLifecycleError } from "./errors.js";
import type {
  WidgetChartType,
  WidgetDataIdentity,
  WidgetDatafeedQuery,
  WidgetIdentityStatus,
} from "./types.js";

export interface ChartSlotOptions {
  readonly id: string;
  readonly document: Document;
  readonly grid: HTMLElement;
  readonly chartOptions: ChartOptions;
  readonly chartType: WidgetChartType;
  readonly data?: readonly Candle[];
  readonly dataIdentity?: WidgetDataIdentity;
  readonly datafeed?: Datafeed | null;
  readonly datafeedQuery?: WidgetDatafeedQuery | null;
  readonly plugins?: readonly OpenKlinePlugin[];
  readonly onEvent: (chartId: string, name: ChartEventName, payload: unknown) => void;
  readonly onStateChange: () => void;
}

/**
 * Owns one Chart instance and its Widget-scoped data/identity/presentation/replay state.
 */
export class ChartSlot {
  public readonly id: string;
  public readonly slotElement: HTMLElement;
  public readonly headerElement: HTMLElement;
  public readonly chartContainer: HTMLElement;
  public readonly emptyElement: HTMLElement;
  public readonly chart: Chart;
  private readonly subscriptions: Array<() => void> = [];
  private readonly pluginHandles: PluginHandle[] = [];
  private readonly onEvent: ChartSlotOptions["onEvent"];
  private readonly onStateChange: () => void;
  private datafeed: Datafeed | null;
  private datafeedQuery: WidgetDatafeedQuery | null;
  private dataRequest: AbortController | null = null;
  private dataRequestGeneration = 0;
  private presentation: SeriesApi<Candle> | SeriesApi<LinePoint> | null = null;
  private syncingPresentation = false;
  private applyingDirectData = false;
  private destroyed = false;
  public chartType: WidgetChartType;
  public symbol: string | null;
  public timeframe: string | null;
  public requestedSymbol: string | null;
  public requestedTimeframe: string | null;
  public identityStatus: WidgetIdentityStatus;
  public hasData = false;
  public error: string | null = null;
  public readonly indicatorApis = new Map<string, ChartIndicatorApi>();
  public readonly indicatorKinds = new Map<string, string>();
  public activeDrawingType: string | null = null;
  private replayApi: ReplayApi | null = null;
  private replayUnsubscribe: (() => void) | null = null;

  public constructor(options: ChartSlotOptions) {
    this.id = options.id;
    this.onEvent = options.onEvent;
    this.onStateChange = options.onStateChange;
    this.chartType = options.chartType;
    const directIdentity = options.dataIdentity;
    this.datafeed = options.datafeed ?? null;
    this.datafeedQuery = options.datafeedQuery ?? null;
    this.symbol = directIdentity?.symbol ?? null;
    this.timeframe = directIdentity?.timeframe ?? null;
    this.requestedSymbol = this.datafeedQuery?.symbol ?? this.symbol;
    this.requestedTimeframe = this.datafeedQuery?.timeframe ?? this.timeframe;
    this.identityStatus = this.datafeedQuery !== null
      ? "loading"
      : options.data !== undefined && options.data.length > 0
        ? directIdentity === undefined ? "unavailable" : "confirmed"
        : directIdentity === undefined ? "unbound" : "confirmed";

    const document = options.document;
    this.slotElement = document.createElement("div");
    this.slotElement.dataset.openklineChartSlot = this.id;
    this.headerElement = document.createElement("div");
    this.headerElement.dataset.openklineChartSlotHeader = "";
    this.headerElement.textContent = this.id;
    this.chartContainer = document.createElement("div");
    this.chartContainer.dataset.openklineChart = "";
    this.chartContainer.setAttribute("role", "img");
    this.chartContainer.setAttribute("aria-label", `OpenKline chart ${this.id}`);
    this.emptyElement = document.createElement("div");
    this.emptyElement.dataset.openklineEmpty = "";
    this.emptyElement.setAttribute("role", "status");
    this.emptyElement.setAttribute("aria-live", "polite");
    this.emptyElement.textContent = "No chart data loaded";
    this.chartContainer.append(this.emptyElement);
    this.slotElement.append(this.headerElement, this.chartContainer);
    options.grid.append(this.slotElement);

    this.chart = createChart(this.chartContainer, options.chartOptions);
    const base = this.chart.addCandlestickSeries({
      id: BASE_SERIES_ID,
      title: "Price",
      style: { visible: this.chartType === "candlestick" },
    });
    if (options.data !== undefined) base.setData(options.data);
    for (const plugin of options.plugins ?? []) this.pluginHandles.push(this.chart.installPlugin(plugin));
    this.hasData = this.chart.getData().length > 0;
    this.attachSubscriptions();
    this.syncPresentation();
    this.renderHeader();
    if (this.datafeed !== null && this.datafeedQuery !== null) {
      void this.setDatafeed(this.datafeed, this.datafeedQuery).catch(() => undefined);
    }
  }

  public setActive(active: boolean): void {
    this.slotElement.dataset.active = String(active);
    this.slotElement.setAttribute("aria-current", active ? "true" : "false");
  }

  public renderHeader(): void {
    const symbol = this.symbol ?? this.requestedSymbol ?? "unbound";
    const timeframe = this.timeframe ?? this.requestedTimeframe ?? "—";
    this.headerElement.textContent = `${this.id} · ${symbol} · ${timeframe}`;
  }

  public getReplayStatus(): ReplayStatus | null {
    if (this.replayApi === null) return null;
    const status = this.replayApi.getStatus();
    return status.state === "disposed" ? null : status;
  }

  public getReplay(): ReplayApi | null {
    if (this.replayApi === null) return null;
    return this.replayApi.getStatus().state === "disposed" ? null : this.replayApi;
  }

  public enterReplay(options: Omit<ReplayOptions, "source"> = {}): ReplayApi {
    this.assertAlive();
    if (this.getReplay() !== null) throw new WidgetLifecycleError(`Replay already active on chart ${this.id}`);
    const source = this.chart.getData();
    if (source.length === 0) throw new WidgetLifecycleError("Cannot enter replay without candle data");
    this.replayUnsubscribe?.();
    this.replayApi = this.chart.createReplay({ source, ...options });
    this.replayApi.start();
    this.replayUnsubscribe = this.replayApi.subscribe(() => this.onStateChange());
    this.onStateChange();
    return this.replayApi;
  }

  public exitReplay(): void {
    const replay = this.getReplay();
    if (replay === null) return;
    replay.exit();
    this.replayUnsubscribe?.();
    this.replayUnsubscribe = null;
    this.replayApi = null;
    this.onStateChange();
  }

  public setData(candles: readonly Candle[], identity?: WidgetDataIdentity): void {
    this.assertAlive();
    const hasIdentity = identity !== undefined && (identity.symbol !== undefined || identity.timeframe !== undefined);
    if (candles.length > 0 && !hasIdentity && (this.hasData || this.identityStatus === "confirmed")) {
      throw new WidgetLifecycleError("A data identity is required when replacing displayed candles");
    }
    this.cancelPendingRequest();
    if (this.datafeed !== null) {
      this.chart.stopDatafeed();
      this.datafeed = null;
      this.datafeedQuery = null;
    }
    this.applyingDirectData = true;
    try {
      this.chart.setData(candles);
      this.hasData = candles.length > 0;
      if (hasIdentity && identity !== undefined) {
        this.symbol = identity.symbol ?? null;
        this.timeframe = identity.timeframe ?? null;
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
      this.emptyElement.hidden = this.hasData;
      this.syncPresentation();
      this.renderHeader();
    } finally {
      this.applyingDirectData = false;
    }
    this.onStateChange();
  }

  public async setDatafeed(datafeed: Datafeed, query: WidgetDatafeedQuery): Promise<void> {
    this.assertAlive();
    const controller = new AbortController();
    this.dataRequest?.abort();
    this.dataRequest = controller;
    const generation = ++this.dataRequestGeneration;
    this.datafeed = datafeed;
    this.datafeedQuery = { ...query };
    this.requestedSymbol = query.symbol;
    this.requestedTimeframe = query.timeframe;
    this.identityStatus = "loading";
    this.error = null;
    // Chart.setDatafeed clears managed indicators before confirming bars.
    this.indicatorApis.clear();
    this.indicatorKinds.clear();
    this.renderHeader();
    this.onStateChange();
    try {
      // Reuse Chart's provider-neutral resolveSymbol / getBars / subscribeBars lifecycle.
      await this.chart.setDatafeed(datafeed, { ...query, signal: controller.signal });
      if (this.destroyed || generation !== this.dataRequestGeneration || controller.signal.aborted) return;
      this.symbol = query.symbol;
      this.timeframe = query.timeframe;
      this.requestedSymbol = this.symbol;
      this.requestedTimeframe = this.timeframe;
      this.identityStatus = "confirmed";
      this.hasData = this.chart.getData().length > 0;
      this.emptyElement.hidden = this.hasData;
      this.syncPresentation();
      this.renderHeader();
      this.onStateChange();
    } catch (error) {
      if (controller.signal.aborted || generation !== this.dataRequestGeneration || isAbortError(error) || this.destroyed) return;
      this.identityStatus = "failed";
      this.error = error instanceof Error ? error.message : String(error);
      this.onStateChange();
      throw error;
    } finally {
      // Clear only this generation's controller so a newer request stays pending.
      if (generation === this.dataRequestGeneration) this.dataRequest = null;
    }
  }

  public async setSymbol(symbol: string): Promise<void> {
    const normalized = symbol.trim();
    if (normalized.length === 0) throw new WidgetLifecycleError("Symbol must not be empty");
    if (this.datafeed === null || this.datafeedQuery === null) {
      if (this.hasData) {
        throw new WidgetLifecycleError("Cannot change symbol while direct candles are displayed; replace them with setData(candles, { symbol, timeframe })");
      }
      this.requestedSymbol = normalized;
      this.renderHeader();
      this.onStateChange();
      return;
    }
    if (normalized === this.requestedSymbol && this.identityStatus === "loading") return;
    await this.setDatafeed(this.datafeed, { ...this.datafeedQuery, symbol: normalized });
  }

  public async setTimeframe(timeframe: string): Promise<void> {
    const normalized = timeframe.trim();
    if (normalized.length === 0) throw new WidgetLifecycleError("Timeframe must not be empty");
    if (this.datafeed === null || this.datafeedQuery === null) {
      if (this.hasData) {
        throw new WidgetLifecycleError("Cannot change timeframe while direct candles are displayed; replace them with setData(candles, { symbol, timeframe })");
      }
      this.requestedTimeframe = normalized;
      this.renderHeader();
      this.onStateChange();
      return;
    }
    if (normalized === this.requestedTimeframe && this.identityStatus === "loading") return;
    await this.setDatafeed(this.datafeed, { ...this.datafeedQuery, timeframe: normalized });
  }

  public setChartType(type: WidgetChartType): void {
    this.chartType = type;
    this.syncPresentation();
    this.onStateChange();
  }

  public addIndicator(indicatorId: string, options: IndicatorAddOptions = {}): string {
    const api = this.chart.addIndicator(indicatorId, options);
    this.indicatorApis.set(api.id, api);
    this.indicatorKinds.set(api.id, indicatorId);
    this.onStateChange();
    return api.id;
  }

  public startDrawing(type: string, options: { readonly snap?: "none" | "visible-ohlc" } = {}): void {
    this.chart.startDrawing(type, options);
    this.activeDrawingType = type;
    this.onStateChange();
  }

  public cancelDrawing(): void {
    this.activeDrawingType = null;
    cancelInteractiveDrawing(this.chart);
    this.onStateChange();
  }

  public exportWorkspace(): WorkspaceDocument {
    return this.chart.serializeWorkspace({
      ...(this.symbol === null ? {} : { symbol: this.symbol }),
      ...(this.timeframe === null ? {} : { timeframe: this.timeframe }),
    });
  }

  public importWorkspace(value: unknown): WorkspaceRestoreResult {
    this.cancelPendingRequest();
    this.exitReplay();
    const parsed = parseWorkspace(value);
    if (this.datafeed !== null) this.chart.stopDatafeed();
    this.datafeed = null;
    this.datafeedQuery = null;
    this.indicatorApis.clear();
    this.indicatorKinds.clear();
    const result = this.chart.restoreWorkspace(value, { missingPlugins: "skip", missingIndicators: "skip" });
    this.rebindPresentation();
    this.symbol = parsed.metadata?.symbol ?? null;
    this.timeframe = parsed.metadata?.timeframe ?? null;
    this.requestedSymbol = this.symbol;
    this.requestedTimeframe = this.timeframe;
    this.hasData = this.chart.getData().length > 0;
    this.emptyElement.hidden = this.hasData;
    this.identityStatus = this.hasData
      ? (this.symbol !== null || this.timeframe !== null ? "confirmed" : "unavailable")
      : (this.symbol !== null || this.timeframe !== null ? "confirmed" : "unbound");
    this.error = null;
    this.renderHeader();
    this.onStateChange();
    return result;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelPendingRequest();
    this.exitReplay();
    if (this.datafeed !== null) {
      this.chart.stopDatafeed();
      this.datafeed = null;
      this.datafeedQuery = null;
    }
    for (const unsubscribe of this.subscriptions.splice(0)) unsubscribe();
    for (const handle of this.pluginHandles.splice(0)) handle.dispose();
    this.chart.destroy();
    this.slotElement.remove();
  }

  public hasPendingDataRequest(): boolean {
    return this.dataRequest !== null && !this.dataRequest.signal.aborted;
  }

  public getSubscriptionCount(): number {
    return this.subscriptions.length;
  }

  private cancelPendingRequest(): void {
    this.dataRequestGeneration += 1;
    this.dataRequest?.abort();
    this.dataRequest = null;
  }

  private attachSubscriptions(): void {
    this.subscribe("dataUpdated", (event) => {
      this.hasData = this.chart.getData().length > 0;
      this.emptyElement.hidden = this.hasData;
      if (!this.syncingPresentation && (event.kind === "set" || event.kind === "update")) this.syncPresentation();
      if (!this.applyingDirectData) this.onStateChange();
    });
    this.subscribe("datafeedError", (event) => {
      this.error = event instanceof Error ? event.message : String(event);
      this.onStateChange();
    });
    this.subscribe("toolActivation", (event) => {
      this.activeDrawingType = event.active ? event.type : null;
      this.onStateChange();
    });
    this.subscribe("indicatorChange", () => this.onStateChange());
    this.subscribe("drawingSelection", () => this.onStateChange());
    this.subscribe("replayChange", () => this.onStateChange());
    this.subscribe("chartDestroy", () => undefined);
  }

  private subscribe<Name extends ChartEventName>(name: Name, callback?: (event: ChartEvents[Name]) => void): void {
    const unsubscribe = this.chart.subscribe(name, (event) => {
      callback?.(event);
      this.onEvent(this.id, name, event);
    });
    this.subscriptions.push(unsubscribe);
  }

  private syncPresentation(): void {
    if (this.destroyed) return;
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
      case "area": return this.chart.addAreaSeries(options) as unknown as SeriesApi<LinePoint>;
      case "baseline": return this.chart.addBaselineSeries(options);
      case "candlestick": return this.chart.addCandlestickSeries(options);
    }
  }

  private rebindPresentation(): void {
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
    this.syncPresentation();
  }

  private assertAlive(): void {
    if (this.destroyed) throw new WidgetLifecycleError(`Chart slot ${this.id} has been destroyed`);
  }
}

function toClosePoint(candle: Candle): LinePoint {
  return { time: candle.time, value: candle.close };
}

function isWidgetChartType(type: string): type is WidgetChartType {
  return ["candlestick", "ohlc", "hollow-candlestick", "heikin-ashi", "line", "area", "baseline"].includes(type);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: string }).name === "AbortError";
}
