import { normalizeTimestamp } from "../datafeed-rest.js";
import type { PaperMarketEvent, PaperTradingMode, PaperQuoteStatus } from "./types.js";

export interface PaperRestEventPayload {
  readonly id: string;
  readonly symbol: string;
  readonly time: number | string;
  readonly price: number;
  readonly sourceSequence?: number;
  readonly quoteStatus?: PaperQuoteStatus;
  readonly mode?: PaperTradingMode;
}

export interface PaperRestEventPage {
  readonly events: readonly PaperRestEventPayload[];
  readonly next?: string | null;
}

export type PaperRestFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface PaperHistoryQuery {
  readonly symbol: string;
  readonly from?: number;
  readonly to?: number;
  readonly signal?: AbortSignal;
}

export interface PaperRestMarketAdapterOptions {
  readonly baseUrl: string;
  readonly eventsPath?: string;
  readonly source?: string;
  readonly fetcher?: PaperRestFetcher;
  readonly headers?: HeadersInit;
  readonly maxPages?: number;
  readonly trustedPaginationOrigins?: readonly string[];
}

export class PaperMarketDataValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaperMarketDataValidationError";
  }
}

export class PaperMarketDataStaleResponseError extends Error {
  public constructor() {
    super("A newer Paper Trading market-data request superseded this response");
    this.name = "PaperMarketDataStaleResponseError";
  }
}

/** Fetches normalized historical quote events with bounded pagination. */
export class PaperRestMarketAdapter {
  private readonly baseUrl: URL;
  private readonly eventsPath: string;
  private readonly source: string;
  private readonly fetcher: PaperRestFetcher;
  private readonly maxPages: number;
  private readonly headers: HeadersInit | undefined;
  private readonly trustedOrigins: ReadonlySet<string>;
  private generation = 0;
  private activeController: AbortController | null = null;
  private disposed = false;

  public constructor(options: PaperRestMarketAdapterOptions) {
    this.baseUrl = new URL(options.baseUrl);
    assertHttpUrl(this.baseUrl);
    this.eventsPath = options.eventsPath ?? "/paper-events";
    this.source = options.source ?? "paper-rest";
    this.fetcher = options.fetcher ?? fetch;
    this.maxPages = options.maxPages ?? 100;
    if (!Number.isInteger(this.maxPages) || this.maxPages < 1) throw new RangeError("maxPages must be a positive integer");
    this.headers = options.headers;
    const origins = new Set<string>([this.baseUrl.origin]);
    for (const origin of options.trustedPaginationOrigins ?? []) {
      const url = new URL(origin);
      assertHttpUrl(url);
      origins.add(url.origin);
    }
    this.trustedOrigins = origins;
  }

  public async loadHistory(query: PaperHistoryQuery): Promise<readonly PaperMarketEvent[]> {
    if (this.disposed) throw new PaperMarketDataValidationError("Paper REST adapter has been disposed");
    if (query.symbol.trim().length === 0 || query.from !== undefined && !isFiniteTime(query.from) || query.to !== undefined && !isFiniteTime(query.to) || query.from !== undefined && query.to !== undefined && query.to < query.from) throw new PaperMarketDataValidationError("Invalid paper history query");
    throwIfAborted(query.signal);
    this.activeController?.abort();
    const controller = new AbortController();
    this.activeController = controller;
    const generation = ++this.generation;
    const byId = new Map<string, PaperMarketEvent>();
    const visited = new Set<string>();
    let next: string | null | undefined;
    try {
      for (let page = 0; page < this.maxPages; page += 1) {
        throwIfAborted(query.signal);
        throwIfAborted(controller.signal);
        if (generation !== this.generation) throw new PaperMarketDataStaleResponseError();
        const url = this.createPageUrl(query, next);
        if (visited.has(url.href)) throw new PaperMarketDataValidationError("Paper REST pagination repeated a URL");
        visited.add(url.href);
        const response = await this.fetcher(url.href, { ...(this.headers === undefined ? {} : { headers: this.headers }), signal: controller.signal });
        if (generation !== this.generation) throw new PaperMarketDataStaleResponseError();
        if (!response.ok) throw new PaperMarketDataValidationError(`Paper REST request failed: ${response.status} ${response.statusText}`);
        const pageData = parsePage(await response.json(), this.source);
        for (const raw of pageData.events) {
          const event = normalizePaperEvent(raw, this.source);
          if (event.symbol !== query.symbol || query.from !== undefined && event.time < query.from || query.to !== undefined && event.time >= query.to) continue;
          byId.set(event.id, event);
        }
        next = pageData.next;
        if (next === undefined || next === null || next === "") break;
        if (page === this.maxPages - 1) throw new PaperMarketDataValidationError(`Paper REST pagination exceeded maxPages=${this.maxPages}`);
      }
      if (generation !== this.generation) throw new PaperMarketDataStaleResponseError();
      return [...byId.values()].sort(compareEvents);
    } finally {
      if (this.activeController === controller) this.activeController = null;
    }
  }

  public cancel(): void {
    this.generation += 1;
    this.activeController?.abort();
    this.activeController = null;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
  }

  private createPageUrl(query: PaperHistoryQuery, cursor: string | null | undefined): URL {
    const absolute = cursor === undefined || cursor === null ? null : parseAbsoluteUrl(cursor, this.baseUrl);
    const url = absolute ?? new URL(this.eventsPath, this.baseUrl);
    assertHttpUrl(url);
    if (!this.trustedOrigins.has(url.origin)) throw new PaperMarketDataValidationError(`Paper REST pagination origin is not trusted: ${url.origin}`);
    url.searchParams.set("symbol", query.symbol);
    if (query.from !== undefined) url.searchParams.set("from", String(query.from));
    if (query.to !== undefined) url.searchParams.set("to", String(query.to));
    if (cursor !== undefined && cursor !== null && absolute === null) url.searchParams.set("cursor", cursor);
    return url;
  }
}

export function normalizePaperEvent(raw: PaperRestEventPayload, defaultSource = "paper-rest"): PaperMarketEvent {
  if (typeof raw !== "object" || raw === null || typeof raw.id !== "string" || raw.id.length === 0 || typeof raw.symbol !== "string" || raw.symbol.length === 0 || (typeof raw.time !== "number" && typeof raw.time !== "string") || !isFinitePrice(raw.price)) throw new PaperMarketDataValidationError("Paper market response contains a malformed event");
  const time = normalizeTimestamp(raw.time);
  if (raw.sourceSequence !== undefined && (!Number.isInteger(raw.sourceSequence) || raw.sourceSequence < 0)) throw new PaperMarketDataValidationError(`Invalid sourceSequence for event ${raw.id}`);
  if (raw.quoteStatus !== undefined && raw.quoteStatus !== "fresh" && raw.quoteStatus !== "stale" && raw.quoteStatus !== "disconnected") throw new PaperMarketDataValidationError(`Invalid quoteStatus for event ${raw.id}`);
  if (raw.mode !== undefined && raw.mode !== "simulated" && raw.mode !== "live" && raw.mode !== "replay") throw new PaperMarketDataValidationError(`Invalid mode for event ${raw.id}`);
  return { id: raw.id, symbol: raw.symbol, time, price: raw.price, source: defaultSource, quoteStatus: raw.quoteStatus ?? "fresh", mode: raw.mode ?? "simulated", ...(raw.sourceSequence === undefined ? {} : { sourceSequence: raw.sourceSequence }) };
}

function parsePage(value: unknown, source: string): PaperRestEventPage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new PaperMarketDataValidationError("Paper REST response must be an object");
  const page = value as Record<string, unknown>;
  if (!Array.isArray(page.events)) throw new PaperMarketDataValidationError("Paper REST response must contain an events array");
  if (page.next !== undefined && page.next !== null && typeof page.next !== "string") throw new PaperMarketDataValidationError("Paper REST response next cursor must be a string, null, or omitted");
  for (const event of page.events) normalizePaperEvent(event as PaperRestEventPayload, source);
  return { events: page.events as PaperRestEventPayload[], ...(page.next === undefined ? {} : { next: page.next as string | null }) };
}

function compareEvents(left: PaperMarketEvent, right: PaperMarketEvent): number {
  return left.time - right.time || (left.sourceSequence ?? Number.MAX_SAFE_INTEGER) - (right.sourceSequence ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id);
}

function parseAbsoluteUrl(value: string, baseUrl: URL): URL | null {
  if (value.startsWith("//")) return new URL(value, baseUrl);
  try { return new URL(value); } catch { return null; }
}

function assertHttpUrl(url: URL): void {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PaperMarketDataValidationError("Paper REST URL must use http or https");
}

function isFiniteTime(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function isFinitePrice(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function throwIfAborted(signal: AbortSignal | undefined): void { if (signal?.aborted) { const error = new Error("The operation was aborted"); error.name = "AbortError"; throw error; } }
