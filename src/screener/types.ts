import type { Candle } from "../types.js";

export const OPENKLINE_SCREENER_VERSION = 1 as const;

/** A stable, provider-scoped identity for one tradable or reference instrument. */
export interface ScreenerInstrument {
  readonly symbol: string;
  readonly provider: string;
  readonly exchange: string;
  readonly assetClass: string;
  readonly quoteCurrency: string;
  readonly instrumentId: string;
  readonly name?: string;
}

export type ScreenerUniverseSource = "explicit" | "watchlist" | "demo";

export interface ScreenerUniverse {
  readonly version: typeof OPENKLINE_SCREENER_VERSION;
  readonly source: ScreenerUniverseSource;
  readonly instruments: readonly ScreenerInstrument[];
}

export type ScreenerBarFinality = "confirmed" | "developing";

/** Historical and streaming bars carry finality explicitly; it is never inferred by the core. */
export interface ScreenerBar {
  readonly candle: Candle;
  readonly finality: ScreenerBarFinality;
  readonly revision: number;
  readonly source: string;
  readonly receivedAt: number;
}

export interface ScreenerHistoryRequest {
  readonly instrument: ScreenerInstrument;
  readonly timeframe: string;
  readonly from?: number;
  readonly to?: number;
  readonly cursor?: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface ScreenerHistoryPage {
  readonly bars: readonly ScreenerBar[];
  readonly nextCursor: string | null;
  readonly complete: boolean;
}

export interface ScreenerBarSubscriptionRequest {
  readonly instrument: ScreenerInstrument;
  readonly timeframe: string;
  readonly signal?: AbortSignal;
}

export interface ScreenerMarketDataProvider {
  readonly id: string;
  resolveInstrument(instrument: ScreenerInstrument, signal?: AbortSignal): Promise<ScreenerInstrument>;
  getHistory(request: ScreenerHistoryRequest): Promise<ScreenerHistoryPage>;
  subscribeBars?(
    request: ScreenerBarSubscriptionRequest,
    onBar: (bar: ScreenerBar) => void,
    onError?: (error: Error) => void,
  ): () => void;
}

export interface ScreenerLimits {
  readonly maxInstruments: number;
  readonly maxBarsPerInstrument: number;
  readonly maxPageSize: number;
}

export const DEFAULT_SCREENER_LIMITS: ScreenerLimits = {
  maxInstruments: 1_000,
  maxBarsPerInstrument: 100_000,
  maxPageSize: 1_000,
};

export class ScreenerValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ScreenerValidationError";
  }
}

