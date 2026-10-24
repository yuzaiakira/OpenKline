export interface Candle {
  /** UTC Unix timestamp in milliseconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface ChartTheme {
  background: string;
  text: string;
  grid: string;
  border: string;
  upCandle: string;
  downCandle: string;
  crosshair: string;
}

export type ChartThemeName = "light" | "dark";

export interface ChartOptions {
  autoSize?: boolean;
  width?: number;
  height?: number;
  theme?: ChartThemeName | Partial<ChartTheme>;
  locale?: string;
  timeZone?: string;
  pricePrecision?: number;
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
}

export interface ChartEvents {
  crosshairMove: CrosshairMoveEvent;
  datafeedError: Error;
}

export type ChartEventName = keyof ChartEvents;

export type ChartEventHandler<Name extends ChartEventName> = (
  event: ChartEvents[Name],
) => void;
