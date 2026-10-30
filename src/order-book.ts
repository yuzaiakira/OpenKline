/** Provider-neutral Level-2 order-book contracts and reconstruction runtime. */

export const OPENKLINE_ORDER_BOOK_VERSION = 1 as const;

export type OrderBookStatus = "uninitialized" | "synchronizing" | "live" | "stale" | "recovering" | "error" | "disposed";
export type OrderBookQuantityMode = "absolute" | "delta";
export type OrderBookIntegrity = "sequenced" | "unsequenced";
export type OrderBookRealtimeStatus = "connecting" | "connected" | "reconnected" | "disconnected" | "error" | "stopped";

export interface OrderBookSource {
  readonly id: string;
  readonly version: string;
  readonly kind?: string;
}

export interface OrderBookSequenceRange {
  readonly from: number;
  readonly to: number;
}

export type OrderBookSequence = number | OrderBookSequenceRange;

export interface OrderBookPriceLevel {
  readonly price: number;
  readonly quantity: number;
}

export interface OrderBookSnapshot {
  readonly version: typeof OPENKLINE_ORDER_BOOK_VERSION;
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly time: number;
  readonly receiveTime?: number;
  readonly sequence?: OrderBookSequence;
  readonly bids: readonly OrderBookPriceLevel[];
  readonly asks: readonly OrderBookPriceLevel[];
  readonly tickSize?: number;
  readonly priceUnit?: string;
  readonly quantityUnit?: string;
  readonly source: OrderBookSource;
}

export interface OrderBookDelta {
  readonly version: typeof OPENKLINE_ORDER_BOOK_VERSION;
  readonly id?: string;
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly time: number;
  readonly receiveTime?: number;
  readonly sequence?: OrderBookSequence;
  readonly previousSequence?: number;
  /** Every level in this message uses the same explicit quantity semantics. */
  readonly quantityMode: OrderBookQuantityMode;
  readonly bids: readonly OrderBookPriceLevel[];
  readonly asks: readonly OrderBookPriceLevel[];
  readonly source: OrderBookSource;
}

export interface OrderBookHistory {
  readonly snapshot: OrderBookSnapshot;
  readonly deltas?: readonly OrderBookDelta[];
}

export interface OrderBookState {
  readonly status: OrderBookStatus;
  readonly integrity: OrderBookIntegrity;
  readonly instrumentId: string | null;
  readonly venueId: string | null;
  readonly source: OrderBookSource | null;
  readonly bids: readonly OrderBookPriceLevel[];
  readonly asks: readonly OrderBookPriceLevel[];
  readonly tickSize: number | null;
  readonly lastEventTime: number | null;
  readonly lastSynchronizedTime: number | null;
  readonly lastSequence: number | null;
  readonly pendingDeltaCount: number;
  readonly reason?: string;
}

export interface OrderBookQuery {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly from?: number;
  readonly to?: number;
  readonly asOfTime?: number;
  readonly maxDepth?: number;
  readonly signal?: AbortSignal;
}

export interface OrderBookSubscriptionArgs {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly onSnapshot: (snapshot: OrderBookSnapshot) => void;
  readonly onDelta: (delta: OrderBookDelta) => void;
  readonly onError?: (error: Error) => void;
  readonly onStatus?: (status: OrderBookRealtimeStatus) => void;
}

export interface OrderBookDatafeed {
  getOrderBook(query: OrderBookQuery): Promise<OrderBookSnapshot | OrderBookHistory>;
  subscribeOrderBook?(args: OrderBookSubscriptionArgs): () => void;
}

export interface OrderBookControllerOptions {
  readonly maxDepth?: number;
  readonly maxPendingDeltas?: number;
  readonly maxHistory?: number;
  readonly defaultTickSize?: number;
  readonly tickPolicy?: "reject" | "round" | "allow";
  readonly instrumentId?: string;
  readonly venueId?: string;
  readonly source?: OrderBookSource;
}

export type OrderBookApplyKind = "applied" | "duplicate" | "buffered" | "stale" | "rejected";

export interface OrderBookApplyResult {
  readonly kind: OrderBookApplyKind;
  readonly status: OrderBookStatus;
  readonly reason?: string;
}

export class OrderBookValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OrderBookValidationError";
  }
}

export class OrderBookLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "OrderBookLifecycleError";
  }
}

interface NormalizedLevel {
  price: number;
  quantity: number;
}

interface HistoricalEventSnapshot {
  readonly kind: "snapshot";
  readonly event: OrderBookSnapshot;
}

interface HistoricalEventDelta {
  readonly kind: "delta";
  readonly event: OrderBookDelta;
}

type HistoricalEvent = HistoricalEventSnapshot | HistoricalEventDelta;

const DEFAULT_MAX_DEPTH = 100;
const DEFAULT_MAX_PENDING = 10_000;
const DEFAULT_MAX_HISTORY = 10_000;

function safeTimestamp(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new OrderBookValidationError(`${label} must be a non-negative safe integer timestamp`);
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new OrderBookValidationError(`${label} must be a non-empty string`);
  return value.trim();
}

function source(value: OrderBookSource): OrderBookSource {
  return { id: nonEmpty(value?.id, "Order-book source id"), version: nonEmpty(value?.version, "Order-book source version"), ...(value?.kind === undefined ? {} : { kind: nonEmpty(value.kind, "Order-book source kind") }) };
}

function sourceEquals(left: OrderBookSource, right: OrderBookSource): boolean {
  return left.id === right.id && left.version === right.version;
}

function sequenceBounds(sequence: OrderBookSequence | undefined): OrderBookSequenceRange | null {
  if (sequence === undefined) return null;
  if (typeof sequence === "number") {
    if (!Number.isSafeInteger(sequence) || sequence < 0) throw new OrderBookValidationError("Order-book sequence must be a non-negative safe integer");
    return { from: sequence, to: sequence };
  }
  if (!Number.isSafeInteger(sequence.from) || sequence.from < 0 || !Number.isSafeInteger(sequence.to) || sequence.to < sequence.from) {
    throw new OrderBookValidationError("Order-book sequence range is invalid");
  }
  return { from: sequence.from, to: sequence.to };
}

function validateLimit(value: number | undefined, label: string, maximum: number): number {
  if (value === undefined) return label === "maxDepth" ? DEFAULT_MAX_DEPTH : label === "maxPendingDeltas" ? DEFAULT_MAX_PENDING : DEFAULT_MAX_HISTORY;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new OrderBookValidationError(`${label} must be between 1 and ${maximum}`);
  return value;
}

function cloneSource(value: OrderBookSource): OrderBookSource {
  return { ...value };
}

function cloneLevel(value: OrderBookPriceLevel): OrderBookPriceLevel {
  return { price: value.price, quantity: value.quantity };
}

function cloneSnapshot(value: OrderBookSnapshot): OrderBookSnapshot {
  const sequence = value.sequence === undefined ? undefined : typeof value.sequence === "number" ? value.sequence : { ...value.sequence };
  return {
    ...value,
    ...(value.venueId === undefined ? {} : { venueId: value.venueId }),
    ...(value.receiveTime === undefined ? {} : { receiveTime: value.receiveTime }),
    ...(sequence === undefined ? {} : { sequence }),
    bids: value.bids.map(cloneLevel),
    asks: value.asks.map(cloneLevel),
    ...(value.tickSize === undefined ? {} : { tickSize: value.tickSize }),
    ...(value.priceUnit === undefined ? {} : { priceUnit: value.priceUnit }),
    ...(value.quantityUnit === undefined ? {} : { quantityUnit: value.quantityUnit }),
    source: cloneSource(value.source),
  };
}

function cloneDelta(value: OrderBookDelta): OrderBookDelta {
  const sequence = value.sequence === undefined ? undefined : typeof value.sequence === "number" ? value.sequence : { ...value.sequence };
  return {
    ...value,
    ...(value.id === undefined ? {} : { id: value.id }),
    ...(value.venueId === undefined ? {} : { venueId: value.venueId }),
    ...(value.receiveTime === undefined ? {} : { receiveTime: value.receiveTime }),
    ...(sequence === undefined ? {} : { sequence }),
    ...(value.previousSequence === undefined ? {} : { previousSequence: value.previousSequence }),
    bids: value.bids.map(cloneLevel),
    asks: value.asks.map(cloneLevel),
    source: cloneSource(value.source),
  };
}

function eventOrder(left: HistoricalEvent, right: HistoricalEvent): number {
  const leftEvent = left.event;
  const rightEvent = right.event;
  return leftEvent.time - rightEvent.time
    || (sequenceBounds(leftEvent.sequence)?.from ?? Number.MAX_SAFE_INTEGER) - (sequenceBounds(rightEvent.sequence)?.from ?? Number.MAX_SAFE_INTEGER)
    || (left.kind === "snapshot" ? -1 : 1) - (right.kind === "snapshot" ? -1 : 1);
}

function validateLevel(level: OrderBookPriceLevel, label: string, quantityMode: OrderBookQuantityMode): void {
  if (typeof level.price !== "number" || !Number.isFinite(level.price) || level.price <= 0) throw new OrderBookValidationError(`${label} price must be finite and positive`);
  if (typeof level.quantity !== "number" || !Number.isFinite(level.quantity) || (quantityMode === "absolute" ? level.quantity < 0 : false)) {
    throw new OrderBookValidationError(`${label} quantity is invalid for ${quantityMode} mode`);
  }
}

function validateCommonIdentity(instrumentId: unknown, venueId: unknown, time: unknown, expectedInstrument?: string, expectedVenue?: string): { instrumentId: string; venueId?: string; time: number } {
  const normalizedInstrument = nonEmpty(instrumentId, "Order-book instrumentId");
  if (expectedInstrument !== undefined && normalizedInstrument !== expectedInstrument) throw new OrderBookValidationError(`Unexpected order-book instrument ${normalizedInstrument}`);
  if (expectedVenue !== undefined && venueId !== expectedVenue) throw new OrderBookValidationError("Unexpected order-book venue");
  const normalizedVenue = venueId === undefined ? undefined : nonEmpty(venueId, "Order-book venueId");
  return { instrumentId: normalizedInstrument, ...(normalizedVenue === undefined ? {} : { venueId: normalizedVenue }), time: safeTimestamp(time, "Order-book time") };
}

function validateTickSize(value: number | undefined, label = "tickSize"): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value / Number.EPSILON))) throw new OrderBookValidationError(`${label} must be finite and positive`);
  return value;
}

function normalizedPrice(price: number, tickSize: number | undefined, policy: "reject" | "round" | "allow"): number {
  if (tickSize === undefined || policy === "allow") return price;
  const index = Math.round(price / tickSize);
  const result = index * tickSize;
  const tolerance = Math.max(Number.EPSILON * Math.max(1, Math.abs(price)), tickSize * 1e-9);
  if (Math.abs(result - price) > tolerance && policy === "reject") throw new OrderBookValidationError(`Price ${price} is not aligned to tickSize ${tickSize}`);
  return result;
}

function priceKey(price: number, tickSize: number | undefined): string {
  if (tickSize !== undefined) return `tick:${Math.round(price / tickSize)}`;
  return `price:${price.toPrecision(15)}`;
}

/**
 * Deterministic bounded Level-2 state machine. A gap never produces a
 * plausible-looking live book: the controller enters stale/recovering state
 * until a replacement snapshot is accepted.
 */
export class OrderBookController {
  private readonly maxDepth: number;
  private readonly maxPendingDeltas: number;
  private readonly maxHistory: number;
  private readonly tickPolicy: "reject" | "round" | "allow";
  private defaultTickSize: number | undefined;
  private instrumentId: string | undefined;
  private venueId: string | undefined;
  private sourceIdentity: OrderBookSource | undefined;
  private status: OrderBookStatus = "uninitialized";
  private integrity: OrderBookIntegrity = "unsequenced";
  private bids = new Map<string, NormalizedLevel>();
  private asks = new Map<string, NormalizedLevel>();
  private pendingDeltas: OrderBookDelta[] = [];
  private history: HistoricalEvent[] = [];
  private appliedDeltaIds = new Set<string>();
  private lastEventTime: number | null = null;
  private lastSynchronizedTime: number | null = null;
  private lastSequence: number | null = null;
  private reason: string | undefined;
  private disposed = false;
  private requestId = 0;
  private subscriptionCleanup: (() => void) | null = null;

  public constructor(options: OrderBookControllerOptions = {}) {
    this.maxDepth = validateLimit(options.maxDepth, "maxDepth", 10_000);
    this.maxPendingDeltas = validateLimit(options.maxPendingDeltas, "maxPendingDeltas", 100_000);
    this.maxHistory = validateLimit(options.maxHistory, "maxHistory", 100_000);
    this.tickPolicy = options.tickPolicy ?? "reject";
    this.defaultTickSize = validateTickSize(options.defaultTickSize);
    this.instrumentId = options.instrumentId === undefined ? undefined : nonEmpty(options.instrumentId, "instrumentId");
    this.venueId = options.venueId === undefined ? undefined : nonEmpty(options.venueId, "venueId");
    this.sourceIdentity = options.source === undefined ? undefined : source(options.source);
  }

  public applySnapshot(input: OrderBookSnapshot): OrderBookApplyResult {
    this.assertAlive();
    let snapshot: OrderBookSnapshot;
    try {
      snapshot = this.normalizeSnapshot(input);
    } catch (error) {
      return this.reject(error instanceof Error ? error.message : String(error));
    }
    const incomingSequence = sequenceBounds(snapshot.sequence);
    if (
      (incomingSequence !== null && this.lastSequence !== null && incomingSequence.to < this.lastSequence)
      || (incomingSequence === null && this.lastSequence === null && this.lastEventTime !== null && snapshot.time < this.lastEventTime)
    ) {
      return { kind: "duplicate", status: this.status, reason: "Delayed snapshot cannot replace a newer synchronized state" };
    }
    this.instrumentId ??= snapshot.instrumentId;
    this.venueId ??= snapshot.venueId;
    this.sourceIdentity ??= snapshot.source;
    this.defaultTickSize = snapshot.tickSize ?? this.defaultTickSize;
    const sequence = incomingSequence;
    this.bids.clear();
    this.asks.clear();
    this.applyLevels(this.bids, snapshot.bids, "absolute", "bid");
    this.applyLevels(this.asks, snapshot.asks, "absolute", "ask");
    this.status = "live";
    this.reason = undefined;
    this.integrity = sequence === null ? "unsequenced" : "sequenced";
    this.lastSequence = sequence?.to ?? null;
    this.lastEventTime = snapshot.time;
    this.lastSynchronizedTime = snapshot.time;
    this.pendingDeltas = this.pendingDeltas.filter((delta) => (sequenceBounds(delta.sequence)?.to ?? Number.MAX_SAFE_INTEGER) > (this.lastSequence ?? -1));
    this.record({ kind: "snapshot", event: snapshot });
    const pending = [...this.pendingDeltas].sort((left, right) => (sequenceBounds(left.sequence)?.from ?? Number.MAX_SAFE_INTEGER) - (sequenceBounds(right.sequence)?.from ?? Number.MAX_SAFE_INTEGER) || left.time - right.time);
    this.pendingDeltas = [];
    for (const delta of pending) this.applyDelta(delta);
    return { kind: "applied", status: this.status };
  }

  public applyDelta(input: OrderBookDelta): OrderBookApplyResult {
    this.assertAlive();
    let delta: OrderBookDelta;
    try {
      delta = this.normalizeDelta(input);
    } catch (error) {
      return this.reject(error instanceof Error ? error.message : String(error));
    }
    if (delta.id !== undefined && this.appliedDeltaIds.has(delta.id)) return { kind: "duplicate", status: this.status };
    const sequence = sequenceBounds(delta.sequence);
    if (this.lastSequence === null && sequence !== null) {
      if (this.pendingDeltas.length >= this.maxPendingDeltas) return this.reject("Pending delta buffer is full");
      this.status = "synchronizing";
      this.pendingDeltas.push(delta);
      return { kind: "buffered", status: this.status, reason: "A sequenced snapshot is required before applying deltas" };
    }
    if (sequence !== null && this.lastSequence !== null) {
      const expected = this.lastSequence + 1;
      if (sequence.to <= this.lastSequence) return { kind: "duplicate", status: this.status };
      if (delta.previousSequence !== undefined && delta.previousSequence !== this.lastSequence) return this.markGap(`Delta ${sequence.from}-${sequence.to} declares previous sequence ${delta.previousSequence}, current is ${this.lastSequence}`);
      if (sequence.from !== expected) return this.markGap(`Order-book sequence gap: expected ${expected}, received ${sequence.from}`);
    }
    if (this.status === "stale" || this.status === "recovering" || this.status === "error") return {
      kind: "stale",
      status: this.status,
      ...(this.reason === undefined ? {} : { reason: this.reason }),
    };
    try {
      this.applyLevels(this.bids, delta.bids, delta.quantityMode, "bid");
      this.applyLevels(this.asks, delta.asks, delta.quantityMode, "ask");
    } catch (error) {
      return this.reject(error instanceof Error ? error.message : String(error));
    }
    if (delta.id !== undefined) this.appliedDeltaIds.add(delta.id);
    this.integrity = sequence === null ? "unsequenced" : "sequenced";
    this.lastSequence = sequence?.to ?? this.lastSequence;
    this.lastEventTime = delta.time;
    this.lastSynchronizedTime = delta.time;
    this.status = "live";
    this.reason = undefined;
    this.record({ kind: "delta", event: delta });
    return { kind: "applied", status: this.status };
  }

  public getState(maxDepth = this.maxDepth): OrderBookState {
    this.assertAlive();
    const depth = validateLimit(maxDepth, "maxDepth", 10_000);
    return {
      status: this.status,
      integrity: this.integrity,
      instrumentId: this.instrumentId ?? null,
      venueId: this.venueId ?? null,
      source: this.sourceIdentity === undefined ? null : cloneSource(this.sourceIdentity),
      bids: this.sortedLevels(this.bids, true, depth),
      asks: this.sortedLevels(this.asks, false, depth),
      tickSize: this.defaultTickSize ?? null,
      lastEventTime: this.lastEventTime,
      lastSynchronizedTime: this.lastSynchronizedTime,
      lastSequence: this.lastSequence,
      pendingDeltaCount: this.pendingDeltas.length,
      ...(this.reason === undefined ? {} : { reason: this.reason }),
    };
  }

  public getSnapshot(maxDepth = this.maxDepth): OrderBookSnapshot | null {
    this.assertAlive();
    if (this.instrumentId === undefined || this.sourceIdentity === undefined || this.status === "uninitialized" || this.status === "disposed") return null;
    return {
      version: OPENKLINE_ORDER_BOOK_VERSION,
      instrumentId: this.instrumentId,
      ...(this.venueId === undefined ? {} : { venueId: this.venueId }),
      time: this.lastEventTime ?? 0,
      ...(this.lastSequence === null ? {} : { sequence: this.lastSequence }),
      bids: this.getState(maxDepth).bids,
      asks: this.getState(maxDepth).asks,
      ...(this.defaultTickSize === undefined ? {} : { tickSize: this.defaultTickSize }),
      source: cloneSource(this.sourceIdentity),
    };
  }

  /** Reconstruct only records available at an event-time as-of frontier. */
  public getStateAt(asOfTime: number): OrderBookState {
    this.assertAlive();
    safeTimestamp(asOfTime, "Order-book asOfTime");
    const replay = new OrderBookController({
      maxDepth: this.maxDepth,
      maxPendingDeltas: this.maxPendingDeltas,
      maxHistory: this.maxHistory,
      ...(this.defaultTickSize === undefined ? {} : { defaultTickSize: this.defaultTickSize }),
      tickPolicy: this.tickPolicy,
      ...(this.instrumentId === undefined ? {} : { instrumentId: this.instrumentId }),
      ...(this.venueId === undefined ? {} : { venueId: this.venueId }),
      ...(this.sourceIdentity === undefined ? {} : { source: this.sourceIdentity }),
    });
    for (const item of [...this.history].sort(eventOrder)) {
      if (item.event.time > asOfTime) continue;
      if (item.kind === "snapshot") replay.applySnapshot(item.event); else replay.applyDelta(item.event);
    }
    return replay.getState();
  }

  public getHistory(): HistoricalEvent[] {
    this.assertAlive();
    return this.history.map((item) => item.kind === "snapshot" ? { kind: item.kind, event: cloneSnapshot(item.event) } : { kind: item.kind, event: cloneDelta(item.event) });
  }

  public async connect(datafeed: OrderBookDatafeed, query: OrderBookQuery): Promise<void> {
    this.assertAlive();
    this.disconnect();
    const request = ++this.requestId;
    this.status = "synchronizing";
    try {
      const result = await datafeed.getOrderBook(query);
      if (this.disposed || request !== this.requestId || query.signal?.aborted) return;
      if ("snapshot" in result) {
        this.applySnapshot(result.snapshot);
        for (const delta of result.deltas ?? []) this.applyDelta(delta);
      } else {
        this.applySnapshot(result);
      }
      if (this.disposed || request !== this.requestId || query.signal?.aborted) return;
      this.subscriptionCleanup = datafeed.subscribeOrderBook?.({
        instrumentId: query.instrumentId,
        ...(query.venueId === undefined ? {} : { venueId: query.venueId }),
        onSnapshot: (snapshot) => { if (!this.disposed && request === this.requestId) this.applySnapshot(snapshot); },
        onDelta: (delta) => { if (!this.disposed && request === this.requestId) this.applyDelta(delta); },
        onError: (error) => { if (!this.disposed && request === this.requestId) { this.status = "error"; this.reason = error.message; } },
      }) ?? null;
    } catch (error) {
      if (!this.disposed && request === this.requestId) {
        this.status = "error";
        this.reason = error instanceof Error ? error.message : String(error);
      }
      throw error;
    }
  }

  public disconnect(): void {
    this.requestId += 1;
    this.subscriptionCleanup?.();
    this.subscriptionCleanup = null;
  }

  public reset(): void {
    this.assertAlive();
    this.disconnect();
    this.bids.clear();
    this.asks.clear();
    this.pendingDeltas = [];
    this.history = [];
    this.appliedDeltaIds.clear();
    this.status = "uninitialized";
    this.lastEventTime = null;
    this.lastSynchronizedTime = null;
    this.lastSequence = null;
    this.reason = undefined;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disconnect();
    this.disposed = true;
    this.status = "disposed";
    this.bids.clear();
    this.asks.clear();
    this.pendingDeltas = [];
    this.history = [];
    this.appliedDeltaIds.clear();
  }

  private normalizeSnapshot(input: OrderBookSnapshot): OrderBookSnapshot {
    if (input.version !== OPENKLINE_ORDER_BOOK_VERSION) throw new OrderBookValidationError("Unsupported order-book snapshot version");
    const identity = validateCommonIdentity(input.instrumentId, input.venueId, input.time, this.instrumentId, this.venueId);
    const normalizedSource = source(input.source);
    if (this.sourceIdentity !== undefined && !sourceEquals(this.sourceIdentity, normalizedSource)) throw new OrderBookValidationError("Unexpected order-book source");
    const tickSize = validateTickSize(input.tickSize ?? this.defaultTickSize);
    const sequence = sequenceBounds(input.sequence);
    if (input.receiveTime !== undefined) safeTimestamp(input.receiveTime, "Order-book receiveTime");
    if (!Array.isArray(input.bids) || !Array.isArray(input.asks)) throw new OrderBookValidationError("Order-book snapshot levels must be arrays");
    const bids = this.normalizeLevels(input.bids, "absolute", tickSize, "bid");
    const asks = this.normalizeLevels(input.asks, "absolute", tickSize, "ask");
    return {
      version: OPENKLINE_ORDER_BOOK_VERSION,
      instrumentId: identity.instrumentId,
      ...(identity.venueId === undefined ? {} : { venueId: identity.venueId }),
      time: identity.time,
      ...(input.receiveTime === undefined ? {} : { receiveTime: input.receiveTime }),
      ...(sequence === null ? {} : { sequence: typeof input.sequence === "number" ? input.sequence : { ...input.sequence! } }),
      bids,
      asks,
      ...(tickSize === undefined ? {} : { tickSize }),
      ...(input.priceUnit === undefined ? {} : { priceUnit: nonEmpty(input.priceUnit, "priceUnit") }),
      ...(input.quantityUnit === undefined ? {} : { quantityUnit: nonEmpty(input.quantityUnit, "quantityUnit") }),
      source: normalizedSource,
    };
  }

  private normalizeDelta(input: OrderBookDelta): OrderBookDelta {
    if (input.version !== OPENKLINE_ORDER_BOOK_VERSION) throw new OrderBookValidationError("Unsupported order-book delta version");
    if (input.quantityMode !== "absolute" && input.quantityMode !== "delta") throw new OrderBookValidationError("Order-book delta quantityMode is invalid");
    const identity = validateCommonIdentity(input.instrumentId, input.venueId, input.time, this.instrumentId, this.venueId);
    const normalizedSource = source(input.source);
    if (this.sourceIdentity !== undefined && !sourceEquals(this.sourceIdentity, normalizedSource)) throw new OrderBookValidationError("Unexpected order-book source");
    const sequence = sequenceBounds(input.sequence);
    if (input.previousSequence !== undefined && (!Number.isSafeInteger(input.previousSequence) || input.previousSequence < 0)) throw new OrderBookValidationError("previousSequence is invalid");
    if (input.receiveTime !== undefined) safeTimestamp(input.receiveTime, "Order-book receiveTime");
    const bids = this.normalizeLevels(input.bids, input.quantityMode, this.defaultTickSize, "bid");
    const asks = this.normalizeLevels(input.asks, input.quantityMode, this.defaultTickSize, "ask");
    return {
      version: OPENKLINE_ORDER_BOOK_VERSION,
      ...(input.id === undefined ? {} : { id: nonEmpty(input.id, "Order-book delta id") }),
      instrumentId: identity.instrumentId,
      ...(identity.venueId === undefined ? {} : { venueId: identity.venueId }),
      time: identity.time,
      ...(input.receiveTime === undefined ? {} : { receiveTime: input.receiveTime }),
      ...(sequence === null ? {} : { sequence: typeof input.sequence === "number" ? input.sequence : { ...input.sequence! } }),
      ...(input.previousSequence === undefined ? {} : { previousSequence: input.previousSequence }),
      quantityMode: input.quantityMode,
      bids,
      asks,
      source: normalizedSource,
    };
  }

  private normalizeLevels(values: readonly OrderBookPriceLevel[], quantityMode: OrderBookQuantityMode, tickSize: number | undefined, side: string): OrderBookPriceLevel[] {
    if (!Array.isArray(values)) throw new OrderBookValidationError(`${side} levels must be an array`);
    const result: OrderBookPriceLevel[] = [];
    const seen = new Set<string>();
    for (const [index, level] of values.entries()) {
      validateLevel(level, `${side}[${index}]`, quantityMode);
      const price = normalizedPrice(level.price, tickSize, this.tickPolicy);
      const key = priceKey(price, tickSize);
      if (seen.has(key)) throw new OrderBookValidationError(`${side} contains duplicate price level ${price}`);
      seen.add(key);
      result.push({ price, quantity: level.quantity });
    }
    return result;
  }

  private applyLevels(target: Map<string, NormalizedLevel>, levels: readonly OrderBookPriceLevel[], quantityMode: OrderBookQuantityMode, side: string): void {
    for (const level of levels) {
      const price = normalizedPrice(level.price, this.defaultTickSize, this.tickPolicy);
      const key = priceKey(price, this.defaultTickSize);
      if (quantityMode === "absolute") {
        if (level.quantity === 0) target.delete(key); else target.set(key, { price, quantity: level.quantity });
      } else {
        const current = target.get(key)?.quantity ?? 0;
        const next = current + level.quantity;
        if (!Number.isFinite(next) || next < 0) throw new OrderBookValidationError(`${side} level ${price} would have a negative or non-finite quantity`);
        if (next === 0) target.delete(key); else target.set(key, { price, quantity: next });
      }
    }
  }

  private sortedLevels(target: Map<string, NormalizedLevel>, descending: boolean, depth: number): OrderBookPriceLevel[] {
    return [...target.values()]
      .sort((left, right) => descending ? right.price - left.price : left.price - right.price)
      .slice(0, depth)
      .map((level) => ({ price: level.price, quantity: level.quantity }));
  }

  private record(item: HistoricalEvent): void {
    this.history.push(item);
    if (this.history.length > this.maxHistory) this.history.splice(0, this.history.length - this.maxHistory);
  }

  private markGap(reason: string): OrderBookApplyResult {
    this.status = "stale";
    this.reason = reason;
    return { kind: "stale", status: this.status, reason };
  }

  private reject(reason: string): OrderBookApplyResult {
    this.status = "error";
    this.reason = reason;
    return { kind: "rejected", status: this.status, reason };
  }

  private assertAlive(): void {
    if (this.disposed) throw new OrderBookLifecycleError("OrderBookController is disposed");
  }
}

export class InMemoryOrderBookDatafeed implements OrderBookDatafeed {
  private snapshot: OrderBookSnapshot;
  private readonly deltas: OrderBookDelta[];
  private readonly listeners = new Set<OrderBookSubscriptionArgs>();

  public constructor(history: OrderBookSnapshot | OrderBookHistory) {
    this.snapshot = cloneSnapshot("snapshot" in history ? history.snapshot : history);
    this.deltas = "snapshot" in history ? (history.deltas ?? []).map(cloneDelta) : [];
  }

  public async getOrderBook(query: OrderBookQuery): Promise<OrderBookHistory> {
    if (query.signal?.aborted) throw new DOMException("Order-book request aborted", "AbortError");
    if (query.instrumentId !== this.snapshot.instrumentId || (query.venueId !== undefined && query.venueId !== this.snapshot.venueId)) throw new OrderBookValidationError("Unknown order-book identity");
    const from = query.from ?? 0;
    const to = query.asOfTime ?? query.to ?? Number.MAX_SAFE_INTEGER;
    return {
      snapshot: cloneSnapshot(this.snapshot),
      deltas: this.deltas.filter((delta) => delta.time >= from && delta.time <= to).map(cloneDelta),
    };
  }

  public subscribeOrderBook(args: OrderBookSubscriptionArgs): () => void {
    const listener = { ...args };
    this.listeners.add(listener);
    args.onStatus?.("connected");
    return () => {
      if (this.listeners.delete(listener)) args.onStatus?.("stopped");
    };
  }

  public emitSnapshot(snapshot: OrderBookSnapshot): void {
    this.snapshot = cloneSnapshot(snapshot);
    for (const listener of [...this.listeners]) if (listener.instrumentId === snapshot.instrumentId && (listener.venueId === undefined || listener.venueId === snapshot.venueId)) listener.onSnapshot(cloneSnapshot(snapshot));
  }

  public emitDelta(delta: OrderBookDelta): void {
    this.deltas.push(cloneDelta(delta));
    for (const listener of [...this.listeners]) if (listener.instrumentId === delta.instrumentId && (listener.venueId === undefined || listener.venueId === delta.venueId)) listener.onDelta(cloneDelta(delta));
  }

  public dispose(): void {
    for (const listener of [...this.listeners]) listener.onStatus?.("stopped");
    this.listeners.clear();
  }
}

