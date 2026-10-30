/**
 * Provider-neutral trade-print contracts.
 *
 * `time` is the UTC exchange/event timestamp. It is deliberately separate
 * from `receiveTime`: a consumer must not silently use receipt time as event
 * time or infer an aggressor side from OHLCV candles.
 */

export const OPENKLINE_MARKET_TRADES_VERSION = 1 as const;

export type MarketTradeAggressorSide = "buy" | "sell" | "unknown";
export type MarketTradeSideQuality = "observed" | "estimated" | "unknown";
export type MarketTradeRealtimeStatus = "connecting" | "connected" | "reconnected" | "disconnected" | "error" | "stopped";

export interface MarketTradeSource {
  readonly id: string;
  readonly version: string;
  readonly kind?: string;
}

export interface MarketTrade {
  readonly id: string;
  readonly instrumentId: string;
  readonly venueId?: string;
  /** UTC Unix timestamp in milliseconds at which the trade occurred. */
  readonly time: number;
  /** Optional UTC receive timestamp; never used as event time by default. */
  readonly receiveTime?: number;
  readonly price: number;
  /** Executed base-asset quantity, not quote notional. */
  readonly quantity: number;
  /** Explicitly unknown when the source cannot classify aggression. */
  readonly aggressorSide: MarketTradeAggressorSide;
  /** Observed is source-provided; estimated is host-derived and remains labelled. */
  readonly sideQuality: MarketTradeSideQuality;
  readonly sequence?: number;
  /** Higher revisions replace an earlier print with the same stable ID. */
  readonly revision: number;
  readonly source: MarketTradeSource;
}

export interface MarketTradeDataset {
  readonly version: typeof OPENKLINE_MARKET_TRADES_VERSION;
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly source: MarketTradeSource;
  readonly trades: readonly MarketTrade[];
  readonly coverage: MarketTradeCoverage;
}

export interface MarketTradeCoverage {
  readonly from: number | null;
  readonly to: number | null;
  readonly complete: boolean;
  readonly knownSideVolume: number;
  readonly unknownSideVolume: number;
  readonly tradeCount: number;
  readonly note?: string;
}

export interface MarketTradeQuery {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly from: number;
  readonly to: number;
  readonly limit?: number;
  readonly asOfTime?: number;
  readonly signal?: AbortSignal;
}

export interface MarketTradeSubscriptionArgs {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly onTrade: (trade: MarketTrade) => void;
  readonly onError?: (error: Error) => void;
  readonly onStatus?: (status: MarketTradeRealtimeStatus) => void;
}

export interface MarketTradeDatafeed {
  getTrades(query: MarketTradeQuery): Promise<readonly MarketTrade[] | MarketTradeDataset>;
  subscribeTrades?(args: MarketTradeSubscriptionArgs): () => void;
}

export interface MarketTradeStoreOptions {
  readonly maxTrades?: number;
  readonly source?: MarketTradeSource;
  readonly instrumentId?: string;
  readonly venueId?: string;
}

export class MarketTradeValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketTradeValidationError";
  }
}

export class MarketTradeDatafeedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketTradeDatafeedError";
  }
}

export type MarketTradeInput = Omit<MarketTrade, "sideQuality" | "revision"> & {
  readonly sideQuality?: MarketTradeSideQuality;
  readonly revision?: number;
};

const DEFAULT_MAX_TRADES = 100_000;

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function requireNonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new MarketTradeValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function validateSource(source: MarketTradeSource): MarketTradeSource {
  const id = requireNonEmpty(source?.id, "Trade source id");
  const version = requireNonEmpty(source?.version, "Trade source version");
  if (source.kind !== undefined) requireNonEmpty(source.kind, "Trade source kind");
  return {
    id,
    version,
    ...(source.kind === undefined ? {} : { kind: source.kind.trim() }),
  };
}

function sameSource(left: MarketTradeSource, right: MarketTradeSource): boolean {
  return left.id === right.id && left.version === right.version;
}

function compareTrades(left: MarketTrade, right: MarketTrade): number {
  return left.time - right.time
    || (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
    || left.revision - right.revision;
}

export function normalizeMarketTrade(value: unknown, expected?: Partial<Pick<MarketTrade, "instrumentId" | "venueId">>): MarketTrade {
  if (typeof value !== "object" || value === null) throw new MarketTradeValidationError("Trade must be an object");
  const input = value as Partial<MarketTradeInput>;
  const id = requireNonEmpty(input.id, "Trade id");
  const instrumentId = requireNonEmpty(input.instrumentId, "Trade instrumentId");
  if (expected?.instrumentId !== undefined && instrumentId !== expected.instrumentId) {
    throw new MarketTradeValidationError(`Trade ${id} belongs to ${instrumentId}, expected ${expected.instrumentId}`);
  }
  if (expected?.venueId !== undefined && input.venueId !== expected.venueId) {
    throw new MarketTradeValidationError(`Trade ${id} belongs to an unexpected venue`);
  }
  if (!isSafeTimestamp(input.time)) throw new MarketTradeValidationError(`Trade ${id} time must be a non-negative safe integer timestamp`);
  if (input.receiveTime !== undefined && !isSafeTimestamp(input.receiveTime)) {
    throw new MarketTradeValidationError(`Trade ${id} receiveTime must be a non-negative safe integer timestamp`);
  }
  if (typeof input.price !== "number" || !Number.isFinite(input.price) || input.price <= 0) {
    throw new MarketTradeValidationError(`Trade ${id} price must be a finite positive number`);
  }
  if (typeof input.quantity !== "number" || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new MarketTradeValidationError(`Trade ${id} quantity must be a finite positive number`);
  }
  if (input.aggressorSide !== "buy" && input.aggressorSide !== "sell" && input.aggressorSide !== "unknown") {
    throw new MarketTradeValidationError(`Trade ${id} aggressorSide must be buy, sell, or unknown`);
  }
  const sideQuality = input.sideQuality ?? (input.aggressorSide === "unknown" ? "unknown" : "observed");
  if (sideQuality !== "observed" && sideQuality !== "estimated" && sideQuality !== "unknown") {
    throw new MarketTradeValidationError(`Trade ${id} sideQuality is invalid`);
  }
  if (input.aggressorSide === "unknown" && sideQuality !== "unknown") {
    throw new MarketTradeValidationError(`Trade ${id} unknown aggressorSide must retain unknown sideQuality`);
  }
  if (input.sequence !== undefined && (!Number.isSafeInteger(input.sequence) || input.sequence < 0)) {
    throw new MarketTradeValidationError(`Trade ${id} sequence must be a non-negative safe integer`);
  }
  const revision = input.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new MarketTradeValidationError(`Trade ${id} revision must be a non-negative safe integer`);
  const source = validateSource(input.source!);
  return {
    id,
    instrumentId,
    ...(input.venueId === undefined ? {} : { venueId: requireNonEmpty(input.venueId, "Trade venueId") }),
    time: input.time,
    ...(input.receiveTime === undefined ? {} : { receiveTime: input.receiveTime }),
    price: input.price,
    quantity: input.quantity,
    aggressorSide: input.aggressorSide,
    sideQuality,
    ...(input.sequence === undefined ? {} : { sequence: input.sequence }),
    revision,
    source,
  };
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_TRADES;
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000) throw new MarketTradeValidationError("maxTrades must be between 1 and 1000000");
  return value;
}

/**
 * Bounded, correction-aware trade store. It never classifies unknown trades
 * and never mutates an object supplied by a provider.
 */
export class MarketTradeStore {
  private readonly trades = new Map<string, MarketTrade>();
  private sortedTrades: MarketTrade[] = [];
  private sortedTradesDirty = true;
  private readonly maxTrades: number;
  private source: MarketTradeSource | undefined;
  private instrumentId: string | undefined;
  private venueId: string | undefined;
  private disposed = false;

  public constructor(options: MarketTradeStoreOptions = {}) {
    this.maxTrades = normalizeLimit(options.maxTrades);
    this.source = options.source === undefined ? undefined : validateSource(options.source);
    this.instrumentId = options.instrumentId === undefined ? undefined : requireNonEmpty(options.instrumentId, "instrumentId");
    this.venueId = options.venueId === undefined ? undefined : requireNonEmpty(options.venueId, "venueId");
  }

  public setData(values: readonly MarketTrade[] | MarketTradeDataset): void {
    this.assertAlive();
    const dataset = Array.isArray(values) ? undefined : values as MarketTradeDataset;
    const trades = dataset === undefined ? values : dataset.trades;
    if (!Array.isArray(trades)) throw new MarketTradeValidationError("Trade dataset trades must be an array");
    this.trades.clear();
    this.sortedTrades = [];
    this.sortedTradesDirty = true;
    if (dataset !== undefined) {
      this.source = validateSource(dataset.source);
      this.instrumentId = requireNonEmpty(dataset.instrumentId, "instrumentId");
      this.venueId = dataset.venueId === undefined ? undefined : requireNonEmpty(dataset.venueId, "venueId");
      if (dataset.version !== OPENKLINE_MARKET_TRADES_VERSION) throw new MarketTradeValidationError("Unsupported market trade dataset version");
    }
    for (const trade of trades) this.upsert(trade);
    this.trim();
  }

  public update(value: MarketTrade): "inserted" | "revised" | "duplicate" {
    this.assertAlive();
    return this.upsert(value);
  }

  public get(id: string): MarketTrade | undefined {
    this.assertAlive();
    const trade = this.trades.get(id);
    return trade === undefined ? undefined : { ...trade, source: { ...trade.source } };
  }

  public getAll(): MarketTrade[] {
    this.assertAlive();
    return this.getSortedTrades().map(cloneTrade);
  }

  public getRange(from: number, to: number, asOfTime?: number): MarketTrade[] {
    this.assertAlive();
    if (!isSafeTimestamp(from) || !isSafeTimestamp(to) || from > to) throw new MarketTradeValidationError("Trade range must contain ascending safe timestamps");
    if (asOfTime !== undefined && !isSafeTimestamp(asOfTime)) throw new MarketTradeValidationError("Trade asOfTime must be a safe timestamp");
    const ordered = this.getSortedTrades();
    const start = lowerBoundTime(ordered, from);
    const end = upperBoundTime(ordered, to);
    const result: MarketTrade[] = [];
    for (let index = start; index < end; index += 1) {
      const trade = ordered[index]!;
      if (asOfTime !== undefined && trade.time > asOfTime) break;
      result.push(cloneTrade(trade));
    }
    return result;
  }

  public getDataset(options: { readonly complete?: boolean; readonly note?: string } = {}): MarketTradeDataset {
    this.assertAlive();
    const trades = this.getAll();
    const from = trades[0]?.time ?? null;
    const to = trades.at(-1)?.time ?? null;
    const unknownSideVolume = trades.filter((trade) => trade.aggressorSide === "unknown").reduce((sum, trade) => sum + trade.quantity, 0);
    return {
      version: OPENKLINE_MARKET_TRADES_VERSION,
      instrumentId: this.instrumentId ?? trades[0]?.instrumentId ?? "unknown",
      ...(this.venueId === undefined ? {} : { venueId: this.venueId }),
      source: this.source === undefined ? { id: "unknown", version: "unknown" } : { ...this.source },
      trades,
      coverage: {
        from,
        to,
        complete: options.complete ?? false,
        knownSideVolume: trades.filter((trade) => trade.aggressorSide !== "unknown").reduce((sum, trade) => sum + trade.quantity, 0),
        unknownSideVolume,
        tradeCount: trades.length,
        ...(options.note === undefined ? {} : { note: options.note }),
      },
    };
  }

  public clear(): void {
    this.assertAlive();
    this.trades.clear();
    this.sortedTrades = [];
    this.sortedTradesDirty = false;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.trades.clear();
    this.sortedTrades = [];
    this.sortedTradesDirty = false;
  }

  private upsert(value: MarketTrade): "inserted" | "revised" | "duplicate" {
    const expected: Partial<Pick<MarketTrade, "instrumentId" | "venueId">> = {
      ...(this.instrumentId === undefined ? {} : { instrumentId: this.instrumentId }),
      ...(this.venueId === undefined ? {} : { venueId: this.venueId }),
    };
    const normalized = normalizeMarketTrade(value, expected);
    if (this.source !== undefined && !sameSource(this.source, normalized.source)) throw new MarketTradeValidationError(`Trade ${normalized.id} has an unexpected source`);
    this.source ??= normalized.source;
    this.instrumentId ??= normalized.instrumentId;
    this.venueId ??= normalized.venueId;
    const previous = this.trades.get(normalized.id);
    if (previous !== undefined) {
      if (normalized.revision < previous.revision) return "duplicate";
      if (normalized.revision === previous.revision && JSON.stringify(previous) === JSON.stringify(normalized)) return "duplicate";
      this.trades.set(normalized.id, normalized);
      this.sortedTradesDirty = true;
      this.trim();
      return "revised";
    }
    this.trades.set(normalized.id, normalized);
    this.sortedTradesDirty = true;
    this.trim();
    return "inserted";
  }

  private trim(): void {
    if (this.trades.size <= this.maxTrades) return;
    const ordered = [...this.trades.values()].sort(compareTrades);
    const keep = ordered.slice(-this.maxTrades);
    this.trades.clear();
    for (const trade of keep) this.trades.set(trade.id, trade);
    this.sortedTrades = keep;
    this.sortedTradesDirty = false;
  }

  private getSortedTrades(): readonly MarketTrade[] {
    if (this.sortedTradesDirty) {
      this.sortedTrades = [...this.trades.values()].sort(compareTrades);
      this.sortedTradesDirty = false;
    }
    return this.sortedTrades;
  }

  private assertAlive(): void {
    if (this.disposed) throw new MarketTradeDatafeedError("MarketTradeStore is disposed");
  }
}

export class InMemoryMarketTradeDatafeed implements MarketTradeDatafeed {
  private readonly store: MarketTradeStore;
  private readonly listeners = new Set<MarketTradeSubscriptionArgs>();

  public constructor(dataset: MarketTradeDataset | readonly MarketTrade[]) {
    this.store = new MarketTradeStore({ maxTrades: 1_000_000 });
    this.store.setData(dataset);
  }

  public async getTrades(query: MarketTradeQuery): Promise<readonly MarketTrade[]> {
    if (!isSafeTimestamp(query.from) || !isSafeTimestamp(query.to) || query.from > query.to) throw new MarketTradeDatafeedError("Invalid trade query range");
    if (query.signal?.aborted) throw new DOMException("Trade request aborted", "AbortError");
    const result = this.store.getRange(query.from, query.to, query.asOfTime);
    return query.limit === undefined ? result : result.slice(-normalizeLimit(query.limit));
  }

  public subscribeTrades(args: MarketTradeSubscriptionArgs): () => void {
    const listener = { ...args };
    this.listeners.add(listener);
    args.onStatus?.("connected");
    return () => {
      if (this.listeners.delete(listener)) args.onStatus?.("stopped");
    };
  }

  public emit(trade: MarketTrade): void {
    this.store.update(trade);
    for (const listener of [...this.listeners]) {
      if (listener.instrumentId !== trade.instrumentId || (listener.venueId !== undefined && listener.venueId !== trade.venueId)) continue;
      listener.onTrade(cloneTrade(trade));
    }
  }

  public dispose(): void {
    for (const listener of [...this.listeners]) listener.onStatus?.("stopped");
    this.listeners.clear();
    this.store.dispose();
  }
}

function cloneTrade(trade: MarketTrade): MarketTrade {
  return { ...trade, source: { ...trade.source } };
}

function lowerBoundTime(values: readonly MarketTrade[], time: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBoundTime(values: readonly MarketTrade[], time: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (values[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

