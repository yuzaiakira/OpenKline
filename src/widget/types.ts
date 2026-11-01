import type { Chart } from "../chart.js";
import type { OpenKlinePlugin, PluginHandle } from "../extensions/types.js";
import type { WorkspaceDocument, WorkspaceRestoreResult } from "../workspace.js";
import type { ChartEventName, ChartOptions, Candle, Datafeed, GetBarsQuery, IndicatorAddOptions } from "../types.js";
import type { WatchlistDocument, WatchlistQuote, QuoteProvider } from "../studio/watchlist.js";
import type { ComparisonNormalizationMode } from "../comparison.js";
import type { ReplayApi, ReplayStatus } from "../replay/types.js";
import type { WidgetCompositionDocument } from "./composition.js";

/** Internal Phase 16.4.0 widget foundation. Deliberately absent from the root package exports. */
export type WidgetChartType =
  | "candlestick"
  | "ohlc"
  | "hollow-candlestick"
  | "heikin-ashi"
  | "line"
  | "area"
  | "baseline";

export type WidgetStatus = "idle" | "loading" | "ready" | "empty" | "error" | "destroyed";

/** Identity explicitly confirmed by the host for the currently displayed data. */
export interface WidgetDataIdentity {
  readonly symbol?: string;
  readonly timeframe?: string;
}

export type WidgetIdentityStatus = "unbound" | "loading" | "confirmed" | "unavailable" | "failed";

export type WidgetLayout = "single" | "two-horizontal" | "two-vertical" | "four-grid";

export interface WidgetFeatureVisibility {
  readonly header: boolean;
  readonly symbol: boolean;
  readonly timeframe: boolean;
  readonly chartType: boolean;
  readonly indicators: boolean;
  readonly drawings: boolean;
  readonly theme: boolean;
  readonly direction: boolean;
  readonly workspace: boolean;
  readonly status: boolean;
  /** Internal Phase 16.4.1 professional indicator explorer. */
  readonly indicatorExplorer: boolean;
  /** Internal Phase 16.4.1 grouped drawing toolbar. */
  readonly drawingToolbar: boolean;
  /** Internal Phase 16.4.1 chart object/layer tree. */
  readonly objectTree: boolean;
  /** Internal Phase 16.4.1 selected-drawing property editor. */
  readonly drawingProperties: boolean;
  /** Internal Phase 16.4.1 chart settings panel. */
  readonly chartSettings: boolean;
  /** Internal Phase 16.4.2 multi-chart layout controls. */
  readonly layout: boolean;
  /** Internal Phase 16.4.2 synchronization controls. */
  readonly synchronization: boolean;
  /** Internal Phase 16.4.2 watchlist panel. */
  readonly watchlist: boolean;
  /** Internal Phase 16.4.2 comparison panel. */
  readonly comparison: boolean;
  /** Internal Phase 16.4.2 replay panel. */
  readonly replay: boolean;
}

export interface WidgetStorage {
  load(key: string, signal?: AbortSignal): Promise<string | unknown | null>;
  save(key: string, value: string, signal?: AbortSignal): Promise<void>;
  remove?(key: string, signal?: AbortSignal): Promise<void>;
}

export type WidgetDatafeedQuery = Omit<GetBarsQuery, "signal">;

export interface WidgetLabels {
  readonly widgetLabel: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly chartType: string;
  readonly indicators: string;
  readonly drawings: string;
  readonly theme: string;
  readonly direction: string;
  readonly saveWorkspace: string;
  readonly loadWorkspace: string;
  readonly add: string;
  readonly start: string;
  readonly load: string;
  readonly loading: string;
  readonly empty: string;
  readonly ready: string;
  readonly error: string;
  readonly indicatorExplorer: string;
  readonly drawingToolbar: string;
  readonly objectTree: string;
  readonly drawingProperties: string;
  readonly chartSettings: string;
  readonly close: string;
  readonly cancel: string;
  readonly undo: string;
  readonly redo: string;
  readonly update: string;
  readonly remove: string;
  readonly apply: string;
  readonly layout: string;
  readonly activeChart: string;
  readonly synchronization: string;
  readonly syncCrosshair: string;
  readonly syncVisibleRange: string;
  readonly syncEnabled: string;
  readonly watchlist: string;
  readonly comparison: string;
  readonly replay: string;
  readonly favorite: string;
  readonly reorder: string;
  readonly play: string;
  readonly pause: string;
  readonly stepForward: string;
  readonly stepBackward: string;
  readonly seek: string;
  readonly exitReplay: string;
  readonly speed: string;
  readonly baseline: string;
  readonly normalization: string;
}

export interface WidgetSyncOptions {
  readonly enabled?: boolean;
  readonly crosshair?: boolean;
  readonly visibleRange?: boolean;
}

export interface WidgetOptions {
  readonly container: HTMLElement;
  readonly chartOptions?: ChartOptions;
  readonly chartType?: WidgetChartType;
  readonly data?: readonly Candle[];
  /** Optional identity binding for direct/offline candles. */
  readonly dataIdentity?: WidgetDataIdentity;
  readonly datafeed?: Datafeed;
  readonly datafeedQuery?: WidgetDatafeedQuery;
  readonly storage?: WidgetStorage;
  readonly storageKey?: string;
  readonly features?: Partial<WidgetFeatureVisibility>;
  readonly indicatorChoices?: readonly string[];
  readonly drawingChoices?: readonly string[];
  readonly labels?: Partial<WidgetLabels>;
  readonly plugins?: readonly OpenKlinePlugin[];
  /** Initial multi-chart layout; defaults to single. */
  readonly layout?: WidgetLayout;
  /** Opt-in crosshair / visible-range synchronization. Disabled by default. */
  readonly synchronization?: WidgetSyncOptions;
  /** Optional host-owned watchlist document seed. */
  readonly watchlist?: WatchlistDocument;
  /** Optional host-supplied quote provider for the Watchlist panel. */
  readonly quoteProvider?: QuoteProvider;
}

export interface WidgetChartSnapshot {
  readonly id: string;
  readonly active: boolean;
  readonly symbol: string | null;
  readonly timeframe: string | null;
  readonly requestedSymbol: string | null;
  readonly requestedTimeframe: string | null;
  readonly identityStatus: WidgetIdentityStatus;
  readonly hasData: boolean;
  readonly error: string | null;
  readonly replay: ReplayStatus | null;
}

export interface WidgetSnapshot {
  readonly status: WidgetStatus;
  readonly symbol: string | null;
  readonly timeframe: string | null;
  /** A host request that has not yet become the confirmed data identity. */
  readonly requestedSymbol: string | null;
  readonly requestedTimeframe: string | null;
  readonly identityStatus: WidgetIdentityStatus;
  readonly chartType: WidgetChartType;
  readonly theme: "light" | "dark";
  readonly direction: "ltr" | "rtl";
  readonly hasData: boolean;
  readonly error: string | null;
  readonly features: WidgetFeatureVisibility;
  readonly layout: WidgetLayout;
  readonly activeChartId: string;
  readonly charts: readonly WidgetChartSnapshot[];
  readonly synchronization: Required<WidgetSyncOptions>;
}

export type WidgetEvent =
  | { readonly type: "state"; readonly snapshot: WidgetSnapshot }
  | { readonly type: "error"; readonly error: Error }
  | { readonly type: "chart"; readonly name: ChartEventName; readonly payload: unknown; readonly chartId: string };

export interface WidgetDiagnostics {
  readonly destroyed: boolean;
  readonly domListeners: number;
  readonly chartSubscriptions: number;
  readonly pendingDataRequest: boolean;
  readonly canvasCount: number;
  readonly styleElementCount: number;
  readonly chartCount: number;
  readonly syncEnabled: boolean;
}

export interface InternalWidget {
  /** Returns the active chart. */
  getChart(): Chart;
  getCharts(): ReadonlyMap<string, Chart>;
  getActiveChartId(): string;
  setActiveChartId(id: string): void;
  getLayout(): WidgetLayout;
  setLayout(layout: WidgetLayout): void;
  getSynchronization(): Required<WidgetSyncOptions>;
  setSynchronization(options: WidgetSyncOptions): void;
  getState(): WidgetSnapshot;
  getDiagnostics(): WidgetDiagnostics;
  setData(candles: readonly Candle[], identity?: WidgetDataIdentity): void;
  setDatafeed(datafeed: Datafeed, query: WidgetDatafeedQuery): Promise<void>;
  setSymbol(symbol: string): Promise<void>;
  setTimeframe(timeframe: string): Promise<void>;
  setChartType(type: WidgetChartType): void;
  setTheme(theme: "light" | "dark"): void;
  setDirection(direction: "ltr" | "rtl"): void;
  addIndicator(indicatorId: string, options?: IndicatorAddOptions): string;
  startDrawing(type: string, options?: { readonly snap?: "none" | "visible-ohlc" }): void;
  saveWorkspace(key?: string): Promise<void>;
  loadWorkspace(key?: string): Promise<WorkspaceRestoreResult>;
  exportWorkspace(): WorkspaceDocument;
  importWorkspace(value: unknown): WorkspaceRestoreResult;
  exportComposition(): WidgetCompositionDocument;
  importComposition(value: unknown): void;
  getWatchlist(): WatchlistDocument;
  setWatchlist(document: WatchlistDocument): void;
  setQuoteProvider(provider: QuoteProvider | null): void;
  getQuotes(): readonly WatchlistQuote[];
  setComparisonMode(mode: ComparisonNormalizationMode): void;
  setComparisonBaseline(time: number | null, options?: { readonly maxAgeMs?: number }): void;
  addComparisonAsset(id: string, candles: readonly Candle[], options?: { readonly label?: string; readonly color?: string }): void;
  removeComparisonAsset(id: string): void;
  clearComparison(): void;
  getReplay(): ReplayApi | null;
  enterReplay(options?: { readonly startAt?: number; readonly speed?: number }): ReplayApi;
  exitReplay(): void;
  installPlugin(plugin: OpenKlinePlugin): PluginHandle;
  subscribe(listener: (event: WidgetEvent) => void): () => void;
  destroy(): void;
}
