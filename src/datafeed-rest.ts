import { CandleStore } from "./core/candle-store.js";
import type { Candle, Datafeed, GetBarsQuery, SymbolInfo } from "./types.js";

export interface RestBarPayload {
  time: number | string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface RestBarsPage {
  bars: readonly RestBarPayload[];
  /** A cursor or absolute URL for the next page. */
  next?: string | null;
}

export type RestFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface RestDatafeedOptions {
  baseUrl: string;
  symbols: Readonly<Record<string, SymbolInfo>>;
  barsPath?: string;
  fetcher?: RestFetcher;
  headers?: HeadersInit;
  maxPages?: number;
}

/**
 * Fetch-based REST adapter for APIs returning `{ bars, next }` pages.
 * Timestamps are normalized to integer UTC milliseconds and duplicate bars
 * are last-write-wins before the final ordered validation pass.
 */
export class RestDatafeed implements Datafeed {
  private readonly baseUrl: URL;
  private readonly barsPath: string;
  private readonly fetcher: RestFetcher;
  private readonly maxPages: number;

  public constructor(private readonly options: RestDatafeedOptions) {
    this.baseUrl = new URL(options.baseUrl);
    this.barsPath = options.barsPath ?? "/bars";
    this.fetcher = options.fetcher ?? fetch;
    this.maxPages = options.maxPages ?? 100;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) {
      throw new RangeError("maxPages must be a positive integer");
    }
  }

  public async resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo> {
    throwIfAborted(signal);
    const info = this.options.symbols[symbol];
    if (info === undefined) throw new Error(`Unknown symbol: ${symbol}`);
    return { ...info };
  }

  public async getBars(query: GetBarsQuery): Promise<readonly Candle[]> {
    if (!Number.isFinite(query.from) || !Number.isFinite(query.to) || query.to < query.from) {
      throw new Error("Bar query requires a finite ascending time range");
    }
    await this.resolveSymbol(query.symbol, query.signal);
    const byTime = new Map<number, Candle>();
    let next: string | null | undefined;
    const visited = new Set<string>();

    for (let page = 0; page < this.maxPages; page += 1) {
      throwIfAborted(query.signal);
      const url = this.createPageUrl(query, next);
      const init: RequestInit = {
        ...(this.options.headers === undefined ? {} : { headers: this.options.headers }),
        ...(query.signal === undefined ? {} : { signal: query.signal }),
      };
      const response = await this.fetcher(url.toString(), init);
      if (!response.ok) throw new Error(`REST bars request failed: ${response.status} ${response.statusText}`);
      const payload = await response.json() as RestBarsPage;
      if (!Array.isArray(payload.bars)) throw new Error("REST bars response must contain a bars array");
      for (const raw of payload.bars) {
        const candle = normalizeRestCandle(raw);
        if (candle.time >= query.from && candle.time < query.to) byTime.set(candle.time, candle);
      }
      next = payload.next;
      if (next === undefined || next === null || next === "") break;
      if (visited.has(next)) throw new Error("REST bars pagination repeated a cursor");
      visited.add(next);
      if (page === this.maxPages - 1) throw new Error(`REST bars pagination exceeded maxPages=${this.maxPages}`);
    }

    const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
    const store = new CandleStore();
    store.setData(candles);
    return store.getAll();
  }

  private createPageUrl(query: GetBarsQuery, cursor: string | null | undefined): URL {
    const url = cursor?.startsWith("http") ? new URL(cursor) : new URL(this.barsPath, this.baseUrl);
    url.searchParams.set("symbol", query.symbol);
    url.searchParams.set("timeframe", query.timeframe);
    url.searchParams.set("from", String(query.from));
    url.searchParams.set("to", String(query.to));
    if (cursor !== undefined && cursor !== null && !cursor.startsWith("http")) url.searchParams.set("cursor", cursor);
    return url;
  }
}

export function normalizeRestCandle(raw: RestBarPayload): Candle {
  return {
    time: normalizeTimestamp(raw.time),
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    ...(raw.volume === undefined ? {} : { volume: raw.volume }),
  };
}

export function normalizeTimestamp(value: number | string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numeric)) {
    const milliseconds = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
    if (Number.isInteger(milliseconds) && milliseconds >= 0) return milliseconds;
  }
  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  throw new Error(`Invalid timestamp: ${String(value)}`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }
}

