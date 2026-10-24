export interface Candle {
  /** UTC Unix timestamp in milliseconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type SeriesType = "candlestick" | "line" | "area" | "volume" | "histogram";

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

export interface ChartOptions {
  autoSize?: boolean;
  width?: number;
  height?: number;
  theme?: ChartThemeName | Partial<ChartTheme>;
  locale?: string;
  timeZone?: string;
  pricePrecision?: number;
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
  price: number | null;
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

export type ChartEventName = keyof ChartEvents;

export type ChartEventHandler<Name extends ChartEventName> = (
  event: ChartEvents[Name],
) => void;
