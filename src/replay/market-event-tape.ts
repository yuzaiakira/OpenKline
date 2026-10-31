import type { CorporateAction, CorporateActionSource } from "../corporate-actions.js";
import { normalizeCorporateActionDataset, OPENKLINE_CORPORATE_ACTIONS_VERSION } from "../corporate-actions.js";
import type { MarketTrade } from "../market-trades.js";
import { normalizeMarketTrade } from "../market-trades.js";
import type {
  OrderBookDelta,
  OrderBookPriceLevel,
  OrderBookSequence,
  OrderBookSnapshot,
  OrderBookSource,
} from "../order-book.js";
import { OPENKLINE_ORDER_BOOK_VERSION } from "../order-book.js";
import type { Candle } from "../types.js";
import { corporateActionLogicalIdentity, marketTradeLogicalIdentity, replayStreamIdentity } from "./market-replay-identity.js";

/** Version of the provider-neutral unified historical event tape. */
export const OPENKLINE_MARKET_REPLAY_VERSION = 1 as const;
export const OPENKLINE_MARKET_REPLAY_ORDERING_VERSION = 1 as const;

export type MarketReplayEventKind =
  | "candle-open"
  | "candle-complete"
  | "trade"
  | "order-book-snapshot"
  | "order-book-delta"
  | "corporate-action-effective"
  | "corporate-action-payment"
  | "session-boundary"
  | "source-status";

export type MarketReplayClockPolicy = "event-time" | "receive-time";
export type MarketReplayKnowledgePolicy = "strict-causal" | "retrospective";
export type MarketReplaySessionBoundary = "open" | "close" | "break-start" | "break-end";
export type MarketReplaySourceCoverage = "complete" | "partial" | "unknown" | "unavailable";
export type MarketReplaySourceStatus = "available" | "partial" | "stale" | "unavailable";

export interface MarketReplaySource {
  readonly id: string;
  readonly version: string;
  readonly kind?: string;
}

export interface MarketReplayEventBase<K extends MarketReplayEventKind = MarketReplayEventKind> {
  readonly id: string;
  readonly kind: K;
  readonly instrumentId: string;
  readonly venueId?: string;
  /** Exchange/event timestamp. It is never inferred from receiveTime. */
  readonly time: number;
  /** Genuine recorded receipt timestamp, when the source provides one. */
  readonly receiveTime?: number;
  readonly revision: number;
  readonly sequence?: OrderBookSequence;
  readonly source: MarketReplaySource;
}

export interface MarketReplayCandleEvent extends MarketReplayEventBase<"candle-open" | "candle-complete"> {
  readonly candle: Candle;
  readonly intervalMs?: number;
  readonly finality: "opening" | "forming" | "completed";
}

export interface MarketReplayTradeEvent extends MarketReplayEventBase<"trade"> {
  readonly trade: MarketTrade;
}

export interface MarketReplayOrderBookSnapshotEvent extends MarketReplayEventBase<"order-book-snapshot"> {
  readonly snapshot: OrderBookSnapshot;
}

export interface MarketReplayOrderBookDeltaEvent extends MarketReplayEventBase<"order-book-delta"> {
  readonly delta: OrderBookDelta;
}

export interface MarketReplayCorporateActionEvent extends MarketReplayEventBase<"corporate-action-effective" | "corporate-action-payment"> {
  readonly action: CorporateAction;
}

export interface MarketReplaySessionBoundaryEvent extends MarketReplayEventBase<"session-boundary"> {
  readonly boundary: MarketReplaySessionBoundary;
  readonly sessionId: string;
  readonly calendarId: string;
  readonly calendarVersion: string;
}

export interface MarketReplaySourceStatusEvent extends MarketReplayEventBase<"source-status"> {
  readonly status: MarketReplaySourceStatus;
  readonly coverage: MarketReplaySourceCoverage;
  readonly note?: string;
}

export type MarketReplayEvent =
  | MarketReplayCandleEvent
  | MarketReplayTradeEvent
  | MarketReplayOrderBookSnapshotEvent
  | MarketReplayOrderBookDeltaEvent
  | MarketReplayCorporateActionEvent
  | MarketReplaySessionBoundaryEvent
  | MarketReplaySourceStatusEvent;

export interface MarketReplayOrderingPolicy {
  readonly version: typeof OPENKLINE_MARKET_REPLAY_ORDERING_VERSION;
  /** Sequenced order-book records retain source sequence order within a stream. */
  readonly sequencePriority: "preserve-source-sequence";
  readonly kindPriority: readonly MarketReplayEventKind[];
}

export interface MarketReplayTape {
  readonly version: typeof OPENKLINE_MARKET_REPLAY_VERSION;
  readonly id: string;
  readonly events: readonly MarketReplayEvent[];
  readonly sources: readonly MarketReplaySource[];
  readonly instrumentIds: readonly string[];
  readonly ordering: MarketReplayOrderingPolicy;
  /** Deterministic identity of the canonical processed records, not provider truth. */
  readonly fingerprint: string;
}

export interface CreateMarketReplayTapeOptions {
  readonly id?: string;
  readonly events: readonly MarketReplayEvent[];
  readonly maxEvents?: number;
}

export interface ParseMarketReplayTapeOptions {
  readonly maxEvents?: number;
}

export class MarketReplayTapeValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketReplayTapeValidationError";
  }
}

const DEFAULT_MAX_EVENTS = 500_000;
const DEFAULT_KIND_PRIORITY: readonly MarketReplayEventKind[] = [
  "source-status",
  "session-boundary",
  "candle-open",
  "trade",
  "order-book-snapshot",
  "order-book-delta",
  "candle-complete",
  "corporate-action-effective",
  "corporate-action-payment",
];

export function createMarketReplayTape(options: CreateMarketReplayTapeOptions): MarketReplayTape {
  const maxEvents = validateMaxEvents(options.maxEvents);
  if (!Array.isArray(options.events)) throw new MarketReplayTapeValidationError("Market replay events must be an array");
  if (options.events.length > maxEvents) throw new MarketReplayTapeValidationError(`Market replay tape exceeds maxEvents=${maxEvents}`);
  const id = normalizeText(options.id ?? "openkline-market-replay", "tape id");
  const seenIds = new Set<string>();
  const revisionKeys = new Set<string>();
  const normalized = options.events.map((event, index) => {
    const next = normalizeEvent(event, `events[${index}]`);
    if (seenIds.has(next.id)) throw new MarketReplayTapeValidationError(`Duplicate market replay event id: ${next.id}`);
    seenIds.add(next.id);
    const revisionKey = revisionIdentity(next);
    if (revisionKeys.has(revisionKey)) throw new MarketReplayTapeValidationError(`Duplicate revision for market replay record: ${revisionKey}`);
    revisionKeys.add(revisionKey);
    return next;
  });
  const ordering: MarketReplayOrderingPolicy = {
    version: OPENKLINE_MARKET_REPLAY_ORDERING_VERSION,
    sequencePriority: "preserve-source-sequence",
    kindPriority: [...DEFAULT_KIND_PRIORITY],
  };
  const events = normalized.sort((left, right) => compareEvents(left, right, ordering));
  const sources = uniqueSources(events);
  const instrumentIds = [...new Set(events.map((event) => event.instrumentId))].sort();
  const draft = {
    version: OPENKLINE_MARKET_REPLAY_VERSION,
    id,
    events: events.map(cloneEvent),
    sources,
    instrumentIds,
    ordering,
  } as const;
  return { ...draft, fingerprint: fingerprintMarketReplayTape(draft) };
}

export function validateMarketReplayTape(value: unknown, options: ParseMarketReplayTapeOptions = {}): asserts value is MarketReplayTape {
  if (!isRecord(value) || value.version !== OPENKLINE_MARKET_REPLAY_VERSION) {
    throw new MarketReplayTapeValidationError("Unsupported market replay tape version");
  }
  const created = createMarketReplayTape({
    ...(typeof value.id === "string" ? { id: value.id } : {}),
    events: Array.isArray(value.events) ? value.events as MarketReplayEvent[] : [],
    ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }),
  });
  if (typeof value.fingerprint !== "string" || value.fingerprint !== created.fingerprint) {
    throw new MarketReplayTapeValidationError("Market replay tape fingerprint does not match canonical events");
  }
  if (!Array.isArray(value.sources) || !Array.isArray(value.instrumentIds)
    || canonicalStringify(value.sources) !== canonicalStringify(created.sources)
    || canonicalStringify(value.instrumentIds) !== canonicalStringify(created.instrumentIds)) {
    throw new MarketReplayTapeValidationError("Market replay tape metadata is invalid or inconsistent with events");
  }
  if (!isRecord(value.ordering)
    || value.ordering.version !== OPENKLINE_MARKET_REPLAY_ORDERING_VERSION
    || value.ordering.sequencePriority !== "preserve-source-sequence"
    || canonicalStringify(value.ordering.kindPriority) !== canonicalStringify(created.ordering.kindPriority)) {
    throw new MarketReplayTapeValidationError("Market replay ordering policy is invalid");
  }
}

export function parseMarketReplayTape(value: string | unknown, options: ParseMarketReplayTapeOptions = {}): MarketReplayTape {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch (error) {
      throw new MarketReplayTapeValidationError(`Invalid market replay JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  validateMarketReplayTape(parsed, options);
  return createMarketReplayTape({
    id: parsed.id,
    events: parsed.events,
    ...(options.maxEvents === undefined ? {} : { maxEvents: options.maxEvents }),
  });
}

export function serializeMarketReplayTape(tape: MarketReplayTape): string {
  validateMarketReplayTape(tape);
  return canonicalStringify(tape);
}

export function fingerprintMarketReplayTape(value: Pick<MarketReplayTape, "version" | "id" | "events" | "sources" | "instrumentIds" | "ordering">): string {
  return fnv1a64(canonicalStringify(value));
}

export function replayEventClock(event: MarketReplayEvent, policy: MarketReplayClockPolicy): number | null {
  if (policy === "event-time") return event.time;
  return event.receiveTime ?? null;
}

export function isMarketReplayEventKind(value: unknown): value is MarketReplayEventKind {
  return typeof value === "string" && DEFAULT_KIND_PRIORITY.includes(value as MarketReplayEventKind);
}

function normalizeEvent(value: unknown, label: string): MarketReplayEvent {
  if (!isRecord(value)) throw new MarketReplayTapeValidationError(`${label} must be an object`);
  const kind = value.kind;
  if (!isMarketReplayEventKind(kind)) throw new MarketReplayTapeValidationError(`${label}.kind is unsupported`);
  const id = normalizeText(value.id, `${label}.id`);
  const instrumentId = normalizeText(value.instrumentId, `${label}.instrumentId`);
  const time = safeTimestamp(value.time, `${label}.time`);
  const receiveTime = value.receiveTime === undefined ? undefined : safeTimestamp(value.receiveTime, `${label}.receiveTime`);
  const revision = safeRevision(value.revision, `${label}.revision`);
  const source = normalizeSource(value.source, `${label}.source`);
  const venueId = value.venueId === undefined ? undefined : normalizeText(value.venueId, `${label}.venueId`);
  const sequence = value.sequence === undefined ? undefined : normalizeSequence(value.sequence, `${label}.sequence`);
  const base = {
    id,
    kind,
    instrumentId,
    ...(venueId === undefined ? {} : { venueId }),
    time,
    ...(receiveTime === undefined ? {} : { receiveTime }),
    revision,
    ...(sequence === undefined ? {} : { sequence }),
    source,
  } as const;
  switch (kind) {
    case "candle-open":
    case "candle-complete": {
      const candle = normalizeCandle(value.candle, `${label}.candle`);
      if (kind === "candle-open" && candle.time !== time) throw new MarketReplayTapeValidationError(`${label}.candle.time must equal its opening event time`);
      if (kind === "candle-complete" && candle.time > time) throw new MarketReplayTapeValidationError(`${label}.candle.time cannot be after its completion event time`);
      const finality = value.finality;
      if (kind === "candle-complete" && finality !== "completed") throw new MarketReplayTapeValidationError(`${label} completed candles require completed finality`);
      if (kind === "candle-open" && finality !== "opening" && finality !== "forming") throw new MarketReplayTapeValidationError(`${label} opening candles require opening or forming finality`);
      const intervalMs = value.intervalMs === undefined ? undefined : positiveSafeInteger(value.intervalMs, `${label}.intervalMs`);
      return { ...base, candle, finality, ...(intervalMs === undefined ? {} : { intervalMs }) } as MarketReplayCandleEvent;
    }
    case "trade": {
      if (!isRecord(value.trade)) throw new MarketReplayTapeValidationError(`${label}.trade must be an object`);
      const trade = normalizeMarketTrade(value.trade, { instrumentId, ...(venueId === undefined ? {} : { venueId }) });
      if (trade.time !== time) throw new MarketReplayTapeValidationError(`${label}.trade.time must equal event time`);
      if (trade.source.id !== source.id || trade.source.version !== source.version) throw new MarketReplayTapeValidationError(`${label}.trade source must equal event source`);
      return { ...base, trade } as MarketReplayTradeEvent;
    }
    case "order-book-snapshot": {
      const snapshot = normalizeSnapshot(value.snapshot, label, instrumentId, venueId, source, time);
      return { ...base, snapshot } as MarketReplayOrderBookSnapshotEvent;
    }
    case "order-book-delta": {
      const delta = normalizeDelta(value.delta, label, instrumentId, venueId, source, time);
      return { ...base, delta } as MarketReplayOrderBookDeltaEvent;
    }
    case "corporate-action-effective":
    case "corporate-action-payment": {
      const action = normalizeAction(value.action, `${label}.action`, instrumentId, source);
      if (kind === "corporate-action-effective" && action.effectiveTime !== time) throw new MarketReplayTapeValidationError(`${label}.time must equal action effectiveTime`);
      if (kind === "corporate-action-payment" && (action.kind !== "cash-dividend" || action.paymentTime !== time)) throw new MarketReplayTapeValidationError(`${label} must reference a cash dividend paymentTime`);
      return { ...base, action } as MarketReplayCorporateActionEvent;
    }
    case "session-boundary": {
      const boundary = value.boundary;
      if (boundary !== "open" && boundary !== "close" && boundary !== "break-start" && boundary !== "break-end") throw new MarketReplayTapeValidationError(`${label}.boundary is invalid`);
      return {
        ...base,
        boundary,
        sessionId: normalizeText(value.sessionId, `${label}.sessionId`),
        calendarId: normalizeText(value.calendarId, `${label}.calendarId`),
        calendarVersion: normalizeText(value.calendarVersion, `${label}.calendarVersion`),
      } as MarketReplaySessionBoundaryEvent;
    }
    case "source-status": {
      const status = value.status;
      const coverage = value.coverage;
      if (status !== "available" && status !== "partial" && status !== "stale" && status !== "unavailable") throw new MarketReplayTapeValidationError(`${label}.status is invalid`);
      if (coverage !== "complete" && coverage !== "partial" && coverage !== "unknown" && coverage !== "unavailable") throw new MarketReplayTapeValidationError(`${label}.coverage is invalid`);
      const note = value.note === undefined ? undefined : normalizeText(value.note, `${label}.note`);
      return { ...base, status, coverage, ...(note === undefined ? {} : { note }) } as MarketReplaySourceStatusEvent;
    }
  }
}

function normalizeCandle(value: unknown, label: string): Candle {
  if (!isRecord(value)) throw new MarketReplayTapeValidationError(`${label} must be an object`);
  const time = safeTimestamp(value.time, `${label}.time`);
  const open = finitePositiveOrZero(value.open, `${label}.open`);
  const high = finitePositiveOrZero(value.high, `${label}.high`);
  const low = finitePositiveOrZero(value.low, `${label}.low`);
  const close = finitePositiveOrZero(value.close, `${label}.close`);
  if (high < Math.max(open, close) || low > Math.min(open, close) || low > high) throw new MarketReplayTapeValidationError(`${label} OHLC bounds are invalid`);
  const volume = value.volume === undefined ? undefined : nonNegativeFinite(value.volume, `${label}.volume`);
  return { time, open, high, low, close, ...(volume === undefined ? {} : { volume }) };
}

function normalizeSnapshot(value: unknown, label: string, instrumentId: string, venueId: string | undefined, source: MarketReplaySource, time: number): OrderBookSnapshot {
  if (!isRecord(value) || value.version !== OPENKLINE_ORDER_BOOK_VERSION) throw new MarketReplayTapeValidationError(`${label}.snapshot has unsupported version`);
  const common = normalizeBookIdentity(value, `${label}.snapshot`, instrumentId, venueId, source, time);
  const bids = normalizeLevels(value.bids, `${label}.snapshot.bids`, false);
  const asks = normalizeLevels(value.asks, `${label}.snapshot.asks`, false);
  const tickSize = value.tickSize === undefined ? undefined : positiveFinite(value.tickSize, `${label}.snapshot.tickSize`);
  return {
    version: OPENKLINE_ORDER_BOOK_VERSION,
    instrumentId,
    ...(venueId === undefined ? {} : { venueId }),
    time,
    ...(common.receiveTime === undefined ? {} : { receiveTime: common.receiveTime }),
    ...(common.sequence === undefined ? {} : { sequence: common.sequence }),
    bids,
    asks,
    ...(tickSize === undefined ? {} : { tickSize }),
    ...(value.priceUnit === undefined ? {} : { priceUnit: normalizeText(value.priceUnit, `${label}.snapshot.priceUnit`) }),
    ...(value.quantityUnit === undefined ? {} : { quantityUnit: normalizeText(value.quantityUnit, `${label}.snapshot.quantityUnit`) }),
    source: toOrderBookSource(source),
  };
}

function normalizeDelta(value: unknown, label: string, instrumentId: string, venueId: string | undefined, source: MarketReplaySource, time: number): OrderBookDelta {
  if (!isRecord(value) || value.version !== OPENKLINE_ORDER_BOOK_VERSION) throw new MarketReplayTapeValidationError(`${label}.delta has unsupported version`);
  const common = normalizeBookIdentity(value, `${label}.delta`, instrumentId, venueId, source, time);
  const quantityMode = value.quantityMode;
  if (quantityMode !== "absolute" && quantityMode !== "delta") throw new MarketReplayTapeValidationError(`${label}.delta.quantityMode is invalid`);
  return {
    version: OPENKLINE_ORDER_BOOK_VERSION,
    ...(value.id === undefined ? {} : { id: normalizeText(value.id, `${label}.delta.id`) }),
    instrumentId,
    ...(venueId === undefined ? {} : { venueId }),
    time,
    ...(common.receiveTime === undefined ? {} : { receiveTime: common.receiveTime }),
    ...(common.sequence === undefined ? {} : { sequence: common.sequence }),
    ...(value.previousSequence === undefined ? {} : { previousSequence: safeRevision(value.previousSequence, `${label}.delta.previousSequence`) }),
    quantityMode,
    bids: normalizeLevels(value.bids, `${label}.delta.bids`, quantityMode === "delta"),
    asks: normalizeLevels(value.asks, `${label}.delta.asks`, quantityMode === "delta"),
    source: toOrderBookSource(source),
  };
}

function normalizeBookIdentity(value: Record<string, unknown>, label: string, instrumentId: string, venueId: string | undefined, source: MarketReplaySource, time: number): { readonly receiveTime?: number; readonly sequence?: OrderBookSequence } {
  if (value.instrumentId !== instrumentId) throw new MarketReplayTapeValidationError(`${label}.instrumentId must match event instrumentId`);
  if (venueId !== undefined && value.venueId !== venueId) throw new MarketReplayTapeValidationError(`${label}.venueId must match event venueId`);
  if (value.time !== time) throw new MarketReplayTapeValidationError(`${label}.time must match event time`);
  const eventSource = normalizeSource(value.source, `${label}.source`);
  if (eventSource.id !== source.id || eventSource.version !== source.version) throw new MarketReplayTapeValidationError(`${label}.source must match event source`);
  const receiveTime = value.receiveTime === undefined ? undefined : safeTimestamp(value.receiveTime, `${label}.receiveTime`);
  const sequence = value.sequence === undefined ? undefined : normalizeSequence(value.sequence, `${label}.sequence`);
  return { ...(receiveTime === undefined ? {} : { receiveTime }), ...(sequence === undefined ? {} : { sequence }) };
}

function normalizeLevels(value: unknown, label: string, allowNegative: boolean): readonly OrderBookPriceLevel[] {
  if (!Array.isArray(value)) throw new MarketReplayTapeValidationError(`${label} must be an array`);
  const prices = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new MarketReplayTapeValidationError(`${label}[${index}] must be an object`);
    const price = positiveFinite(item.price, `${label}[${index}].price`);
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) && (allowNegative ? true : item.quantity >= 0) ? item.quantity : NaN;
    if (!Number.isFinite(quantity)) throw new MarketReplayTapeValidationError(`${label}[${index}].quantity is invalid`);
    const key = price.toPrecision(15);
    if (prices.has(key)) throw new MarketReplayTapeValidationError(`${label} contains duplicate price ${price}`);
    prices.add(key);
    return { price, quantity };
  });
}

function normalizeAction(value: unknown, label: string, instrumentId: string, source: MarketReplaySource): CorporateAction {
  if (!isRecord(value)) throw new MarketReplayTapeValidationError(`${label} must be an object`);
  if (value.instrumentId !== instrumentId) throw new MarketReplayTapeValidationError(`${label}.instrumentId must match event instrumentId`);
  const actionSource = value.source as CorporateActionSource | undefined;
  if (actionSource === undefined || actionSource.id !== source.id || actionSource.version !== source.version) throw new MarketReplayTapeValidationError(`${label}.source must match event source`);
  try {
    const dataset = normalizeCorporateActionDataset({
      version: OPENKLINE_CORPORATE_ACTIONS_VERSION,
      instrumentId,
      source: actionSource,
      knowledgeCoverage: "known",
      actions: [value as unknown as CorporateAction],
    });
    return dataset.actions[0]!;
  } catch (error) {
    throw new MarketReplayTapeValidationError(`${label} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeSource(value: unknown, label: string): MarketReplaySource {
  if (!isRecord(value)) throw new MarketReplayTapeValidationError(`${label} must be an object`);
  const id = normalizeText(value.id, `${label}.id`);
  const version = normalizeText(value.version, `${label}.version`);
  return { id, version, ...(value.kind === undefined ? {} : { kind: normalizeText(value.kind, `${label}.kind`) }) };
}

function normalizeSequence(value: unknown, label: string): OrderBookSequence {
  if (typeof value === "number") return safeRevision(value, label);
  if (!isRecord(value)) throw new MarketReplayTapeValidationError(`${label} must be a number or range`);
  const from = safeRevision(value.from, `${label}.from`);
  const to = safeRevision(value.to, `${label}.to`);
  if (to < from) throw new MarketReplayTapeValidationError(`${label}.to must not be less than from`);
  return { from, to };
}

function safeTimestamp(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new MarketReplayTapeValidationError(`${label} must be a non-negative safe integer timestamp`);
  return value as number;
}

function safeRevision(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new MarketReplayTapeValidationError(`${label} must be a non-negative safe integer`);
  return value as number;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const result = safeRevision(value, label);
  if (result === 0) throw new MarketReplayTapeValidationError(`${label} must be positive`);
  return result;
}

function finitePositiveOrZero(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new MarketReplayTapeValidationError(`${label} must be finite and non-negative`);
  return value;
}

function nonNegativeFinite(value: unknown, label: string): number {
  return finitePositiveOrZero(value, label);
}

function positiveFinite(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new MarketReplayTapeValidationError(`${label} must be finite and positive`);
  return value;
}

function normalizeText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new MarketReplayTapeValidationError(`${label} must be a non-empty string`);
  return value.trim();
}

function validateMaxEvents(value: number | undefined): number {
  if (value === undefined) return DEFAULT_MAX_EVENTS;
  if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_MAX_EVENTS) throw new MarketReplayTapeValidationError(`maxEvents must be between 1 and ${DEFAULT_MAX_EVENTS}`);
  return value;
}

function toOrderBookSource(source: MarketReplaySource): OrderBookSource {
  return { id: source.id, version: source.version, ...(source.kind === undefined ? {} : { kind: source.kind }) };
}

function revisionIdentity(event: MarketReplayEvent): string {
  if (event.kind === "trade") return `${marketTradeLogicalIdentity(event.trade)}:revision:${event.trade.revision}`;
  if (event.kind === "corporate-action-effective" || event.kind === "corporate-action-payment") return `${corporateActionLogicalIdentity(event.action)}:revision:${event.action.revision}:${event.kind}`;
  return `event:${event.id}`;
}

function uniqueSources(events: readonly MarketReplayEvent[]): readonly MarketReplaySource[] {
  const byKey = new Map<string, MarketReplaySource>();
  for (const event of events) byKey.set(`${event.source.id}\u0000${event.source.version}`, { ...event.source });
  return [...byKey.values()].sort((left, right) => left.id.localeCompare(right.id) || left.version.localeCompare(right.version));
}

function compareEvents(left: MarketReplayEvent, right: MarketReplayEvent, ordering: MarketReplayOrderingPolicy): number {
  const leftStream = eventStreamKey(left);
  const rightStream = eventStreamKey(right);
  const leftSequence = sequenceStart(left);
  const rightSequence = sequenceStart(right);
  if (leftStream === rightStream && leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence;
  return left.time - right.time
    || left.instrumentId.localeCompare(right.instrumentId)
    || left.source.id.localeCompare(right.source.id)
    || left.source.version.localeCompare(right.source.version)
    || kindPriority(ordering, left.kind) - kindPriority(ordering, right.kind)
    || (leftSequence ?? Number.MAX_SAFE_INTEGER) - (rightSequence ?? Number.MAX_SAFE_INTEGER)
    || left.id.localeCompare(right.id)
    || left.revision - right.revision;
}

function kindPriority(ordering: MarketReplayOrderingPolicy, kind: MarketReplayEventKind): number {
  return ordering.kindPriority.indexOf(kind);
}

function eventStreamKey(event: MarketReplayEvent): string {
  return replayStreamIdentity(event);
}

function sequenceStart(event: MarketReplayEvent): number | null {
  if (event.sequence === undefined) return null;
  return typeof event.sequence === "number" ? event.sequence : event.sequence.from;
}

function cloneEvent(event: MarketReplayEvent): MarketReplayEvent {
  const base = {
    id: event.id,
    kind: event.kind,
    instrumentId: event.instrumentId,
    ...(event.venueId === undefined ? {} : { venueId: event.venueId }),
    time: event.time,
    ...(event.receiveTime === undefined ? {} : { receiveTime: event.receiveTime }),
    revision: event.revision,
    ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }),
    source: { ...event.source },
  } as const;
  switch (event.kind) {
    case "candle-open":
    case "candle-complete": return { ...base, candle: { ...event.candle }, finality: event.finality, ...(event.intervalMs === undefined ? {} : { intervalMs: event.intervalMs }) } as MarketReplayCandleEvent;
    case "trade": return { ...base, trade: { ...event.trade, source: { ...event.trade.source } } } as MarketReplayTradeEvent;
    case "order-book-snapshot": return { ...base, snapshot: cloneSnapshot(event.snapshot) } as MarketReplayOrderBookSnapshotEvent;
    case "order-book-delta": return { ...base, delta: cloneDelta(event.delta) } as MarketReplayOrderBookDeltaEvent;
    case "corporate-action-effective":
    case "corporate-action-payment": return { ...base, action: { ...event.action, source: { ...event.action.source } } } as MarketReplayCorporateActionEvent;
    case "session-boundary": return { ...base, boundary: event.boundary, sessionId: event.sessionId, calendarId: event.calendarId, calendarVersion: event.calendarVersion } as MarketReplaySessionBoundaryEvent;
    case "source-status": return { ...base, status: event.status, coverage: event.coverage, ...(event.note === undefined ? {} : { note: event.note }) } as MarketReplaySourceStatusEvent;
  }
}

function cloneSnapshot(snapshot: OrderBookSnapshot): OrderBookSnapshot {
  return {
    ...snapshot,
    ...(snapshot.sequence === undefined ? {} : { sequence: typeof snapshot.sequence === "number" ? snapshot.sequence : { ...snapshot.sequence } }),
    bids: snapshot.bids.map((level) => ({ ...level })),
    asks: snapshot.asks.map((level) => ({ ...level })),
    source: { ...snapshot.source },
  };
}

function cloneDelta(delta: OrderBookDelta): OrderBookDelta {
  return {
    ...delta,
    ...(delta.sequence === undefined ? {} : { sequence: typeof delta.sequence === "number" ? delta.sequence : { ...delta.sequence } }),
    bids: delta.bids.map((level) => ({ ...level })),
    asks: delta.asks.map((level) => ({ ...level })),
    source: { ...delta.source },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isRecord(value)) {
    const entries = Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new MarketReplayTapeValidationError("Market replay tape contains a non-serializable value");
}

function fnv1a64(value: string): string {
  let hash = BigInt("14695981039346656037");
  const prime = BigInt("1099511628211");
  const mask = BigInt("18446744073709551615");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
