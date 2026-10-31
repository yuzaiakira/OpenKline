# Phase 16 execution-research public API proposal

Status: **PROPOSED — NOT PUBLIC**

This document remains an owner-review proposal. Phase 16.0 now has an internal
implementation, but no declaration here is exported from the root package,
included in package metadata, or covered by a public compatibility promise.
The protected API baseline remains unchanged.

## Proposed surface

The eventual additive contract may expose a framework-neutral session only
after the internal reference implementation and all Phase 15.5 approval gates
are complete. Names are provisional.

```ts
interface ExecutionResearchSessionOptions {
  readonly version: 1;
  readonly tape: MarketReplayTape;
  readonly instrumentId: string;
  readonly venueId?: string;
  readonly initialCapital: number;
  readonly currency: string;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly latency: ExecutionLatencyPolicy;
  readonly execution: ExecutionModelPolicy;
  readonly costs: TransactionCostPolicy;
  readonly precision: ExecutionPrecisionPolicy;
  readonly risk?: ExecutionRiskLimits;
  readonly passivePolicy: PassiveExecutionPolicy;
}

interface ExecutionResearchOrderDecision {
  readonly idempotencyKey: string;
  readonly side: "buy" | "sell";
  readonly type: "market" | "limit";
  readonly quantity: number;
  readonly limitPrice?: number;
  readonly decisionEventId: string;
  readonly decisionCursor: number;
  readonly reason?: string;
}

interface LiquidityQuality {
  readonly status: "available" | "stale" | "crossed" | "locked" | "sequence-gap" | "partial-coverage" | "unavailable" | "indeterminate";
  readonly source: MarketReplaySource;
  readonly lastSynchronizedTime: number | null;
  readonly reason?: string;
}

interface SimulatedFill {
  readonly simulated: true;
  readonly orderId: string;
  readonly referenceEventIds: readonly string[];
  readonly quantity: number;
  readonly price: number;
  readonly fee: number;
  readonly modeledSlippage: number;
  readonly quality: LiquidityQuality;
  readonly assumptionsFingerprint: string;
}

interface ExecutionResearchLedgerSnapshot {
  readonly cash: number;
  readonly reservedCash: number;
  readonly availableCash: number;
  readonly positionQuantity: number;
  readonly costBasis: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number | null;
  readonly equity: number | null;
  readonly totalFees: number;
  readonly valuation: "complete" | "partial" | "unknown";
}

interface ScenarioJournalEntry {
  readonly scenarioId: string;
  readonly orderId?: string;
  readonly cursor: number;
  readonly decisionTime: number | null;
  readonly eligibleTime: number | null;
  readonly transition: string;
  readonly source: MarketReplaySource;
  readonly referenceEventIds: readonly string[];
  readonly ledger: ExecutionResearchLedgerSnapshot;
  readonly quality: LiquidityQuality;
}

interface ExecutionResearchSession {
  submit(decision: ExecutionResearchOrderDecision): ResearchOrder;
  cancel(orderId: string): ResearchOrder;
  start(): void;
  pause(): void;
  step(): void;
  seek(cursor: number): void;
  reset(): void;
  snapshot(): ExecutionResearchSnapshot;
  exportScenario(): ExecutionResearchExport;
  dispose(): void;
}
```

The final names and field types require a separate additive API review. The
proposal must not expose callbacks, Workers, DOM objects, runtime datafeed
instances, mutable tape objects, or source credentials. Exports should be
versioned and JSON-safe, with explicit limits for event count, journal size,
orders, and serialized bytes.

## Compatibility decisions requiring approval

- Whether the session belongs in Core, a separately versioned research package,
  or remains private to a future Studio integration;
- whether `MarketReplayTape` is a stable input contract or must be wrapped by a
  versioned research-tape reference;
- whether simulated fills and ledger snapshots may be persisted or only
  exported as clearly labelled research artifacts;
- how breaking changes to execution assumptions and result schemas are
  versioned;
- whether a consumer may use the API without a broker/datafeed dependency;
- support, documentation, security disclosure, and license implications.

Until each decision is recorded by the authorized owner, these declarations
remain **PROPOSED — NOT PUBLIC** and `npm run api:check` must continue to use
the protected historical baseline.

## Phase 16.1 implementation boundary

The internal Phase 16.1 implementation adds a schema-1 scenario artifact,
strict validator, canonical serializer, result fingerprint helper, and trusted
reconstructor under `src/research-execution`. These are implementation
research tools only. They do not change the proposal above, the root exports,
the React exports, package metadata, Studio contracts, or the protected API
inventory. No public consumer may rely on the artifact schema or reconstruction
status until a separate owner decision approves an additive API.

The artifact's optional expected-result evidence is intentionally not a public
result-import API: restoration derives all orders, fills, journals,
diagnostics, and ledger values through the internal engine and only compares a
new fingerprint with supplied evidence. The content hash is unauthenticated,
so it is not a signing, authorization, or exchange-provenance mechanism.

The following decisions remain for a future API review: whether scenario files
belong in Core or a separately versioned research package; whether tape/source
generation references can be stabilized; whether any research artifact may be
persisted by consumers; the compatibility and migration policy for assumption
and result schemas; and the security, documentation, licensing, and support
obligations of exposing deterministic reconstruction. Phase 16.2, Studio,
worker, broker, live-execution, publication, and release work remain outside
the current authorization.
