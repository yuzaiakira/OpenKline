export interface Candle {
  /** UTC Unix timestamp in milliseconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type CandleSeriesType = "candlestick" | "ohlc" | "hollow-candlestick" | "heikin-ashi";
export type SeriesType = CandleSeriesType | "line" | "area" | "baseline" | "volume" | "histogram";

export interface LinePoint {
  time: number;
  value: number;
}

export type AreaPoint = LinePoint;

export interface VolumePoint {
  time: number;
  value: number;
  /** Optional per-bar override; otherwise the candle direction/style is used. */
  color?: string;
}

export type SeriesPoint = Candle | LinePoint | VolumePoint;

export interface SeriesStyle {
  color?: string;
  lineWidth?: number;
  fillColor?: string;
  fillOpacity?: number;
  upColor?: string;
  downColor?: string;
  /** Optional distinct outline color for an up hollow candlestick. */
  hollowUpColor?: string;
  /** Raw value used by a baseline series to split above/below regions. */
  baseline?: number;
  aboveColor?: string;
  belowColor?: string;
  aboveFillColor?: string;
  belowFillColor?: string;
  aboveFillOpacity?: number;
  belowFillOpacity?: number;
  visible?: boolean;
}

export interface SeriesBand {
  /** Shared key for the upper/lower boundary pair rendered as a filled region. */
  group: string;
  role: "upper" | "lower";
}

export interface SeriesOptions {
  id?: string;
  title?: string;
  /** Existing pane ID. Omit for the main pane; volume defaults to a volume pane. */
  pane?: string;
  style?: SeriesStyle;
  band?: SeriesBand;
}

export interface PaneOptions {
  id?: string;
  /** Preferred CSS-pixel height for non-main panes. */
  height?: number;
  minHeight?: number;
}

export interface PaneApi {
  readonly id: string;
  setHeight(height: number): void;
  getHeight(): number | null;
  remove(): void;
}

export interface IndicatorAddOptions {
  id?: string;
  pane?: string | "new";
  parameters?: Record<string, unknown>;
  [parameter: string]: unknown;
}

export interface ChartIndicatorApi {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  getResult(): import("./indicators/types.js").IndicatorResult;
  setParameters(parameters: Record<string, unknown>): void;
  setOutputStyle(outputId: string, style: SeriesStyle): void;
  remove(): void;
}

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  border: string;
  upCandle: string;
  downCandle: string;
  crosshair: string;
  volumeUp: string;
  volumeDown: string;
  bandFill?: string;
  bandFillOpacity?: number;
}

export type ChartThemeName = "light" | "dark";
export type ChartDirection = "ltr" | "rtl";

/** Display-only transformation for the primary price pane. */
export type PriceScaleMode = "linear" | "logarithmic" | "percentage" | "indexed";

export interface PriceScaleRange {
  readonly min: number;
  readonly max: number;
}

/** Runtime configuration for the primary price pane. */
export interface PriceScaleOptions {
  mode?: PriceScaleMode;
  /** Recompute from visible data; false retains the current/manual range. */
  autoScale?: boolean;
  /** Positive raw-price reference for percentage and indexed modes. */
  referencePrice?: number;
  /** Fraction of transformed range reserved above the highest visible value. */
  marginTop?: number;
  /** Fraction of transformed range reserved below the lowest visible value. */
  marginBottom?: number;
  /** Render numeric labels for the primary price axis. */
  axisVisible?: boolean;
}

export interface PriceScaleConfiguration {
  readonly mode: PriceScaleMode;
  readonly autoScale: boolean;
  readonly referencePrice?: number;
  readonly marginTop: number;
  readonly marginBottom: number;
  readonly axisVisible: boolean;
  /** Present only while autoscale is disabled. Values remain raw prices. */
  readonly range?: PriceScaleRange;
}

export interface PriceScaleDiagnostic {
  readonly code: "LOGARITHMIC_REQUIRES_POSITIVE_VALUES" | "REFERENCE_REQUIRES_POSITIVE_VALUE";
  readonly message: string;
}

export interface PriceScaleState extends PriceScaleConfiguration {
  /** The effective transform after deterministic domain validation. */
  readonly activeMode: PriceScaleMode;
  readonly diagnostic?: PriceScaleDiagnostic;
}

export interface ChartOptions {
  autoSize?: boolean;
  width?: number;
  height?: number;
  theme?: ChartThemeName | Partial<ChartTheme>;
  locale?: string;
  timeZone?: string;
  pricePrecision?: number;
  priceScale?: PriceScaleOptions;
  interaction?: ChartInteractionOptions;
  direction?: ChartDirection;
}

export interface ChartInteractionOptions {
  /** Enable wheel zoom; enabled by default. */
  wheelZoom?: boolean;
  /** Enable pointer/touch panning when no drawing is selected; enabled by default. */
  pointerPan?: boolean;
  /** Render and publish crosshair updates; enabled by default. */
  crosshair?: boolean;
  /** Allow plugin command shortcuts while the chart canvas is focused; enabled by default. */
  keyboardShortcuts?: boolean;
}

export interface SymbolInfo {
  symbol: string;
  exchange?: string;
  currency?: string;
  timezone: string;
  pricePrecision: number;
  minTick?: number;
}

export interface GetBarsQuery {
  symbol: string;
  timeframe: string;
  from: number;
  to: number;
  signal?: AbortSignal;
}

export interface SubscribeBarsArgs {
  symbol: string;
  timeframe: string;
  onBar: (bar: Candle) => void;
  onError?: (error: Error) => void;
}

export interface Datafeed {
  resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo>;
  getBars(query: GetBarsQuery): Promise<readonly Candle[]>;
  subscribeBars?(args: SubscribeBarsArgs): () => void;
}

export interface CrosshairMoveEvent {
  time: number | null;
  /** Raw financial price. Display transformations never change this value. */
  price: number | null;
  /** Formatted display value for the active pane, when the pointer is in it. */
  formattedPrice?: string | null;
  priceScaleMode?: PriceScaleMode;
  x: number;
  y: number;
  series: CrosshairSeriesValue[];
}

export interface ChartEvents {
  chartReady: { timestamp: number };
  chartDestroy: { timestamp: number };
  dataUpdated: { kind: "set" | "update"; time: number | null; appendOnly: boolean };
  viewportChange: { from: number; to: number };
  indicatorChange: { action: "add" | "remove" | "update"; id: string; indicatorId: string };
  drawingSelection: { id: string | null };
  toolActivation: { type: string; active: boolean };
  themeChange: { theme: ChartTheme };
  crosshairMove: CrosshairMoveEvent;
  datafeedError: Error;
  replayChange: import("./replay/types.js").ReplayStatus;
  replayError: Error;
  alertTriggered: import("./alerts/types.js").AlertEvent;
  alertError: import("./alerts/types.js").AlertDiagnostic;
}

export interface CrosshairSeriesValue {
  id: string;
  type: SeriesType;
  title?: string;
  value: SeriesPoint | null;
}

export interface SeriesApi<T extends SeriesPoint> {
  readonly id: string;
  readonly type: SeriesType;
  setData(data: readonly T[]): void;
  update(point: T): void;
  getData(): T[];
  setStyle(style: SeriesStyle): void;
  remove(): void;
}

/** A lightweight, defensive description for object-management UIs. */
export interface ChartSeriesInfo {
  readonly id: string;
  readonly type: SeriesType;
  readonly paneId: string;
  readonly title?: string;
  readonly style: SeriesStyle;
  readonly dataLength: number;
}

export type ChartEventName = keyof ChartEvents;

export type ChartEventHandler<Name extends ChartEventName> = (
  event: ChartEvents[Name],
) => void;
