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
  /** Additional HTTPS/HTTP origins allowed in absolute `next` links. */
  trustedPaginationOrigins?: readonly string[];
  /**
   * Forward configured headers to explicitly trusted cross-origin pagination
   * URLs. Disabled by default so credentials stay on `baseUrl`'s origin.
   */
  forwardHeadersToTrustedOrigins?: boolean;
  /** Maximum redirect hops for one page. Defaults to five. */
  maxRedirects?: number;
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
  private readonly trustedOrigins: ReadonlySet<string>;
  private readonly forwardHeadersToTrustedOrigins: boolean;
  private readonly maxRedirects: number;

  public constructor(private readonly options: RestDatafeedOptions) {
    this.baseUrl = new URL(options.baseUrl);
    assertHttpUrl(this.baseUrl, "REST baseUrl");
    this.barsPath = options.barsPath ?? "/bars";
    this.fetcher = options.fetcher ?? fetch;
    this.maxPages = options.maxPages ?? 100;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) {
      throw new RangeError("maxPages must be a positive integer");
    }
    this.maxRedirects = options.maxRedirects ?? 5;
    if (!Number.isInteger(this.maxRedirects) || this.maxRedirects < 0) {
      throw new RangeError("maxRedirects must be a non-negative integer");
    }
    const origins = new Set<string>([this.baseUrl.origin]);
    for (const origin of options.trustedPaginationOrigins ?? []) {
      const url = new URL(origin);
      assertHttpUrl(url, "trusted pagination origin");
      origins.add(url.origin);
    }
    this.trustedOrigins = origins;
    this.forwardHeadersToTrustedOrigins = options.forwardHeadersToTrustedOrigins === true;
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
      if (visited.has(url.href)) throw new Error("REST bars pagination repeated a URL");
      visited.add(url.href);
      const response = await this.fetchPage(url, query.signal);
      if (!response.ok) throw new Error(`REST bars request failed: ${response.status} ${response.statusText}`);
      const payload = parseRestBarsPage(await response.json());
      for (const raw of payload.bars) {
        const candle = normalizeRestCandle(raw);
        if (candle.time >= query.from && candle.time < query.to) byTime.set(candle.time, candle);
      }
      next = payload.next;
      if (next === undefined || next === null || next === "") break;
      if (page === this.maxPages - 1) throw new Error(`REST bars pagination exceeded maxPages=${this.maxPages}`);
    }

    const candles = [...byTime.values()].sort((left, right) => left.time - right.time);
    const store = new CandleStore();
    store.setData(candles);
    return store.getAll();
  }

  private createPageUrl(query: GetBarsQuery, cursor: string | null | undefined): URL {
    const absolute = cursor === undefined || cursor === null ? null : parseAbsolutePaginationUrl(cursor, this.baseUrl);
    const url = absolute ?? new URL(this.barsPath, this.baseUrl);
    if (absolute !== null) this.assertAllowedPaginationUrl(absolute);
    url.searchParams.set("symbol", query.symbol);
    url.searchParams.set("timeframe", query.timeframe);
    url.searchParams.set("from", String(query.from));
    url.searchParams.set("to", String(query.to));
    if (cursor !== undefined && cursor !== null && absolute === null) url.searchParams.set("cursor", cursor);
    return url;
  }

  private async fetchPage(url: URL, signal: AbortSignal | undefined): Promise<Response> {
    let current = url;
    const redirects = new Set<string>([current.href]);
    for (let redirect = 0; redirect <= this.maxRedirects; redirect += 1) {
      throwIfAborted(signal);
      const init: RequestInit = {
        redirect: "manual",
        ...(this.shouldForwardHeaders(current) && this.options.headers !== undefined ? { headers: this.options.headers } : {}),
        ...(signal === undefined ? {} : { signal }),
      };
      const response = await this.fetcher(current.href, init);
      if (!isRedirect(response.status)) {
        if (response.redirected && response.url !== "") {
          const finalUrl = new URL(response.url);
          this.assertAllowedPaginationUrl(finalUrl);
          if (finalUrl.origin !== current.origin) {
            throw new Error("REST fetcher followed an unexpected cross-origin redirect");
          }
        }
        return response;
      }
      const location = response.headers.get("location");
      if (location === null || location.length === 0) throw new Error("REST bars redirect is missing a Location header");
      const next = new URL(location, current);
      this.assertAllowedPaginationUrl(next);
      if (redirect === this.maxRedirects) throw new Error(`REST bars request exceeded maxRedirects=${this.maxRedirects}`);
      if (redirects.has(next.href)) throw new Error("REST bars redirect repeated a URL");
      redirects.add(next.href);
      current = next;
    }
    throw new Error("REST bars request exceeded redirect handling");
  }

  private shouldForwardHeaders(url: URL): boolean {
    return url.origin === this.baseUrl.origin || this.forwardHeadersToTrustedOrigins;
  }

  private assertAllowedPaginationUrl(url: URL): void {
    assertHttpUrl(url, "REST pagination URL");
    if (!this.trustedOrigins.has(url.origin)) {
      throw new Error(`REST pagination URL origin is not trusted: ${url.origin}`);
    }
  }
}

export function normalizeRestCandle(raw: RestBarPayload): Candle {
  assertRestBarPayload(raw);
  return {
    time: normalizeTimestamp(raw.time),
    open: raw.open,
    high: raw.high,
    low: raw.low,
    close: raw.close,
    ...(raw.volume === undefined ? {} : { volume: raw.volume }),
  };
}

function parseRestBarsPage(value: unknown): RestBarsPage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("REST bars response must be an object");
  }
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.bars)) throw new Error("REST bars response must contain a bars array");
  if (page.next !== undefined && page.next !== null && typeof page.next !== "string") {
    throw new Error("REST bars response next cursor must be a string, null, or omitted");
  }
  for (const bar of page.bars) assertRestBarPayload(bar);
  return { bars: page.bars as RestBarPayload[], ...(page.next === undefined ? {} : { next: page.next as string | null }) };
}

function assertRestBarPayload(value: unknown): asserts value is RestBarPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("REST bars response contains a malformed bar");
  }
  const bar = value as Record<string, unknown>;
  if ((typeof bar.time !== "number" && typeof bar.time !== "string")
    || typeof bar.open !== "number"
    || typeof bar.high !== "number"
    || typeof bar.low !== "number"
    || typeof bar.close !== "number"
    || (bar.volume !== undefined && typeof bar.volume !== "number")) {
    throw new Error("REST bars response contains a malformed bar");
  }
}

function parseAbsolutePaginationUrl(value: string, baseUrl: URL): URL | null {
  if (value.startsWith("//")) return new URL(value, baseUrl);
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function assertHttpUrl(url: URL, label: string): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${label} must use http or https`);
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
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

