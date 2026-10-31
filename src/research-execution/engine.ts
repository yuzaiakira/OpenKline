import { applyAdverseSlippage, calculateLongGrossPnl, calculateTransactionCost } from "../financial.js";
import type { CorporateAction, CashDividendAction, StockSplitAction } from "../corporate-actions.js";
import { OrderBookController, type OrderBookState } from "../order-book.js";
import { marketTradeLogicalIdentity, type MarketTrade } from "../market-trades.js";
import { corporateActionLogicalIdentity } from "../replay/market-replay-identity.js";
import {
  replayEventClock,
  type MarketReplayEvent,
  type MarketReplayOrderBookDeltaEvent,
  type MarketReplayOrderBookSnapshotEvent,
  type MarketReplaySource,
} from "../replay/market-event-tape.js";
import { MarketReplayController, type MarketReplayControllerOptions, type MarketReplayState } from "../replay/market-replay-controller.js";
import type {
  ResearchDecisionRecord,
  ResearchCancelDecision,
  ResearchDiagnostics,
  ResearchExecutionOptions,
  ResearchExecutionPolicy,
  ResearchExecutionSession,
  ResearchFill,
  ResearchJsonValue,
  ResearchLatencyPolicy,
  ResearchLedgerSnapshot,
  ResearchLiquidityQuality,
  ResearchOrder,
  ResearchOrderRequest,
  ResearchOrderSide,
  ResearchOrderStatus,
  ResearchPositionSnapshot,
  ResearchPrecisionPolicy,
  ResearchRiskLimits,
  ResearchScenarioArtifact,
  ResearchScenarioArtifactCreateOptions,
  ResearchScenarioExport,
  ResearchScenarioFrontier,
  ResearchSessionState,
  ResearchJournalRetention,
  ResearchSubmitDecision,
  ResearchSnapshot,
  ResearchSourceQuality,
} from "./types.js";
import { OPENKLINE_RESEARCH_EXECUTION_VERSION } from "./types.js";
import { createResearchScenarioArtifact } from "./scenario-artifact.js";

const EPSILON = 1e-10;
const DEFAULT_MAX_QUOTE_AGE_MS = 60_000;
const DEFAULT_MAX_JOURNAL_ENTRIES = 25_000;
const DEFAULT_MAX_DEPTH = 100;

export class ResearchExecutionValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ResearchExecutionValidationError";
  }
}

export class ResearchExecutionLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ResearchExecutionLifecycleError";
  }
}

export class ResearchExecutionOrderError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ResearchExecutionOrderError";
  }
}

interface InternalOptions {
  readonly scenarioId: string;
  readonly tape: ResearchExecutionOptions["tape"];
  readonly instrumentId: string;
  readonly venueId: string | null;
  readonly initialCapital: number;
  readonly currency: string;
  readonly clockPolicy: NonNullable<ResearchExecutionOptions["clockPolicy"]>;
  readonly knowledgePolicy: NonNullable<ResearchExecutionOptions["knowledgePolicy"]>;
  readonly latency: ResearchLatencyPolicy;
  readonly execution: ResearchExecutionPolicy;
  readonly precision: ResearchPrecisionPolicy;
  readonly commission: ResearchExecutionOptions["commission"];
  readonly slippage: ResearchExecutionOptions["slippage"];
  readonly priceImpact: NonNullable<ResearchExecutionOptions["priceImpact"]> | null;
  readonly maxQuoteAgeMs: number;
  readonly risk: ResearchRiskLimits;
  readonly corporateActionSource: MarketReplaySource | null;
  readonly maxJournalEntries: number;
  readonly maxDepth: number;
}

interface MutablePosition {
  quantity: number;
  costBasis: number;
  openEntryFees: number;
  averageEntryPrice: number;
  markPrice: number | null;
  markTime: number | null;
}

interface MutableLedger {
  cash: number;
  reservedCash: number;
  reservedPositionQuantity: number;
  position: MutablePosition | null;
  realizedPnl: number;
  totalFees: number;
  highWaterMark: number;
}

interface MutableOrder {
  id: string;
  idempotencyKey: string;
  scenarioId: string;
  instrumentId: string;
  venueId?: string;
  side: ResearchOrderSide;
  type: ResearchOrderRequest["type"];
  requestedQuantity: number;
  remainingQuantity: number;
  simulatedQuantity: number;
  weightedAverageExecutionPrice: number | null;
  cumulativeFees: number;
  reservedCash: number;
  status: ResearchOrderStatus;
  submittedAt: number;
  decisionEventId: string;
  decisionCursor: number;
  eligibleClockTime: number | null;
  fills: string[];
  reason?: string;
  limitPrice?: number;
}

interface MutableBook {
  readonly key: string;
  readonly instrumentId: string;
  readonly venueId: string | null;
  readonly source: MarketReplaySource;
  readonly controller: OrderBookController;
  lastEventId: string | null;
  lastSynchronizedClock: number | null;
  consumedEventId: string | null;
  consumedBidQuantity: number;
  consumedAskQuantity: number;
  observedEventCount: number;
}

interface SourceStatusObservation {
  readonly status: "available" | "partial" | "stale" | "unavailable";
  readonly coverage: "complete" | "partial" | "unknown" | "unavailable";
  readonly eventId: string;
}

interface DividendEntitlement {
  quantity: number;
  readonly action: CashDividendAction;
}

interface SessionObservation {
  readonly sessionId: string;
  readonly boundary: "open" | "close" | "break-start" | "break-end";
  readonly eventId: string;
  readonly time: number;
}

interface BookCandidate {
  readonly book: MutableBook;
  readonly state: OrderBookState;
}

interface FillAttempt {
  readonly price: number;
  readonly quantity: number;
  readonly quality: ResearchLiquidityQuality;
  readonly referenceEventIds: readonly string[];
  readonly scenarioBias: ResearchFill["scenarioBias"];
  readonly book: MutableBook | null;
  readonly bookEventId: string | null;
}

function normalizeOptions(options: ResearchExecutionOptions): InternalOptions {
  if (!options || typeof options !== "object") throw new ResearchExecutionValidationError("Research execution options are required");
  const instrumentId = nonEmpty(options.instrumentId, "instrumentId");
  const currency = nonEmpty(options.currency, "currency");
  const initialCapital = finiteNonNegative(options.initialCapital, "initialCapital");
  const precisionInput = options.precision ?? {};
  const precision: ResearchPrecisionPolicy = {
    ...(precisionInput.tickSize === undefined ? {} : { tickSize: positiveFinite(precisionInput.tickSize, "tickSize") }),
    ...(precisionInput.quantityStep === undefined ? {} : { quantityStep: positiveFinite(precisionInput.quantityStep, "quantityStep") }),
    ...(precisionInput.minimumQuantity === undefined ? {} : { minimumQuantity: positiveFinite(precisionInput.minimumQuantity, "minimumQuantity") }),
    tickPolicy: precisionInput.tickPolicy ?? "reject",
    quantityPolicy: precisionInput.quantityPolicy ?? "reject",
  };
  if (precision.tickPolicy !== "reject" && precision.tickPolicy !== "round") throw new ResearchExecutionValidationError("Unsupported tick policy");
  if (precision.quantityPolicy !== "reject" && precision.quantityPolicy !== "round") throw new ResearchExecutionValidationError("Unsupported quantity policy");
  const latency = normalizeLatency(options.latency ?? { type: "zero" });
  const execution = normalizeExecution(options.execution ?? {
    maxParticipationRate: 1,
    allowPartialFills: true,
    passivePolicy: "no-inferred-passive-fill",
  });
  const maxQuoteAgeMs = options.maxQuoteAgeMs === undefined ? DEFAULT_MAX_QUOTE_AGE_MS : finiteNonNegative(options.maxQuoteAgeMs, "maxQuoteAgeMs");
  const maxJournalEntries = options.maxJournalEntries === undefined ? DEFAULT_MAX_JOURNAL_ENTRIES : positiveInteger(options.maxJournalEntries, "maxJournalEntries");
  const maxDepth = options.maxDepth === undefined ? DEFAULT_MAX_DEPTH : positiveInteger(options.maxDepth, "maxDepth");
  const corporateActionSource = options.corporateActionSource === undefined ? null : cloneSource(options.corporateActionSource);
  validateCorporateActionSources(options.tape.events, corporateActionSource);
  validateCost(options.commission, "commission");
  validateCost(options.slippage, "slippage");
  if (options.priceImpact !== undefined) validateCost(options.priceImpact, "priceImpact");
  const scenarioId = options.scenarioId === undefined
    ? `research-${options.tape.fingerprint}-${stableHash(JSON.stringify([instrumentId, options.venueId ?? null, initialCapital, currency]))}`
    : nonEmpty(options.scenarioId, "scenarioId");
  return {
    scenarioId,
    tape: options.tape,
    instrumentId,
    venueId: options.venueId === undefined ? null : nonEmpty(options.venueId, "venueId"),
    initialCapital,
    currency,
    clockPolicy: options.clockPolicy ?? "event-time",
    knowledgePolicy: options.knowledgePolicy ?? "strict-causal",
    latency,
    execution,
    precision,
    commission: { ...options.commission },
    slippage: { ...options.slippage },
    priceImpact: options.priceImpact === undefined ? null : { ...options.priceImpact },
    maxQuoteAgeMs,
    risk: normalizeRisk(options.risk),
    corporateActionSource,
    maxJournalEntries,
    maxDepth,
  };
}

function normalizeLatency(value: ResearchLatencyPolicy): ResearchLatencyPolicy {
  if (value.type === "zero") return { type: "zero" };
  if (value.type === "fixed") return { type: "fixed", delayMs: finiteNonNegative(value.delayMs, "latency.delayMs") };
  if (value.type !== "bounded" || value.delaysMs.length === 0) throw new ResearchExecutionValidationError("Bounded latency requires at least one delay");
  const delaysMs = value.delaysMs.map((delay, index) => finiteNonNegative(delay, `latency.delaysMs[${index}]`));
  return { type: "bounded", delaysMs };
}

function normalizeExecution(value: ResearchExecutionPolicy): ResearchExecutionPolicy {
  if (!Number.isFinite(value.maxParticipationRate) || value.maxParticipationRate <= 0 || value.maxParticipationRate > 1) throw new ResearchExecutionValidationError("maxParticipationRate must be in (0, 1]");
  if (value.passivePolicy !== "no-inferred-passive-fill" && value.passivePolicy !== "conservative-eligibility" && value.passivePolicy !== "explicit-scenario") throw new ResearchExecutionValidationError("Unsupported passive execution policy");
  if (value.scenarioBias !== undefined && value.scenarioBias !== "optimistic" && value.scenarioBias !== "conservative") throw new ResearchExecutionValidationError("Unsupported passive scenario bias");
  return { ...value };
}

function normalizeRisk(value: ResearchRiskLimits | undefined): ResearchRiskLimits {
  if (value === undefined) return {};
  const result: ResearchRiskLimits = {
    ...(value.maxOrderNotional === undefined ? {} : { maxOrderNotional: finiteNonNegative(value.maxOrderNotional, "maxOrderNotional") }),
    ...(value.maxOrderQuantity === undefined ? {} : { maxOrderQuantity: positiveFinite(value.maxOrderQuantity, "maxOrderQuantity") }),
    ...(value.maxPositionQuantity === undefined ? {} : { maxPositionQuantity: positiveFinite(value.maxPositionQuantity, "maxPositionQuantity") }),
    ...(value.maxPendingOrders === undefined ? {} : { maxPendingOrders: positiveInteger(value.maxPendingOrders, "maxPendingOrders") }),
    ...(value.maxDrawdown === undefined ? {} : { maxDrawdown: finiteNonNegative(value.maxDrawdown, "maxDrawdown") }),
  };
  return result;
}

function validateCost(value: { readonly type: "percent" | "fixed"; readonly value: number }, label: string): void {
  if ((value.type !== "percent" && value.type !== "fixed") || !Number.isFinite(value.value) || value.value < 0 || (value.type === "percent" && value.value >= 1)) throw new ResearchExecutionValidationError(`${label} is invalid`);
}

function nonEmpty(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new ResearchExecutionValidationError(`${label} must be non-empty`);
  return value.trim();
}

function finiteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) throw new ResearchExecutionValidationError(`${label} must be finite and non-negative`);
  return value;
}

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new ResearchExecutionValidationError(`${label} must be finite and positive`);
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ResearchExecutionValidationError(`${label} must be a positive safe integer`);
  return value;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sourceKey(source: MarketReplaySource): string {
  return `${source.id}\u0000${source.version}`;
}

function corporateActionEconomicKey(action: CorporateAction): string {
  return JSON.stringify([action.instrumentId, action.id]);
}

function validateCorporateActionSources(events: readonly MarketReplayEvent[], authoritativeSource: MarketReplaySource | null): void {
  const selected = authoritativeSource === null ? null : sourceKey(authoritativeSource);
  const sourcesByEconomicAction = new Map<string, string>();
  for (const event of events) {
    if (event.kind !== "corporate-action-effective" && event.kind !== "corporate-action-payment") continue;
    const actionSource = sourceKey(event.action.source);
    if (selected !== null && actionSource !== selected) continue;
    const economicKey = corporateActionEconomicKey(event.action);
    const existingSource = sourcesByEconomicAction.get(economicKey);
    if (existingSource !== undefined && existingSource !== actionSource) {
      throw new ResearchExecutionValidationError(`AMBIGUOUS_CORPORATE_ACTION_SOURCE: ${event.action.instrumentId}/${event.action.id} is reported by multiple source generations`);
    }
    sourcesByEconomicAction.set(economicKey, actionSource);
  }
}

function streamKey(instrumentId: string, venueId: string | undefined, source: MarketReplaySource): string {
  return JSON.stringify([instrumentId, venueId ?? null, source.id, source.version]);
}

function sessionKey(instrumentId: string, venueId: string | undefined): string {
  return JSON.stringify([instrumentId, venueId ?? null]);
}

function cloneSource(source: MarketReplaySource): MarketReplaySource {
  return { id: source.id, version: source.version, ...(source.kind === undefined ? {} : { kind: source.kind }) };
}

function cloneQuality(value: ResearchLiquidityQuality): ResearchLiquidityQuality {
  return { ...value, source: value.source === null ? null : cloneSource(value.source), ...(value.reason === undefined ? {} : { reason: value.reason }) };
}

function cloneOrder(order: MutableOrder): ResearchOrder {
  return {
    id: order.id,
    idempotencyKey: order.idempotencyKey,
    scenarioId: order.scenarioId,
    instrumentId: order.instrumentId,
    ...(order.venueId === undefined ? {} : { venueId: order.venueId }),
    side: order.side,
    type: order.type,
    ...(order.limitPrice === undefined ? {} : { limitPrice: order.limitPrice }),
    requestedQuantity: order.requestedQuantity,
    remainingQuantity: order.remainingQuantity,
    simulatedQuantity: order.simulatedQuantity,
    weightedAverageExecutionPrice: order.weightedAverageExecutionPrice,
    cumulativeFees: order.cumulativeFees,
    reservedCash: order.reservedCash,
    status: order.status,
    submittedAt: order.submittedAt,
    decisionEventId: order.decisionEventId,
    decisionCursor: order.decisionCursor,
    eligibleClockTime: order.eligibleClockTime,
    fills: [...order.fills],
    ...(order.reason === undefined ? {} : { reason: order.reason }),
  };
}

function cloneFill(fill: ResearchFill): ResearchFill {
  return { ...fill, referenceEventIds: [...fill.referenceEventIds], quality: cloneQuality(fill.quality) };
}

function cloneJournalEntry(entry: ResearchSnapshot["journal"][number]): ResearchSnapshot["journal"][number] {
  return {
    ...entry,
    ...(entry.source === undefined ? {} : { source: cloneSource(entry.source) }),
    ...(entry.quality === undefined ? {} : { quality: cloneQuality(entry.quality) }),
    ...(entry.payload === undefined ? {} : { payload: cloneJson(entry.payload) }),
  };
}

function cloneResearchOrder(order: ResearchOrder): ResearchOrder {
  return { ...order, fills: [...order.fills] };
}

function cloneLedgerSnapshot(value: ResearchLedgerSnapshot): ResearchLedgerSnapshot {
  return { ...value, position: value.position === null ? null : { ...value.position } };
}

function cloneDiagnostics(value: ResearchDiagnostics): ResearchDiagnostics {
  return {
    quality: [...value.quality],
    warnings: [...value.warnings],
    sourceCoverage: value.sourceCoverage.map((entry) => ({ ...entry, source: cloneSource(entry.source) })),
    observedTradeCount: value.observedTradeCount,
    observedOrderBookEventCount: value.observedOrderBookEventCount,
    simulatedFillCount: value.simulatedFillCount,
  };
}

function cloneResearchSnapshot(value: ResearchSnapshot): ResearchSnapshot {
  return {
    ...value,
    cursor: { ...value.cursor },
    ledger: cloneLedgerSnapshot(value.ledger),
    orders: value.orders.map(cloneResearchOrder),
    fills: value.fills.map(cloneFill),
    journal: value.journal.map(cloneJournalEntry),
    journalRetention: { ...value.journalRetention },
    diagnostics: cloneDiagnostics(value.diagnostics),
    ...(value.error === undefined ? {} : { error: value.error }),
  };
}

function cloneDecision(decision: ResearchDecisionRecord): ResearchDecisionRecord {
  if (decision.decisionType === "cancel-order") return { ...decision };
  return { ...decision, ...(decision.limitPrice === undefined ? {} : { limitPrice: decision.limitPrice }), ...(decision.reason === undefined ? {} : { reason: decision.reason }) };
}

function createLedger(initialCapital: number): MutableLedger {
  return { cash: initialCapital, reservedCash: 0, reservedPositionQuantity: 0, position: null, realizedPnl: 0, totalFees: 0, highWaterMark: initialCapital };
}

export class ResearchExecutionSessionImpl implements ResearchExecutionSession {
  private readonly options: InternalOptions;
  private readonly controller: MarketReplayController;
  private readonly listeners = new Set<(snapshot: ResearchSnapshot) => void>();
  private readonly decisions: ResearchDecisionRecord[] = [];
  private readonly decisionsByCursor = new Map<number, ResearchDecisionRecord[]>();
  private readonly nextDecisionOrdinalByCursor = new Map<number, number>();
  private readonly orders = new Map<string, MutableOrder>();
  private readonly fills = new Map<string, ResearchFill>();
  private readonly books = new Map<string, MutableBook>();
  private readonly sourceStatuses = new Map<string, SourceStatusObservation>();
  private readonly observedTrades = new Map<string, MarketTrade>();
  private readonly dividendEntitlements = new Map<string, DividendEntitlement>();
  private readonly sessionStates = new Map<string, SessionObservation>();
  private readonly corporateActionRevisions = new Map<string, number>();
  private journal: ResearchSnapshot["journal"][number][] = [];
  private journalHead = 0;
  private warnings: string[] = [];
  private quality = new Set<ResearchSourceQuality>();
  private ledger: MutableLedger;
  private currentIndex = -1;
  private state: ResearchSessionState = "idle";
  private error: Error | null = null;
  private disposed = false;
  private finalized = false;
  private nextOrderNumber = 1;
  private nextDecisionNumber = 1;
  private nextJournalSequence = 0;
  private journalEvictedEntries = 0;
  private lastEvent: MarketReplayEvent | null = null;
  private lastMarkPrice: number | null = null;
  private lastMarkTime: number | null = null;
  private snapshotRevision = 0;
  private cachedSnapshotRevision = -1;
  private cachedSnapshot: ResearchSnapshot | null = null;
  private readonly unsubscribeController: () => void;

  public constructor(options: ResearchExecutionOptions) {
    this.options = normalizeOptions(options);
    const controllerOptions: MarketReplayControllerOptions = {
      tape: this.options.tape,
      clockPolicy: this.options.clockPolicy,
      knowledgePolicy: this.options.knowledgePolicy,
      maxDepth: this.options.maxDepth,
    };
    this.controller = new MarketReplayController(controllerOptions);
    this.ledger = createLedger(this.options.initialCapital);
    this.unsubscribeController = this.controller.subscribe((state) => this.handleControllerState(state));
  }

  public getSnapshot(): ResearchSnapshot {
    return cloneResearchSnapshot(this.canonicalSnapshot());
  }

  public getOrders(): readonly ResearchOrder[] {
    return this.canonicalSnapshot().orders.map(cloneResearchOrder);
  }

  public getFills(): readonly ResearchFill[] {
    return this.canonicalSnapshot().fills.map(cloneFill);
  }

  public getJournal(): readonly ResearchSnapshot["journal"][number][] {
    return this.canonicalSnapshot().journal.map(cloneJournalEntry);
  }

  private canonicalSnapshot(): ResearchSnapshot {
    if (this.cachedSnapshot !== null && this.cachedSnapshotRevision === this.snapshotRevision) return this.cachedSnapshot;
    const controllerState = this.controller.getState();
    this.cachedSnapshot = {
      version: OPENKLINE_RESEARCH_EXECUTION_VERSION,
      scenarioId: this.options.scenarioId,
      state: this.state,
      cursor: {
        eventIndex: controllerState.eventIndex,
        eventId: controllerState.eventId,
        time: controllerState.timestamp,
        clockTime: controllerState.clockTimestamp,
      },
      clockPolicy: this.options.clockPolicy,
      knowledgePolicy: this.options.knowledgePolicy,
      ledger: this.ledgerSnapshot(controllerState.clockTimestamp),
      orders: [...this.orders.values()].sort((left, right) => left.id.localeCompare(right.id)).map(cloneOrder),
      fills: [...this.fills.values()].sort((left, right) => left.id.localeCompare(right.id)).map(cloneFill),
      journal: this.journalEntries().map(cloneJournalEntry),
      journalRetention: this.journalRetention(),
      diagnostics: this.diagnostics(),
      ...(this.error === null ? {} : { error: this.error.message }),
    };
    this.cachedSnapshotRevision = this.snapshotRevision;
    return this.cachedSnapshot;
  }

  public submitOrder(request: ResearchOrderRequest): ResearchOrder {
    this.assertActive();
    if (this.currentIndex < 0 || this.lastEvent === null) throw new ResearchExecutionOrderError("NO_REPLAY_FRONTIER", "A replay event must be visible before submitting a research order");
    const normalized = this.normalizeRequest(request);
    const existingDecision = this.decisions.find((decision): decision is ResearchSubmitDecision => decision.decisionType === "submit-order" && decision.idempotencyKey === normalized.idempotencyKey);
    if (existingDecision !== undefined) {
      const existing = this.orders.get(existingDecision.orderId);
      if (existingDecision.decisionCursor <= this.currentIndex && existing !== undefined) {
        if (!sameRequest(existingDecision, normalized)) throw new ResearchExecutionOrderError("IDEMPOTENCY_CONFLICT", "Idempotency key was used with different order parameters");
        return cloneOrder(existing);
      }
      throw new ResearchExecutionOrderError("IDEMPOTENCY_FUTURE", "Idempotency key belongs to a future scenario decision; use a new scenario key after seeking");
    }
    this.assertNoFutureScenarioBranch();
    const eventClock = replayEventClock(this.lastEvent, this.options.clockPolicy);
    const delay = this.latencyDelay(this.currentIndex);
    const decisionMetadata = this.nextDecisionMetadata(this.currentIndex);
    const orderId = `${this.options.scenarioId}-order-${this.nextOrderNumber++}`;
    const decision: ResearchSubmitDecision = {
      ...normalized,
      ...decisionMetadata,
      decisionType: "submit-order",
      orderId,
      scenarioId: this.options.scenarioId,
      decisionEventId: this.lastEvent.id,
      decisionCursor: this.currentIndex,
      decisionTime: this.lastEvent.time,
      decisionClockTime: eventClock,
      eligibleClockTime: eventClock === null ? null : eventClock + delay,
    };
    this.recordDecision(decision);
    const order = this.createOrderFromDecision(decision);
    if (this.controller.getState().state === "completed") {
      this.finalizePendingOrders();
      this.finalized = true;
    }
    this.invalidateSnapshot();
    this.emit();
    return cloneOrder(order);
  }

  public cancelOrder(orderId: string, reason = "Cancelled by research scenario"): ResearchOrder {
    this.assertActive();
    if (this.currentIndex < 0 || this.lastEvent === null) throw new ResearchExecutionOrderError("NO_REPLAY_FRONTIER", "A replay event must be visible before cancelling a research order");
    const order = this.orders.get(nonEmpty(orderId, "orderId"));
    if (order === undefined) throw new ResearchExecutionOrderError("UNKNOWN_ORDER", `Unknown research order: ${orderId}`);
    if (order.status !== "pending" && order.status !== "partially-simulated") throw new ResearchExecutionOrderError("TERMINAL_ORDER", `Order ${orderId} is already ${order.status}`);
    this.assertNoFutureScenarioBranch();
    const decisionMetadata = this.nextDecisionMetadata(this.currentIndex);
    const cancellation: ResearchCancelDecision = {
      ...decisionMetadata,
      decisionType: "cancel-order",
      orderId: order.id,
      scenarioId: this.options.scenarioId,
      decisionEventId: this.lastEvent.id,
      decisionCursor: this.currentIndex,
      decisionTime: this.lastEvent.time,
      decisionClockTime: replayEventClock(this.lastEvent, this.options.clockPolicy),
      eligibleClockTime: null,
      reason: nonEmpty(reason, "reason"),
    };
    this.recordDecision(cancellation);
    this.releaseReservation(order);
    order.status = "cancelled";
    order.reason = cancellation.reason;
    this.recordJournal("decision", this.lastEvent, "order-cancelled", order.id, undefined, { reason: cancellation.reason, decisionId: cancellation.decisionId });
    this.assertFinancialInvariants();
    this.invalidateSnapshot();
    this.emit();
    return cloneOrder(order);
  }

  public start(): void {
    this.assertNotDisposed();
    this.controller.start();
  }

  public play(): void {
    this.assertNotDisposed();
    this.controller.play();
  }

  public pause(): void {
    this.assertNotDisposed();
    this.controller.pause();
  }

  public step(): void {
    this.assertNotDisposed();
    if (this.controller.getState().state === "idle") this.controller.start();
    this.controller.stepNextEvent();
  }

  public seekToTimestamp(timestamp: number): void {
    this.assertNotDisposed();
    if (this.controller.getState().state === "idle") this.controller.start();
    this.controller.seekToTimestamp(timestamp);
  }

  public seekToEvent(eventId: string): void {
    this.assertNotDisposed();
    if (this.controller.getState().state === "idle") this.controller.start();
    this.controller.seekToEvent(nonEmpty(eventId, "eventId"));
  }

  public reset(): void {
    this.assertNotDisposed();
    this.controller.reset();
  }

  public subscribe(listener: (snapshot: ResearchSnapshot) => void): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public exportScenario(): ResearchScenarioExport {
    this.assertNotDisposed();
    const snapshot = this.getSnapshot();
    return {
      version: OPENKLINE_RESEARCH_EXECUTION_VERSION,
      scenarioId: this.options.scenarioId,
      tapeFingerprint: this.options.tape.fingerprint,
      tapeId: this.options.tape.id,
      assumptions: {
        instrumentId: this.options.instrumentId,
        venueId: this.options.venueId,
        currency: this.options.currency,
        initialCapital: this.options.initialCapital,
        clockPolicy: this.options.clockPolicy,
        knowledgePolicy: this.options.knowledgePolicy,
        latency: cloneLatency(this.options.latency),
        execution: { ...this.options.execution },
        precision: { ...this.options.precision },
        commission: { ...this.options.commission },
        slippage: { ...this.options.slippage },
        priceImpact: this.options.priceImpact === null ? null : { ...this.options.priceImpact },
        maxQuoteAgeMs: this.options.maxQuoteAgeMs,
        risk: { ...this.options.risk },
        corporateActionSource: this.options.corporateActionSource === null ? null : cloneSource(this.options.corporateActionSource),
        maxJournalEntries: this.options.maxJournalEntries,
        maxDepth: this.options.maxDepth,
      },
      decisions: this.orderedDecisions().map(cloneDecision),
      orders: snapshot.orders,
      fills: snapshot.fills,
      ledger: snapshot.ledger,
      journal: snapshot.journal,
      journalRetention: snapshot.journalRetention,
      diagnostics: snapshot.diagnostics,
    };
  }

  public exportScenarioArtifact(options: ResearchScenarioArtifactCreateOptions = {}): ResearchScenarioArtifact {
    this.assertNotDisposed();
    const snapshot = this.getSnapshot();
    if (snapshot.state === "playing" || snapshot.state === "error" || snapshot.state === "disposed") {
      throw new ResearchExecutionValidationError(`Scenario artifact cannot be exported from ${snapshot.state} state`);
    }
    const frontier: ResearchScenarioFrontier = {
      eventIndex: snapshot.cursor.eventIndex,
      eventId: snapshot.cursor.eventId,
      time: snapshot.cursor.time,
      clockTime: snapshot.cursor.clockTime,
      state: snapshot.state,
    };
    return createResearchScenarioArtifact({ scenario: this.exportScenario(), tape: this.options.tape, frontier, options });
  }

  /** Internal-only restore hook used after an artifact has passed strict validation. */
  public loadScenarioDecisions(decisions: readonly ResearchDecisionRecord[]): void {
    this.assertNotDisposed();
    if (this.state !== "idle" || this.currentIndex !== -1 || this.decisions.length > 0) {
      throw new ResearchExecutionLifecycleError("Scenario decisions can only be loaded into a fresh idle session");
    }
    const validated: ResearchDecisionRecord[] = [];
    const decisionIds = new Set<string>();
    const orderIds = new Set<string>();
    const submittedOrders = new Set<string>();
    const ordinals = new Map<number, number>();
    for (const candidate of decisions) {
      const decision = cloneDecision(candidate);
      if (decision.scenarioId !== this.options.scenarioId) throw new ResearchExecutionValidationError(`Scenario decision ${decision.decisionId} belongs to a different scenario`);
      if (decisionIds.has(decision.decisionId)) throw new ResearchExecutionValidationError(`Duplicate scenario decision ${decision.decisionId}`);
      decisionIds.add(decision.decisionId);
      const event = this.controller.getEligibleEvent(decision.decisionCursor);
      if (event === null || event.id !== decision.decisionEventId) throw new ResearchExecutionValidationError(`Decision ${decision.decisionId} references an incompatible replay event`);
      if (event.time !== decision.decisionTime) throw new ResearchExecutionValidationError(`Decision ${decision.decisionId} time does not match its replay event`);
      const decisionClockTime = replayEventClock(event, this.options.clockPolicy);
      if (decision.decisionClockTime !== decisionClockTime) throw new ResearchExecutionValidationError(`Decision ${decision.decisionId} clock time does not match its replay event`);
      const previousOrdinal = ordinals.get(decision.decisionCursor) ?? 0;
      if (decision.decisionOrdinal <= previousOrdinal) throw new ResearchExecutionValidationError(`Decision ${decision.decisionId} ordinal is not strictly increasing at its replay cursor`);
      ordinals.set(decision.decisionCursor, decision.decisionOrdinal);
      if (decision.decisionType === "submit-order") {
        const normalized = this.normalizeRequest({
          idempotencyKey: decision.idempotencyKey,
          side: decision.side,
          type: decision.type,
          quantity: decision.quantity,
          ...(decision.limitPrice === undefined ? {} : { limitPrice: decision.limitPrice }),
          ...(decision.reason === undefined ? {} : { reason: decision.reason }),
        });
        if (!sameRequest(decision, normalized)) throw new ResearchExecutionValidationError(`Decision ${decision.decisionId} does not match the active precision policy`);
        if (orderIds.has(decision.orderId)) throw new ResearchExecutionValidationError(`Duplicate scenario order ${decision.orderId}`);
        orderIds.add(decision.orderId);
        submittedOrders.add(decision.orderId);
        const expectedEligibleClockTime = decisionClockTime === null ? null : decisionClockTime + this.latencyDelay(decision.decisionCursor);
        if (decision.eligibleClockTime !== expectedEligibleClockTime) throw new ResearchExecutionValidationError(`Decision ${decision.decisionId} eligibility time does not match the active latency policy`);
      } else {
        if (!submittedOrders.has(decision.orderId)) throw new ResearchExecutionValidationError(`Cancellation ${decision.decisionId} references an unavailable order`);
      }
      validated.push(decision);
    }
    for (const decision of validated) this.recordDecision(decision);
    this.nextDecisionNumber = validated.length + 1;
    this.nextOrderNumber = validated.filter((decision) => decision.decisionType === "submit-order").length + 1;
    for (const [cursor, ordinal] of ordinals) this.nextDecisionOrdinalByCursor.set(cursor, ordinal);
    this.invalidateSnapshot();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeController();
    this.controller.dispose();
    this.listeners.clear();
    this.books.forEach((book) => book.controller.dispose());
    this.books.clear();
    this.decisions.length = 0;
    this.decisionsByCursor.clear();
    this.nextDecisionOrdinalByCursor.clear();
    this.sourceStatuses.clear();
    this.observedTrades.clear();
    this.dividendEntitlements.clear();
    this.sessionStates.clear();
    this.corporateActionRevisions.clear();
    this.orders.clear();
    this.fills.clear();
    this.journal = [];
    this.journalHead = 0;
    this.warnings = [];
    this.quality.clear();
    this.cachedSnapshot = null;
    this.cachedSnapshotRevision = -1;
    this.state = "disposed";
    this.error = null;
  }

  private handleControllerState(state: MarketReplayState): void {
    if (this.disposed) return;
    try {
      const target = state.eventIndex ?? -1;
      if (target < this.currentIndex) this.rebuildSimulationTo(target);
      else if (target > this.currentIndex) {
        for (let index = this.currentIndex + 1; index <= target; index += 1) {
          const event = this.controller.getEligibleEvent(index);
          if (event === null) throw new ResearchExecutionValidationError(`Replay event ${index} is unavailable`);
          this.currentIndex = index;
          this.processEvent(event, index);
          this.activateDecisions(index);
        }
        this.currentIndex = target;
      }
      if (state.state === "completed" && !this.finalized) {
        this.finalizePendingOrders();
        this.finalized = true;
      }
      this.state = mapSessionState(state.state);
      this.error = null;
      this.invalidateSnapshot();
      this.emit();
    } catch (error) {
      this.state = "error";
      this.error = error instanceof Error ? error : new Error(String(error));
      this.invalidateSnapshot();
      this.emit();
    }
  }

  private rebuildSimulationTo(target: number): void {
    this.resetRuntime();
    for (let index = 0; index <= target; index += 1) {
      const event = this.controller.getEligibleEvent(index);
      if (event === null) throw new ResearchExecutionValidationError(`Replay event ${index} is unavailable during reconstruction`);
      this.currentIndex = index;
      this.processEvent(event, index);
      this.activateDecisions(index);
    }
    this.currentIndex = target;
  }

  private resetRuntime(): void {
    this.books.forEach((book) => book.controller.dispose());
    this.books.clear();
    this.sourceStatuses.clear();
    this.observedTrades.clear();
    this.dividendEntitlements.clear();
    this.sessionStates.clear();
    this.corporateActionRevisions.clear();
    this.orders.clear();
    this.fills.clear();
    this.journal = [];
    this.journalHead = 0;
    this.nextJournalSequence = 0;
    this.journalEvictedEntries = 0;
    this.warnings = [];
    this.quality.clear();
    this.ledger = createLedger(this.options.initialCapital);
    this.currentIndex = -1;
    this.lastEvent = null;
    this.lastMarkPrice = null;
    this.lastMarkTime = null;
    this.finalized = false;
    this.invalidateSnapshot();
  }

  private processEvent(event: MarketReplayEvent, index: number): void {
    this.lastEvent = event;
    this.applyObservation(event);
    this.evaluatePendingOrders(event, index);
  }

  private activateDecisions(index: number): void {
    const decisions = this.decisionsByCursor.get(index) ?? [];
    for (const decision of decisions) {
      if (decision.decisionType === "submit-order") {
        if (this.orders.has(decision.orderId)) continue;
        this.createOrderFromDecision(decision);
      } else {
        this.applyCancellationDecision(decision);
      }
    }
  }

  private applyCancellationDecision(decision: ResearchCancelDecision): void {
    const order = this.orders.get(decision.orderId);
    if (order === undefined) throw new ResearchExecutionValidationError(`Cancellation ${decision.decisionId} references an unavailable order ${decision.orderId}`);
    if (order.status === "cancelled" && order.reason === decision.reason) return;
    if (order.status !== "pending" && order.status !== "partially-simulated") throw new ResearchExecutionValidationError(`Cancellation ${decision.decisionId} reached terminal order ${decision.orderId}`);
    this.releaseReservation(order);
    order.status = "cancelled";
    order.reason = decision.reason;
    this.recordJournal("decision", this.lastEvent, "order-cancelled", order.id, undefined, { reason: decision.reason, decisionId: decision.decisionId });
    this.assertFinancialInvariants();
  }

  private applyObservation(event: MarketReplayEvent): void {
    if (!this.matchesTarget(event.instrumentId, event.venueId)) return;
    if (event.kind === "source-status") {
      this.sourceStatuses.set(sourceKey(event.source), { status: event.status, coverage: event.coverage, eventId: event.id });
      return;
    }
    switch (event.kind) {
      case "order-book-snapshot": this.applyBookSnapshot(event); break;
      case "order-book-delta": this.applyBookDelta(event); break;
      case "trade": this.applyTrade(event); break;
      case "candle-complete": this.updateMark(event.candle.close, event.time); break;
      case "corporate-action-effective": this.applyCorporateAction(event.action, event.id, false); break;
      case "corporate-action-payment": this.applyCorporateAction(event.action, event.id, true); break;
      case "candle-open":
        break;
      case "session-boundary": this.applySessionBoundary(event); break;
    }
  }

  private applyBookSnapshot(event: MarketReplayOrderBookSnapshotEvent): void {
    const book = this.getOrCreateBook(event.instrumentId, event.venueId, event.source);
    const result = book.controller.applySnapshot(event.snapshot);
    if (result.kind === "applied") {
      book.observedEventCount += 1;
      book.lastEventId = event.id;
      book.lastSynchronizedClock = replayEventClock(event, this.options.clockPolicy);
      book.consumedEventId = null;
      book.consumedBidQuantity = 0;
      book.consumedAskQuantity = 0;
    }
    if (result.kind === "buffered") book.observedEventCount += 1;
    if (result.kind === "rejected") this.addQuality("indeterminate", `Order-book snapshot rejected: ${result.reason ?? "unknown reason"}`);
  }

  private applyBookDelta(event: MarketReplayOrderBookDeltaEvent): void {
    const book = this.getOrCreateBook(event.instrumentId, event.venueId, event.source);
    const result = book.controller.applyDelta(event.delta);
    if (result.kind === "applied") {
      book.observedEventCount += 1;
      book.lastEventId = event.id;
      book.lastSynchronizedClock = replayEventClock(event, this.options.clockPolicy);
      book.consumedEventId = null;
      book.consumedBidQuantity = 0;
      book.consumedAskQuantity = 0;
    }
    if (result.kind === "buffered") book.observedEventCount += 1;
    if (result.kind === "rejected") this.addQuality("indeterminate", `Order-book delta rejected: ${result.reason ?? "unknown reason"}`);
  }

  private applySessionBoundary(event: Extract<MarketReplayEvent, { readonly kind: "session-boundary" }>): void {
    this.sessionStates.set(sessionKey(event.instrumentId, event.venueId), {
      sessionId: event.sessionId,
      boundary: event.boundary,
      eventId: event.id,
      time: event.time,
    });
  }

  private applyTrade(event: Extract<MarketReplayEvent, { readonly kind: "trade" }>): void {
    const identity = marketTradeLogicalIdentity(event.trade);
    const previous = this.observedTrades.get(identity);
    if (previous !== undefined && event.trade.revision < previous.revision) {
      this.addQuality("indeterminate", `Ignored out-of-order trade revision: ${identity}`);
      return;
    }
    if (previous !== undefined && event.trade.revision === previous.revision) return;
    if (previous !== undefined) this.addQuality("indeterminate", `Applied trade correction: ${identity}`);
    this.observedTrades.set(identity, { ...event.trade, source: cloneSource(event.trade.source) });
    this.updateMark(event.trade.price, event.time);
  }

  private applyCorporateAction(action: CorporateAction, eventId: string, payment: boolean): void {
    if (this.options.corporateActionSource !== null && sourceKey(action.source) !== sourceKey(this.options.corporateActionSource)) return;
    const actionIdentity = corporateActionLogicalIdentity(action);
    const phase = payment ? "payment" : "effective";
    const revisionKey = `${phase}:${actionIdentity}`;
    const previousRevision = this.corporateActionRevisions.get(revisionKey);
    if (previousRevision !== undefined) {
      if (action.revision > previousRevision) this.addQuality("unsupported-corporate-action", `Corporate action revision cannot be applied after ${phase}: ${actionIdentity}`);
      return;
    }
    this.corporateActionRevisions.set(revisionKey, action.revision);
    if (action.knowledgeTime !== undefined && action.knowledgeTime > action.effectiveTime) {
      this.addQuality("unsupported-corporate-action", `Corporate action ${action.id} has a future knowledge frontier`);
      this.recordJournal("system", this.lastEvent, "corporate-action-indeterminate", undefined, undefined, { actionId: action.id, eventId });
      return;
    }
    if (action.kind === "stock-split" || action.kind === "reverse-stock-split") {
      if (payment) return;
      this.applySplit(action, eventId);
      return;
    }
    if (action.kind !== "cash-dividend") return;
    if (!payment) {
      if (this.ledger.position !== null) this.dividendEntitlements.set(actionIdentity, { quantity: this.ledger.position.quantity, action });
      this.recordJournal("system", this.lastEvent, "dividend-entitlement", undefined, undefined, { actionId: action.id, actionIdentity, quantity: this.ledger.position?.quantity ?? 0 });
      return;
    }
    const entitlement = this.dividendEntitlements.get(actionIdentity);
    if (entitlement === undefined) {
      this.addQuality("unsupported-corporate-action", `Dividend payment has no causal entitlement: ${action.id}`);
      return;
    }
    const amount = entitlement.quantity * action.amountPerShare;
    this.ledger.cash = normalizeZero(this.ledger.cash + amount);
    this.dividendEntitlements.delete(actionIdentity);
    this.assertFinancialInvariants();
    this.recordJournal("system", this.lastEvent, "dividend-paid", undefined, undefined, { actionId: action.id, actionIdentity, amount });
  }

  private applySplit(action: StockSplitAction, eventId: string): void {
    const ratio = action.newShares / action.oldShares;
    if (!Number.isFinite(ratio) || ratio <= 0) {
      this.addQuality("unsupported-corporate-action", `Invalid split ratio: ${action.id}`);
      return;
    }
    if (this.ledger.position !== null) {
      this.ledger.position.quantity = normalizeZero(this.ledger.position.quantity * ratio);
      this.ledger.position.averageEntryPrice = this.ledger.position.quantity <= EPSILON ? 0 : this.ledger.position.costBasis / this.ledger.position.quantity;
    }
    for (const order of this.orders.values()) {
      if (order.status !== "pending" && order.status !== "partially-simulated") continue;
      this.releaseReservation(order);
      order.status = "cancelled";
      order.reason = `Pending order cancelled at split ${action.id}`;
      this.recordJournal("system", this.lastEvent, "order-cancelled-corporate-action", order.id, undefined, { actionId: action.id, actionIdentity: corporateActionLogicalIdentity(action), eventId });
    }
    // Dividend entitlements are fixed at the ex-dividend boundary declared by
    // CashDividendAction. A later split must not retroactively change them.
    this.assertFinancialInvariants();
    this.recordJournal("system", this.lastEvent, "split-applied", undefined, undefined, { actionId: action.id, actionIdentity: corporateActionLogicalIdentity(action), ratio });
  }

  private evaluatePendingOrders(event: MarketReplayEvent, index: number): void {
    const clock = replayEventClock(event, this.options.clockPolicy);
    for (const order of [...this.orders.values()].sort((left, right) => left.id.localeCompare(right.id))) {
      if (order.status !== "pending" && order.status !== "partially-simulated") continue;
      if (order.decisionCursor >= index) continue;
      if (order.eligibleClockTime === null || clock === null) {
        this.markOrderIndeterminate(order, "missing-receive-time", "An eligible replay clock is unavailable");
        continue;
      }
      if (clock < order.eligibleClockTime) continue;
      const attempt = this.findFillAttempt(order, event, clock);
      if (attempt === null) continue;
      this.applyFillAttempt(order, attempt, event);
    }
  }

  private findFillAttempt(order: MutableOrder, event: MarketReplayEvent, clock: number): FillAttempt | null {
    const sessionReason = this.sessionEligibilityReason(event);
    if (sessionReason !== null) {
      this.addQuality("indeterminate", sessionReason);
      this.recordJournal("system", event, "session-eligibility-indeterminate", order.id, undefined, { reason: sessionReason });
      return null;
    }
    const touchPrice = observedTouchPrice(event);
    const book = this.findBook(clock);
    const quality = this.bookQuality(book, event, clock);
    const bestAsk = book?.state.asks[0];
    const bestBid = book?.state.bids[0];
    const isMarketable = order.type === "market"
      || (order.side === "buy" && bestAsk !== undefined && order.limitPrice !== undefined && order.limitPrice + EPSILON >= bestAsk.price)
      || (order.side === "sell" && bestBid !== undefined && order.limitPrice !== undefined && order.limitPrice - EPSILON <= bestBid.price);
    if (!isMarketable) {
      const touched = order.limitPrice !== undefined && touchPrice !== null && (order.side === "buy" ? touchPrice <= order.limitPrice + EPSILON : touchPrice >= order.limitPrice - EPSILON);
      if (!touched) return null;
      const passiveQuality: ResearchLiquidityQuality = { ...quality, status: "indeterminate", observedEventId: event.id, reason: "Historical price touch does not establish passive queue execution" };
      this.addQuality("indeterminate", `Passive order ${order.id} reached a hypothetical price touch`);
      this.recordJournal("system", event, "passive-eligibility-indeterminate", order.id, undefined, { policy: this.options.execution.passivePolicy }, passiveQuality);
      if (this.options.execution.passivePolicy !== "explicit-scenario") return null;
      const scenarioBias = this.options.execution.scenarioBias ?? "optimistic";
      return { price: order.limitPrice!, quantity: order.remainingQuantity, quality: passiveQuality, referenceEventIds: [event.id], scenarioBias, book: null, bookEventId: null };
    }
    if (book === null || quality.status !== "available") {
      this.recordJournal("system", event, "liquidity-unavailable", order.id, undefined, { status: quality.status }, quality);
      return null;
    }
    const level = order.side === "buy" ? bestAsk : bestBid;
    if (level === undefined || !Number.isFinite(level.price) || level.price <= 0) {
      this.addQuality("invalid-price", `No valid executable ${order.side === "buy" ? "ask" : "bid"} is available`);
      return null;
    }
    if (book.book.consumedEventId !== book.book.lastEventId) {
      book.book.consumedEventId = book.book.lastEventId;
      book.book.consumedBidQuantity = 0;
      book.book.consumedAskQuantity = 0;
    }
    const consumed = order.side === "buy" ? book.book.consumedAskQuantity : book.book.consumedBidQuantity;
    const available = level.quantity * this.options.execution.maxParticipationRate - consumed;
    if (!Number.isFinite(available) || available <= EPSILON) {
      this.addQuality("invalid-quantity", `Displayed ${order.side === "buy" ? "ask" : "bid"} depth is unavailable`);
      return null;
    }
    if (available + EPSILON < order.remainingQuantity && !this.options.execution.allowPartialFills) {
      this.recordJournal("system", event, "displayed-depth-insufficient", order.id, undefined, { available, requested: order.remainingQuantity }, quality);
      return null;
    }
    const quantity = Math.min(order.remainingQuantity, available);
    const normalizedQuantity = this.normalizeQuantity(quantity, false);
    if (normalizedQuantity <= EPSILON) return null;
    return {
      price: level.price,
      quantity: normalizedQuantity,
      quality: { ...quality, observedEventId: book.book.lastEventId ?? event.id, displayedQuantity: available },
      referenceEventIds: [book.book.lastEventId ?? event.id],
      scenarioBias: "indeterminate",
      book: book.book,
      bookEventId: book.book.lastEventId,
    };
  }

  private sessionEligibilityReason(event: MarketReplayEvent): string | null {
    if (this.sessionStates.size === 0) return null;
    const observation = this.sessionStates.get(sessionKey(event.instrumentId, event.venueId));
    if (observation === undefined) return "No session boundary is available for the execution event";
    if (observation.boundary === "close" || observation.boundary === "break-start") return `Trading session ${observation.sessionId} is closed at ${observation.eventId}`;
    return null;
  }

  private applyFillAttempt(order: MutableOrder, attempt: FillAttempt, event: MarketReplayEvent): void {
    const referencePrice = this.normalizePrice(attempt.price, order.side);
    const afterSlippage = applyAdverseSlippage(referencePrice, this.options.slippage, order.side === "buy");
    const executionPrice = this.options.priceImpact === null ? afterSlippage : applyAdverseSlippage(afterSlippage, this.options.priceImpact, order.side === "buy");
    if (order.limitPrice !== undefined && ((order.side === "buy" && executionPrice > order.limitPrice + EPSILON) || (order.side === "sell" && executionPrice < order.limitPrice - EPSILON))) {
      this.recordJournal("system", event, "limit-constraint-indeterminate", order.id, undefined, { executionPrice, limitPrice: order.limitPrice }, attempt.quality);
      return;
    }
    const quantity = this.normalizeQuantity(attempt.quantity, false);
    if (quantity <= EPSILON) return;
    this.releaseReservation(order);
    const notional = executionPrice * quantity;
    const fee = calculateTransactionCost(this.options.commission, notional);
    if (order.side === "buy") {
      if (this.availableCash() + EPSILON < notional + fee) {
        order.status = "rejected";
        order.reason = "INSUFFICIENT_FUNDS_AT_EXECUTION";
        this.recordJournal("system", event, "order-rejected", order.id, undefined, { reason: order.reason }, attempt.quality);
        this.assertFinancialInvariants();
        return;
      }
      this.ledger.cash = normalizeZero(this.ledger.cash - notional - fee);
      this.addPosition(quantity, notional, fee, event.time);
    } else {
      const availablePosition = (this.ledger.position?.quantity ?? 0) - this.ledger.reservedPositionQuantity;
      if (this.ledger.position === null || quantity > availablePosition + EPSILON) {
        order.status = "rejected";
        order.reason = "POSITION_NOT_AVAILABLE_AT_EXECUTION";
        this.recordJournal("system", event, "order-rejected", order.id, undefined, { reason: order.reason }, attempt.quality);
        this.assertFinancialInvariants();
        return;
      }
      this.reducePosition(quantity, executionPrice, fee);
      this.ledger.cash = normalizeZero(this.ledger.cash + notional - fee);
    }
    const fillId = `${this.options.scenarioId}-fill-${this.fills.size + 1}`;
    const fill: ResearchFill = {
      simulated: true,
      id: fillId,
      orderId: order.id,
      side: order.side,
      time: event.time,
      referencePrice,
      executionPrice,
      quantity,
      fee,
      slippage: Math.abs(afterSlippage - referencePrice),
      priceImpact: Math.abs(executionPrice - afterSlippage),
      referenceEventIds: [...attempt.referenceEventIds],
      quality: cloneQuality(attempt.quality),
      scenarioBias: attempt.scenarioBias,
    };
    this.fills.set(fillId, fill);
    order.fills.push(fillId);
    order.simulatedQuantity = normalizeZero(order.simulatedQuantity + quantity);
    order.remainingQuantity = normalizeZero(order.requestedQuantity - order.simulatedQuantity);
    order.cumulativeFees = normalizeZero(order.cumulativeFees + fee);
    order.weightedAverageExecutionPrice = order.weightedAverageExecutionPrice === null
      ? executionPrice
      : ((order.weightedAverageExecutionPrice * (order.simulatedQuantity - quantity)) + executionPrice * quantity) / order.simulatedQuantity;
    this.ledger.totalFees = normalizeZero(this.ledger.totalFees + fee);
    if (order.remainingQuantity <= EPSILON) {
      order.remainingQuantity = 0;
      order.status = "fully-simulated";
    } else {
      order.status = "partially-simulated";
      this.reserveRemaining(order);
    }
    if (attempt.book !== null && attempt.bookEventId !== null && attempt.book.lastEventId === attempt.bookEventId) {
      if (order.side === "buy") attempt.book.consumedAskQuantity = normalizeZero(attempt.book.consumedAskQuantity + quantity);
      else attempt.book.consumedBidQuantity = normalizeZero(attempt.book.consumedBidQuantity + quantity);
    }
    this.recordJournal("system", event, "order-filled", order.id, fillId, { quantity, executionPrice, fee, simulated: true }, attempt.quality);
    this.updateHighWaterMark(event.time);
    this.assertFinancialInvariants();
  }

  private addPosition(quantity: number, notional: number, fee: number, time: number): void {
    if (this.ledger.position === null) {
      this.ledger.position = { quantity, costBasis: notional, openEntryFees: fee, averageEntryPrice: notional / quantity, markPrice: this.lastMarkPrice, markTime: this.lastMarkTime ?? time };
      return;
    }
    const nextQuantity = this.ledger.position.quantity + quantity;
    const nextCostBasis = this.ledger.position.costBasis + notional;
    this.ledger.position.quantity = normalizeZero(nextQuantity);
    this.ledger.position.costBasis = normalizeZero(nextCostBasis);
    this.ledger.position.openEntryFees = normalizeZero(this.ledger.position.openEntryFees + fee);
    this.ledger.position.averageEntryPrice = nextCostBasis / nextQuantity;
    this.ledger.position.markPrice = this.lastMarkPrice;
    this.ledger.position.markTime = this.lastMarkTime ?? time;
  }

  private reducePosition(quantity: number, executionPrice: number, exitFee: number): void {
    if (this.ledger.position === null) throw new ResearchExecutionOrderError("POSITION_NOT_AVAILABLE_AT_EXECUTION", "No long position is available");
    const position = this.ledger.position;
    const entryFee = position.openEntryFees * quantity / position.quantity;
    const grossPnl = calculateLongGrossPnl(position.averageEntryPrice, executionPrice, quantity);
    this.ledger.realizedPnl = normalizeZero(this.ledger.realizedPnl + grossPnl - entryFee - exitFee);
    const remaining = position.quantity - quantity;
    if (remaining <= EPSILON) this.ledger.position = null;
    else {
      position.quantity = normalizeZero(remaining);
      position.costBasis = normalizeZero(position.costBasis * remaining / (remaining + quantity));
      position.openEntryFees = normalizeZero(position.openEntryFees - entryFee);
    }
  }

  private createOrderFromDecision(decision: ResearchDecisionRecord): MutableOrder {
    if (decision.decisionType !== "submit-order") throw new ResearchExecutionValidationError(`Cannot create an order from ${decision.decisionType} decision ${decision.decisionId}`);
    const order: MutableOrder = {
      id: decision.orderId,
      idempotencyKey: decision.idempotencyKey,
      scenarioId: decision.scenarioId,
      instrumentId: this.options.instrumentId,
      ...(this.options.venueId === null ? {} : { venueId: this.options.venueId }),
      side: decision.side,
      type: decision.type,
      requestedQuantity: decision.quantity,
      remainingQuantity: decision.quantity,
      simulatedQuantity: 0,
      weightedAverageExecutionPrice: null,
      cumulativeFees: 0,
      reservedCash: 0,
      status: "submitted",
      submittedAt: decision.decisionTime,
      decisionEventId: decision.decisionEventId,
      decisionCursor: decision.decisionCursor,
      eligibleClockTime: decision.eligibleClockTime,
      fills: [],
      ...(decision.limitPrice === undefined ? {} : { limitPrice: decision.limitPrice }),
      ...(decision.reason === undefined ? {} : { reason: decision.reason }),
    };
    this.orders.set(order.id, order);
    this.recordJournal("decision", this.lastEvent, "order-submitted", order.id, undefined, { type: order.type, side: order.side, quantity: order.requestedQuantity });
    const rejection = this.submissionRejection(order);
    if (rejection !== null) {
      order.status = "rejected";
      order.reason = rejection;
      this.recordJournal("decision", this.lastEvent, "order-rejected", order.id, undefined, { reason: rejection });
      this.assertFinancialInvariants();
      return order;
    }
    order.status = "accepted";
    this.recordJournal("decision", this.lastEvent, "order-accepted", order.id);
    this.reserveInitial(order);
    order.status = "pending";
    this.recordJournal("decision", this.lastEvent, "order-pending", order.id, undefined, { eligibleClockTime: order.eligibleClockTime });
    this.assertFinancialInvariants();
    return order;
  }

  private submissionRejection(order: MutableOrder): string | null {
    const pendingCount = [...this.orders.values()].filter((candidate) => candidate.status === "pending" || candidate.status === "partially-simulated").length;
    if (this.options.risk.maxPendingOrders !== undefined && pendingCount >= this.options.risk.maxPendingOrders) return "MAX_PENDING_ORDERS";
    if (this.options.risk.maxOrderQuantity !== undefined && order.requestedQuantity > this.options.risk.maxOrderQuantity + EPSILON) return "MAX_ORDER_QUANTITY";
    if (order.side === "sell") {
      const available = (this.ledger.position?.quantity ?? 0) - this.ledger.reservedPositionQuantity;
      if (order.requestedQuantity > available + EPSILON) return "INSUFFICIENT_POSITION";
    }
    if (order.side === "buy" && this.options.risk.maxPositionQuantity !== undefined && (this.ledger.position?.quantity ?? 0) + order.requestedQuantity + this.ledger.reservedPositionQuantity > this.options.risk.maxPositionQuantity + EPSILON) return "MAX_POSITION_QUANTITY";
    if (this.options.risk.maxDrawdown !== undefined && -this.ledgerSnapshot(this.currentClock()).drawdown > this.options.risk.maxDrawdown + EPSILON) return "MAX_DRAWDOWN";
    const reference = this.currentReferencePrice(order.side, order.limitPrice);
    if (this.options.risk.maxOrderNotional !== undefined) {
      if (reference === null) return "RISK_UNAVAILABLE_NO_REFERENCE_PRICE";
      if (reference * order.requestedQuantity > this.options.risk.maxOrderNotional + EPSILON) return "MAX_ORDER_NOTIONAL";
    }
    if (order.side === "buy" && order.type === "limit" && order.limitPrice !== undefined) {
      const reserve = this.reservationFor(order, order.requestedQuantity);
      if (this.availableCash() + EPSILON < reserve) return "INSUFFICIENT_FUNDS";
    }
    return null;
  }

  private reserveInitial(order: MutableOrder): void {
    if (order.side === "buy" && order.type === "limit" && order.limitPrice !== undefined) {
      order.reservedCash = this.reservationFor(order, order.remainingQuantity);
      this.ledger.reservedCash = normalizeZero(this.ledger.reservedCash + order.reservedCash);
    } else if (order.side === "sell") {
      this.ledger.reservedPositionQuantity = normalizeZero(this.ledger.reservedPositionQuantity + order.remainingQuantity);
    }
    this.assertFinancialInvariants();
  }

  private reserveRemaining(order: MutableOrder): void {
    if (order.side === "buy" && order.type === "limit" && order.limitPrice !== undefined) {
      order.reservedCash = this.reservationFor(order, order.remainingQuantity);
      this.ledger.reservedCash = normalizeZero(this.ledger.reservedCash + order.reservedCash);
    } else if (order.side === "sell") this.ledger.reservedPositionQuantity = normalizeZero(this.ledger.reservedPositionQuantity + order.remainingQuantity);
    this.assertFinancialInvariants();
  }

  private releaseReservation(order: MutableOrder): void {
    if (order.reservedCash > 0) {
      this.ledger.reservedCash = normalizeZero(this.ledger.reservedCash - order.reservedCash);
      order.reservedCash = 0;
    }
    if (order.side === "sell" && order.remainingQuantity > 0) this.ledger.reservedPositionQuantity = normalizeZero(this.ledger.reservedPositionQuantity - order.remainingQuantity);
    this.assertFinancialInvariants();
  }

  private reservationFor(order: MutableOrder, quantity: number): number {
    if (order.limitPrice === undefined) return 0;
    const notional = order.limitPrice * quantity;
    return notional + calculateTransactionCost(this.options.commission, notional);
  }

  private normalizeRequest(request: ResearchOrderRequest): ResearchOrderRequest {
    if (!request || typeof request !== "object") throw new ResearchExecutionOrderError("INVALID_ORDER", "Order request is required");
    if (request.side !== "buy" && request.side !== "sell") throw new ResearchExecutionOrderError("INVALID_SIDE", "Order side is invalid");
    if (request.type !== "market" && request.type !== "limit") throw new ResearchExecutionOrderError("INVALID_TYPE", "Order type is invalid");
    const idempotencyKey = nonEmpty(request.idempotencyKey, "idempotencyKey");
    const quantity = this.normalizeQuantity(request.quantity, true);
    if (request.type === "limit" && (request.limitPrice === undefined || !Number.isFinite(request.limitPrice) || request.limitPrice <= 0)) throw new ResearchExecutionOrderError("INVALID_LIMIT_PRICE", "A limit order requires a positive finite limitPrice");
    const limitPrice = request.limitPrice === undefined ? undefined : this.normalizePrice(request.limitPrice, request.side);
    return {
      idempotencyKey,
      side: request.side,
      type: request.type,
      quantity,
      ...(limitPrice === undefined ? {} : { limitPrice }),
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    };
  }

  private normalizeQuantity(value: number, validateMinimum: boolean): number {
    if (!Number.isFinite(value) || value <= 0) throw new ResearchExecutionOrderError("INVALID_QUANTITY", "Order quantity must be positive and finite");
    let result = value;
    const step = this.options.precision.quantityStep;
    if (step !== undefined) {
      const units = result / step;
      if (Math.abs(units - Math.round(units)) > EPSILON) {
        if (this.options.precision.quantityPolicy === "reject") throw new ResearchExecutionOrderError("QUANTITY_PRECISION", "Quantity is not aligned to quantityStep");
        result = Math.floor(units + EPSILON) * step;
      }
    }
    result = normalizeZero(result);
    if (validateMinimum && this.options.precision.minimumQuantity !== undefined && result + EPSILON < this.options.precision.minimumQuantity) throw new ResearchExecutionOrderError("MINIMUM_QUANTITY", "Quantity is below minimumQuantity");
    if (result <= EPSILON) throw new ResearchExecutionOrderError("INVALID_QUANTITY", "Quantity rounds to zero");
    return result;
  }

  private normalizePrice(value: number, side: ResearchOrderSide): number {
    if (!Number.isFinite(value) || value <= 0) throw new ResearchExecutionOrderError("INVALID_PRICE", "Price must be positive and finite");
    const step = this.options.precision.tickSize;
    if (step === undefined) return value;
    const units = value / step;
    if (Math.abs(units - Math.round(units)) <= EPSILON) return normalizeZero(Math.round(units) * step);
    if (this.options.precision.tickPolicy === "reject") throw new ResearchExecutionOrderError("PRICE_PRECISION", "Price is not aligned to tickSize");
    const roundedUnits = side === "buy" ? Math.floor(units + EPSILON) : Math.ceil(units - EPSILON);
    return normalizeZero(roundedUnits * step);
  }

  private findBook(clock: number): BookCandidate | null {
    const candidates: BookCandidate[] = [];
    for (const book of this.books.values()) {
      if (!this.matchesTarget(book.instrumentId, book.venueId === null ? undefined : book.venueId)) continue;
      const state = book.controller.getState(this.options.maxDepth);
      if (book.lastSynchronizedClock !== null && book.lastSynchronizedClock <= clock) candidates.push({ book, state });
    }
    candidates.sort((left, right) => (right.book.lastSynchronizedClock ?? -1) - (left.book.lastSynchronizedClock ?? -1) || left.book.key.localeCompare(right.book.key));
    return candidates[0] ?? null;
  }

  private bookQuality(candidate: BookCandidate | null, event: MarketReplayEvent, clock: number): ResearchLiquidityQuality {
    if (candidate === null) {
      const status = this.sourceQuality(event.source);
      this.addQuality(status, "No matching synchronized order book is available");
      return {
      status,
      source: cloneSource(event.source),
      instrumentId: this.options.instrumentId,
      venueId: this.options.venueId,
      observedEventId: event.id,
      lastSynchronizedTime: null,
      quoteAgeMs: null,
      displayedQuantity: 0,
      reason: "No matching synchronized order book is available",
      };
    }
    const state = candidate.state;
    const sourceStatus = this.sourceStatuses.get(sourceKey(candidate.book.source));
    let status: ResearchSourceQuality = "available";
    let reason: string | undefined;
    if (sourceStatus?.status === "unavailable" || sourceStatus?.coverage === "unavailable") { status = "source-unavailable"; reason = "Source reported unavailable"; }
    else if (sourceStatus?.status === "stale") { status = "stale"; reason = "Order book is stale"; }
    else if (sourceStatus?.coverage === "partial" || sourceStatus?.coverage === "unknown" || sourceStatus?.status === "partial") { status = "partial-coverage"; reason = "Source coverage is not complete"; }
    else if (state.status === "stale" || state.status === "recovering" || state.status === "synchronizing" || state.status === "error") { status = "sequence-gap"; reason = state.reason ?? "Order book is not synchronized"; }
    const bestBid = state.bids[0]?.price;
    const bestAsk = state.asks[0]?.price;
    if (status === "available" && (bestBid === undefined || bestAsk === undefined || !Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= 0)) { status = "source-unavailable"; reason = "Best bid/ask is unavailable"; }
    else if (status === "available" && bestBid !== undefined && bestAsk !== undefined && bestBid > bestAsk) { status = "crossed"; reason = "Book is crossed"; }
    else if (status === "available" && bestBid !== undefined && bestAsk !== undefined && Math.abs(bestBid - bestAsk) <= EPSILON) { status = "locked"; reason = "Book is locked"; }
    const lastSynchronizedTime = candidate.book.lastSynchronizedClock ?? state.lastSynchronizedTime;
    const quoteAgeMs = lastSynchronizedTime === null ? null : clock - lastSynchronizedTime;
    if (status === "available" && (quoteAgeMs === null || quoteAgeMs < 0 || quoteAgeMs > this.options.maxQuoteAgeMs)) { status = "stale"; reason = "Quote age is outside the configured bound"; }
    const levelQuantity = Math.max(state.bids[0]?.quantity ?? 0, state.asks[0]?.quantity ?? 0);
    const quality: ResearchLiquidityQuality = {
      status,
      source: cloneSource(candidate.book.source),
      instrumentId: this.options.instrumentId,
      venueId: this.options.venueId,
      observedEventId: candidate.book.lastEventId ?? event.id,
      lastSynchronizedTime,
      quoteAgeMs,
      displayedQuantity: levelQuantity,
      ...(reason === undefined ? {} : { reason }),
    };
    if (status !== "available") this.addQuality(status, reason ?? status);
    return quality;
  }

  private sourceQuality(source: MarketReplaySource): ResearchSourceQuality {
    const observed = this.sourceStatuses.get(sourceKey(source));
    if (observed?.status === "unavailable" || observed?.coverage === "unavailable") return "source-unavailable";
    if (observed?.status === "stale") return "stale";
    if (observed?.status === "partial" || observed?.coverage === "partial" || observed?.coverage === "unknown") return "partial-coverage";
    return "source-unavailable";
  }

  private currentReferencePrice(side: ResearchOrderSide, limitPrice: number | undefined): number | null {
    const clock = this.currentClock();
    if (clock === null) return limitPrice ?? this.lastMarkPrice;
    const book = this.findBook(clock);
    const level = side === "buy" ? book?.state.asks[0] : book?.state.bids[0];
    return level?.price ?? limitPrice ?? this.lastMarkPrice;
  }

  private currentClock(): number | null {
    return this.lastEvent === null ? null : replayEventClock(this.lastEvent, this.options.clockPolicy);
  }

  private getOrCreateBook(instrumentId: string, venueId: string | undefined, source: MarketReplaySource): MutableBook {
    const key = streamKey(instrumentId, venueId, source);
    const existing = this.books.get(key);
    if (existing !== undefined) return existing;
    const book: MutableBook = {
      key,
      instrumentId,
      venueId: venueId ?? null,
      source: cloneSource(source),
      controller: new OrderBookController({ instrumentId, ...(venueId === undefined ? {} : { venueId }), source, maxDepth: this.options.maxDepth, tickPolicy: "reject" }),
      lastEventId: null,
      lastSynchronizedClock: null,
      consumedEventId: null,
      consumedBidQuantity: 0,
      consumedAskQuantity: 0,
      observedEventCount: 0,
    };
    this.books.set(key, book);
    return book;
  }

  private matchesTarget(instrumentId: string, venueId: string | undefined): boolean {
    return instrumentId === this.options.instrumentId && (this.options.venueId === null || venueId === this.options.venueId);
  }

  private updateMark(price: number, time: number): void {
    if (!Number.isFinite(price) || price <= 0) return;
    this.lastMarkPrice = price;
    this.lastMarkTime = time;
    if (this.ledger.position !== null) {
      this.ledger.position.markPrice = price;
      this.ledger.position.markTime = time;
    }
    this.updateHighWaterMark(time);
  }

  private updateHighWaterMark(time: number): void {
    const clock = this.lastEvent === null ? time : replayEventClock(this.lastEvent, this.options.clockPolicy);
    const snapshot = this.ledgerSnapshot(clock);
    if (snapshot.equity !== null && snapshot.equity > this.ledger.highWaterMark) this.ledger.highWaterMark = snapshot.equity;
  }

  private ledgerSnapshot(clockTime: number | null): ResearchLedgerSnapshot {
    const position = this.ledger.position;
    const markAge = position?.markTime === null || position?.markTime === undefined || clockTime === null ? null : clockTime - position.markTime;
    const valuation: ResearchLedgerSnapshot["valuation"] = position === null ? "complete" : position.markPrice === null ? "unknown" : markAge !== null && markAge > this.options.maxQuoteAgeMs ? "partial" : "complete";
    const marketValue = position === null ? null : position.markPrice === null ? null : position.quantity * position.markPrice;
    const equity = position === null ? this.ledger.cash : marketValue === null ? null : this.ledger.cash + marketValue;
    const drawdown = equity === null ? 0 : equity - this.ledger.highWaterMark;
    return {
      initialCapital: this.options.initialCapital,
      cash: normalizeZero(this.ledger.cash),
      reservedCash: normalizeZero(this.ledger.reservedCash),
      availableCash: normalizeZero(this.availableCash()),
      reservedPositionQuantity: normalizeZero(this.ledger.reservedPositionQuantity),
      position: position === null ? null : this.positionSnapshot(position),
      realizedPnl: normalizeZero(this.ledger.realizedPnl),
      totalFees: normalizeZero(this.ledger.totalFees),
      equity: equity === null ? null : normalizeZero(equity),
      valuation,
      highWaterMark: normalizeZero(this.ledger.highWaterMark),
      drawdown: normalizeZero(drawdown),
      drawdownPercent: this.ledger.highWaterMark > EPSILON ? normalizeZero(drawdown / this.ledger.highWaterMark) : null,
    };
  }

  private positionSnapshot(position: MutablePosition): ResearchPositionSnapshot {
    const marketValue = position.markPrice === null ? null : position.quantity * position.markPrice;
    const unrealizedPnl = position.markPrice === null ? null : calculateLongGrossPnl(position.averageEntryPrice, position.markPrice, position.quantity);
    return {
      quantity: normalizeZero(position.quantity),
      costBasis: normalizeZero(position.costBasis),
      averageEntryPrice: normalizeZero(position.averageEntryPrice),
      openEntryFees: normalizeZero(position.openEntryFees),
      markPrice: position.markPrice,
      marketValue: marketValue === null ? null : normalizeZero(marketValue),
      unrealizedPnl: unrealizedPnl === null ? null : normalizeZero(unrealizedPnl),
    };
  }

  private availableCash(): number {
    return this.ledger.cash - this.ledger.reservedCash;
  }

  private assertFinancialInvariants(): void {
    const { cash, reservedCash, reservedPositionQuantity, position } = this.ledger;
    if (![cash, reservedCash, reservedPositionQuantity].every(Number.isFinite)) throw new ResearchExecutionValidationError("Financial invariant violated: non-finite ledger value");
    if (cash < -EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: cash is negative");
    if (reservedCash < -EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: reserved cash is negative");
    if (this.availableCash() < -EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: available cash is negative");
    if (reservedPositionQuantity < -EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: reserved position is negative");
    if (position === null) {
      if (reservedPositionQuantity > EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: position is absent while quantity is reserved");
      return;
    }
    if (![position.quantity, position.costBasis, position.openEntryFees, position.averageEntryPrice].every(Number.isFinite)) throw new ResearchExecutionValidationError("Financial invariant violated: non-finite position value");
    if (position.quantity < -EPSILON || position.costBasis < -EPSILON || position.openEntryFees < -EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: negative position value");
    if (reservedPositionQuantity > position.quantity + EPSILON) throw new ResearchExecutionValidationError("Financial invariant violated: reserved position exceeds held position");
  }

  private finalizePendingOrders(): void {
    for (const order of this.orders.values()) {
      if (order.status !== "pending" && order.status !== "partially-simulated") continue;
      this.releaseReservation(order);
      order.status = "indeterminate";
      order.reason = "END_OF_TAPE_NO_ELIGIBLE_LIQUIDITY";
      this.recordJournal("system", this.lastEvent, "order-indeterminate", order.id, undefined, { reason: order.reason });
    }
  }

  private markOrderIndeterminate(order: MutableOrder, status: ResearchSourceQuality, reason: string): void {
    this.addQuality(status, reason);
    this.recordJournal("system", this.lastEvent, "order-eligibility-indeterminate", order.id, undefined, { reason, status });
    if (status === "missing-receive-time") {
      this.releaseReservation(order);
      order.status = "indeterminate";
      order.reason = reason;
    }
  }

  private nextDecisionMetadata(cursor: number): Pick<ResearchSubmitDecision, "decisionId" | "decisionOrdinal"> {
    const decisionOrdinal = (this.nextDecisionOrdinalByCursor.get(cursor) ?? 0) + 1;
    this.nextDecisionOrdinalByCursor.set(cursor, decisionOrdinal);
    return {
      decisionId: `${this.options.scenarioId}-decision-${this.nextDecisionNumber++}`,
      decisionOrdinal,
    };
  }

  private recordDecision(decision: ResearchDecisionRecord): void {
    this.decisions.push(decision);
    const bucket = this.decisionsByCursor.get(decision.decisionCursor);
    if (bucket === undefined) this.decisionsByCursor.set(decision.decisionCursor, [decision]);
    else bucket.push(decision);
  }

  private orderedDecisions(): readonly ResearchDecisionRecord[] {
    return [...this.decisions].sort((left, right) => left.decisionCursor - right.decisionCursor || left.decisionOrdinal - right.decisionOrdinal || left.decisionId.localeCompare(right.decisionId));
  }

  private assertNoFutureScenarioBranch(): void {
    if (this.decisions.some((decision) => decision.decisionCursor > this.currentIndex)) {
      throw new ResearchExecutionOrderError("FUTURE_DECISIONS", "The scenario has recorded future decisions; reset or use an explicit scenario fork before changing it");
    }
  }

  private recordJournal(kind: ResearchSnapshot["journal"][number]["eventKind"], event: MarketReplayEvent | null, transition: string, orderId?: string, fillId?: string, payload?: Record<string, ResearchJsonValue>, quality?: ResearchLiquidityQuality): void {
    this.nextJournalSequence += 1;
    const entry: ResearchSnapshot["journal"][number] = {
      id: `${this.options.scenarioId}-journal-${this.nextJournalSequence}`,
      scenarioId: this.options.scenarioId,
      cursor: this.currentIndex,
      eventId: event?.id ?? null,
      eventKind: kind,
      time: event?.time ?? null,
      decisionTime: kind === "decision" ? event?.time ?? null : null,
      eligibleTime: event === null ? null : replayEventClock(event, this.options.clockPolicy),
      transition,
      ...(orderId === undefined ? {} : { orderId }),
      ...(fillId === undefined ? {} : { fillId }),
      ...(event === undefined || event === null ? {} : { source: cloneSource(event.source) }),
      ...(quality === undefined ? {} : { quality: cloneQuality(quality) }),
      ...(payload === undefined ? {} : { payload: cloneJson(payload) }),
    };
    if (this.journal.length >= this.options.maxJournalEntries) {
      this.journal[this.journalHead] = entry;
      this.journalHead = (this.journalHead + 1) % this.options.maxJournalEntries;
      this.journalEvictedEntries += 1;
      if (!this.warnings.includes("Journal retention limit reached; oldest entries were evicted")) this.warnings.push("Journal retention limit reached; oldest entries were evicted");
    } else this.journal.push(entry);
  }

  private journalEntries(): readonly ResearchSnapshot["journal"][number][] {
    if (this.journalHead === 0 || this.journal.length < this.options.maxJournalEntries) return this.journal;
    return [...this.journal.slice(this.journalHead), ...this.journal.slice(0, this.journalHead)];
  }

  private journalRetention(): ResearchJournalRetention {
    return {
      retainedEntries: this.journal.length,
      totalEmittedEntries: this.nextJournalSequence,
      evictedEntries: this.journalEvictedEntries,
      complete: this.journalEvictedEntries === 0,
    };
  }

  private addQuality(value: ResearchSourceQuality, warning: string): void {
    this.quality.add(value);
    if (!this.warnings.includes(warning)) this.warnings.push(warning);
  }

  private diagnostics(): ResearchDiagnostics {
    const coverage = this.options.tape.sources.map((source) => {
      const status = this.sourceStatuses.get(sourceKey(source));
      return { source: cloneSource(source), status: status?.status ?? "not-reported", coverage: status?.coverage ?? "not-reported" };
    });
    return {
      quality: [...this.quality].sort(),
      warnings: [...this.warnings],
      sourceCoverage: coverage,
      observedTradeCount: this.observedTrades.size,
      observedOrderBookEventCount: [...this.books.values()].reduce((count, book) => count + book.observedEventCount, 0),
      simulatedFillCount: this.fills.size,
    };
  }

  private latencyDelay(decisionCursor: number): number {
    if (this.options.latency.type === "zero") return 0;
    if (this.options.latency.type === "fixed") return this.options.latency.delayMs;
    return this.options.latency.delaysMs[decisionCursor % this.options.latency.delaysMs.length] ?? 0;
  }

  private emit(): void {
    if (this.disposed || this.listeners.size === 0) return;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) listener(snapshot);
  }

  private invalidateSnapshot(): void {
    this.snapshotRevision += 1;
    this.cachedSnapshot = null;
    this.cachedSnapshotRevision = -1;
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new ResearchExecutionLifecycleError("Research execution session is disposed");
  }

  private assertActive(): void {
    this.assertNotDisposed();
    if (this.state === "error") throw new ResearchExecutionLifecycleError("Research execution session is in an error state");
  }
}

export function createResearchExecutionSession(options: ResearchExecutionOptions): ResearchExecutionSession {
  return new ResearchExecutionSessionImpl(options);
}

function mapSessionState(state: MarketReplayState["state"]): ResearchSessionState {
  return state;
}

function observedTouchPrice(event: MarketReplayEvent): number | null {
  if (event.kind === "trade") return event.trade.price;
  if (event.kind === "candle-complete") return event.candle.close;
  return null;
}

function sameRequest(decision: ResearchSubmitDecision, request: ResearchOrderRequest): boolean {
  return decision.side === request.side && decision.type === request.type && decision.quantity === request.quantity && decision.limitPrice === request.limitPrice;
}

function cloneLatency(value: ResearchLatencyPolicy): ResearchLatencyPolicy {
  return value.type === "bounded" ? { type: "bounded", delaysMs: [...value.delaysMs] } : { ...value };
}

function cloneJson<T extends ResearchJsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => cloneJson(entry)) as unknown as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, cloneJson(entry)])) as T;
}

function normalizeZero(value: number): number {
  return Math.abs(value) <= EPSILON ? 0 : Number(value.toPrecision(15));
}
