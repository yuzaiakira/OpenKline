import type { Candle, Datafeed } from "openkline";

export declare const BINANCE_INTERVALS: ReadonlySet<string>;
export declare function binanceStudioSymbol(symbol: string): string | null;
export declare function binanceStudioInterval(timeframe: string): string | null;
export declare function normalizeBinanceKline(value: readonly (number | string)[]): Candle;
export declare function createBinanceDatafeed(options?: {
  readonly symbol?: string;
  readonly interval?: string;
  readonly restBaseUrl?: string;
  readonly wsBaseUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly createSocket?: (url: string) => import("openkline").WebSocketLike;
  readonly maxPages?: number;
}): Datafeed;
