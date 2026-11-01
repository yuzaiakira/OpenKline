import type { MarketReplayClockPolicy, MarketReplayEvent, MarketReplayKnowledgePolicy, MarketReplaySource, MarketReplayTape } from "../replay/market-event-tape.js";
import type { TransactionCost } from "../backtesting/types.js";

/** Internal Phase 16.0 scenario schema. It is intentionally not exported from the root package. */
export const OPENKLINE_RESEARCH_EXECUTION_VERSION = 1 as const;
/** Versioned internal artifact schema; intentionally absent from public package exports. */
export const OPENKLINE_RESEARCH_SCENARIO_ARTIFACT_VERSION = 1 as const;

export type ResearchOrderSide = "buy" | "sell";
export type ResearchOrderType = "market" | "limit";
export type ResearchOrderStatus =
  | "submitted"
  | "accepted"
  | "pending"
  | "partially-simulated"
  | "fully-simulated"
  | "cancelled"
  | "rejected"
  | "expired"
  | "indeterminate";
export type ResearchSessionState = "idle" | "ready" | "playing" | "paused" | "completed" | "error" | "disposed";
export type ResearchPassivePolicy = "no-inferred-passive-fill" | "conservative-eligibility" | "explicit-scenario";
export type ResearchScenarioBias = "optimistic" | "conservative" | "indeterminate";
export type ResearchValuationStatus = "complete" | "partial" | "unknown";
export type ResearchSourceQuality =
  | "available"
  | "stale"
  | "crossed"
  | "locked"
  | "sequence-gap"
  | "missing-receive-time"
  | "partial-coverage"
  | "source-unavailable"
  | "invalid-price"
  | "invalid-quantity"
  | "unsupported-corporate-action"
  | "indeterminate";

export type ResearchLatencyPolicy =
  | { readonly type: "zero" }
  | { readonly type: "fixed"; readonly delayMs: number }
  | { readonly type: "bounded"; readonly delaysMs: readonly number[] };

export interface ResearchPrecisionPolicy {
  readonly tickSize?: number;
  readonly quantityStep?: number;
  readonly minimumQuantity?: number;
  readonly tickPolicy: "reject" | "round";
  readonly quantityPolicy: "reject" | "round";
}

export interface ResearchExecutionPolicy {
  /** Maximum displayed depth fraction a simulated fill may consume per event. */
  readonly maxParticipationRate: number;
  readonly allowPartialFills: boolean;
  readonly passivePolicy: ResearchPassivePolicy;
  /** Explicit scenario mode may use a limit touch as a hypothetical fill. */
  readonly scenarioBias?: Exclude<ResearchScenarioBias, "indeterminate">;
}

export interface ResearchRiskLimits {
  readonly maxOrderNotional?: number;
  readonly maxOrderQuantity?: number;
  readonly maxPositionQuantity?: number;
  readonly maxPendingOrders?: number;
  readonly maxDrawdown?: number;
}

export interface ResearchExecutionOptions {
  readonly scenarioId?: string;
  readonly tape: MarketReplayTape;
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly initialCapital: number;
  readonly currency: string;
  readonly clockPolicy?: MarketReplayClockPolicy;
  readonly knowledgePolicy?: MarketReplayKnowledgePolicy;
  readonly latency?: ResearchLatencyPolicy;
  readonly execution?: ResearchExecutionPolicy;
  readonly precision?: Partial<ResearchPrecisionPolicy>;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly priceImpact?: TransactionCost;
  readonly maxQuoteAgeMs?: number;
  readonly risk?: ResearchRiskLimits;
  /** Optional authoritative corporate-action source. Without it, conflicting provider identities fail closed. */
  readonly corporateActionSource?: MarketReplaySource;
  readonly maxJournalEntries?: number;
  readonly maxDepth?: number;
  /** Internal bounded acceleration controls; never persisted in scenario artifacts. */
  readonly checkpoints?: ResearchCheckpointOptions;
}

export interface ResearchCheckpointOptions {
  readonly enabled?: boolean;
  readonly interval?: number;
  readonly maxCheckpoints?: number;
  /** Approximate retained checkpoint bytes, not a measured JavaScript heap bound. */
  readonly memoryBudgetBytes?: number;
}

export type ResearchCheckpointFallbackCode =
  | "order-book-state-not-restorable"
  | "checkpoint-over-budget"
  | "checkpoint-incompatible"
  | "checkpoint-restore-rejected";

export interface ResearchCheckpointFallback {
  readonly code: ResearchCheckpointFallbackCode;
  readonly eventIndex: number;
  readonly reason: string;
}

export interface ResearchCheckpointDiagnostics {
  readonly enabled: boolean;
  readonly interval: number;
  readonly maxCheckpoints: number;
  readonly memoryBudgetBytes: number;
  readonly retainedCheckpoints: number;
  readonly estimatedRetainedBytes: number;
  readonly evictions: number;
  readonly invalidations: number;
  readonly fallbacks: readonly ResearchCheckpointFallback[];
}

export interface ResearchOrderRequest {
  readonly idempotencyKey: string;
  readonly side: ResearchOrderSide;
  readonly type: ResearchOrderType;
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly reason?: string;
}

export type ResearchDecisionType = "submit-order" | "cancel-order";

export interface ResearchSubmitDecision extends ResearchOrderRequest {
  readonly decisionId: string;
  readonly decisionType: "submit-order";
  readonly decisionOrdinal: number;
  readonly orderId: string;
  readonly scenarioId: string;
  readonly decisionEventId: string;
  readonly decisionCursor: number;
  readonly decisionTime: number;
  readonly decisionClockTime: number | null;
  readonly eligibleClockTime: number | null;
}

export interface ResearchCancelDecision {
  readonly decisionId: string;
  readonly decisionType: "cancel-order";
  readonly decisionOrdinal: number;
  readonly orderId: string;
  readonly scenarioId: string;
  readonly decisionEventId: string;
  readonly decisionCursor: number;
  readonly decisionTime: number;
  readonly decisionClockTime: number | null;
  readonly eligibleClockTime: null;
  readonly reason: string;
}

export type ResearchDecisionRecord = ResearchSubmitDecision | ResearchCancelDecision;

export interface ResearchLiquidityQuality {
  readonly status: ResearchSourceQuality;
  readonly source: MarketReplaySource | null;
  readonly instrumentId: string;
  readonly venueId: string | null;
  readonly observedEventId: string | null;
  readonly lastSynchronizedTime: number | null;
  readonly quoteAgeMs: number | null;
  readonly displayedQuantity: number;
  readonly reason?: string;
}

export interface ResearchFill {
  readonly simulated: true;
  readonly id: string;
  readonly orderId: string;
  readonly side: ResearchOrderSide;
  readonly time: number;
  readonly referencePrice: number;
  readonly executionPrice: number;
  readonly quantity: number;
  readonly fee: number;
  readonly slippage: number;
  readonly priceImpact: number;
  readonly referenceEventIds: readonly string[];
  readonly quality: ResearchLiquidityQuality;
  readonly scenarioBias: ResearchScenarioBias;
}

export interface ResearchOrder {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly scenarioId: string;
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly side: ResearchOrderSide;
  readonly type: ResearchOrderType;
  readonly limitPrice?: number;
  readonly requestedQuantity: number;
  readonly remainingQuantity: number;
  readonly simulatedQuantity: number;
  readonly weightedAverageExecutionPrice: number | null;
  readonly cumulativeFees: number;
  readonly reservedCash: number;
  readonly status: ResearchOrderStatus;
  readonly submittedAt: number;
  readonly decisionEventId: string;
  readonly decisionCursor: number;
  readonly eligibleClockTime: number | null;
  readonly fills: readonly string[];
  readonly reason?: string;
}

export interface ResearchPositionSnapshot {
  readonly quantity: number;
  readonly costBasis: number;
  readonly averageEntryPrice: number;
  readonly openEntryFees: number;
  readonly markPrice: number | null;
  readonly marketValue: number | null;
  readonly unrealizedPnl: number | null;
}

export interface ResearchLedgerSnapshot {
  readonly initialCapital: number;
  readonly cash: number;
  readonly reservedCash: number;
  readonly availableCash: number;
  readonly reservedPositionQuantity: number;
  readonly position: ResearchPositionSnapshot | null;
  readonly realizedPnl: number;
  readonly totalFees: number;
  readonly equity: number | null;
  readonly valuation: ResearchValuationStatus;
  readonly highWaterMark: number;
  readonly drawdown: number;
  readonly drawdownPercent: number | null;
}

export type ResearchJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly ResearchJsonValue[]
  | { readonly [key: string]: ResearchJsonValue };

export interface ResearchJournalEntry {
  readonly id: string;
  readonly scenarioId: string;
  readonly cursor: number;
  readonly eventId: string | null;
  readonly eventKind: MarketReplayEvent["kind"] | "decision" | "system";
  readonly time: number | null;
  readonly decisionTime: number | null;
  readonly eligibleTime: number | null;
  readonly transition: string;
  readonly orderId?: string;
  readonly fillId?: string;
  readonly source?: MarketReplaySource;
  readonly quality?: ResearchLiquidityQuality;
  readonly payload?: { readonly [key: string]: ResearchJsonValue };
}

export interface ResearchJournalRetention {
  readonly retainedEntries: number;
  readonly totalEmittedEntries: number;
  readonly evictedEntries: number;
  readonly complete: boolean;
}

export interface ResearchDiagnostics {
  readonly quality: ResearchSourceQuality[];
  readonly warnings: readonly string[];
  readonly sourceCoverage: readonly {
    readonly source: MarketReplaySource;
    readonly status: string;
    readonly coverage: string;
  }[];
  readonly observedTradeCount: number;
  readonly observedOrderBookEventCount: number;
  readonly simulatedFillCount: number;
  readonly checkpoints: ResearchCheckpointDiagnostics;
}

export interface ResearchSnapshot {
  readonly version: typeof OPENKLINE_RESEARCH_EXECUTION_VERSION;
  readonly scenarioId: string;
  readonly state: ResearchSessionState;
  readonly cursor: { readonly eventIndex: number | null; readonly eventId: string | null; readonly time: number | null; readonly clockTime: number | null };
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly ledger: ResearchLedgerSnapshot;
  readonly orders: readonly ResearchOrder[];
  readonly fills: readonly ResearchFill[];
  readonly journal: readonly ResearchJournalEntry[];
  readonly journalRetention: ResearchJournalRetention;
  readonly diagnostics: ResearchDiagnostics;
  readonly error?: string;
}

export interface ResearchScenarioAssumptions {
  readonly instrumentId: string;
  readonly venueId: string | null;
  readonly currency: string;
  readonly initialCapital: number;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly latency: ResearchLatencyPolicy;
  readonly execution: ResearchExecutionPolicy;
  readonly precision: ResearchPrecisionPolicy;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly priceImpact: TransactionCost | null;
  readonly maxQuoteAgeMs: number;
  readonly risk: ResearchRiskLimits;
  readonly corporateActionSource: MarketReplaySource | null;
  readonly maxJournalEntries: number;
  readonly maxDepth: number;
}

export interface ResearchScenarioCursor {
  readonly eventIndex: number | null;
  readonly eventId: string | null;
  readonly time: number | null;
  readonly clockTime: number | null;
}

export type ResearchScenarioRestorableState = "idle" | "ready" | "paused" | "completed";

export interface ResearchScenarioFrontier extends ResearchScenarioCursor {
  readonly state: ResearchScenarioRestorableState;
}

export interface ResearchScenarioResultEvidence {
  readonly algorithm: "fnv1a64";
  readonly fingerprint: string;
  readonly state: ResearchSessionState;
  readonly cursor: ResearchScenarioCursor;
}

export interface ResearchScenarioArtifactIntegrity {
  /** This is a content hash only; it is not an authenticated signature. */
  readonly algorithm: "fnv1a64";
  readonly contentHash: string;
  readonly authenticated: false;
}

export interface ResearchScenarioArtifact {
  readonly artifactType: "openkline-research-scenario";
  readonly schemaVersion: typeof OPENKLINE_RESEARCH_SCENARIO_ARTIFACT_VERSION;
  readonly scenarioId: string;
  readonly tape: {
    readonly id: string;
    readonly fingerprint: string;
    readonly version: number;
    readonly orderingVersion: number;
    readonly instrumentIds: readonly string[];
    readonly sources: readonly MarketReplaySource[];
  };
  readonly replay: {
    readonly tapeVersion: number;
    readonly orderingVersion: number;
    readonly clockPolicy: MarketReplayClockPolicy;
    readonly knowledgePolicy: MarketReplayKnowledgePolicy;
    readonly frontier: ResearchScenarioFrontier;
  };
  readonly assumptions: ResearchScenarioAssumptions;
  readonly decisions: readonly ResearchDecisionRecord[];
  readonly decisionHistory: {
    readonly complete: boolean;
    readonly count: number;
    readonly lastDecisionOrdinal: number | null;
  };
  readonly journalRetention: ResearchJournalRetention;
  readonly expectedResult?: ResearchScenarioResultEvidence;
  readonly integrity: ResearchScenarioArtifactIntegrity;
}

export interface ResearchScenarioArtifactCreateOptions {
  readonly includeExpectedResult?: boolean;
}

export interface ResearchScenarioArtifactValidationOptions {
  readonly maxSerializedBytes?: number;
  readonly maxDecisions?: number;
  readonly maxStringLength?: number;
  readonly maxNestingDepth?: number;
}

export interface ResearchScenarioRestoreOptions {
  readonly artifact: ResearchScenarioArtifact | string | unknown;
  readonly tape: MarketReplayTape;
  readonly validation?: ResearchScenarioArtifactValidationOptions;
  /** Internal cooperative cancellation boundary; absent from public package APIs. */
  readonly signal?: AbortSignal;
  /** Internal event-visit accounting hook; called before each restored event. */
  readonly onEventVisit?: (eventIndex: number) => void;
  /** Internal checkpoint policy for a fresh restored session. */
  readonly checkpoints?: ResearchCheckpointOptions;
}

export type ResearchScenarioReconstructionStatus = "verified" | "mismatch" | "no-expected-result";

export interface ResearchScenarioReconstructionResult {
  readonly status: ResearchScenarioReconstructionStatus;
  readonly artifact: ResearchScenarioArtifact;
  readonly session: ResearchExecutionSession;
  readonly actual: ResearchScenarioExport;
  readonly actualResult: ResearchScenarioResultEvidence;
  readonly expectedResult: ResearchScenarioResultEvidence | null;
}

export interface ResearchScenarioExport {
  readonly version: typeof OPENKLINE_RESEARCH_EXECUTION_VERSION;
  readonly scenarioId: string;
  readonly tapeFingerprint: string;
  readonly tapeId: string;
  readonly assumptions: ResearchScenarioAssumptions;
  readonly decisions: readonly ResearchDecisionRecord[];
  readonly orders: readonly ResearchOrder[];
  readonly fills: readonly ResearchFill[];
  readonly ledger: ResearchLedgerSnapshot;
  readonly journal: readonly ResearchJournalEntry[];
  readonly journalRetention: ResearchJournalRetention;
  readonly diagnostics: ResearchDiagnostics;
}

export interface ResearchExecutionSession {
  getSnapshot(): ResearchSnapshot;
  getOrders(): readonly ResearchOrder[];
  getFills(): readonly ResearchFill[];
  getJournal(): readonly ResearchJournalEntry[];
  submitOrder(request: ResearchOrderRequest): ResearchOrder;
  cancelOrder(orderId: string, reason?: string): ResearchOrder;
  start(): void;
  play(): void;
  pause(): void;
  step(): void;
  seekToTimestamp(timestamp: number): void;
  seekToEvent(eventId: string): void;
  reset(): void;
  subscribe(listener: (snapshot: ResearchSnapshot) => void): () => void;
  exportScenario(): ResearchScenarioExport;
  exportScenarioArtifact(options?: ResearchScenarioArtifactCreateOptions): ResearchScenarioArtifact;
  dispose(): void;
}
