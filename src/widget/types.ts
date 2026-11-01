import type { Chart } from "../chart.js";
import type { OpenKlinePlugin, PluginHandle } from "../extensions/types.js";
import type { WorkspaceDocument, WorkspaceRestoreResult } from "../workspace.js";
import type { ChartEventName, ChartOptions, Candle, Datafeed, GetBarsQuery, IndicatorAddOptions } from "../types.js";

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
}

export interface WidgetOptions {
  readonly container: HTMLElement;
  readonly chartOptions?: ChartOptions;
  readonly chartType?: WidgetChartType;
  readonly data?: readonly Candle[];
  readonly datafeed?: Datafeed;
  readonly datafeedQuery?: WidgetDatafeedQuery;
  readonly storage?: WidgetStorage;
  readonly storageKey?: string;
  readonly features?: Partial<WidgetFeatureVisibility>;
  readonly indicatorChoices?: readonly string[];
  readonly drawingChoices?: readonly string[];
  readonly labels?: Partial<WidgetLabels>;
  readonly plugins?: readonly OpenKlinePlugin[];
}

export interface WidgetSnapshot {
  readonly status: WidgetStatus;
  readonly symbol: string | null;
  readonly timeframe: string;
  readonly chartType: WidgetChartType;
  readonly theme: "light" | "dark";
  readonly direction: "ltr" | "rtl";
  readonly hasData: boolean;
  readonly error: string | null;
  readonly features: WidgetFeatureVisibility;
}

export type WidgetEvent =
  | { readonly type: "state"; readonly snapshot: WidgetSnapshot }
  | { readonly type: "error"; readonly error: Error }
  | { readonly type: "chart"; readonly name: ChartEventName; readonly payload: unknown };

export interface WidgetDiagnostics {
  readonly destroyed: boolean;
  readonly domListeners: number;
  readonly chartSubscriptions: number;
  readonly pendingDataRequest: boolean;
  readonly canvasCount: number;
}

export interface InternalWidget {
  getChart(): Chart;
  getState(): WidgetSnapshot;
  getDiagnostics(): WidgetDiagnostics;
  setData(candles: readonly Candle[]): void;
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
  installPlugin(plugin: OpenKlinePlugin): PluginHandle;
  subscribe(listener: (event: WidgetEvent) => void): () => void;
  destroy(): void;
}
