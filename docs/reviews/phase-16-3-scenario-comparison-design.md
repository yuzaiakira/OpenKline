# OpenKline Phase 16.3 — Research Scenario Comparison and Execution-Assumption Sensitivity

Status: **DESIGN APPROVED — INTERNAL IMPLEMENTATION IN PROGRESS — NOT PUBLIC**

This document is an internal design and authorization handoff. It does not
add a comparison engine, change a source or public interface, authorize a
public API, or establish that a simulated fill occurred on an exchange.
Every result described by the proposed capability would remain a modeled
research result.

## 1. Review boundary and repository state

The original Phase 16.3 specification required a design-only handoff. The
owner has since explicitly approved both design documentation and the limited
internal implementation described in the separate authorization message. The
implementation remains restricted to internal source, tests, benchmarks, and
technical documentation; it does not authorize Studio, Worker, public export,
or release work.

The specification names `40e6d12ac0bb12b7b0da29a1c280b023c419d975` as its
starting SHA. The actual checkout inspected for this handoff is different:

| Item | Observed value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` at `/workspace/OpenKline` |
| Branch | `main` |
| Original local `HEAD` | `719e693ad2afedb786bc41557c5e2f47982d5c27` |
| Refreshed local `HEAD` | `40e6d12ac0bb12b7b0da29a1c280b023c419d975` |
| Refreshed `origin/main` | `40e6d12ac0bb12b7b0da29a1c280b023c419d975` |
| Working tree after reconciliation | Only this untracked design document |
| Specification starting SHA | `40e6d12ac0bb12b7b0da29a1c280b023c419d975` |
| Source changes in this handoff | None |
| Public API/baseline changes | None |

The initial checkout was seven commits behind the actual remote. The design
document was verified before Git operations, copied outside the checkout to
`/tmp/openkline-phase16-3-reconcile.oFBfoF/phase-16-3-scenario-comparison-design.md`,
and matched its original SHA-256:
`91278d0160bdf2c3ae1f42e5abd939847c810f4f4dcd60e46fa08c879327b6c0`.
`origin/main` was fetched and the local branch was updated with
`git merge --ff-only origin/main`; no reset, clean, forced checkout, or
destructive history operation was used. The seven fetched commits are the
Phase 16.2 checkpoint and Phase 16.2.1 evidence-compatibility history. The
design file was not replaced by that fast-forward.

### Existing components reviewed

| Existing component | Relevant capability | Phase 16.3 treatment |
| --- | --- | --- |
| `src/research-execution/types.ts` | Version-1 assumptions, decisions, orders, fills, ledger, diagnostics, artifacts, evidence, bounded validation options, and internal checkpoint controls/diagnostics | Reuse as the internal input/evidence foundation; do not make it public |
| `scenario-artifact.ts` | Strict schema-1 data validation, canonical serialization, tape/source binding, ordinary content-integrity hash | Validate every input before allocating execution sessions; expected results remain advisory |
| `scenario-restore.ts` | Fresh-session restoration, exact tape/source/venue/frontier checks, derived orders/fills/ledger/journal, disposal on failure | Use as the candidate isolation boundary; compare independently restored results |
| `engine.ts` and internal session | Causal event processing, durable submit/cancel decisions, reservations, fills, quality, sessions, corporate actions, export, disposal, and format-1 causal checkpoints | Preserve semantics; later implementation may need internal comparison hooks, not public methods |
| `reference.ts` | Independent ledger arithmetic and transaction-cost parity checks | Use as a test oracle, never as an imported result or exchange truth |
| `MarketReplayTape` | Canonical event ordering, fingerprint, source generations, instruments, event/receive time, session and corporate-action events | Require exact tape identity and source-generation agreement |
| `MarketReplayController` | Causal cursor, clock/knowledge policies, integrity, snapshots, and eligible-event traversal | Share only validated immutable tape data; do not treat controller state as comparison evidence |
| `research-execution-checkpoints.md` | Format-1 immutable research-state checkpoints, decision-history revision binding, live-book fail-closed restore, bounded retention, and fallback diagnostics | Optional acceleration only; never cross assumption/session boundaries or replace fresh candidate evidence |
| `src/optimization` | Bounded candidate generation, cancellation/progress conventions, deterministic parameter serialization, descriptive robustness reporting | Reuse design ideas only; do not treat candle `BacktestResult` as a research-execution result |
| `docs/architecture/*` and Phase 16 reports | No-lookahead, resource, lifecycle, public-boundary, and uncertainty policies | Preserve and extend internally after separate authorization |
| `docs/reviews/phase-16-public-api-proposal.md` | `PROPOSED — NOT PUBLIC` boundary | Keep comparison contracts internal and absent from root/React exports |

The current optimization sensitivity utility varies strategy parameters over
candles and can rank available backtest scores. It is not a suitable direct
implementation of execution-assumption sensitivity: it must not rank
research results, coerce incomplete valuation to zero, or mix candle
backtests with replay-causal fills.

Phase 16.2 introduced an opt-in internal research checkpoint cache with a
default of `enabled: false`. Phase 16.2.1 made the schema-1 result evidence
projection explicitly causal: checkpoint enablement, retention, estimated
bytes, evictions, invalidations, timings, and fallback history are operational
diagnostics and are excluded from the result fingerprint. The comparison
design must preserve that separation.

## 2. Problem and intended internal use

### Problem

An execution-research scenario contains a historical tape binding, a causal
decision history, execution assumptions, and a result derived by replay. A
single restored scenario cannot answer whether a change in commission,
latency, displayed liquidity, or another modeled assumption changed the
result. Re-running candidates without exact identity, isolated state, and
explicit classification can accidentally compare different market data,
reuse future information, mutate the baseline, or present an indeterminate
outcome as a favorable one.

Phase 16.3 should provide an internal comparison protocol that makes those
distinctions explicit and reproducible.

### Intended uses

- Compare a baseline artifact with a bounded set of independently restored
  candidate artifacts using exactly the same historical tape.
- Measure descriptive deltas in modeled costs, fills, positions, and ledger
  state when the decision history is demonstrably compatible.
- Identify when an assumption change also changed order decisions, and report
  that fact instead of attributing all differences to execution quality.
- Explore bounded execution-assumption sensitivity for internal research,
  with provenance and uncertainty diagnostics attached to every candidate.
- Produce repeatable offline evidence for engineering tests and benchmark
  investigations.

This is not a profitability optimizer, exchange-fill estimator, statistical
test, broker simulator, live-trading facility, or public consumer API.

## 3. Proposed internal comparison contract

The following names are design notation, not declarations to add to the
package. They describe a future internal module and require owner approval
before implementation.

### 3.1 Input model

The recommended initial contract compares fully materialized, schema-1
artifacts. It does not silently patch a baseline object in place.

```ts
type ScenarioComparisonPlan = {
  schemaVersion: 1;
  baseline: ScenarioComparisonInput;
  candidates: readonly ScenarioComparisonInput[];
  limits: ScenarioComparisonLimits;
  compatibility: {
    requireExactTape: true;
    classifyDecisionHistory: true;
  };
  signal?: AbortSignal;                 // internal orchestration only
  onProgress?: (event: ComparisonProgress) => void;
};

type ScenarioComparisonInput = {
  candidateId: string;
  artifact: unknown;                    // validated before restore
  tape: MarketReplayTape;               // separately validated exact tape
  label?: string;
  assumptionChange?: Readonly<Record<string, unknown>>;
};
```

The `artifact` field is intentionally unknown at the boundary. The
implementation must parse and strictly validate it with the existing
schema-1 validator, then bind it to the separately supplied tape. A caller
must not be able to provide imported orders, fills, ledger values, or
diagnostics as authoritative candidate state.

The first implementation should accept full candidate artifacts rather than
inventing an unsafe “mutate these assumptions” shortcut. Sensitivity tooling
may generate candidate artifacts only through a deterministic, explicitly
causal scenario-generation path. An assumption patch must never mutate the
baseline artifact, its decision array, tape, or restored session.

### 3.2 Input validation and compatibility classes

Validation is performed for every input before any scenario session is
started. The comparator should classify, rather than blur, these cases:

| Classification | Meaning | Permitted comparison |
| --- | --- | --- |
| `identical-decision-history` | Canonical ordered decision references and decision semantics match; only allowed execution assumptions differ | Per-order and aggregate baseline deltas may be reported, subject to valuation/quality status |
| `compatible-fixed-history` | The same causal decision actions can be proven compatible with the candidate assumptions, even if assumption-derived execution metadata is regenerated | Aggregate and explicitly matched decision deltas; no implicit order matching |
| `decision-history-different` | The candidate accepted, rejected, submitted, or cancelled different decisions | Aggregate results may be shown with a prominent classification; per-order attribution and “better” ranking are not valid by default |
| `incompatible-tape` | Tape ID, fingerprint, version, ordering, instrument set, venue, source generation, or required frontier differs | Reject before replay with a typed error |
| `incomplete-or-indeterminate` | History, valuation, receive times, source coverage, depth, sessions, or corporate-action knowledge is insufficient | Preserve unknown/indeterminate values; do not rank or replace them with zero |

Decision-history equality must use a canonical ordered representation of
stable decision references: decision ordinal, decision kind, stable decision
identity, cursor/event identity, instrument/venue, order action, and relevant
causal times. Scenario IDs and labels are provenance, not decision content.
Any omission from that canonical representation must be a deliberate,
versioned contract decision.

The comparator must not infer comparability from matching symbols, timestamps,
or display labels. Exact `MarketReplayTape` identity and source-generation
binding are mandatory. A candidate generated from a different provider
revision, event ordering, clock policy, knowledge policy, or incomplete
frontier is not a compatible replay merely because its candles look similar.

### 3.3 Proposed resource and lifecycle contract

The following limits are proposals for owner review, not accepted project
policy. They are deliberately bounded and should be validated against real
internal workloads before implementation:

```ts
type ScenarioComparisonLimits = {
  maxCandidates: number;              // proposed default 8, absolute 32
  maxTotalDecisionRecords: number;    // proposed default 400_000
  maxAggregateSerializedBytes: number;// proposed default 64 MiB
  maxDiagnostics: number;             // proposed default 10_000 per result
  maxRetainedCheckpoints: number;     // proposed default 0 for first version
  executionMode: "sequential";       // no Worker in this phase
};

type ComparisonProgress = {
  phase: "validating" | "restoring" | "comparing" | "disposing" | "completed";
  candidateId: string | null;
  candidateIndex: number;
  candidateCount: number;
  processedDecisions: number;
  percentage: number;
};
```

The comparator should validate all candidate count, byte, decision, string,
array, nesting, latency, journal, pending-order, and replay-depth limits
against the existing absolute schema/session ceilings. The proposed aggregate
limits must not weaken the existing per-artifact limits.

The recommended first executor is sequential. It should:

1. Validate and fingerprint the tape and all artifacts before starting the
   baseline restore.
2. Restore the baseline in a fresh session and retain only immutable exported
   evidence required for the comparison.
3. Dispose the baseline session before or immediately after the result is
   captured according to the selected result-retention policy.
4. Restore each candidate in a fresh session, compare its derived export and
   diagnostics, and dispose it in a `finally` path on success, mismatch,
   cancellation, or failure.
5. Check cancellation before validation, before each candidate, after each
   bounded replay phase, and before publishing a completed report.
6. Never return a partially completed report with a `completed` status.

The existing synchronous engine does not currently provide arbitrary
mid-replay cancellation. If a future executor requires cooperative checks
inside long restores, that is an explicit internal engine change to design
and test; it is not permission to add a Worker or alter public APIs.

## 4. Identity, provenance, and deterministic fingerprints

The comparison must carry separate identities rather than using one hash for
all purposes:

1. **Tape identity** — exact tape ID, canonical tape fingerprint, tape and
   ordering versions, instrument set, venue set, source IDs/versions, clock
   policy, and knowledge policy.
2. **Artifact identity** — schema version, scenario ID, canonical artifact
   content hash, and serialized size. The existing FNV-1a hash remains an
   ordinary corruption check, not authentication or authorization.
3. **Assumption fingerprint** — canonical serialization of the normalized
   execution assumptions, including capital/currency, latency, execution
   policy, precision, costs, risk, corporate-action source, and causal
   journal/depth limits. Operational checkpoint controls are not scenario
   assumptions and must be tracked separately from this fingerprint.
4. **Decision-history fingerprint** — canonical ordered decision references,
   independent of scenario display labels. It must be distinct from the
   artifact hash because two artifacts can differ only in assumptions.
5. **Derived-result evidence** — the existing result evidence fingerprint,
   state, cursor, and frontier, computed from freshly reconstructed state using
   the explicit causal diagnostics projection. Operational checkpoint
   settings and cache measurements must not affect this evidence.
6. **Comparison fingerprint** — canonical sorted records containing the
   comparison schema version, baseline/candidate identities, compatibility
   classes, fingerprints, metric availability/status, deltas, warnings, and
   provenance. Candidate input order must not alter this fingerprint; stable
   candidate IDs and canonical sorting must.

The comparison fingerprint is reproducibility evidence for the internal
report. It is not a signature, trust anchor, proof of provider truth, or
authorization to execute orders.

### Baseline isolation

The baseline tape, artifact, assumptions, decision history, exported evidence,
and restored session must be treated as read-only. Candidate generation must
clone or re-materialize data through a validated path. A candidate mutation,
candidate seek, candidate cancellation, or candidate disposal must not alter
the baseline. The implementation should prove this by exporting baseline
state before and after the complete comparison and checking byte/fingerprint
equality.

## 5. Causality and execution-assumption sensitivity

### 5.1 General rules

Observed tape events remain the only market-data inputs. Simulated orders and
fills stay in the research-execution namespace and must never be appended to
observed trades, order-book history, CVD, Footprint, or the canonical tape.
Each candidate starts from the same eligible causal frontier and uses the
same event/receive-time and knowledge policy. No candidate may consume an
event before its decision frontier permits it.

Changing an assumption can change both execution and future decisions. The
comparison must therefore report whether decision history stayed identical;
it must not attribute a changed strategy decision to slippage alone.

### 5.2 Sensitivity dimensions

| Assumption | Modeled meaning | Causal/compatibility rule | Required diagnostics |
| --- | --- | --- | --- |
| Commission | Fee schedule applied by the research ledger | A compatible fixed-history comparison may recompute fees; invalid/negative/non-finite schedules fail validation | Fee delta, currency, cost provenance |
| Slippage | Explicit modeled execution-price adjustment | Never infer slippage from observed trade prices; changed execution can alter fills and decisions | Modeled cost, fill-price difference, quality warning |
| Price impact | Explicit quantity/price impact model | Must be bounded and deterministic; impact cannot manufacture displayed liquidity | Impacted price/quantity and assumption fingerprint |
| Latency | Zero, fixed, or bounded event/receive-time delay | Receive-time policy requires genuine receive timestamps; delayed eligibility must not see future events | Eligibility frontier, missing-time failure, decision-history class |
| Displayed-depth participation | Maximum participation in observed eligible depth | Fill quantity must remain within available displayed quantity and configured participation; stale/gapped depth remains uncertain | Fill quantity, unfilled quantity, depth quality, gaps/staleness |
| Passive uncertainty | Explicit passive-fill policy or indeterminate outcome | No inferred fill from a candle or later trade; unsupported passive certainty is indeterminate | Fill-status reason, `scenarioBias`, source-quality warning |
| Risk constraints | Max order/position/notional/pending/drawdown limits | A rejection or cancellation caused by a changed limit is a decision-history difference, not a superior execution | Rejected decisions, limit, reason, changed-decision count |
| Precision policy | Tick and quantity normalization/rejection rules | Rounding or rejection must be explicit; changing precision may invalidate decision equality | Raw/normalized request, precision rule, rejection reason |

These dimensions must be represented as assumptions, never as observed facts.
The output may say that a modeled fee or latency scenario produced a
different simulated result. It must not say that the exchange would have
filled the order, that a strategy is profitable, or that a difference is
statistically significant.

For latency, risk, precision, and execution-policy changes, loading an old
decision history is not automatically valid. Existing restoration validates
decision metadata against active assumptions. The eventual implementation
must either:

- require a fully regenerated candidate artifact from an internal deterministic
  decision policy; or
- add a narrowly specified internal fixed-history evaluator that re-derives
  assumption-dependent metadata and proves the decision frontier remains
  valid.

It must not silently rewrite `eligibleClockTime`, normalized order fields, or
  risk outcomes in an imported artifact.

## 6. Proposed output model

Each candidate should produce an immutable internal result with status and
provenance before any baseline delta is calculated. A proposed shape is:

```ts
type ScenarioComparisonResult = {
  schemaVersion: 1;
  comparisonFingerprint: string;
  status: "completed" | "incompatible" | "indeterminate" | "cancelled" | "failed";
  baseline: ScenarioResultReference;
  candidates: readonly ScenarioCandidateComparison[];
  warnings: readonly ComparisonWarning[];
};

type ScenarioCandidateComparison = {
  candidateId: string;
  compatibility: "identical-decision-history" | "compatible-fixed-history"
    | "decision-history-different" | "incompatible-tape";
  status: "verified" | "no-expected-result" | "mismatch" | "indeterminate"
    | "incompatible" | "failed" | "cancelled";
  provenance: ScenarioProvenance;
  result: ScenarioMetrics;
  differences: ScenarioDifferences;
  indeterminateReasons: readonly string[];
};
```

`ScenarioMetrics` should be derived from the fresh export and should preserve
the existing null/partial/unknown semantics:

- simulated realized P&L, unrealized P&L, fees, modeled execution costs,
  fills, unfilled quantity, exposure, position, and reservations;
- equity and drawdown only when valuation is complete;
- valuation status (`complete`, `partial`, or `unknown`), quality coverage,
  stale/gapped/crossed depth diagnostics, source status, session and
  corporate-action warnings;
- simulated order/fill lifecycle counts and stable decision/order references;
- artifact/tape/source/assumption/decision/result fingerprints.

Every scalar delta should carry availability metadata, for example:

```ts
type MetricDelta = {
  status: "available" | "unknown" | "not-comparable";
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  reason: string | null;
};
```

Unknown, partial, unavailable, and indeterminate values remain null with an
explicit reason. They are never serialized as zero merely to make a table
complete. A candidate with indeterminate valuation cannot outrank a fully
evaluated candidate. The first comparison report should not expose a generic
“best scenario” or optimization ranking; it should provide deterministic
ordered results and descriptive deltas.

Per-order matching is allowed only for identical or proven compatible
decision histories and must use stable decision references. With different
histories, aggregate results may be displayed side by side, but unmatched
orders/fills must remain unmatched and no causal attribution should be
invented.

## 7. Causal reconstruction and checkpoint policy

The source of truth for every candidate is a fresh restoration through the
existing scenario path. Derived orders, fills, journals, ledgers, and
diagnostics supplied in an artifact or candidate result are never imported.

The same validated tape may be shared as an immutable input to reduce memory,
but mutable controllers, execution sessions, ledgers, journals, and quality
maps must be candidate-local. A candidate's replay cursor and source
observations must not be reused as the baseline's state.

Phase 16.2 research-execution checkpoints are immutable format-1 copies of a
complete causal execution frontier. They bind to scenario/instrument/venue,
tape and ordering versions, clock/knowledge policy, event frontier, and
decision-history revision. They include ledger reservations, orders, fills,
order-book state, source/session/corporate-action observations, journal ring
state, and identity counters. A live synchronized book is required; gaps,
stale/recovering/unavailable/crossed books fall back to full reconstruction.
Checkpoint retention and fallback fields are operational diagnostics, not
causal result evidence.

These checkpoints are useful for measured warm-seek acceleration, but a
checkpoint is not an execution-research artifact or a comparison result. The
current checkpoint identity does not include a complete Phase 16.3 comparison
assumption fingerprint; a checkpoint therefore cannot be shared across
candidate assumptions or sessions. It may be reused only within the same
active session when the existing identity and decision-history revision checks
pass, and the candidate's derived evidence must still be independently
compared. The recommended first comparison implementation retains no shared
comparison checkpoints and measures sequential fresh restoration first.

If comparison-specific checkpoint acceleration is later authorized, it must
preserve order-book gap state, source coverage, session state,
corporate-action eligibility, causal decisions, and ledger reservations. A
partial snapshot must fail closed rather than silently produce an apparently
complete result. The Phase 16.2 benchmark already shows that checkpoints are
not universally faster: decision-heavy and large ordinary workloads paid
capture cost, while some order-book-heavy workloads benefited. No speedup is
promised without a controlled comparison benchmark.

## 8. Architecture alternatives

| Alternative | Benefits | Risks | Recommendation |
| --- | --- | --- | --- |
| A. Sequential fresh restore per candidate with one shared immutable tape | Smallest correctness surface, easy cancellation/disposal, independent evidence, deterministic ordering | Repeats replay work; no parallel speedup | **Recommended for Phase 16.3** |
| B. Shared immutable tape plus validated market-replay checkpoints | May reduce repeated tape projection/seek cost; can retain one bounded cache | Checkpoint identity and invalidation are easy to get wrong; execution state cannot be assumed equivalent | Optional follow-up only after a measured bottleneck and targeted authorization |
| C. Worker or parallel candidate execution | Potential throughput and UI isolation | New serialization/security/lifecycle boundary, nondeterministic completion ordering, more memory; no measured need yet | Excluded from this phase; requires separate need, design, authorization, and tests |
| D. Directly reuse optimization/backtest sensitivity | Existing candidate/progress utilities | Wrong data model and causality boundary; encourages ranking and hides incomplete valuation | Reject as the implementation model; reuse only bounded utility patterns |

Sequential execution should preserve input candidate order for progress, while
the final comparison fingerprint sorts by stable candidate ID so equivalent
plans produce equivalent evidence even if callers reorder candidates.

## 9. Security, resource, and lifecycle controls

The existing schema-1 validator remains the first trust boundary. The future
comparator must retain its rejection of unknown fields, unsupported versions,
prototype-pollution keys, accessors/proxies outside the supported data shape,
cycles, sparse arrays, non-finite numbers, oversized values, excessive depth,
duplicate identities, invalid frontiers, and invalid source/tape metadata.

Additional comparison controls should include:

- validate all inputs and aggregate budgets before session construction;
- hard candidate, decision, byte, diagnostic, depth, latency, journal, and
  pending-order limits; proposed defaults are not a license to raise current
  absolute ceilings;
- bounded progress payloads with no full ledger/journal copies on every event;
- no unbounded retention of all candidate artifacts or snapshots;
- sequential disposal in `finally`, including cancellation and validation
  failures;
- idempotent disposal and no retained subscriptions, timers, controllers, or
  Workers after completion;
- cancellation checks at phase boundaries and a defined terminal status;
- explicit distinction between cancellation, incompatibility, failed
  validation, failed reconstruction, and indeterminate financial valuation.

The existing FNV-1a artifact hash is unauthenticated. A comparison report
must say so and must not be treated as signed provenance, permission, or
secure remote input verification. This phase has no remote fetch, credentials,
broker, live execution, or Worker boundary.

The current evidence contains 1k/10k/100k research workloads. A 500k workload
is **NOT VERIFIED** and must remain so until an authorized, reproducible run
exists. No performance target should be accepted from a synthetic estimate.

## 10. Dependency map and implementation workstreams

### Dependency map

| Workstream | Reuse | New internal work if authorized | Explicit non-dependency |
| --- | --- | --- | --- |
| Input identity | schema-1 parser, tape validator, canonical serializers | Comparison identity/classification records | Public API inventory |
| Reconstruction | `restoreResearchScenario`, research session, reference ledger | Candidate isolation coordinator and result extraction | Broker/Paper Trading account |
| Sensitivity | normalized assumptions and cost/latency types | Bounded candidate artifact generation or fixed-history evaluator | Candle optimization result ranking |
| Output | result evidence, ledger/quality diagnostics | Null-aware deltas and comparison fingerprint | Profitability claim |
| Lifecycle | existing disposal and optimization cancellation conventions | Comparison cancellation/progress terminal state | Worker orchestration |
| Performance | existing research/replay benchmarks | Comparison benchmark protocol and memory accounting | Universal FPS/capacity claim |
| Public boundary | root/API baseline checks and proposal status | None; keep module internal | Root/React exports, Studio contracts |

### Proposed implementation increments after authorization

1. **Contract and identity:** versioned internal types, canonical identity
   records, compatibility errors, and strict input preflight.
2. **Isolation coordinator:** sequential fresh restoration, baseline capture,
   candidate disposal, cancellation, and no-mutation tests.
3. **Result and delta layer:** null-aware metrics, quality/indeterminate
   diagnostics, stable matching rules, and comparison fingerprint.
4. **Sensitivity generation:** only approved assumption dimensions, bounded
   candidate counts, deterministic ordering, and explicit decision-history
   classification. Do not silently patch artifacts.
5. **Verification and evidence:** causal, numerical, hostile-input,
   lifecycle, reproducibility, memory, and 1k/10k/100k benchmark coverage.
6. **Documentation:** update internal architecture/report documents only
   after verified behavior; keep public API and release gates unchanged.

No increment should add Studio, Worker, broker, live execution, package
exports, or protected API baseline changes.

## 11. Test and benchmark design

The following tests are acceptance design, not results. They must be added and
run only after a separate implementation authorization.

### Correctness and causality

- Restore a baseline and an identical clone; verify the standalone restore
  exports and comparison candidate result are byte/fingerprint equivalent.
- Repeat the same plan several times and verify ordered results, evidence,
  deltas, warnings, and comparison fingerprint are identical.
- Reorder candidate inputs and verify candidate-local outputs and final
  canonical comparison fingerprint are unchanged.
- Mutate a candidate object, seek it, cancel an order, and dispose it; prove
  the baseline export, decision history, and tape remain unchanged.
- Change tape ID/fingerprint/version/ordering/instrument/venue/source
  generation, clock policy, knowledge policy, or frontier; verify typed
  incompatible rejection occurs before replay allocation.
- Compare identical decisions with changed costs and verify only modeled
  cost/result fields change where expected.
- Change latency, risk, precision, or execution policy and verify the result
  is classified as a changed decision history unless an independently proven
  fixed-history path applies.
- Verify no candidate can consume a future event, and that same-cursor
  decision ordering, cancellation, reservation release, corporate actions,
  and session eligibility match the existing research engine.
- Compare research fills with `ReferenceExecutionLedger` for eligible finite
  fills, while confirming simulated fills never enter observed stores.

### Data quality and uncertainty

- Stale, gapped, crossed, locked, partial, and unavailable Level-2 input.
- Missing receive times under receive-time latency policy.
- Unknown passive fill, incomplete valuation, missing mark, and partial
  source coverage; assert null/indeterminate outputs, never zero.
- Corporate-action effective/payment events, split/dividend entitlement,
  session open/close/break boundaries, and source-generation corrections.
- Duplicate, out-of-order, and corrected observed events under the same tape
  identity rules.

### Security and lifecycle

- Unknown fields, cycles, accessors, prototype keys, sparse arrays, oversized
  candidate sets, invalid numbers, invalid assumptions, and aggregate budget
  exhaustion.
- Cancellation before validation, between candidates, during a bounded
  restore phase, and at final publication.
- Repeated completion/cancellation/disposal; verify zero listeners,
  subscriptions, timers, and Workers retained by comparison sessions.
- Failed baseline and candidate restores dispose every temporary session.

### Benchmarks

Use deterministic tapes and record environment, Node version, sample count,
GC availability, tape/artifact fingerprints, candidate count, decision count,
median/p95 restore time, comparison overhead, peak heap, retained heap after
disposal, cancellation latency, and diagnostic counts for 1k/10k/100k event
workloads. Run baseline-only and 2/4/8-candidate sequential profiles under
the same process conditions. Do not present these as exchange or production
capacity claims, and do not mark 500k verified without a real run.

### Measurable acceptance criteria

Phase 16.3 implementation should not be accepted unless all of the following
are evidenced:

1. Inputs are validated and exact tape/source compatibility is established
   before any candidate replay begins.
2. Baseline standalone restore and comparison baseline result match exactly
   under the selected evidence representation.
3. Independent candidate restoration produces the same result as its
   standalone restore and cannot mutate baseline state.
4. Repeated identical plans produce identical canonical comparison evidence.
5. Incompatible tapes and source generations fail closed with typed reasons.
6. Different decision histories are explicitly classified and are not
   presented as fixed-history execution deltas.
7. Unknown, partial, and indeterminate values remain unknown and are never
   ranked as better than complete values.
8. Financial reservation, causal frontier, source isolation, session, and
   corporate-action invariants pass parity tests.
9. Cancellation and disposal leave no orphaned internal resources.
10. No public export, protected API baseline, Studio, Worker, broker, live,
    license, npm, tag, release, or browser/device gate changes occur.
11. The report records actual 1k/10k/100k measurements and explicitly states
    that 500k is not verified if it was not run.

## 12. Risks and unresolved design decisions

The owner and counsel/maintainer review must resolve these before coding:

- **Assumption patch semantics:** whether Phase 16.3 initially accepts only
  pre-generated full artifacts, or authorizes a deterministic internal
  decision-policy runner for sensitivity candidates.
- **Decision matching:** which decision fields are identity-defining and how
  assumption-derived metadata is revalidated without rewriting imported
  history.
- **Valuation policy:** which marks and source-quality states qualify as
  complete equity/drawdown and how partial valuation is exposed.
- **Candidate budget:** exact default and absolute candidate/decision/byte
  ceilings, including whether the proposed 8/32 candidate limits fit actual
  internal workloads.
- **Cancellation semantics:** whether synchronous restoration receives
  cooperative hooks or comparison remains cancellable only between bounded
  candidate operations.
- **Checkpoint use:** whether any internal market-only checkpoints are
  retained in the first implementation; execution state must remain isolated.
- **Output retention:** whether full scenario exports are retained or only
  bounded summaries and fingerprints.
- **Result comparison:** whether aggregate deltas for different decision
  histories are shown at all, and what warning language is mandatory.
- **Hash trust:** the existing artifact hash remains unauthenticated unless a
  separate security design authorizes a stronger provenance mechanism.

Known risks include candidate explosion, false order attribution, missing
receive-time data, source corrections, uncertain passive fills, valuation
gaps, checkpoint invalidation, memory retention, and users mistaking
descriptive historical differences for predictive or exchange-accurate
claims.

## 13. Explicit exclusions

This design does not authorize or implement:

- Phase 16.3 source changes;
- root, React, Studio, or any other public API exports;
- protected API baseline modifications;
- public scenario/comparison file formats or compatibility promises;
- Studio UI, chart integration, or workspace persistence;
- Worker or parallel orchestration;
- broker connectivity, order routing, or live execution;
- licensing or legal-policy changes;
- npm publication, GitHub releases, tags, or release readiness;
- closure of Phase 15.5 compatibility, browser, device, accessibility, legal,
  ownership, or release gates;
- claims of profitability, execution certainty, statistical significance,
  exchange-fill equivalence, or 500k capacity.

## 14. Exact owner authorization requested

If the owner approves the next step, the requested authorization should be
recorded with the following limited wording:

> **Approve internal Phase 16.3 implementation only:** authorize a
> provider-neutral, sequential research-scenario comparison executor based
> on the existing schema-1 scenario artifacts, exact `MarketReplayTape` and
> source-generation binding, fresh isolated restorations, null-aware
> baseline-relative diagnostics, bounded execution-assumption sensitivity,
> cancellation/progress/disposal tests, and internal 1k/10k/100k benchmarks.
> Authorize only internal source, tests, benchmarks, and technical
> documentation commits under the established repository workflow.
>
> This authorization does not approve public exports or API-baseline changes,
> Studio integration, Worker integration, broker connectivity, live order
> execution, licensing changes, npm publication, tags, releases, or closure
> of browser/device/accessibility/legal/release gates. Simulated results must
> remain explicitly distinct from observed exchange transactions. Any
> checkpoint acceleration, parallel/Worker execution, public contract, or
> sensitivity decision-policy runner requires separate approval if it is not
> covered by the exact implementation plan.

Before implementation begins, the owner should additionally record decisions
on assumption-patch semantics, candidate limits, cancellation model,
checkpoint use, output retention, and whether aggregate results with changed
decision histories may be displayed.

## 15. Repository reconciliation record

The requested recovery was completed without changing the design concepts:

| Requirement | Result |
| --- | --- |
| Original local SHA | `719e693ad2afedb786bc41557c5e2f47982d5c27` |
| Refreshed remote `origin/main` | `40e6d12ac0bb12b7b0da29a1c280b023c419d975` |
| Safe synchronization | **PASS — fast-forward-only; seven commits applied** |
| Design backup | Verified outside the checkout before Git operations |
| Original design SHA-256 | `91278d0160bdf2c3ae1f42e5abd939847c810f4f4dcd60e46fa08c879327b6c0` |
| Product/source changes | None in this handoff |
| Public API/baseline changes | None |
| Commit/push | Not performed; separate authorization is required |

Necessary local design corrections were limited to the stale repository state,
the Phase 16.2 research-checkpoint contract, the Phase 16.2.1 cache-independent
evidence projection, and the resulting checkpoint-sharing restriction. The
sequential architecture, isolation boundary, uncertainty policy, sensitivity
dimensions, test plan, and exclusions were preserved.

## 16. Current handoff state

The repository was reconciled to the specification's verified main SHA and
the approved design document was committed and pushed as
`53820951fde0f599ddc28b543d55a4696f048670`. The Phase 16.3 implementation is
now authorized and in progress, but remains internal and non-public. The
implementation authorization does not extend to public API, Studio, Worker,
broker, live execution, publication, release, or Phase 16.4 work.

The next safe action is owner review of this design and explicit authorization
for the limited internal implementation above. Until that authorization is
recorded, Phase 16.3 remains an open design gate.
