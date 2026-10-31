import type { CorporateAction } from "../corporate-actions.js";
import type { MarketTrade } from "../market-trades.js";
import {
  OrderBookController,
  type OrderBookState,
  type OrderBookSnapshot,
  type OrderBookDelta,
} from "../order-book.js";
import type { Candle } from "../types.js";
import type { ReplayScheduler } from "./types.js";
import {
  replayEventClock,
  type MarketReplayCandleEvent,
  type MarketReplayClockPolicy,
  type MarketReplayEvent,
  type MarketReplayKnowledgePolicy,
  type MarketReplayOrderBookDeltaEvent,
  type MarketReplayOrderBookSnapshotEvent,
  type MarketReplaySessionBoundaryEvent,
  type MarketReplaySourceCoverage,
  type MarketReplaySource,
  type MarketReplaySourceStatus,
  type MarketReplaySourceStatusEvent,
  type MarketReplayTape,
  type MarketReplayTradeEvent,
  validateMarketReplayTape,
} from "./market-event-tape.js";
import {
  corporateActionLogicalIdentity,
  marketTradeLogicalIdentity,
  replayCandleIdentity,
  replayFootprintIdentity,
  replayStreamIdentity,
} from "./market-replay-identity.js";

export type MarketReplayPlaybackState = "idle" | "ready" | "playing" | "paused" | "completed" | "error" | "disposed";

export interface MarketReplayCursor {
  readonly eventIndex: number | null;
  readonly eventId: string | null;
  readonly timestamp: number | null;
  readonly clockTimestamp: number | null;
}

export interface MarketReplaySourceCoverageState {
  readonly source: { readonly id: string; readonly version: string };
  readonly instrumentId: string;
  readonly status: MarketReplaySourceStatus | "not-reported";
  readonly coverage: MarketReplaySourceCoverage | "not-reported";
  readonly observedEvents: number;
  readonly note?: string;
}

export interface MarketReplayIntegrityState {
  readonly complete: boolean;
  readonly unknownReceiveTime: boolean;
  readonly sequenceGaps: readonly string[];
  readonly staleOrderBooks: readonly string[];
  readonly rejectedEventIds: readonly string[];
  readonly notes: readonly string[];
}

export interface MarketReplayTradeSummary {
  readonly instrumentId: string;
  readonly tradeCount: number;
  readonly totalVolume: number;
  readonly knownSideVolume: number;
  readonly unknownSideVolume: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
}

export interface MarketReplayCvdState {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly source: MarketReplaySource;
  readonly value: number;
  readonly knownVolume: number;
  readonly unknownVolume: number;
}

export interface MarketReplayFootprintCell {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly source: MarketReplaySource;
  readonly time: number;
  readonly price: number;
  readonly buyVolume: number;
  readonly sellVolume: number;
  readonly unknownVolume: number;
}

export interface MarketReplayFormingCandle {
  readonly instrumentId: string;
  readonly time: number;
  readonly open: number;
  readonly intervalMs?: number;
  readonly status: "opening" | "forming";
}

export interface MarketReplayCompletedCandle extends Candle {
  readonly instrumentId: string;
}

export interface MarketReplayTradeMaterialization {
  readonly complete: boolean;
  readonly totalEligibleTrades: number;
  readonly materializedTrades: number;
  readonly limit: number;
  readonly instrumentId?: string;
}

export interface MarketReplayOrderBookState {
  readonly key: string;
  readonly state: OrderBookState;
}

export interface MarketReplaySessionState {
  readonly eventId: string;
  readonly instrumentId: string;
  readonly sessionId: string;
  readonly calendarId: string;
  readonly calendarVersion: string;
  readonly boundary: MarketReplaySessionBoundaryEvent["boundary"];
  readonly time: number;
}

export interface MarketReplaySnapshot {
  readonly cursor: MarketReplayCursor;
  readonly state: MarketReplayPlaybackState;
  readonly speed: number;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  /** Only completed candles contain final OHLCV. */
  readonly completedCandles: readonly MarketReplayCompletedCandle[];
  /** Opening/forming events intentionally expose only the opening price. */
  readonly formingCandles: readonly MarketReplayFormingCandle[];
  readonly trades: readonly MarketTrade[];
  /** Indicates whether the defensive trade array contains the complete view. */
  readonly tradeMaterialization: MarketReplayTradeMaterialization;
  readonly tradeSummary: readonly MarketReplayTradeSummary[];
  readonly cvd: readonly MarketReplayCvdState[];
  readonly footprint: readonly MarketReplayFootprintCell[];
  readonly orderBooks: readonly MarketReplayOrderBookState[];
  readonly effectiveCorporateActions: readonly CorporateAction[];
  readonly paymentCorporateActions: readonly CorporateAction[];
  readonly sessions: readonly MarketReplaySessionState[];
  readonly sourceCoverage: readonly MarketReplaySourceCoverageState[];
  readonly integrity: MarketReplayIntegrityState;
}

export interface MarketReplayState extends MarketReplayCursor {
  readonly state: MarketReplayPlaybackState;
  readonly speed: number;
  readonly totalEvents: number;
  readonly eligibleEvents: number;
  readonly processedEvents: number;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly currentEvent: MarketReplayEvent | null;
  readonly sourceCoverage: readonly MarketReplaySourceCoverageState[];
  readonly integrity: MarketReplayIntegrityState;
  readonly error?: string;
}

export interface MarketReplayProgress {
  readonly state: MarketReplayPlaybackState;
  readonly processedEvents: number;
  readonly totalEvents: number;
  readonly currentTimestamp: number | null;
  readonly currentEventId: string | null;
}

export interface MarketReplayCheckpoint {
  readonly id: string;
  readonly eventIndex: number;
  readonly eventId: string | null;
  readonly timestamp: number | null;
  readonly tapeVersion: number;
  readonly datasetFingerprint: string;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly orderingVersion: number;
  readonly snapshot: MarketReplaySnapshot;
}

export interface MarketReplayCheckpointDiagnostics {
  readonly interval: number;
  readonly maxCheckpoints: number;
  readonly memoryBudgetBytes: number;
  readonly retainedCheckpoints: number;
  readonly estimatedRetainedBytes: number;
  readonly evictions: number;
  readonly oldestEventIndex: number | null;
  readonly newestEventIndex: number | null;
}

export interface MarketReplaySnapshotOptions {
  /** Restrict materialization to one instrument without changing replay state. */
  readonly instrumentId?: string;
  /** Optional upper bound for defensive trade materialization. */
  readonly maxMaterializedTrades?: number;
}

export interface MarketReplayControllerOptions {
  readonly tape: MarketReplayTape;
  readonly clockPolicy?: MarketReplayClockPolicy;
  readonly knowledgePolicy?: MarketReplayKnowledgePolicy;
  readonly startAt?: number;
  readonly speed?: number;
  readonly scheduler?: ReplayScheduler;
  readonly checkpointInterval?: number;
  readonly maxCheckpoints?: number;
  /** Approximate retained checkpoint budget in bytes. */
  readonly checkpointMemoryBudgetBytes?: number;
  readonly maxMaterializedTrades?: number;
  readonly maxFootprintCells?: number;
  readonly maxDepth?: number;
}

export type MarketReplayStateListener = (state: MarketReplayState) => void;

export class MarketReplayLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketReplayLifecycleError";
  }
}

export class MarketReplayValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketReplayValidationError";
  }
}

interface ProjectedEvent {
  readonly event: MarketReplayEvent;
  readonly tapeIndex: number;
  readonly clockTimestamp: number;
}

type OpeningCandleEvent = Omit<MarketReplayCandleEvent, "kind" | "finality"> & { readonly kind: "candle-open"; readonly finality: "opening" | "forming" };
type CompletedCandleEvent = Omit<MarketReplayCandleEvent, "kind" | "finality"> & { readonly kind: "candle-complete"; readonly finality: "completed" };

interface MutableCvd {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly source: MarketReplaySource;
  value: number;
  knownVolume: number;
  unknownVolume: number;
}

interface MutableCell {
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly source: MarketReplaySource;
  readonly time: number;
  readonly price: number;
  buyVolume: number;
  sellVolume: number;
  unknownVolume: number;
}

interface MutableCoverage {
  readonly source: { readonly id: string; readonly version: string };
  readonly instrumentId: string;
  status: MarketReplaySourceStatus | "not-reported";
  coverage: MarketReplaySourceCoverage | "not-reported";
  observedEvents: number;
  note?: string;
}

interface MutableRuntime {
  completedCandles: Map<string, { instrumentId: string; candle: Candle; revision: number }>;
  formingCandles: Map<string, { instrumentId: string; time: number; open: number; intervalMs?: number; status: "opening" | "forming"; revision: number }>;
  trades: Map<string, MarketTrade>;
  cvd: Map<string, MutableCvd>;
  footprint: Map<string, MutableCell>;
  books: Map<string, OrderBookController>;
  effectiveActions: Map<string, { action: CorporateAction; revision: number }>;
  paymentActions: Map<string, { action: CorporateAction; revision: number }>;
  sessions: Map<string, MarketReplaySessionState>;
  coverage: Map<string, MutableCoverage>;
  sequenceGaps: Set<string>;
  staleOrderBooks: Set<string>;
  rejectedEventIds: Set<string>;
  notes: Set<string>;
}

interface RuntimeCheckpoint {
  readonly eventIndex: number;
  readonly eventId: string | null;
  readonly timestamp: number | null;
  readonly tapeVersion: number;
  readonly datasetFingerprint: string;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly orderingVersion: number;
  readonly estimatedBytes: number;
  readonly completedCandles: readonly [string, { readonly instrumentId: string; readonly candle: Candle; readonly revision: number }][];
  readonly formingCandles: readonly [string, { readonly instrumentId: string; readonly time: number; readonly open: number; readonly intervalMs?: number; readonly status: "opening" | "forming"; readonly revision: number }][];
  readonly trades: readonly [string, MarketTrade][];
  readonly cvd: readonly [string, MutableCvd][];
  readonly footprint: readonly [string, MutableCell][];
  readonly books: readonly [string, OrderBookState][];
  readonly effectiveActions: readonly [string, { readonly action: CorporateAction; readonly revision: number }][];
  readonly paymentActions: readonly [string, { readonly action: CorporateAction; readonly revision: number }][];
  readonly sessions: readonly [string, MarketReplaySessionState][];
  readonly coverage: readonly [string, MutableCoverage][];
  readonly sequenceGaps: readonly string[];
  readonly staleOrderBooks: readonly string[];
  readonly rejectedEventIds: readonly string[];
  readonly notes: readonly string[];
}

const MIN_SPEED = 0.01;
const MAX_SPEED = 100;
const DEFAULT_CHECKPOINT_INTERVAL = 250;
const DEFAULT_MAX_CHECKPOINTS = 64;
const DEFAULT_CHECKPOINT_MEMORY_BUDGET_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_TRADES = 5_000;
const DEFAULT_MAX_FOOTPRINT_CELLS = 50_000;
const DEFAULT_MAX_DEPTH = 100;

/**
 * Deterministic multi-stream historical replay. The cursor, not a wall-clock,
 * is the source of financial truth. Chart.createReplay() remains independent
 * and is intentionally not replaced by this research-oriented controller.
 */
export class MarketReplayController {
  private readonly tape: MarketReplayTape;
  private readonly clockPolicy: MarketReplayClockPolicy;
  private readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  private readonly scheduler: ReplayScheduler;
  private readonly checkpointInterval: number;
  private readonly maxCheckpoints: number;
  private readonly checkpointMemoryBudgetBytes: number;
  private readonly maxMaterializedTrades: number;
  private readonly maxFootprintCells: number;
  private readonly maxDepth: number;
  private readonly projectedEvents: readonly ProjectedEvent[];
  private readonly clockOrderingUncertain: boolean;
  private readonly eventIndexById: ReadonlyMap<string, number>;
  private readonly timestampProjection: readonly number[];
  private readonly listeners = new Set<MarketReplayStateListener>();
  private readonly checkpoints = new Map<number, RuntimeCheckpoint>();
  private retainedCheckpointBytes = 0;
  private checkpointEvictions = 0;
  private readonly initialIndex: number;
  private runtime: MutableRuntime = createRuntime();
  private state: MarketReplayPlaybackState = "idle";
  private currentIndex = -1;
  private speed: number;
  private timer: unknown = null;
  private error: Error | null = null;
  private disposed = false;

  public constructor(options: MarketReplayControllerOptions) {
    try {
      validateMarketReplayTape(options.tape);
    } catch (error) {
      throw new MarketReplayValidationError(`Invalid market replay tape: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.tape = options.tape;
    this.clockPolicy = options.clockPolicy ?? "event-time";
    this.knowledgePolicy = options.knowledgePolicy ?? "strict-causal";
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.checkpointInterval = positiveLimit(options.checkpointInterval, DEFAULT_CHECKPOINT_INTERVAL, 100_000, "checkpointInterval");
    this.maxCheckpoints = positiveLimit(options.maxCheckpoints, DEFAULT_MAX_CHECKPOINTS, 1_000, "maxCheckpoints");
    this.checkpointMemoryBudgetBytes = positiveLimit(options.checkpointMemoryBudgetBytes, DEFAULT_CHECKPOINT_MEMORY_BUDGET_BYTES, 1_073_741_824, "checkpointMemoryBudgetBytes");
    this.maxMaterializedTrades = positiveLimit(options.maxMaterializedTrades, DEFAULT_MAX_TRADES, 100_000, "maxMaterializedTrades");
    this.maxFootprintCells = positiveLimit(options.maxFootprintCells, DEFAULT_MAX_FOOTPRINT_CELLS, 1_000_000, "maxFootprintCells");
    this.maxDepth = positiveLimit(options.maxDepth, DEFAULT_MAX_DEPTH, 10_000, "maxDepth");
    this.speed = normalizeSpeed(options.speed ?? 1);
    this.projectedEvents = projectEvents(this.tape, this.clockPolicy);
    this.clockOrderingUncertain = hasClockRegression(this.projectedEvents);
    this.eventIndexById = new Map(this.projectedEvents.map((item, index) => [item.event.id, index]));
    this.timestampProjection = this.projectedEvents.map((item) => item.clockTimestamp);
    this.initialIndex = options.startAt === undefined ? -1 : this.resolveTimestampIndex(options.startAt);
    if (options.startAt !== undefined && (!Number.isSafeInteger(options.startAt) || options.startAt < 0)) throw new MarketReplayValidationError("startAt must be a non-negative safe integer timestamp");
  }

  public getState(): MarketReplayState {
    const current = this.projectedEvents[this.currentIndex];
    return {
      eventIndex: current === undefined ? null : this.currentIndex,
      eventId: current?.event.id ?? null,
      timestamp: current?.event.time ?? null,
      clockTimestamp: current?.clockTimestamp ?? null,
      state: this.state,
      speed: this.speed,
      totalEvents: this.tape.events.length,
      eligibleEvents: this.projectedEvents.length,
      processedEvents: Math.max(0, this.currentIndex + 1),
      clockPolicy: this.clockPolicy,
      knowledgePolicy: this.knowledgePolicy,
      currentEvent: current === undefined ? null : cloneEventForPublic(current.event),
      sourceCoverage: this.getCoverage(),
      integrity: this.getIntegrity(),
      ...(this.error === null ? {} : { error: this.error.message }),
    };
  }

  public getProgress(): MarketReplayProgress {
    const current = this.projectedEvents[this.currentIndex];
    return {
      state: this.state,
      processedEvents: Math.max(0, this.currentIndex + 1),
      totalEvents: this.projectedEvents.length,
      currentTimestamp: current?.clockTimestamp ?? null,
      currentEventId: current?.event.id ?? null,
    };
  }

  public getSnapshot(options: MarketReplaySnapshotOptions = {}): MarketReplaySnapshot {
    const instrumentId = options.instrumentId === undefined ? undefined : requireSnapshotInstrument(options.instrumentId);
    const tradeLimit = options.maxMaterializedTrades === undefined
      ? this.maxMaterializedTrades
      : positiveLimit(options.maxMaterializedTrades, this.maxMaterializedTrades, 100_000, "maxMaterializedTrades");
    const current = this.projectedEvents[this.currentIndex];
    const completedCandles = [...this.runtime.completedCandles.entries()]
      .filter(([, item]) => instrumentId === undefined || item.instrumentId === instrumentId)
      .sort(([, left], [, right]) => left.candle.time - right.candle.time || left.candle.open - right.candle.open)
      .map(([, item]) => ({ instrumentId: item.instrumentId, ...item.candle }));
    const formingCandles = [...this.runtime.formingCandles.entries()]
      .filter(([, item]) => instrumentId === undefined || item.instrumentId === instrumentId)
      .map(([, item]) => ({ instrumentId: item.instrumentId, time: item.time, open: item.open, ...(item.intervalMs === undefined ? {} : { intervalMs: item.intervalMs }), status: item.status } as MarketReplayFormingCandle))
      .sort((left, right) => left.time - right.time || left.instrumentId.localeCompare(right.instrumentId));
    const scopedTrades = [...this.runtime.trades.values()].filter((trade) => instrumentId === undefined || trade.instrumentId === instrumentId).sort(compareTrades);
    const trades = scopedTrades.slice(-tradeLimit).map(cloneTrade);
    const tradeSummary = summarizeTrades(scopedTrades);
    const cvd = [...this.runtime.cvd.entries()]
      .filter(([, value]) => instrumentId === undefined || value.instrumentId === instrumentId)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => ({ ...value, source: { ...value.source } }));
    const footprint = [...this.runtime.footprint.values()]
      .filter((cell) => instrumentId === undefined || cell.instrumentId === instrumentId)
      .sort((left, right) => left.time - right.time || left.price - right.price || left.instrumentId.localeCompare(right.instrumentId) || left.source.id.localeCompare(right.source.id) || left.source.version.localeCompare(right.source.version) || (left.venueId ?? "").localeCompare(right.venueId ?? ""))
      .map((cell) => ({ ...cell, source: { ...cell.source } }));
    const orderBooks = [...this.runtime.books.entries()]
      .map(([key, controller]) => ({ key, state: cloneOrderBookState(controller.getState(this.maxDepth)) }))
      .filter(({ state }) => instrumentId === undefined || state.instrumentId === instrumentId)
      .sort((left, right) => left.key.localeCompare(right.key));
    const effectiveCorporateActions = [...this.runtime.effectiveActions.values()]
      .filter((item) => instrumentId === undefined || item.action.instrumentId === instrumentId)
      .sort(compareActionValues)
      .map((item) => cloneAction(item.action));
    const paymentCorporateActions = [...this.runtime.paymentActions.values()]
      .filter((item) => instrumentId === undefined || item.action.instrumentId === instrumentId)
      .sort(compareActionValues)
      .map((item) => cloneAction(item.action));
    const sessions = [...this.runtime.sessions.values()]
      .filter((item) => instrumentId === undefined || item.instrumentId === instrumentId)
      .sort((left, right) => left.time - right.time || left.eventId.localeCompare(right.eventId))
      .map((item) => ({ ...item }));
    return {
      cursor: {
        eventIndex: current === undefined ? null : this.currentIndex,
        eventId: current?.event.id ?? null,
        timestamp: current?.event.time ?? null,
        clockTimestamp: current?.clockTimestamp ?? null,
      },
      state: this.state,
      speed: this.speed,
      clockPolicy: this.clockPolicy,
      knowledgePolicy: this.knowledgePolicy,
      completedCandles,
      formingCandles,
      trades,
      tradeMaterialization: {
        complete: trades.length === scopedTrades.length,
        totalEligibleTrades: scopedTrades.length,
        materializedTrades: trades.length,
        limit: tradeLimit,
        ...(instrumentId === undefined ? {} : { instrumentId }),
      },
      tradeSummary,
      cvd,
      footprint,
      orderBooks,
      effectiveCorporateActions,
      paymentCorporateActions,
      sessions,
      sourceCoverage: this.getCoverage(instrumentId),
      integrity: this.getIntegrity(),
    };
  }

  public getCheckpoints(): readonly MarketReplayCheckpoint[] {
    return [...this.checkpoints.values()].sort((left, right) => left.eventIndex - right.eventIndex).map((checkpoint) => ({
      id: checkpointId(this.tape, checkpoint.eventIndex, this.clockPolicy, this.knowledgePolicy),
      eventIndex: checkpoint.eventIndex,
      eventId: checkpoint.eventId,
      timestamp: checkpoint.timestamp,
      tapeVersion: this.tape.version,
      datasetFingerprint: this.tape.fingerprint,
      clockPolicy: this.clockPolicy,
      knowledgePolicy: this.knowledgePolicy,
      orderingVersion: this.tape.ordering.version,
      snapshot: snapshotFromCheckpoint(checkpoint, this.tape, this.clockPolicy, this.knowledgePolicy),
    }));
  }

  public getCheckpointDiagnostics(): MarketReplayCheckpointDiagnostics {
    const indices = [...this.checkpoints.keys()].sort((left, right) => left - right);
    return {
      interval: this.checkpointInterval,
      maxCheckpoints: this.maxCheckpoints,
      memoryBudgetBytes: this.checkpointMemoryBudgetBytes,
      retainedCheckpoints: this.checkpoints.size,
      estimatedRetainedBytes: this.retainedCheckpointBytes,
      evictions: this.checkpointEvictions,
      oldestEventIndex: indices[0] ?? null,
      newestEventIndex: indices.at(-1) ?? null,
    };
  }

  public getAvailableSeekBoundaries(): { readonly from: number | null; readonly to: number | null } {
    return { from: this.projectedEvents[0]?.clockTimestamp ?? null, to: this.projectedEvents.at(-1)?.clockTimestamp ?? null };
  }

  public getEvent(eventId: string): MarketReplayEvent | null {
    const projectedIndex = this.eventIndexById.get(eventId);
    const event = projectedIndex === undefined ? this.tape.events.find((candidate) => candidate.id === eventId) : this.projectedEvents[projectedIndex]?.event;
    return event === undefined ? null : cloneEventForPublic(event);
  }

  /** Return an eligible projected event by replay cursor index. */
  public getEligibleEvent(index: number): MarketReplayEvent | null {
    if (!Number.isSafeInteger(index) || index < 0) return null;
    const event = this.projectedEvents[index]?.event;
    return event === undefined ? null : cloneEventForPublic(event);
  }

  public subscribe(listener: MarketReplayStateListener): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public start(): void {
    this.assertNotDisposed();
    if (this.state !== "idle") return;
    this.error = null;
    this.rebuildTo(this.initialIndex);
    this.state = this.projectedEvents.length === 0 ? "completed" : "ready";
    this.emit();
  }

  public play(): void {
    this.assertNotDisposed();
    if (this.state === "idle") this.start();
    if (this.state === "error") throw new MarketReplayLifecycleError("Market replay is in an error state; reset before playing");
    if (this.state !== "ready" && this.state !== "paused") return;
    if (this.currentIndex >= this.projectedEvents.length - 1) {
      this.state = "completed";
      this.emit();
      return;
    }
    this.state = "playing";
    this.emit();
    this.scheduleNext();
  }

  public pause(): void {
    this.assertNotDisposed();
    if (this.state !== "playing") return;
    this.clearTimer();
    this.state = "paused";
    this.emit();
  }

  public resume(): void {
    this.play();
  }

  public stop(): void {
    this.exit();
  }

  public exit(): void {
    this.assertNotDisposed();
    this.clearTimer();
    if (this.state === "idle") return;
    this.disposeRuntime();
    this.currentIndex = -1;
    this.state = "idle";
    this.error = null;
    this.emit();
  }

  public reset(): void {
    this.assertNotDisposed();
    this.clearTimer();
    this.error = null;
    this.rebuildTo(this.initialIndex);
    this.state = this.projectedEvents.length === 0 ? "completed" : "ready";
    this.emit();
  }

  public stepNextEvent(): void {
    this.assertActive();
    this.clearTimer();
    if (this.currentIndex >= this.projectedEvents.length - 1) {
      this.state = "completed";
      this.emit();
      return;
    }
    this.applyTo(this.currentIndex + 1);
    this.state = this.currentIndex >= this.projectedEvents.length - 1 ? "completed" : "paused";
    this.emit();
  }

  public stepPreviousEvent(): void {
    this.assertActive();
    this.clearTimer();
    const target = Math.max(this.initialIndex, this.currentIndex - 1);
    this.rebuildTo(target);
    this.state = "paused";
    this.emit();
  }

  public stepNextCompletedCandle(): void {
    this.assertActive();
    this.clearTimer();
    let target = this.currentIndex + 1;
    while (target < this.projectedEvents.length && this.projectedEvents[target]!.event.kind !== "candle-complete") target += 1;
    if (target >= this.projectedEvents.length) {
      this.currentIndex = this.projectedEvents.length - 1;
      this.rebuildTo(this.currentIndex);
      this.state = "completed";
    } else {
      this.rebuildTo(target);
      this.state = target >= this.projectedEvents.length - 1 ? "completed" : "paused";
    }
    this.emit();
  }

  public seekToTimestamp(timestamp: number): void {
    this.assertActive();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new MarketReplayValidationError("Replay timestamp must be a non-negative safe integer");
    const wasPlaying = this.state === "playing";
    this.clearTimer();
    const target = this.resolveTimestampIndex(timestamp);
    this.rebuildTo(target);
    this.state = target >= this.projectedEvents.length - 1 ? "paused" : "paused";
    this.emit();
    if (wasPlaying) this.play();
  }

  public replayToTimestamp(timestamp: number): void {
    this.seekToTimestamp(timestamp);
  }

  public seekToEvent(eventId: string): void {
    this.assertActive();
    const target = this.eventIndexById.get(eventId) ?? -1;
    if (target < 0) throw new MarketReplayValidationError(`Event ${eventId} is not eligible under ${this.clockPolicy} replay`);
    const wasPlaying = this.state === "playing";
    this.clearTimer();
    this.rebuildTo(target);
    this.state = "paused";
    this.emit();
    if (wasPlaying) this.play();
  }

  public setSpeed(speed: number): void {
    this.assertNotDisposed();
    this.speed = normalizeSpeed(speed);
    if (this.state === "playing") {
      this.clearTimer();
      this.scheduleNext();
    }
    this.emit();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.clearTimer();
    this.disposeRuntime();
    this.checkpoints.clear();
    this.retainedCheckpointBytes = 0;
    this.listeners.clear();
    this.state = "disposed";
    this.disposed = true;
    this.error = null;
  }

  private resolveTimestampIndex(timestamp: number): number {
    if (!this.clockOrderingUncertain) {
      let low = 0;
      let high = this.timestampProjection.length;
      while (low < high) {
        const middle = low + Math.floor((high - low) / 2);
        if (this.timestampProjection[middle]! <= timestamp) low = middle + 1;
        else high = middle;
      }
      return low - 1;
    }
    let result = -1;
    for (let index = 0; index < this.projectedEvents.length; index += 1) {
      const item = this.projectedEvents[index]!;
      if (item.clockTimestamp > timestamp) break;
      result = index;
    }
    return result;
  }

  private rebuildTo(target: number): void {
    if (target < -1 || target >= this.projectedEvents.length) throw new MarketReplayValidationError("Replay cursor is outside the eligible event range");
    if (target === this.currentIndex) return;
    if (target > this.currentIndex && this.currentIndex >= -1) {
      for (let index = this.currentIndex + 1; index <= target; index += 1) this.applyTo(index);
      return;
    }
    const checkpoint = [...this.checkpoints.values()]
      .filter((candidate) => candidate.eventIndex <= target)
      .sort((left, right) => right.eventIndex - left.eventIndex)[0];
    if (checkpoint !== undefined && this.restoreCheckpoint(checkpoint)) {
      this.currentIndex = checkpoint.eventIndex;
      for (let index = checkpoint.eventIndex + 1; index <= target; index += 1) this.applyTo(index);
      return;
    }
    this.disposeRuntime();
    this.runtime = createRuntime();
    this.currentIndex = -1;
    for (let index = 0; index <= target; index += 1) this.applyTo(index);
  }

  private applyTo(index: number): void {
    const projected = this.projectedEvents[index];
    if (projected === undefined) throw new MarketReplayValidationError(`Replay event ${index} does not exist`);
    this.applyEvent(projected.event);
    this.currentIndex = index;
    if ((index + 1) % this.checkpointInterval === 0) this.saveCheckpoint(index);
  }

  private applyEvent(event: MarketReplayEvent): void {
    const coverage = this.coverageFor(event);
    coverage.observedEvents += 1;
    switch (event.kind) {
      case "candle-open": this.applyCandleOpen(event as OpeningCandleEvent); break;
      case "candle-complete": this.applyCandleComplete(event as CompletedCandleEvent); break;
      case "trade": this.applyTrade(event); break;
      case "order-book-snapshot": this.applyBookSnapshot(event); break;
      case "order-book-delta": this.applyBookDelta(event); break;
      case "corporate-action-effective": this.applyCorporateAction(event, "effective"); break;
      case "corporate-action-payment": this.applyCorporateAction(event, "payment"); break;
      case "session-boundary": this.runtime.sessions.set(event.id, { eventId: event.id, instrumentId: event.instrumentId, sessionId: event.sessionId, calendarId: event.calendarId, calendarVersion: event.calendarVersion, boundary: event.boundary, time: event.time }); break;
      case "source-status": this.applySourceStatus(event); break;
    }
  }

  private applyCandleOpen(event: OpeningCandleEvent): void {
    const key = replayCandleIdentity({ ...event, time: event.candle.time });
    const previous = this.runtime.formingCandles.get(key);
    if (previous !== undefined && previous.revision > event.revision) return;
    this.runtime.formingCandles.set(key, { instrumentId: event.instrumentId, time: event.candle.time, open: event.candle.open, ...(event.intervalMs === undefined ? {} : { intervalMs: event.intervalMs }), status: event.finality, revision: event.revision });
  }

  private applyCandleComplete(event: CompletedCandleEvent): void {
    const key = replayCandleIdentity({ ...event, time: event.candle.time });
    const previous = this.runtime.completedCandles.get(key);
    if (previous !== undefined && previous.revision > event.revision) return;
    this.runtime.formingCandles.delete(key);
    this.runtime.completedCandles.set(key, { instrumentId: event.instrumentId, candle: { ...event.candle }, revision: event.revision });
  }

  private applyTrade(event: MarketReplayTradeEvent): void {
    const identity = marketTradeLogicalIdentity(event.trade);
    const previous = this.runtime.trades.get(identity);
    if (previous !== undefined && previous.revision >= event.trade.revision) return;
    if (previous !== undefined) this.removeTradeDerived(previous);
    const trade = cloneTrade(event.trade);
    this.runtime.trades.set(identity, trade);
    this.addTradeDerived(trade);
  }

  private addTradeDerived(trade: MarketTrade): void {
    const streamKey = replayStreamIdentity(trade);
    const cvd = this.runtime.cvd.get(streamKey) ?? {
      instrumentId: trade.instrumentId,
      ...(trade.venueId === undefined ? {} : { venueId: trade.venueId }),
      source: { ...trade.source },
      value: 0,
      knownVolume: 0,
      unknownVolume: 0,
    };
    if (trade.aggressorSide === "buy") {
      cvd.value += trade.quantity;
      cvd.knownVolume += trade.quantity;
    } else if (trade.aggressorSide === "sell") {
      cvd.value -= trade.quantity;
      cvd.knownVolume += trade.quantity;
    } else {
      cvd.unknownVolume += trade.quantity;
    }
    this.runtime.cvd.set(streamKey, cvd);
    const tickPrice = Number(trade.price.toPrecision(15));
    const key = replayFootprintIdentity({ instrumentId: trade.instrumentId, ...(trade.venueId === undefined ? {} : { venueId: trade.venueId }), source: trade.source, time: trade.time, price: tickPrice });
    const cell = this.runtime.footprint.get(key) ?? {
      instrumentId: trade.instrumentId,
      ...(trade.venueId === undefined ? {} : { venueId: trade.venueId }),
      source: { ...trade.source },
      time: trade.time,
      price: tickPrice,
      buyVolume: 0,
      sellVolume: 0,
      unknownVolume: 0,
    };
    if (trade.aggressorSide === "buy") cell.buyVolume += trade.quantity;
    else if (trade.aggressorSide === "sell") cell.sellVolume += trade.quantity;
    else cell.unknownVolume += trade.quantity;
    this.runtime.footprint.set(key, cell);
    if (this.runtime.footprint.size > this.maxFootprintCells) {
      const first = this.runtime.footprint.keys().next().value as string | undefined;
      if (first !== undefined) this.runtime.footprint.delete(first);
      this.runtime.notes.add(`Footprint cell budget ${this.maxFootprintCells} reached; oldest cells were bounded`);
    }
  }

  private removeTradeDerived(trade: MarketTrade): void {
    const streamKey = replayStreamIdentity(trade);
    const cvd = this.runtime.cvd.get(streamKey);
    if (cvd !== undefined) {
      if (trade.aggressorSide === "buy") { cvd.value -= trade.quantity; cvd.knownVolume -= trade.quantity; }
      else if (trade.aggressorSide === "sell") { cvd.value += trade.quantity; cvd.knownVolume -= trade.quantity; }
      else cvd.unknownVolume -= trade.quantity;
      this.runtime.cvd.set(streamKey, cvd);
    }
    const key = replayFootprintIdentity({ instrumentId: trade.instrumentId, ...(trade.venueId === undefined ? {} : { venueId: trade.venueId }), source: trade.source, time: trade.time, price: Number(trade.price.toPrecision(15)) });
    const cell = this.runtime.footprint.get(key);
    if (cell === undefined) return;
    if (trade.aggressorSide === "buy") cell.buyVolume -= trade.quantity;
    else if (trade.aggressorSide === "sell") cell.sellVolume -= trade.quantity;
    else cell.unknownVolume -= trade.quantity;
    if (Math.abs(cell.buyVolume) < Number.EPSILON && Math.abs(cell.sellVolume) < Number.EPSILON && Math.abs(cell.unknownVolume) < Number.EPSILON) this.runtime.footprint.delete(key);
  }

  private applyBookSnapshot(event: MarketReplayOrderBookSnapshotEvent): void {
    const key = bookKey(event.snapshot.instrumentId, event.snapshot.venueId, event.snapshot.source.id, event.snapshot.source.version);
    const controller = this.getBookController(key, event.snapshot.instrumentId, event.snapshot.venueId);
    const result = controller.applySnapshot(cloneBookSnapshot(event.snapshot));
    if (result.kind === "rejected") this.runtime.rejectedEventIds.add(event.id);
    if (result.status === "stale" || result.status === "recovering") this.runtime.staleOrderBooks.add(key);
    else this.runtime.staleOrderBooks.delete(key);
  }

  private applyBookDelta(event: MarketReplayOrderBookDeltaEvent): void {
    const key = bookKey(event.delta.instrumentId, event.delta.venueId, event.delta.source.id, event.delta.source.version);
    const controller = this.getBookController(key, event.delta.instrumentId, event.delta.venueId);
    const result = controller.applyDelta(cloneBookDelta(event.delta));
    if (result.reason?.includes("sequence gap") === true) this.runtime.sequenceGaps.add(key);
    if (result.status === "stale" || result.status === "recovering") this.runtime.staleOrderBooks.add(key);
    else if (result.status === "live") this.runtime.staleOrderBooks.delete(key);
    if (result.kind === "rejected") this.runtime.rejectedEventIds.add(event.id);
  }

  private getBookController(key: string, instrumentId: string, venueId: string | undefined): OrderBookController {
    const existing = this.runtime.books.get(key);
    if (existing !== undefined) return existing;
    const controller = new OrderBookController({ instrumentId, ...(venueId === undefined ? {} : { venueId }), maxDepth: this.maxDepth, maxHistory: 100_000 });
    this.runtime.books.set(key, controller);
    return controller;
  }

  private applyCorporateAction(event: Extract<MarketReplayEvent, { readonly kind: "corporate-action-effective" | "corporate-action-payment" }>, phase: "effective" | "payment"): void {
    const target = phase === "effective" ? this.runtime.effectiveActions : this.runtime.paymentActions;
    const identity = corporateActionLogicalIdentity(event.action);
    const previous = target.get(identity);
    if (previous !== undefined && previous.revision >= event.action.revision) return;
    target.set(identity, { action: cloneAction(event.action), revision: event.action.revision });
  }

  private applySourceStatus(event: MarketReplaySourceStatusEvent): void {
    const coverage = this.coverageFor(event);
    coverage.status = event.status;
    coverage.coverage = event.coverage;
    if (event.note !== undefined) coverage.note = event.note;
  }

  private coverageFor(event: MarketReplayEvent): MutableCoverage {
    const key = replayStreamIdentity(event);
    const existing = this.runtime.coverage.get(key);
    if (existing !== undefined) return existing;
    const coverage: MutableCoverage = { source: { id: event.source.id, version: event.source.version }, instrumentId: event.instrumentId, status: "not-reported", coverage: "not-reported", observedEvents: 0 };
    this.runtime.coverage.set(key, coverage);
    return coverage;
  }

  private saveCheckpoint(eventIndex: number): void {
    if (estimateRuntimeStateBytes(this.runtime, this.maxDepth) > this.checkpointMemoryBudgetBytes) {
      this.runtime.notes.add(`Checkpoint retention budget ${this.checkpointMemoryBudgetBytes} bytes reached; larger checkpoints use full reconstruction fallback`);
      return;
    }
    const checkpointWithoutSize: Omit<RuntimeCheckpoint, "estimatedBytes"> = {
      eventIndex,
      eventId: this.projectedEvents[eventIndex]?.event.id ?? null,
      timestamp: this.projectedEvents[eventIndex]?.clockTimestamp ?? null,
      tapeVersion: this.tape.version,
      datasetFingerprint: this.tape.fingerprint,
      clockPolicy: this.clockPolicy,
      knowledgePolicy: this.knowledgePolicy,
      orderingVersion: this.tape.ordering.version,
      completedCandles: [...this.runtime.completedCandles.entries()].map(([key, value]) => [key, { instrumentId: value.instrumentId, candle: { ...value.candle }, revision: value.revision }]),
      formingCandles: [...this.runtime.formingCandles.entries()].map(([key, value]) => [key, { ...value }]),
      trades: [...this.runtime.trades.entries()].map(([key, value]) => [key, cloneTrade(value)]),
      cvd: [...this.runtime.cvd.entries()].map(([key, value]) => [key, { ...value }]),
      footprint: [...this.runtime.footprint.entries()].map(([key, value]) => [key, { ...value }]),
      books: [...this.runtime.books.entries()].map(([key, value]) => [key, cloneOrderBookState(value.getState(this.maxDepth))]),
      effectiveActions: [...this.runtime.effectiveActions.entries()].map(([key, value]) => [key, { action: cloneAction(value.action), revision: value.revision }]),
      paymentActions: [...this.runtime.paymentActions.entries()].map(([key, value]) => [key, { action: cloneAction(value.action), revision: value.revision }]),
      sessions: [...this.runtime.sessions.entries()].map(([key, value]) => [key, { ...value }]),
      coverage: [...this.runtime.coverage.entries()].map(([key, value]) => [key, { ...value }]),
      sequenceGaps: [...this.runtime.sequenceGaps],
      staleOrderBooks: [...this.runtime.staleOrderBooks],
      rejectedEventIds: [...this.runtime.rejectedEventIds],
      notes: [...this.runtime.notes],
    };
    const estimatedBytes = estimateRetainedBytes(checkpointWithoutSize);
    if (estimatedBytes > this.checkpointMemoryBudgetBytes) {
      this.runtime.notes.add(`Checkpoint at event ${eventIndex} exceeded the ${this.checkpointMemoryBudgetBytes}-byte retained budget and was not stored`);
      return;
    }
    const checkpoint: RuntimeCheckpoint = { ...checkpointWithoutSize, estimatedBytes };
    const previous = this.checkpoints.get(eventIndex);
    if (previous !== undefined) this.retainedCheckpointBytes -= previous.estimatedBytes;
    this.checkpoints.set(eventIndex, checkpoint);
    this.retainedCheckpointBytes += estimatedBytes;
    while (this.checkpoints.size > this.maxCheckpoints || this.retainedCheckpointBytes > this.checkpointMemoryBudgetBytes) {
      const oldest = [...this.checkpoints.keys()].sort((left, right) => left - right)[0];
      if (oldest === undefined) break;
      const removed = this.checkpoints.get(oldest);
      this.checkpoints.delete(oldest);
      this.retainedCheckpointBytes -= removed?.estimatedBytes ?? 0;
      this.checkpointEvictions += 1;
    }
  }

  private restoreCheckpoint(checkpoint: RuntimeCheckpoint): boolean {
    if (checkpoint.eventIndex >= this.projectedEvents.length) return false;
    if (checkpoint.tapeVersion !== this.tape.version
      || checkpoint.datasetFingerprint !== this.tape.fingerprint
      || checkpoint.clockPolicy !== this.clockPolicy
      || checkpoint.knowledgePolicy !== this.knowledgePolicy
      || checkpoint.orderingVersion !== this.tape.ordering.version) return false;
    if (checkpoint.books.some(([, state]) => state.status !== "live" && state.status !== "uninitialized")) return false;
    this.disposeRuntime();
    const runtime = createRuntime();
    runtime.completedCandles = new Map(checkpoint.completedCandles.map(([key, value]) => [key, { instrumentId: value.instrumentId, candle: { ...value.candle }, revision: value.revision }]));
    runtime.formingCandles = new Map(checkpoint.formingCandles.map(([key, value]) => [key, { ...value }]));
    runtime.trades = new Map(checkpoint.trades.map(([key, value]) => [key, cloneTrade(value)] as const));
    runtime.cvd = new Map(checkpoint.cvd.map(([key, value]) => [key, { ...value }]));
    runtime.footprint = new Map(checkpoint.footprint.map(([key, value]) => [key, { ...value }]));
    runtime.effectiveActions = new Map(checkpoint.effectiveActions.map(([key, value]) => [key, { action: cloneAction(value.action), revision: value.revision }]));
    runtime.paymentActions = new Map(checkpoint.paymentActions.map(([key, value]) => [key, { action: cloneAction(value.action), revision: value.revision }]));
    runtime.sessions = new Map(checkpoint.sessions.map(([key, value]) => [key, { ...value }]));
    runtime.coverage = new Map(checkpoint.coverage.map(([key, value]) => [key, { ...value }]));
    runtime.sequenceGaps = new Set(checkpoint.sequenceGaps);
    runtime.staleOrderBooks = new Set(checkpoint.staleOrderBooks);
    runtime.rejectedEventIds = new Set(checkpoint.rejectedEventIds);
    runtime.notes = new Set(checkpoint.notes);
    for (const [key, state] of checkpoint.books) {
      if (state.source === null || state.instrumentId === null) return false;
      const controller = new OrderBookController({ instrumentId: state.instrumentId, ...(state.venueId === null ? {} : { venueId: state.venueId }), maxDepth: this.maxDepth, maxHistory: 100_000 });
      const snapshot: OrderBookSnapshot = {
        version: 1,
        instrumentId: state.instrumentId,
        ...(state.venueId === null ? {} : { venueId: state.venueId }),
        time: state.lastEventTime ?? 0,
        ...(state.lastSequence === null ? {} : { sequence: state.lastSequence }),
        bids: state.bids.map((level) => ({ ...level })),
        asks: state.asks.map((level) => ({ ...level })),
        ...(state.tickSize === null ? {} : { tickSize: state.tickSize }),
        source: { ...state.source },
      };
      const result = controller.applySnapshot(snapshot);
      if (result.kind === "rejected") return false;
      runtime.books.set(key, controller);
    }
    this.runtime = runtime;
    return true;
  }

  private getCoverage(instrumentId?: string): readonly MarketReplaySourceCoverageState[] {
    return [...this.runtime.coverage.values()]
      .filter((value) => instrumentId === undefined || value.instrumentId === instrumentId)
      .sort((left, right) => left.source.id.localeCompare(right.source.id) || left.source.version.localeCompare(right.source.version) || left.instrumentId.localeCompare(right.instrumentId))
      .map((value) => ({ ...value, source: { ...value.source } }));
  }

  private getIntegrity(): MarketReplayIntegrityState {
    const unknownReceiveTime = this.clockPolicy === "receive-time" && this.tape.events.some((event) => event.receiveTime === undefined);
    const notes = new Set(this.runtime.notes);
    if (this.clockOrderingUncertain) notes.add("Sequenced source ordering is not monotonic in the selected clock; timestamp seeks use a conservative eligible prefix.");
    const complete = !unknownReceiveTime && !this.clockOrderingUncertain && this.runtime.sequenceGaps.size === 0 && this.runtime.staleOrderBooks.size === 0 && this.runtime.rejectedEventIds.size === 0 && [...this.runtime.coverage.values()].every((coverage) => coverage.coverage === "complete" || coverage.coverage === "not-reported");
    return {
      complete,
      unknownReceiveTime,
      sequenceGaps: [...this.runtime.sequenceGaps].sort(),
      staleOrderBooks: [...this.runtime.staleOrderBooks].sort(),
      rejectedEventIds: [...this.runtime.rejectedEventIds].sort(),
      notes: [...notes].sort(),
    };
  }

  private scheduleNext(): void {
    this.clearTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      if (this.state !== "playing") return;
      try {
        if (this.currentIndex >= this.projectedEvents.length - 1) {
          this.state = "completed";
          this.emit();
          return;
        }
        this.applyTo(this.currentIndex + 1);
        this.state = this.currentIndex >= this.projectedEvents.length - 1 ? "completed" : "playing";
        this.emit();
        if (this.state === "playing") this.scheduleNext();
      } catch (error) {
        this.error = error instanceof Error ? error : new Error(String(error));
        this.state = "error";
        this.clearTimer();
        this.emit();
      }
    }, 1000 / this.speed);
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of [...this.listeners]) listener(state);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }

  private disposeRuntime(): void {
    for (const controller of this.runtime.books.values()) controller.dispose();
    this.runtime = createRuntime();
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new MarketReplayLifecycleError("Market replay controller has been disposed");
  }

  private assertActive(): void {
    this.assertNotDisposed();
    if (this.state === "idle") throw new MarketReplayLifecycleError("Market replay has not started");
    if (this.state === "error") throw new MarketReplayLifecycleError("Market replay is in an error state");
  }
}

function projectEvents(tape: MarketReplayTape, policy: MarketReplayClockPolicy): readonly ProjectedEvent[] {
  const projected = tape.events.flatMap((event, tapeIndex) => {
    const clockTimestamp = replayEventClock(event, policy);
    return clockTimestamp === null ? [] : [{ event, tapeIndex, clockTimestamp }];
  });
  return projected.sort((left, right) => {
    const leftStream = streamKey(left.event);
    const rightStream = streamKey(right.event);
    const leftSequence = sequenceStart(left.event);
    const rightSequence = sequenceStart(right.event);
    if (leftStream === rightStream && leftSequence !== null && rightSequence !== null && leftSequence !== rightSequence) return leftSequence - rightSequence;
    return left.clockTimestamp - right.clockTimestamp
      || left.event.instrumentId.localeCompare(right.event.instrumentId)
      || left.event.source.id.localeCompare(right.event.source.id)
      || left.event.kind.localeCompare(right.event.kind)
      || (leftSequence ?? Number.MAX_SAFE_INTEGER) - (rightSequence ?? Number.MAX_SAFE_INTEGER)
      || left.event.id.localeCompare(right.event.id)
      || left.tapeIndex - right.tapeIndex;
  });
}

function hasClockRegression(events: readonly ProjectedEvent[]): boolean {
  for (let index = 1; index < events.length; index += 1) {
    if (events[index]!.clockTimestamp < events[index - 1]!.clockTimestamp) return true;
  }
  return false;
}

function streamKey(event: MarketReplayEvent): string {
  return replayStreamIdentity(event);
}

function sequenceStart(event: MarketReplayEvent): number | null {
  if (event.sequence === undefined) return null;
  return typeof event.sequence === "number" ? event.sequence : event.sequence.from;
}

function createRuntime(): MutableRuntime {
  return {
    completedCandles: new Map(),
    formingCandles: new Map(),
    trades: new Map(),
    cvd: new Map(),
    footprint: new Map(),
    books: new Map(),
    effectiveActions: new Map(),
    paymentActions: new Map(),
    sessions: new Map(),
    coverage: new Map(),
    sequenceGaps: new Set(),
    staleOrderBooks: new Set(),
    rejectedEventIds: new Set(),
    notes: new Set(),
  };
}

function summarizeTrades(trades: Iterable<MarketTrade>): readonly MarketReplayTradeSummary[] {
  const summary = new Map<string, MarketReplayTradeSummary>();
  for (const trade of trades) {
    const previous = summary.get(trade.instrumentId) ?? { instrumentId: trade.instrumentId, tradeCount: 0, totalVolume: 0, knownSideVolume: 0, unknownSideVolume: 0, buyVolume: 0, sellVolume: 0 };
    const next = { ...previous, tradeCount: previous.tradeCount + 1, totalVolume: previous.totalVolume + trade.quantity };
    if (trade.aggressorSide === "buy") { next.knownSideVolume += trade.quantity; next.buyVolume += trade.quantity; }
    else if (trade.aggressorSide === "sell") { next.knownSideVolume += trade.quantity; next.sellVolume += trade.quantity; }
    else next.unknownSideVolume += trade.quantity;
    summary.set(trade.instrumentId, next);
  }
  return [...summary.values()].sort((left, right) => left.instrumentId.localeCompare(right.instrumentId));
}

function compareTrades(left: MarketTrade, right: MarketTrade): number {
  return left.time - right.time || (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) || left.id.localeCompare(right.id) || left.revision - right.revision;
}

function compareActionValues(left: { action: CorporateAction }, right: { action: CorporateAction }): number {
  return left.action.effectiveTime - right.action.effectiveTime || left.action.id.localeCompare(right.action.id) || left.action.revision - right.action.revision;
}

function bookKey(instrumentId: string, venueId: string | undefined, sourceId: string, sourceVersion: string): string {
  return replayStreamIdentity({ instrumentId, ...(venueId === undefined ? {} : { venueId }), source: { id: sourceId, version: sourceVersion } });
}

function cloneTrade(trade: MarketTrade): MarketTrade {
  return { ...trade, source: { ...trade.source } };
}

function cloneAction(action: CorporateAction): CorporateAction {
  return { ...action, source: { ...action.source } };
}

function cloneOrderBookState(state: OrderBookState): OrderBookState {
  return {
    ...state,
    source: state.source === null ? null : { ...state.source },
    bids: state.bids.map((level) => ({ ...level })),
    asks: state.asks.map((level) => ({ ...level })),
  };
}

function cloneBookSnapshot(snapshot: OrderBookSnapshot): OrderBookSnapshot {
  return {
    ...snapshot,
    ...(snapshot.sequence === undefined ? {} : { sequence: typeof snapshot.sequence === "number" ? snapshot.sequence : { ...snapshot.sequence } }),
    bids: snapshot.bids.map((level) => ({ ...level })),
    asks: snapshot.asks.map((level) => ({ ...level })),
    source: { ...snapshot.source },
  };
}

function cloneBookDelta(delta: OrderBookDelta): OrderBookDelta {
  return {
    ...delta,
    ...(delta.sequence === undefined ? {} : { sequence: typeof delta.sequence === "number" ? delta.sequence : { ...delta.sequence } }),
    bids: delta.bids.map((level) => ({ ...level })),
    asks: delta.asks.map((level) => ({ ...level })),
    source: { ...delta.source },
  };
}

function cloneEventForPublic(event: MarketReplayEvent): MarketReplayEvent {
  if (event.kind === "candle-open" || event.kind === "candle-complete") return { ...event, candle: { ...event.candle }, source: { ...event.source }, ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }) };
  if (event.kind === "trade") return { ...event, trade: cloneTrade(event.trade), source: { ...event.source }, ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }) };
  if (event.kind === "order-book-snapshot") return { ...event, snapshot: cloneBookSnapshot(event.snapshot), source: { ...event.source }, ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }) };
  if (event.kind === "order-book-delta") return { ...event, delta: cloneBookDelta(event.delta), source: { ...event.source }, ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }) };
  if (event.kind === "corporate-action-effective" || event.kind === "corporate-action-payment") return { ...event, action: cloneAction(event.action), source: { ...event.source }, ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }) };
  return { ...event, source: { ...event.source }, ...(event.sequence === undefined ? {} : { sequence: typeof event.sequence === "number" ? event.sequence : { ...event.sequence } }) };
}

function snapshotFromCheckpoint(checkpoint: RuntimeCheckpoint, tape: MarketReplayTape, clockPolicy: MarketReplayClockPolicy, knowledgePolicy: MarketReplayKnowledgePolicy): MarketReplaySnapshot {
  const current = tape.events.find((event) => event.id === checkpoint.eventId);
  return {
    cursor: { eventIndex: checkpoint.eventIndex, eventId: checkpoint.eventId, timestamp: current?.time ?? null, clockTimestamp: checkpoint.timestamp },
    state: "paused",
    speed: 1,
    clockPolicy,
    knowledgePolicy,
    completedCandles: checkpoint.completedCandles.map(([, value]) => ({ instrumentId: value.instrumentId, ...value.candle })),
    formingCandles: checkpoint.formingCandles.map(([, value]) => ({ instrumentId: value.instrumentId, time: value.time, open: value.open, ...(value.intervalMs === undefined ? {} : { intervalMs: value.intervalMs }), status: value.status })),
    trades: checkpoint.trades.map(([, value]) => cloneTrade(value)),
    tradeMaterialization: {
      complete: true,
      totalEligibleTrades: checkpoint.trades.length,
      materializedTrades: checkpoint.trades.length,
      limit: checkpoint.trades.length,
    },
    tradeSummary: summarizeTrades(checkpoint.trades.map(([, value]) => value)),
    cvd: checkpoint.cvd.map(([, value]) => ({ ...value, source: { ...value.source } })),
    footprint: checkpoint.footprint.map(([, value]) => ({ ...value, source: { ...value.source } })),
    orderBooks: checkpoint.books.map(([key, state]) => ({ key, state: cloneOrderBookState(state) })),
    effectiveCorporateActions: checkpoint.effectiveActions.map(([, value]) => cloneAction(value.action)),
    paymentCorporateActions: checkpoint.paymentActions.map(([, value]) => cloneAction(value.action)),
    sessions: checkpoint.sessions.map(([, value]) => ({ ...value })),
    sourceCoverage: checkpoint.coverage.map(([, value]) => ({ ...value, source: { ...value.source } })),
    integrity: { complete: checkpoint.sequenceGaps.length === 0 && checkpoint.staleOrderBooks.length === 0 && checkpoint.rejectedEventIds.length === 0, unknownReceiveTime: clockPolicy === "receive-time" && tape.events.some((event) => event.receiveTime === undefined), sequenceGaps: [...checkpoint.sequenceGaps], staleOrderBooks: [...checkpoint.staleOrderBooks], rejectedEventIds: [...checkpoint.rejectedEventIds], notes: [...checkpoint.notes] },
  };
}

function checkpointId(tape: MarketReplayTape, eventIndex: number, clockPolicy: MarketReplayClockPolicy, knowledgePolicy: MarketReplayKnowledgePolicy): string {
  return `${tape.fingerprint}:${tape.ordering.version}:${clockPolicy}:${knowledgePolicy}:${eventIndex}`;
}

function normalizeSpeed(value: number): number {
  if (!Number.isFinite(value) || value < MIN_SPEED || value > MAX_SPEED) throw new MarketReplayValidationError(`Replay speed must be between ${MIN_SPEED} and ${MAX_SPEED}`);
  return value;
}

function positiveLimit(value: number | undefined, fallback: number, maximum: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new MarketReplayValidationError(`${label} must be between 1 and ${maximum}`);
  return value;
}

function requireSnapshotInstrument(value: string): string {
  if (value.trim().length === 0) throw new MarketReplayValidationError("Snapshot instrumentId must be a non-empty string");
  return value;
}

function estimateRetainedBytes(value: unknown): number {
  if (value === null || value === undefined) return 8;
  if (typeof value === "string") return 16 + value.length * 2;
  if (typeof value === "number" || typeof value === "boolean") return 8;
  if (Array.isArray(value)) return 24 + value.reduce((sum, item) => sum + estimateRetainedBytes(item), 0);
  if (typeof value === "object") {
    return 32 + Object.entries(value as Record<string, unknown>).reduce((sum, [key, item]) => sum + estimateRetainedBytes(key) + estimateRetainedBytes(item), 0);
  }
  return 16;
}

function estimateRuntimeStateBytes(runtime: MutableRuntime, maxDepth: number): number {
  // This conservative preflight prevents an over-budget checkpoint from
  // allocating a full deep copy just to reject it a moment later. The final
  // retained value still uses estimateRetainedBytes on the copied checkpoint.
  return 64 * 1024
    + runtime.completedCandles.size * 320
    + runtime.formingCandles.size * 240
    + runtime.trades.size * 4_096
    + runtime.cvd.size * 192
    + runtime.footprint.size * 256
    + runtime.books.size * (2_048 + maxDepth * 96)
    + (runtime.effectiveActions.size + runtime.paymentActions.size) * 512
    + runtime.sessions.size * 256
    + runtime.coverage.size * 320
    + (runtime.sequenceGaps.size + runtime.staleOrderBooks.size + runtime.rejectedEventIds.size + runtime.notes.size) * 96;
}

const defaultScheduler: ReplayScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};
