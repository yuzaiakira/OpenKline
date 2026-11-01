# OpenKline Phase 16.4 — Professional Embeddable Charting Library Design

**Status: INTERNAL PHASE 16.4.2 MULTI-CHART & ADVANCED PANELS IMPLEMENTED / PUBLIC API REVIEW REQUIRED**

This document is an internal product-architecture and implementation-readiness
design for Phase 16.4. The original design handoff was not an implementation,
public API adoption, or release approval. The owner authorized the narrow Phase
16.4.0 internal foundation and subsequently authorized the bounded Phase
16.4.1 professional UI increment. Both implementations live in `src/widget/`
and focused tests; they do not adopt a public Widget API, change root package
exports, change license/release metadata, or close any release gate. Later
Phase 16.4 increments remain unauthorized.

### Phase 16.4.1 implementation note

The authorized UI increment adds five scoped, lifecycle-owned surfaces —
Indicator Explorer, Drawing Toolbar, Object Tree, Drawing Property Editor,
and Chart Settings — over the existing Chart handle. They delegate to Chart's
indicator, drawing, series, price-scale, theme, direction, workspace, and event
contracts; they do not create a second renderer or financial model. Behavioral
evidence and remaining gates are recorded in
`docs/reports/phase-16-4-1-professional-widget-ui.md`.

The authoritative product vision is a professional, framework-independent,
client-side financial charting library that application developers can embed as
an alternative to TradingView Advanced Charts. OpenKline is not a hosted
trading website, SaaS platform, broker, market-data service, or standalone cloud
product. It must not require an OpenKline-operated backend, account system,
database, cloud service, billing, authentication infrastructure, or mandatory
network request. Hosts own their data, providers, persistence, credentials, and
optional external services.

## 1. Repository state and scope boundary

The repository was inspected before authoring this document.

| Item | Verified value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Local branch | `main` |
| Local `HEAD` | `88b5bdb004d84678243a1a60fa042da39a9dd8a4` |
| `origin/main` | `88b5bdb004d84678243a1a60fa042da39a9dd8a4` |
| Remote `refs/heads/main` | `88b5bdb004d84678243a1a60fa042da39a9dd8a4` |
| Last commit identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Working tree before this document | Clean |
| Phase 16.3.1 baseline reviewed | `88b5bdb004d84678243a1a60fa042da39a9dd8a4` |

The remote check was performed with a read-only `git ls-remote` query. No fetch,
merge, reset, branch creation, commit, or push was required. The file created by
this task is the only intended working-tree change.

The governing restrictions are:

- The original design was design-only; the current authorization permits only
  the bounded Phase 16.4.0 internal foundation. The proposed public package
  and API remain subject to separate owner review.
- Simulated executions must never be represented as observed exchange fills.
- The root package, React package, Studio, and protected API baseline remain
  untouched.
- No Worker orchestration, broker connectivity, live order execution, npm
  publication, tag, release, license change, or GitHub Actions change is part of
  this design.
- The inherited `api:check` declaration-hash gate remains open. The known
  differences for `Chart`, `WorkspaceDocument`, and `WorkspaceRestoreOptions`
  are not resolved by this document.
- Firefox, WebKit, Mobile Safari, physical-device, accessibility, legal, and
  release gates remain open and are outside this design task.

## 2. Existing architecture reviewed

### 2.1 Replay and causal data boundary

`src/replay/market-event-tape.ts` provides the provider-neutral
`MarketReplayTape`. It validates events, rejects duplicate logical revisions,
canonicalizes event order, records the ordering policy, derives instrument and
source metadata, and computes a deterministic tape fingerprint. The fingerprint
identifies the canonical input representation; it is not provider authentication
or a claim that the historical data is true.

`MarketReplayController` supplies the causal cursor, event-time or genuine
receive-time clock policy, strict-causal or retrospective knowledge policy,
seek/reset/step behavior, event eligibility, integrity diagnostics, cancellation
boundaries, and disposal. A later Phase 16.4 implementation must reuse this
ordering and frontier model rather than creating a second market clock.

The replay boundary also carries source generations, instrument and venue
identities, session boundaries, corporate actions, trades, candles, and
order-book snapshots/deltas. Display symbols, timestamps, or provider trade IDs
alone are not sufficient identity keys.

### 2.2 Research execution session

`src/research-execution/engine.ts` is an internal, unexported research runtime.
It owns causal decision processing, simulated orders and fills, long-only spot
accounting, reservation invariants, latency and eligibility, displayed-depth
participation, passive uncertainty, corporate-action/session boundaries,
bounded journals, diagnostics, checkpoint state, export, subscription, and
disposal. Its interface is deliberately not part of the root package API.

The existing internal types distinguish:

- observed replay events from simulated orders and fills;
- assumptions from derived results;
- complete, partial, and unknown valuation;
- available, stale, crossed, gapped, missing-time, and indeterminate source
  quality; and
- durable submit/cancel decisions from transient UI state.

`reference.ts` contains a small independent ledger used as a numerical parity
oracle. It consumes simulated fills only and has no replay or order-book
dependency. It must remain a test oracle, not an exchange-truth source.

### 2.3 Scenario artifacts and trusted reconstruction

`scenario-artifact.ts` defines internal schema-1 artifacts containing assumptions,
exact tape/source binding, replay policy, causal frontier, durable decisions,
decision-history completeness, journal-retention metadata, optional expected
result evidence, and an unauthenticated FNV-1a content hash.

Validation is strict and bounded. The current implementation rejects unknown
keys, accessors, sparse arrays, unexpected prototypes, symbol keys, cycles,
non-finite values, excessive strings/nesting/bytes, invalid decisions, duplicate
identities, invalid cancellation order, and unsupported versions. The normal
serialized artifact budget is 2 MiB and the absolute serialized ceiling is 8 MiB;
the research decision ceiling is 100,000 records.

`scenario-restore.ts` validates the supplied tape and exact source generations,
creates a fresh session, loads only durable decisions, replays to the recorded
frontier, recomputes orders/fills/journal/diagnostics/ledger, compares optional
expected evidence, and disposes a temporary session on failures. Imported
derived results are never treated as authoritative state.

### 2.4 Checkpoints and scenario comparison

Phase 16.2 introduced bounded, opt-in internal causal checkpoints. They are
candidate-local computational caches, not shared truth. They can be rejected or
evicted when the order book is stale, gapped, recovering, incompatible, or over
budget. Checkpoint operational metadata is excluded from the causal result
evidence fingerprint by Phase 16.2.1.

Phase 16.3 and 16.3.1 added `compareResearchScenarios()` in
`src/research-execution/scenario-comparison.ts`. The current comparator:

- validates one baseline and up to seven candidates (eight scenarios total);
- accepts either a validated artifact or a strict allowlisted assumption patch;
- validates exact tape ID, tape fingerprint, ordering, instrument set, source
  generations, and replay compatibility;
- reconstructs each candidate in a fresh session sequentially;
- checks cancellation at validation and restored-event boundaries;
- captures bounded, data-only metrics and provenance;
- classifies identical, compatible-fixed, different, and incompatible decision
  histories;
- preserves unknown and indeterminate values rather than coercing them to zero;
- compares monetary deltas only when the validated accounting currencies match;
- uses a one-million eligible-event-visit budget, bounded diagnostics/records,
  and an eight MiB result budget; and
- disposes every temporary session on success, cancellation, mismatch, or
  failure.

The comparator is synchronous and sequential. It is not a study coordinator,
does not rank results as investment recommendations, does not persist tapes or
live sessions, and is not a public consumer API.

### 2.5 Existing verification evidence

The latest Phase 16.3.1 evidence reports:

- full Node regression: 385/385 passing;
- Market Replay: 17/17 passing;
- local Chromium: 35/35 passing;
- React/Studio Chromium: 38/38 passing;
- API inventory and diagnostics passing, while the inherited API check remains
  open because of the three declaration-hash differences;
- package smoke, package/distribution checks, Studio checks, and stress checks
  passing;
- stress cleanup with zero orphan failures, zero Worker orphans, and zero
  remaining canvases; and
- comparison benchmark medians of 264.993 ms for 1k events, 3,037.272 ms for
  10k events, and 24,968.951 ms for 100k events. The 100k workload used two
  samples only, so its p95 is not stable tail-latency evidence. A 500k workload
  remains **NOT VERIFIED**.

These are historical internal measurements, not performance guarantees. They
show that repeated full reconstruction is a meaningful cost, but they do not by
themselves authorize parallelism, Workers, checkpoint changes, or speculative
optimization.

## 3. Gap analysis for Phase 16.4

| Gap or dependency | Evidence | Consequence |
| --- | --- | --- |
| No study-level contract | The current API compares one baseline and bounded candidates only | Repeated research runs would otherwise be ad hoc and difficult to reproduce |
| No analysis/report artifact | Comparison output contains metrics, deltas, status, fingerprints, and diagnostics, but no stable analytical projection | Consumers may accidentally rank or flatten uncertainty when presenting results |
| Repeated replay is expensive | The 1k/10k/100k medians grow materially with event count | A future coordinator could amplify cost; no unmeasured optimization should be assumed |
| Synchronous cancellation boundary | Cancellation is checked at bounded restore/event boundaries; no asynchronous executor exists | A long comparison cannot be made into a Worker implicitly; cancellation must remain explicit and deterministic |
| Aggregate retention contract | Individual comparison results are bounded, but there is no Phase 16.4 report-level retained-record policy | A reporting layer must not retain tapes, artifacts, sessions, checkpoints, or credentials |
| Cross-currency and incomplete valuation semantics | Phase 16.3.1 now emits `not-comparable` and null deltas for incompatible monetary units | Any analysis must preserve these states and never invent FX or convert missing values |
| Decision-history interpretation | Different decisions are descriptive, not controlled fixed-history sensitivity | Any report must expose the classification and prohibit “better” or causal superiority language |
| Public and UI integration is intentionally absent | Research entry points are internal-only | Phase 16.4 design must not add root exports, React/Studio wiring, or a UI workflow |
| Large-input and hostile-input handling | Artifact validation is strict, but a new report boundary would still need input-shape checks | The proposed report layer must validate data-only comparison outputs before allocation |

The gaps support a small data-only layer over an already verified comparison
result. They do not establish a need for a distributed runner, a browser Worker,
or an execution-engine rewrite.

## 4. Bounded alternatives

Phase 16.4 must select one bounded direction. The alternatives below are not
combined into a larger implementation phase.

### Option A — Reproducible research study orchestration

Option A would define a study containing several comparison requests, exact
tape/artifact provenance, bounded aggregate output, study-level cancellation,
failure isolation, and a reproducible study fingerprint. A sequential executor
could run the existing comparator repeatedly without creating a distributed
runner.

**Value:** useful for repeated sensitivity studies and future batch workflows.

**Reuse:** high reuse of `compareResearchScenarios()`, existing validation,
fingerprints, progress events, and disposal.

**Risk and complexity:** a new study identity and aggregate budget must prevent
duplicate or overlapping workloads from exhausting resources. Cancellation and
failure isolation must distinguish a cancelled study from a completed partial
study. The study contract could easily become an accidental optimization or
public API surface.

**Dependencies:** requires a settled report/retention policy and benchmark
evidence for repeated workloads. No external infrastructure is required, but
large workloads remain bounded by synchronous replay cost.

### Option B — Scenario-comparison analysis and reporting

Option B would add an internal, data-only analytical projection over one
existing `ResearchScenarioComparisonResult`. It would summarize baseline-relative
coverage, assumption sensitivity, metric availability, uncertainty, provenance,
compatibility classes, and modeling limitations without re-running scenarios or
ranking them.

**Value:** immediately makes existing comparison evidence safer to consume and
prevents accidental loss of null, currency, provenance, and decision-history
semantics.

**Reuse:** very high. It can reuse the current comparison types, canonical
fingerprints, metric-delta statuses, quality diagnostics, and bounded result
records without changing replay or financial calculations.

**Risk and complexity:** lower than a study runner, but the report contract must
be precise about what is descriptive versus causal. A reporting layer must not
turn a data projection into an investment recommendation or silently infer
significance.

**Dependencies:** no external infrastructure. It requires strict validation of
the comparison result, deterministic serialization, bounded report output, and
focused uncertainty tests.

### Option C — Performance, correctness, and lifecycle hardening

Option C would target measured bottlenecks such as sequential reconstruction,
cancellation responsiveness, memory retention, large decision histories,
fingerprint work, and checkpoint economics.

**Value:** could reduce cost or improve failure behavior if a reproducible
defect or regression is demonstrated.

**Reuse:** high reuse of the current engine and comparator, but each optimization
would touch causality-sensitive runtime code.

**Risk and complexity:** highest correctness risk. An optimization can change
event ordering, decision history, valuation, checkpoint evidence, or disposal
semantics. The current benchmarks are evidence for cost, not proof of a specific
bottleneck. Parallelism, Workers, or adaptive checkpoints would expand the
security and lifecycle surface.

**Dependencies:** requires a profiling protocol, before/after runs under the
same workload, and a separate decision for any runtime or scheduling change.
The 500k workload and official non-Chromium browsers remain unavailable and
cannot be used as assumed evidence.

### Alternative evaluation

| Criterion | Option A: orchestration | Option B: reporting | Option C: hardening |
| --- | --- | --- | --- |
| User/research value now | High for repeated studies | High for safe interpretation of existing results | Conditional on a reproduced bottleneck |
| Code reuse | High | Very high | High but runtime-sensitive |
| Implementation complexity | Medium-high | Low-medium | High |
| Financial/causal integrity risk | Medium | Low if data-only | High |
| Performance evidence required | Moderate | Low; measure projection cost | High |
| Resource requirements | New aggregate budgets | Existing bounded result plus report budget | New profiling and regression evidence |
| Testing feasibility in current cloud | Good for sequential tests | Very good | Good for unit tests; browser evidence remains limited |
| External infrastructure dependency | None initially | None | None initially, but future Worker ideas are excluded |
| Fit with current authorization boundary | Possible after explicit implementation approval | Best bounded fit | Possible only for a narrowly measured defect |

## 5. Prior research-scope recommendation (retained for traceability)

**Historical recommendation: Option B — internal Scenario-Comparison Analysis
and Reporting.**

This was the recommendation in the earlier research-only design revision. It
is retained to explain why the existing report-oriented analysis was not
implemented, but it is not the current product scope. The latest authoritative
Phase 16.4 requirement selects the professional embeddable widget architecture
described in Sections 18–28. Neither this historical research track nor the
current widget track has implementation authorization.

Option A should be deferred until the project has a concrete repeated-study
workflow and has approved an aggregate study identity, cancellation, and
retention contract. Option C should be deferred until a controlled profile
isolates a specific correctness-preserving bottleneck. Neither is rejected
forever; neither is included in the recommended Phase 16.4 scope.

### 5.1 Objectives

The recommended scope would:

1. Validate a data-only Phase 16.3.1 comparison result before analysis.
2. Produce a bounded, immutable, deterministic report projection.
3. Preserve baseline/candidate provenance, tape and source identities,
   assumption and decision-history fingerprints, result evidence, currency
   comparability, valuation status, and source-quality diagnostics.
4. Explain whether a candidate is a controlled fixed-history sensitivity or a
   descriptive different-history comparison.
5. Preserve explicit `unknown`, `indeterminate`, `not-comparable`, `failed`,
   `cancelled`, and partial states.
6. Make no additional replay pass, order decision, fill, ledger mutation, or
   observed-market-data mutation.
7. Provide deterministic tests and isolated report-generation benchmarks.

### 5.2 Non-goals

The scope would not:

- generate strategy decisions or mutate scenario artifacts;
- re-run the replay engine or calculate new fills;
- add FX conversion or infer currency equivalence;
- rank candidates, select a winner, calculate investment advice, or claim
  statistical significance;
- create a study scheduler, parallel executor, Worker, broker, or live path;
- add a root or React export, Studio integration, or UI;
- persist tapes, full artifacts, credentials, runtime sessions, or checkpoints;
- change schema-1 artifact compatibility, replay ordering, financial formulas,
  checkpoint evidence, or the protected API baseline; or
- close browser, accessibility, legal, license, publication, or release gates.

## 6. Proposed internal architecture

### 6.1 Module boundary

The proposed implementation would remain behind `src/research-execution/` and
would not be exported from `src/index.ts` or the React package. A likely internal
module is:

```text
src/research-execution/
  scenario-comparison-analysis.ts   # validation, projection, classification
  scenario-comparison.ts            # existing replay-causal comparison
  scenario-artifact.ts              # existing schema-1 validation/fingerprint
  scenario-restore.ts               # existing fresh-session reconstruction
  types.ts                           # existing internal domain types
```

The reporting module must depend on the already materialized comparison result,
not on a live `ResearchExecutionSession`, `MarketReplayController`, or mutable
artifact. It should not import Studio or public package modules.

### 6.2 Proposed internal interfaces

These are design sketches only. They are not implemented declarations or a
public compatibility promise.

```ts
type AnalysisMetricStatus = "available" | "unknown" | "not-comparable";

type ScenarioComparisonAnalysisOptions = {
  readonly maxReportBytes?: number;
  readonly maxWarnings?: number;
  readonly signal?: AbortSignal;
};

type ScenarioComparisonAnalysisInput = {
  readonly comparison: unknown;
  readonly label?: string;
};

type ScenarioComparisonAnalysis = {
  readonly schemaVersion: 1;
  readonly status: "complete" | "partial" | "indeterminate" | "cancelled";
  readonly reportFingerprint: string;
  readonly sourceComparisonFingerprint: string;
  readonly baseline: AnalysisScenarioReference | null;
  readonly candidates: readonly AnalysisCandidate[];
  readonly coverage: AnalysisCoverage;
  readonly limitations: readonly string[];
  readonly warnings: readonly string[];
};

type AnalysisCandidate = {
  readonly candidateId: string;
  readonly compatibility: ResearchScenarioComparisonCompatibility;
  readonly status: ResearchScenarioComparisonCandidateStatus;
  readonly provenance: ResearchScenarioComparisonProvenance | null;
  readonly metrics: readonly AnalysisMetricSummary[];
  readonly differences: readonly AnalysisDifferenceSummary[];
  readonly uncertainty: readonly string[];
  readonly decisionHistoryChanged: boolean;
};

type AnalysisMetricSummary = {
  readonly name: string;
  readonly status: AnalysisMetricStatus;
  readonly baseline: number | null;
  readonly candidate: number | null;
  readonly delta: number | null;
  readonly unit: "currency" | "price" | "quantity" | "count" | "percent";
  readonly reason: string | null;
};
```

The actual implementation must use the existing exported-internal comparison
types and must not duplicate their financial calculations. `unknown` at the
input boundary is intentional: a strict validator must reject prototype-bearing
objects, accessors, symbols, cycles, unsupported fields, non-finite values,
oversized arrays/strings, and malformed nested records before constructing the
output.

`AnalysisMetricSummary` is an explanatory projection only. It must preserve the
existing delta status and reason. A `not-comparable` currency metric cannot be
changed to `unknown`, `available`, or a converted number without a separately
approved FX contract.

### 6.3 Data flow

```text
validated comparison result
          |
          v
strict data-only boundary validation
          |
          v
candidate identity and compatibility classification
          |
          v
metric/uncertainty projection (no replay)
          |
          v
canonical sort by stable candidate ID
          |
          v
bounded immutable report + deterministic fingerprint
```

The module must never call `submitOrder`, `cancelOrder`, `step`, `seek`,
`restoreResearchScenario`, or a provider/datafeed. It must not append anything
to an observed trade store, order-book history, CVD, Footprint, or replay tape.

The existing comparison result remains the source of truth for the projection.
If its baseline is null, a candidate has no scenario, or a required provenance
field is malformed, the report must preserve an explicit incomplete or failed
state rather than fabricate a baseline.

### 6.4 Lifecycle and cancellation

The proposed reporter owns no subscriptions, timers, Workers, controllers, or
sessions. Its disposal requirement is therefore data retention, not runtime
teardown: it must not retain the input object beyond the returned immutable
projection, and it must not attach mutable references to the output.

An optional `AbortSignal` is checked:

1. before input validation;
2. between baseline and candidate projection;
3. after each bounded warning/metric batch; and
4. before computing and publishing the final fingerprint.

Cancellation must return an explicit `cancelled` status or a typed cancellation
error according to the final internal contract. It must never return a report
with `status: "complete"` after cancellation. Because the current maximum is
eight scenarios and all arrays are bounded, no asynchronous scheduler is needed
for the first implementation.

### 6.5 Error classifications

The implementation should distinguish:

| Class | Meaning | Report behavior |
| --- | --- | --- |
| `INVALID_INPUT` | Malformed, hostile, or unsupported comparison data | Fail closed before output publication |
| `REPORT_LIMIT` | Proposed report byte/warning/record ceiling exceeded | Return explicit failed/limited state; never truncate silently |
| `CANCELLED` | Caller cancellation observed | Explicit cancelled status; no complete report |
| `SOURCE_COMPARISON_PARTIAL` | Existing comparison completed with candidate failures or no expected evidence | Preserve candidate statuses and mark report partial |
| `INDETERMINATE` | Valid comparison data lacks valuation/quality/decision certainty | Preserve reasons and no ranking |
| `INTERNAL_INVARIANT` | Unexpected impossible internal shape | Fail closed and retain diagnostics suitable for tests |

An individual candidate already marked `failed`, `cancelled`, `incompatible`,
or `indeterminate` must remain so. The report may summarize it, but must not
upgrade it because other candidates completed.

## 7. Causality and financial-integrity requirements

The report layer must preserve the following invariants from Phases 15–16.3.1:

1. The tape fingerprint, ordering version, source generations, instrument and
   venue identities, clock policy, and knowledge policy remain provenance, not
   display metadata.
2. Historical events are the only observed market inputs. Simulated orders and
   fills remain research results and are never observed exchange activity.
3. A decision cannot consume future information. Report generation does not
   replay or widen any causal frontier.
4. Durable decision identity and action fingerprints remain separate from
   assumption and artifact content hashes.
5. A different decision history is descriptive. The report must say that a
   controlled single-assumption attribution is unavailable.
6. Monetary deltas with different accounting currencies remain
   `not-comparable` with null deltas unless an explicitly approved FX conversion
   contract exists. This design introduces no FX conversion.
7. Complete, partial, and unknown valuation remain distinct. Missing equity,
   drawdown, or market value is never converted to zero.
8. Quality states such as stale, crossed, sequence-gap, missing receive time,
   partial coverage, and indeterminate remain visible in limitations.
9. Corporate-action, session, order-book, and passive-fill uncertainty remains
   a warning or indeterminate condition, not an inferred fact.
10. Result fingerprints remain evidence of deterministic computation over the
    supplied representation, not provider authentication or live-execution
    authorization.

The report may describe a modeled fee, slippage, price impact, or latency delta.
It must not state that an exchange would have filled an order, that a scenario is
profitable in production, or that a candidate is objectively better.

## 8. Identity, provenance, and deterministic output

The proposed report has distinct identities:

- **Source comparison identity:** the existing `comparisonFingerprint` and
  comparison schema version.
- **Scenario provenance:** candidate ID, scenario ID, artifact content hash,
  exact tape ID/fingerprint, source generations, assumption fingerprint,
  decision-history fingerprint, action fingerprint, and result evidence.
- **Report policy identity:** analysis schema version and canonical metric/unit
  projection policy. A change to the projection contract must change this
  version.
- **Report fingerprint:** canonical serialization of the policy version, source
  comparison fingerprint, compatibility/status records, metric statuses and
  values, reasons, warnings, limitations, and candidates sorted by stable
  candidate ID.

Display labels must not control candidate matching. Candidate input order must
not alter the report fingerprint. The report must use a canonical field order,
canonical JSON-like serialization, finite numeric checks, and the repository's
documented FNV-1a semantics only where an internal content fingerprint is
needed. The resulting hash is not a signature.

The returned report must be deeply immutable or composed exclusively of fresh
immutable data. It must not contain a tape, full artifact, live session,
checkpoint cache, provider configuration secret, function, accessor, or mutable
caller-owned array.

## 9. Resource ceilings

The first implementation should retain the existing comparison ceilings and add
only report-level limits. The values below are proposed engineering defaults,
not accepted project policy until the owner authorizes implementation:

| Limit | Proposed default | Rationale |
| --- | ---: | --- |
| Scenarios including baseline | 8 | Match the verified comparator ceiling |
| Aggregate eligible event visits | 1,000,000 | Preserve causal replay budget; reporter must not increase it |
| Source comparison result bytes | 8 MiB | Match current comparator maximum |
| Candidate summaries | 8 | One bounded summary per scenario |
| Metric rows per candidate | 64 | Covers current metrics without unbounded schema growth |
| Warning/limitation strings | 10,000 absolute; 1,000 default | Align with comparison diagnostic bounds |
| Report serialized bytes | 2 MiB proposed | Smaller than the source result because the report is a projection |
| Retained tapes/artifacts/sessions | 0 | Report must be data-only and portable |
| Checkpoint retention | 0 | Reporting does not replay and must not retain caches |
| Execution mode | synchronous, sequential projection | No parallelism or Worker boundary |

All limits must be checked before allocating large output arrays and again before
publishing the serialized result. Truncating warnings or metric rows without an
explicit status is prohibited. The report budget is not a V8 heap guarantee and
must be documented as serialized-output accounting.

## 10. Compatibility and migration implications

The recommended scope is additive only within the internal research boundary:

- schema-1 scenario artifacts remain unchanged;
- replay tape version, ordering, identity, and fingerprint semantics remain
  unchanged;
- Phase 16.3.1 comparison inputs, output statuses, currency gates, and
  fingerprints remain unchanged;
- checkpoint-enabled and checkpoint-disabled result evidence remains comparable
  under the existing causal projection;
- no root or React package declaration changes are introduced;
- no API baseline file is updated; and
- no migration is required because the report is derived data, not a persisted
  public artifact.

If a future owner-approved implementation wants to persist reports, it must
receive a separate schema/version decision. This design does not authorize
persisting report files, full tapes, or provider credentials.

## 11. Verification and acceptance plan

### 11.1 Deterministic and causality tests

| Test | PASS criterion |
| --- | --- |
| Identical comparison input twice | Byte-equivalent report and report fingerprint |
| Candidate order permutation | Same sorted candidate output and fingerprint |
| Changed display label only | Provenance label behavior is documented and semantic fingerprint policy is stable |
| Same tape/source binding | Provenance retained exactly; no revalidation mutation |
| Different tape/source generation | Existing incompatible classification remains visible; no report upgrade |
| Identical decision history | Controlled fixed-history classification preserved |
| Different decision history | Descriptive classification and `decisionHistoryChanged: true`; no ranking field |
| Missing baseline or candidate scenario | Explicit partial/failed state; no fabricated delta |
| Existing `not-comparable` currency delta | Null delta and deterministic currency reason preserved |
| Partial/unknown valuation | Null-aware status and limitation preserved; no zero substitution |
| Stale/gapped/indeterminate quality | Quality warnings retained and report not marked fully certain |
| Simulated versus observed labels | Report contains only simulated research provenance and no exchange-fill claim |
| Repeat in separate Node processes | Same report fingerprint for identical canonical input |

### 11.2 Input-safety and resource tests

The strict data-only validator must reject:

- accessors, symbol keys, unexpected prototypes, sparse arrays, functions,
  cycles, `NaN`, infinities, unsupported fields, malformed enum values, and
  oversized strings/arrays/objects;
- missing required provenance, metric status, delta status, or reason fields;
- inconsistent currency metadata, non-null deltas for `not-comparable`, and
  non-null valuation-dependent values where the source says unknown; and
- reports exceeding the proposed serialized-byte or warning ceilings.

Tests must prove that candidate failure does not mutate another candidate or the
input comparison object, that output arrays do not share mutable references,
that cancellation never publishes `complete`, and that repeated invocation does
not retain sessions, tapes, checkpoint caches, subscriptions, Workers, or
timers. Since this module owns none of those resources, the expected cleanup
count is zero before and after report generation.

### 11.3 Regression suite

The implementation authorization should require, at minimum:

- focused scenario-comparison analysis tests;
- all existing research execution and replay tests;
- Phase 16.3.1 financial-comparability tests;
- `npm run typecheck`;
- `npm test`;
- `npm run api:inventory` and `npm run api:diagnostics`, with `api:check` still
  explicitly open unless separately approved;
- `npm run package:smoke`, `npm run package:check`, and
  `npm run distribution:check`;
- `npm run stress:ci`; and
- relevant local browser/React checks where the environment supports them,
  without claiming managed Firefox/WebKit/Mobile Safari or physical-device
  support.

The reporter should not require a browser to execute. No browser test may be
used to claim the internal report is a release gate.

### 11.4 Benchmark matrix

The benchmark must separate source comparison cost from report projection cost.
For each 1k, 10k, and 100k historical event workload, record:

| Measurement | Required evidence |
| --- | --- |
| Source comparison baseline | Existing comparator median/p95 and sample count |
| Report-only projection | Median/p95, sample count, input/output serialized bytes |
| End-to-end internal path | Comparison plus report timing, clearly labeled |
| Candidate count | Baseline plus 1, 2, 4, and 7 candidates where within budget |
| Status mix | Verified, no expected result, indeterminate, incompatible, failed |
| Allocation/retention | Process-level or forced-GC measurements with methodology |
| Cancellation | Boundary and observed cancellation latency, if exercised |
| Fingerprint repeatability | Same fingerprint across repeated process runs |

The 100k historical comparison result currently has only two samples and must
retain that caveat. A 500k run remains **NOT VERIFIED** unless separately
measured. No benchmark may claim a universal heap bound or exchange-performance
equivalence.

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Report becomes a ranking or recommendation tool | No ranking field; use descriptive compatibility and uncertainty language; test generated text/fields |
| Currency values are subtracted incorrectly | Preserve Phase 16.3.1 delta status/reason and test USD/EUR fixtures |
| Different decisions are attributed to one assumption | Expose decision-history classification and changed-history flag; prohibit causal attribution |
| Data-only output retains large runtime graphs | Strict projection, fresh arrays, no sessions/tapes/checkpoints, serialized-byte budget |
| Malformed comparison object bypasses artifact validation | Validate the report boundary independently; never trust a caller-supplied derived result blindly |
| Candidate ordering changes evidence | Sort by stable candidate ID before canonical serialization and fingerprinting |
| Input cancellation leaves a false complete report | Check signal at defined boundaries and test cancellation before final publication |
| Future persistence creates schema obligations | Keep the first version in-memory and internal; require a separate persistence decision |
| Runtime optimization is smuggled into reporting | Report-only scope explicitly forbids replay, Worker, checkpoint, and scheduling changes |

## 13. Exact implementation workstreams after approval

These are proposed workstreams, not work performed in this design-only task.

1. **Authorization and contract lock.** Record owner approval for Option B,
   report schema version, proposed resource ceilings, cancellation semantics,
   no-ranking policy, and internal-only boundary.
2. **Strict comparison-result validator.** Define the smallest accepted
   data-only shape, reject hostile values before allocation, and add malformed
   input/resource tests.
3. **Metric and uncertainty projection.** Reuse existing comparison metrics and
   delta statuses; preserve currency, valuation, quality, provenance, and
   decision-history distinctions without recalculation.
4. **Canonical report identity.** Add policy-versioned canonical serialization,
   stable candidate sorting, deterministic report fingerprinting, and immutable
   output tests.
5. **Cancellation and bounded lifecycle.** Add signal checks and explicit
   cancelled/partial status behavior. Verify no subscriptions, Workers,
   sessions, tapes, checkpoints, or timers are retained.
6. **Regression verification.** Run focused research tests, the full local
   regression/package/distribution/stress suite, and the supported local browser
   checks. Keep open gates open.
7. **Isolated benchmark and documentation.** Measure 1k/10k/100k report-only
   and end-to-end workloads, record sample counts and caveats, and update only
   the relevant internal architecture/report documentation.
8. **Review handoff.** Verify source/public-API diffs, report the exact commit
   and push evidence if separately authorized, and stop before any Phase 16.5,
   public export, UI, Worker, broker, or release work.

## 14. Explicit exclusions

The following remain excluded from the recommended Phase 16.4 scope:

- Option A study orchestration and any distributed or parallel runner;
- Option C runtime optimization unless separately authorized after profiling;
- public root or React exports and protected API baseline changes;
- Studio or UI integration;
- Worker orchestration, broker connectivity, live orders, or real exchange
  integration;
- FX conversion, portfolio accounting changes, or new financial formulas;
- scenario artifact schema changes, full-tape persistence, or checkpoint
  persistence;
- licensing/legal-policy work;
- npm publication, GitHub releases, tags, GitHub Actions, or public marketing;
- Phase 16.5 or later work; and
- claims of Firefox/WebKit/Mobile Safari, physical-device, accessibility, or
  final release readiness.

## 15. Exact owner decisions still required

The current owner instruction authorizes this local design document only. Before
any further Phase 16.4 action, the owner must decide separately:

1. **Documentation commit decision:** authorize committing and pushing this
   design document to `origin/main`, or require it to remain uncommitted for
   review.
2. **Implementation decision:** approve or reject the recommended Option B
   internal data-only scenario-comparison analysis/reporting layer.
3. **Policy decision:** if implementation is approved, approve the proposed
   internal schema version, eight-scenario inheritance, 2 MiB report budget,
   warning/metric bounds, sequential synchronous projection, explicit
   cancellation status, immutable data-only output, no-ranking rule, and no
   report persistence.
4. **Verification decision:** approve the stated focused tests and 1k/10k/100k
   report-only/end-to-end benchmark matrix as the internal acceptance evidence.
5. **Boundary decision:** reaffirm that no public exports, API-baseline changes,
   Studio, Workers, brokers, live execution, publication, tags, releases,
   licensing, or Phase 16.5 work is included.

No prior Phase 16.3 or 16.3.1 authorization is inferred to cover these new
decisions.

## 16. Draft implementation authorization statement

The following statement is intentionally separate from the design and requires
an explicit owner decision before implementation:

> **Approve internal Phase 16.4 Option B implementation only.** I authorize
> OpenKline maintainers to implement the internal, unexported, data-only
> Scenario-Comparison Analysis and Reporting layer described in
> `docs/reviews/phase-16-4-architecture-design.md`, based on the verified
> baseline `88b5bdb004d84678243a1a60fa042da39a9dd8a4`.
>
> The authorization includes strict comparison-result validation, immutable
> bounded report projection, deterministic provenance and fingerprinting,
> explicit currency/valuation/decision-history uncertainty preservation,
> cooperative cancellation, focused regression tests, internal 1k/10k/100k
> benchmarks, and technical documentation. It permits only internal source,
> tests, benchmarks, and documentation changes within the research boundary.
>
> It does not authorize replay-engine changes, new financial formulas or FX
> conversion, study orchestration, parallelism, Workers, public package or
> React exports, Studio integration, protected API-baseline changes, broker or
> live execution, licensing work, npm publication, tags, releases, GitHub
> Actions, Phase 16.5, or closure of browser/device/accessibility/legal/release
> gates. Simulated results must remain distinct from observed exchange
> transactions. Any deviation requires separate explicit authorization.

## 17. Design-task acceptance and handoff

The acceptance state for the original design task was design-only. The current
internal implementation state is:

`PHASE 16.4.1 — INTERNAL PROFESSIONAL WIDGET UI IMPLEMENTED / PUBLIC API REVIEW REQUIRED`

After this file is created, verification must confirm:

- the file exists at `docs/reviews/phase-16-4-architecture-design.md`;
- all required sections are present;
- no files under `src/` were modified;
- root/React public API files and protected baseline files were not modified;
- the Phase 16.4.0 and 16.4.1 implementation remained inside `src/widget/` and
  did not change root exports or the protected API baseline; and
- the current implementation and verification records are in the phase reports.

The original document was later committed under owner authorization. The
internal UI must not be described as a public package, and Phase 16.5 must not
begin without separate authorization.

## 18. Current authoritative product direction

The current Phase 16.4 direction is the **Professional Embeddable Charting
Library**: a polished, framework-independent widget layer around the tested
OpenKline core. Phase 16.4.0 and the bounded 16.4.1 UI increment are internal
implementations; they do not authorize a public package release.

The widget is intended for application developers who own their application,
market-data permissions, persistence, and host UI policy. It must run entirely
client-side with directly supplied offline data and injected provider-neutral
datafeeds. It must not contact an OpenKline backend or require OpenKline
accounts, authentication, billing, telemetry, cloud storage, or a network
connection. A host may add its own alerts, accounts, or service integrations;
those remain host responsibilities and are not OpenKline-operated services.

The design uses TradingView Advanced Charts only as a functional product
reference. It does not copy proprietary code, assets, branding, interaction
implementation, or an unsupported drop-in API promise.

## 19. Existing capability and gap matrix

The following matrix is based on the public root exports, `@openkline/react`,
the private Next.js example, source architecture documents, and API guides at
the verified baseline. “Public” means an exported, documented contract, not a
claim that every inherited release gate is closed.

| Capability | Current state | Evidence / boundary | Widget implication |
| --- | --- | --- | --- |
| Canvas2D chart construction and lifecycle | Implemented and publicly available | `createChart`, `Chart`, resize/destroy, defensive snapshots | Reuse as the sole chart/rendering owner |
| Primary and alternative series | Implemented and publicly available | Candlestick, OHLC, hollow, Heikin-Ashi, line, area, baseline, volume/histogram APIs | Header chart-type controls should call series visibility/style APIs; do not duplicate chart state |
| Shared viewport, scales, crosshair, tooltip data | Implemented and publicly available | Pan/zoom, linear/log/percentage/indexed scale, crosshair events, visible-range primitives | Widget owns controls and presentation, not a second viewport or scale system |
| Pointer, touch, keyboard, theme, locale, timezone, RTL foundations | Implemented in core; host UI is separate | `interaction`, `ChartTheme`, locale/timezone, `direction: "rtl"`; formal UI conformance remains open | Widget must add labeled DOM controls and preserve the core interaction model |
| Offline/direct data | Implemented and publicly available | `setData`, `update`, offline guide and deterministic fixtures | Must be a first-class no-backend initialization path |
| Provider-neutral datafeed | Implemented and publicly available | `Datafeed`, `InMemoryDatafeed`, `RestDatafeed`, `WebSocketDatafeed`, cancellation and stale-response handling | Inject adapters; never add provider discovery or mandatory network calls |
| Indicators and filled bands | Implemented and publicly available | Built-in registry, custom definitions, panes, Bollinger band fill, anchored VWAP and volume profile | Indicator explorer can consume metadata and call existing chart APIs |
| Drawings and custom drawing tools | Implemented and publicly available | Drawing lifecycle, selection, locking, visibility, undo/redo, serialization, plugin registration | Toolbar/property editor/object tree must be a separate UI layer |
| Plugin and extension contracts | Implemented and publicly available | Trusted `PluginRegistry`, extensions, commands, events, indicators, drawings, JSON state | Widget installs trusted host-provided plugins; it must not execute untrusted code or load code from workspace JSON |
| Workspace JSON | Implemented and publicly available | Versioned `WorkspaceDocument`, parse/restore, plugin/indicator compatibility handling | Storage remains injected by the host; widget provides convenience orchestration only |
| React chart binding | Implemented and publicly available | `@openkline/react` `FinancialChart`, declarative candles/indicators/drawings/plugins/workspace, unmount cleanup | Preserve the existing adapter; an optional widget wrapper must not require React in core |
| Multi-chart layout and synchronization contracts | Implemented and publicly available at the model/API level | `StudioWorkspaceDocument`, `WatchlistModel`, `StudioSynchronizationController`, `ChartSynchronizationController` | Widget can compose these contracts, but must isolate panel lifecycle and replay cutoffs |
| Multi-chart/watchlist/settings UI | Implemented but private to the reference Studio | `examples/nextjs-app-router` contains controls, panel selection, object tree, settings, watchlist, responsive layout | Extract a dependency-clean, framework-neutral widget instead of copying the Next.js application |
| Replay controls and market replay | Core/replay contracts are public; richer controls are private to Studio | Legacy and unified replay APIs, causal masking, replay workspace; Studio owns panel controls | Widget controls should call replay APIs and preserve datafeed suspension/restore semantics |
| Volume analytics, order flow, corporate actions, sessions, MTF | Implemented and publicly available at calculation/chart API boundaries | Public calculators and chart methods; Studio panels demonstrate workflows | Widget panels are optional presentations over existing APIs, not new calculations |
| KlineScript compiler/runtime | Implemented and publicly available as restricted contracts; editor UI is private | Compiler, diagnostics, script indicators, optional worker path; private editor in Next example | Widget may expose a host-enabled editor later, but script execution remains restricted and explicitly configured |
| Screener and watch workflows | Core contracts are public; UI is private/reference | Public universe/rules/snapshot/watch/worker contracts; Studio panel/example | Widget feature flag may host a panel but must not become a market-data service |
| Backtesting, paper trading, optimization | Core contracts are public; Studio panels are private consumers | Public simulation/worker contracts and client-only Studio panels | Keep these optional and clearly simulated; do not make them required for chart embedding |
| Standalone professional widget package | Internal controller implemented; package missing | `src/widget/` contains the owner-authorized internal controller; no package subpath or public export exists | Separate package/public API approval remains required |
| Programmatic UI command surface | Internal-first controller implemented | Internal Widget routes five UI surfaces through existing Chart methods/events; no public command contract is adopted | Stabilize and review a public controller contract before release |
| Injected widget storage contract | Internal adapter implemented | Workspace JSON remains public and Widget storage is injected, cancellable, and has no default persistence | Public storage/type adoption remains a separate decision |
| Full UI accessibility and visual conformance | Partially implemented / not fully verified | Native controls, dialog semantics, keyboard focus, RTL, and touch-emulation tests exist; formal screen-reader/WCAG gate remains open | Retain formal verification as a release gate |
| Official all-browser and physical-device evidence | Blocked or open | Chromium evidence exists; inherited Firefox/WebKit/Mobile Safari and physical-device gates remain open in this environment | Do not claim universal compatibility from the design or Chromium runs |
| Public API baseline and release readiness | Open | `api:check` retains inherited declaration-hash differences; legal/publication gates are open | No baseline rewrite, release, tag, or npm publication in this phase |
| OpenKline backend/account/cloud infrastructure | Intentionally excluded | Library-first architecture assigns data, credentials, storage, and services to hosts | Do not treat this as missing product work |

## 20. Professional Widget architecture

### 20.1 Layered model

The proposed widget is a browser-only presentation/controller package over the
existing library-first core:

```text
Host application
  ├─ owns symbols, permissions, credentials, data, persistence, services
  ├─ injects Datafeed / REST / WebSocket adapters and optional storage
  └─ chooses framework, routing, authentication, and optional host actions
           |
           v
@openkline/widget (proposed, framework-independent DOM package)
  ├─ widget shell and feature visibility
  ├─ accessible controls, menus, dialogs, panels, and command routing
  ├─ symbol/timeframe/chart-type/indicator/drawing/workspace orchestration
  ├─ responsive layout, theme, locale, RTL, and touch policy
  └─ owns UI subscriptions and disposes them deterministically
           |
           v
openkline core (existing)
  ├─ Chart, Canvas2D renderer, series, panes, scales, viewport, crosshair
  ├─ indicators, drawings, plugins, replay, datafeed, workspace contracts
  └─ provider-neutral calculations and lifecycle-safe state
```

The widget must not reach into `ChartModel`, renderer internals, stores, or
private Studio state. Every chart mutation goes through the public `Chart`
handle and every data request goes through an injected provider contract. The
widget may maintain UI state such as active panel, open dialog, selected object,
and feature visibility, but it must not maintain a second financial truth.

### 20.2 Lifecycle

Proposed lifecycle:

1. Validate the container and widget options without network activity.
2. Create or accept a host-approved `Chart` instance and attach only public
   event subscriptions.
3. Install explicitly supplied trusted plugins before restoring workspace state.
4. Resolve optional datafeed/symbol state through the injected adapter and apply
   data with an `AbortSignal`.
5. Render controls from immutable snapshots and route commands to the chart.
6. On symbol/timeframe changes, cancel stale loads, stop the prior feed, and
   preserve only workspace state that the host's policy allows.
7. On `destroy()`, remove DOM listeners, cancel pending requests, dispose
   subscriptions/handles, stop datafeeds, destroy the chart when widget-owned,
   and clear references to host data.

The ownership mode must be explicit: a widget either creates and destroys its
chart or receives a host-owned chart and never destroys it. The same rule applies
to injected storage and plugin handles. Destruction must be idempotent.

### 20.3 Offline-first initialization

The minimum valid setup is a container plus local candles:

```ts
const widget = createOpenKlineWidget({
  container,
  data: localCandles,
  chart: { theme: "dark", timeZone: "UTC" },
  features: { watchlist: false, replay: false },
});
```

No fetch, WebSocket, account lookup, authentication, telemetry, or host service
is implied. A datafeed is opt-in. A widget must be usable when the host denies
network access and must expose validation/error state without replacing local
data with a demo provider.

## 21. Proposed module and package boundaries

These names are design sketches, not approved package exports.

| Boundary | Responsibility | Dependencies and exclusions |
| --- | --- | --- |
| `openkline` | Existing framework-independent chart/calculation/public contracts | No React, Next.js, UI framework, provider discovery, or storage implementation |
| `@openkline/widget` (proposed) | DOM widget shell, controls, panels, command routing, responsive/a11y policy | Depends on `openkline`; no Next.js, no mandatory React, no backend |
| `@openkline/widget/styles` (proposed optional entry) | Reset/theme tokens and component styles | No application branding or proprietary reference assets; host may override tokens |
| `@openkline/react` | Existing React `FinancialChart` adapter; possible future widget adapter | React peer dependency only; must not pull Next.js or Studio code into core |
| `examples/nextjs-app-router` | Private reference consumer and integration evidence | Not a package source; not copied into the widget; may demonstrate optional panels |
| host datafeed adapter | Symbol resolution, history, streaming, auth, retry policy | Host-owned; use existing `Datafeed`, `RestDatafeed`, `WebSocketDatafeed` contracts |
| host storage adapter | Workspace save/load/remove/list according to host policy | Host-owned; no default browser/server persistence in core |
| host service integration | Alerts, account, permissions, remote sync, analytics | Optional host feature; never an OpenKline backend obligation |

The package graph must remain acyclic: core must not import widget, React, Next.js,
examples, or provider code. The widget may import core. React may wrap the widget
only through a separate optional adapter and must not make the core React-aware.

## 22. UI component inventory

The proposed widget UI is modular and feature-flagged. Each component must have
a corresponding programmatic command/event or a documented reason why it is
presentation-only.

| Component | Primary responsibility | Programmatic counterpart |
| --- | --- | --- |
| Widget shell | Own regions, resize observation, focus scope, theme/locale context | `getLayout`, `setLayout`, `destroy` |
| Header | Symbol selector, timeframe selector, data status, chart-type entry point | `setSymbol`, `setTimeframe`, `setChartType`, status events |
| Chart-type menu | Candles, OHLC, hollow, Heikin-Ashi, line, area, baseline, volume visibility/style | `setSeriesStyle`, series APIs |
| Indicator explorer | Search, categories, favorites, parameter form, pane selection | `addIndicator`, `removeIndicator`, `setParameters`, `setOutputStyle` |
| Drawing toolbar | Tool activation, placement, snap mode, undo/redo | `startDrawing`, `registerDrawingTool`, drawing APIs |
| Drawing property editor | Style, anchors, lock/visibility, text, delete | `setStyle`, `setPoints`, `setDrawingLocked`, `setDrawingVisibility` |
| Object tree/layers | Series, indicators, drawings, overlays, ordering/visibility | `getSeriesInfo`, `getDrawings`, plugin/indicator APIs |
| Chart context menu | Contextual navigation, crosshair, drawing and viewport actions | Typed command registry and chart methods |
| Settings dialog | Theme, locale, timezone, price scale, interaction, margins | `setOptions`, price-scale APIs |
| Template/workspace dialog | Save, restore, import, export, validation and missing-plugin policy | `serializeWorkspace`, `restoreWorkspace`, storage adapter |
| Pane/layout manager | Add/remove/resize panes and single/two/four chart layouts | `addPane`, `remove`, proposed widget layout controller |
| Watchlist panel | Ordered lists, favorites, quote state, active symbol | Public `WatchlistModel` and injected `QuoteProvider` |
| Comparison controls | Add/remove assets and normalized/indexed comparison presentation | Public `ComparisonEngine` and series APIs |
| Replay controls | Start/pause/step/seek/speed/exit and causal status | `createReplay` / market replay APIs |
| Optional analysis panels | Volume analytics, order flow, screener, strategy/research panels | Existing public contracts; disabled by default and host-configured |
| Command/shortcut manager | Keyboard shortcuts, conflict validation, host actions | Plugin commands and proposed widget command API |
| Status/error region | Loading, stale, reconnecting, validation, replay and disposal messages | Typed widget events and accessible live region |

The object tree and layer controls must use defensive public snapshots. They must
not retain internal `SeriesApi`, indicator, or drawing implementation objects
after removal. Panel removal must dispose only the resources owned by that panel.

## 23. Proposed developer API design

The following is a proposed internal-first shape. It is not a public export and
does not change the protected API baseline.

```ts
interface OpenKlineWidgetOptions {
  readonly container: HTMLElement;
  readonly chart?: ChartOptions;
  readonly chartInstance?: Chart; // host-owned mode; mutually exclusive with ownership
  readonly ownership?: "widget" | "host";
  readonly data?: readonly Candle[];
  readonly datafeed?: Datafeed;
  readonly datafeedQuery?: DatafeedQuery;
  readonly storage?: OpenKlineWidgetStorage;
  readonly initialWorkspace?: WorkspaceDocument;
  readonly features?: OpenKlineWidgetFeatures;
  readonly locale?: OpenKlineWidgetLocale;
  readonly theme?: OpenKlineWidgetTheme;
  readonly plugins?: readonly OpenKlinePlugin[];
}

interface OpenKlineWidget {
  getChart(): Chart;
  getState(): OpenKlineWidgetSnapshot;
  setSymbol(symbol: string, options?: { readonly signal?: AbortSignal }): Promise<void>;
  setTimeframe(timeframe: string, options?: { readonly signal?: AbortSignal }): Promise<void>;
  setChartType(type: ChartPresentation): void;
  addIndicator(id: string, options?: IndicatorAddOptions): ChartIndicatorApi;
  removeIndicator(id: string): void;
  addDrawing(type: string, options: DrawingOptions): DrawingApi;
  removeDrawing(id: string): void;
  setFeatureVisibility(patch: Partial<OpenKlineWidgetFeatures>): void;
  setTheme(theme: OpenKlineWidgetTheme): void;
  setLocale(locale: OpenKlineWidgetLocale): void;
  saveWorkspace(key: string, options?: { readonly signal?: AbortSignal }): Promise<void>;
  loadWorkspace(key: string, options?: { readonly signal?: AbortSignal }): Promise<WorkspaceRestoreResult>;
  exportWorkspace(): WorkspaceDocument;
  importWorkspace(value: unknown): WorkspaceRestoreResult;
  installPlugin(plugin: OpenKlinePlugin): PluginHandle;
  subscribe(listener: (event: OpenKlineWidgetEvent) => void): () => void;
  destroy(): void;
}
```

The final API must use the repository's existing `Chart`, `Datafeed`, indicator,
drawing, plugin, workspace, and cancellation types where compatible. It must
not promise drop-in compatibility with TradingView APIs. Symbol and timeframe
changes must define whether datafeed replacement is atomic, how stale responses
are ignored, and which workspace fields remain stable.

Every imperative method must have deterministic disposal behavior and explicit
error/status events. UI actions must call the same methods rather than adding a
second hidden mutation path. Host-defined actions may be registered through a
scoped command contract with an explicit cleanup handle; arbitrary DOM callbacks
must not be serialized into workspaces.

## 24. Datafeed and storage injection contracts

### 24.1 Datafeed

The widget reuses the existing vendor-neutral `Datafeed` contract:

```ts
interface Datafeed {
  resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo>;
  getBars(query: GetBarsQuery): Promise<readonly Candle[]>;
  subscribeBars?(args: SubscribeBarsArgs): () => void;
}
```

`RestDatafeed` and `WebSocketDatafeed` remain reference adapters, not required
providers. They keep their existing URL, redirect, pagination, timestamp,
duplicate/correction, reconnect, stale-response, and cleanup policies. The
widget must expose provider status and errors but must not hide invalid data or
silently switch providers. `InMemoryDatafeed` remains the deterministic offline
fixture.

Trade-print, Level-2, corporate-action, comparison, and screener providers
remain separate typed contracts. A widget may enable a panel only when the host
supplies the matching source. It must not infer missing liquidity, aggressor
side, corporate actions, or quote data from candles.

### 24.2 Storage

Workspace storage remains outside `openkline` and is injected into the widget:

```ts
interface OpenKlineWidgetStorage {
  load(key: string, signal?: AbortSignal): Promise<string | unknown | null>;
  save(key: string, value: string, signal?: AbortSignal): Promise<void>;
  remove(key: string, signal?: AbortSignal): Promise<void>;
}
```

The widget validates untrusted data with `parseWorkspace` before restoration,
limits document size before allocation, reports skipped/missing plugins and
indicators, and never executes code contained in a workspace. Storage errors,
cancellation, and version incompatibility are visible to the host. No default
localStorage, IndexedDB, server, cloud sync, account, or credential storage is
required. A host may implement those policies outside the package.

## 25. Accessibility, localization, RTL, and responsive requirements

The canvas accessible summary is useful but is not a complete table or a formal
screen-reader/WCAG claim. The widget must provide accessible DOM controls around
the canvas:

- semantic buttons, selects, inputs, menus, dialogs, and list/tree structures;
- visible focus indicators and keyboard operation for every toolbar, menu,
  drawing tool, object-tree action, pane/layout action, and replay control;
- roving focus or an equivalent deterministic model for toolbars and trees;
- dialog labeling, focus return, Escape handling, and no blocking
  `prompt()`/`confirm()` workflows;
- `aria-expanded`, `aria-selected`, `aria-pressed`, `aria-current`, and
  disabled/loading/error states where applicable;
- concise live-region updates for symbol/timeframe changes, datafeed status,
  replay state, validation errors, and destructive-action confirmation;
- keyboard alternatives for touch/pointer-only commands and a non-color-only
  indication for up/down/selected/error states;
- localization of control labels, accessible names, date/time, numbers, and
  validation messages through an injected locale catalog;
- RTL-aware DOM order and menu placement, while using the core `direction` for
  time-coordinate transforms; and
- responsive layout that works in narrow and wide containers without assuming a
  desktop viewport, with touch targets and gestures that do not block chart
  pointer capture.

The target accessibility standard and browser matrix must be approved before
release verification. Until formal screen-reader and assistive-technology tests
are executed, the widget must be marked accessibility-unverified.

## 26. Performance, memory, and lifecycle requirements

The widget must preserve the existing core renderer and its measured behavior;
it must not add a second chart canvas per panel or rebuild the chart on every
control update. UI work must be separated from high-frequency pointer,
crosshair, pan, zoom, and realtime data paths.

Acceptance measurements should include:

| Workload | Required measurements |
| --- | --- |
| 1,000 bars | Initial render, interaction latency, reportable frame time/FPS, memory and cleanup |
| 10,000 bars | Same metrics plus indicator/drawing/pane combinations |
| 100,000 bars | Same metrics with median/p95 and sample counts; no unsupported universal claim |
| Continuous pan/zoom | Event-to-visual-update latency, dropped/coalesced frames, crosshair alignment |
| Realtime append/correction | Append and correction cost, stale-response isolation, UI stability |
| Multi-chart | Panel synchronization cost, mixed sizes, layout changes, isolated disposal |
| Destroy/unmount | Remaining canvases, listeners, timers, subscriptions, Workers, and storage tasks |

Historical baselines such as approximately 60–62 FPS for the optimized 100k
core workload are reference evidence only. Widget measurements must identify
browser, hardware, sample count, workload, and whether the host or system
browser was used. Cloud measurements must not be presented as equivalent to
trusted Manjaro or official Playwright evidence.

The widget must virtualize or bound long watchlists/object trees, debounce
search/filter UI, avoid deep-comparing large candle arrays on every render, and
keep immutable snapshots separate from mutable DOM state. Any optimization that
changes chart scheduling, replay causality, financial calculations, or public
API behavior requires a separate measured design and authorization.

## 27. Implementation workstreams and dependencies

These are proposed future workstreams only; none is authorized by the current
design instruction.

1. **Product/API contract lock:** approve the corrected library-first vision,
   ownership modes, widget API names, feature flags, storage contract, and
   migration/non-drop-in compatibility statement.
2. **Package boundary prototype:** create the dependency graph and build/package
   fixtures for a framework-independent widget without changing root exports or
   the protected API baseline.
3. **Shell and command model:** implement lifecycle ownership, feature
   visibility, typed events, command/shortcut registration, and public-API-only
   chart orchestration.
4. **Core controls:** add symbol/timeframe/chart-type, indicator explorer,
   drawing toolbar/property editor/object tree, settings, panes, layouts,
   watchlist, comparison, and replay controls as independently disposable
   components.
5. **Datafeed/storage adapters:** integrate injected Datafeed and storage with
   cancellation, validation, stale-response handling, offline fixtures, and
   error/status presentation.
6. **React integration:** preserve `FinancialChart`; add a separate opt-in
   widget adapter only after the framework-neutral package is stable. Verify
   Strict Mode mount/unmount and prop reconciliation without leaking resources.
7. **Accessibility/localization:** add semantic controls, keyboard/touch paths,
   focus management, RTL, locale catalogs, reduced-motion/high-contrast policy,
   and assistive-technology test fixtures.
8. **Performance/lifecycle:** measure 1k/10k/100k, continuous interactions,
   realtime, responsive layout, multi-chart disposal, and package consumers.
9. **Documentation and acceptance:** publish API guides and migration notes only
   after public API approval; keep unsupported browser/device/legal/release gates
   explicit.

Dependencies are ordered: API/boundary decisions precede source work; core
controls depend on stable command and storage contracts; React depends on the
framework-neutral widget; accessibility and performance depend on stable UI
semantics; release verification depends on all of the preceding evidence.

## 28. Release acceptance criteria for the future widget

These criteria are proposed gates, not current results:

| Area | PASS requires | Current state |
| --- | --- | --- |
| Vanilla JS | Independent consumer installs the approved widget package, initializes with offline candles, controls chart state, exports/restores workspace, and destroys cleanly | Internal offline Widget flow passes; package/public contract is not authorized |
| React | Independent React consumer mounts/unmounts under Strict Mode and receives the same programmatic capabilities without leaks | Existing `FinancialChart` is covered; widget adapter not implemented |
| Next.js | Client-only integration builds in production and does not import DOM-only widget code into server modules | Reference example exists; future widget path not verified |
| Datafeed | Injected in-memory, REST, and WebSocket mocks cover pagination, cancellation, corrections, reconnect, stale responses, and unsubscribe | Core adapters and Widget datafeed transition tests exist; public Widget package remains unapproved |
| Offline/no backend | Network-deny consumer works from local data with no OpenKline service, account, auth, or telemetry | Internal offline Widget initialization passes; public consumer package not authorized |
| UI controls | Every enabled significant feature has an accessible UI path and a documented programmatic command/event | Five internal UI surfaces have Chromium behavior coverage; public Widget command/API contract remains open |
| Accessibility | Keyboard, focus, semantic controls, RTL, localization, screen-reader/AT, contrast, and reduced-motion tests pass for supported browsers | Partial Studio/core evidence; formal gate open |
| Responsive/touch | Narrow and wide layouts, pointer/touch pan/zoom, drawing gestures, dialogs, and panel changes pass in the supported browser matrix | Chromium diagnostic evidence exists; official/mobile/physical gates open |
| Performance | 1k/10k/100k and interaction/realtime results meet approved budgets with median/p95/sample evidence | Internal Widget benchmark covers 1k/10k/100k, panels, lifecycle, and next-frame interaction timings; approved release budgets remain open |
| Cleanup | Destroy/unmount leaves zero widget-owned canvases, listeners, subscriptions, timers, Workers, and pending storage tasks | Internal Widget diagnostics and browser tests show zero listeners/subscriptions/canvas after destroy; official cross-browser gate remains open |
| API compatibility | Additive API review passes; no unapproved declaration hash changes or protected baseline rewrite | Inherited API gate remains open |
| Documentation | Vanilla, React, Next.js, datafeed, storage, plugin, workspace, accessibility, RTL, and migration guides match shipped APIs | Internal architecture and Phase 16.4.1 verification docs updated; public Widget guides are deferred |
| Release/legal | Owner/legal approval, package audit, browser/device evidence, license and publication authorization are complete | Open and not authorized |

No row may be marked PASS from design text alone. Browser compatibility must be
reported per actual engine/version, and no physical-device or final release
claim may be inferred from Chromium tests.

## 29. Current explicit exclusions

In addition to the research-scope exclusions above, the authoritative product
direction explicitly excludes:

- an OpenKline-operated backend, SaaS, hosted trading website, account system,
  database, cloud service, billing, authentication, telemetry, or market-data
  service;
- mandatory network access, provider discovery, vendor credentials, or a
  required exchange integration;
- broker connectivity, live order placement, actual exchange execution, or a
  claim that simulated fills are observed transactions;
- copying TradingView code, assets, branding, proprietary behavior, or promising
  unsupported drop-in API compatibility;
- copying the private Next.js Studio application directly into a public package;
- public exports, protected API-baseline changes, package publication, npm
  release, tags, GitHub releases, or GitHub Actions without separate approval;
- licensing/legal-policy changes;
- Worker/parallel execution or a new rendering architecture merely to support
  the widget; and
- Phase 16.5 or later work, or closure of inherited browser, device,
  accessibility, legal, or release gates.

## 30. Exact owner implementation authorization request

The following text is retained as the historical design-task authorization
request. The owner has now separately approved the bounded Phase 16.4.0
foundation in the current execution, but has not approved the complete widget
roadmap or public API adoption:

> **Approve internal Phase 16.4 Professional Embeddable Charting Library
> implementation only.** I authorize implementation of the dependency-clean,
> client-side `@openkline/widget` architecture described in
> `docs/reviews/phase-16-4-architecture-design.md`, using the existing public
> `openkline` core and preserving the current `@openkline/react` boundary.
>
> The authorized scope, if approved, includes the framework-independent widget
> shell, accessible DOM controls, symbol/timeframe/chart-type controls,
> indicator and drawing management, object/layer controls, chart settings,
> panes/layouts, watchlist/comparison/replay controls, keyboard/touch/RTL/
> localization behavior, injected provider-neutral Datafeed adapters, injected
> storage, JSON workspace import/export, typed events/commands, lifecycle
> cleanup, offline consumer examples, focused tests, performance measurements,
> and technical documentation.
>
> This authorization does not permit an OpenKline backend, SaaS/cloud/account/
> billing/authentication service, mandatory network calls, broker/live
> execution, untrusted plugin execution, copied TradingView code/assets/
> branding, direct copying of the private Studio, protected API-baseline
> changes, unapproved public exports, npm publication, tags, releases, GitHub
> Actions, license changes, Phase 16.5, or closure of browser/device/
> accessibility/legal/release gates. All data, credentials, persistence, and
> optional host services remain host-owned. Any simulated results remain
> explicitly distinct from observed exchange transactions. Any scope change
> requires separate explicit authorization.

The current authorizations cover source, focused tests, technical
documentation, Conventional Commits, and direct pushes for the bounded
Phase 16.4.0 foundation and Phase 16.4.1 professional UI increments only. They
do not authorize public package exports, publication, releases, tags, or later
Phase 16.4 workstreams.

## 31. Final design-task state

The current handoff state is:

`PHASE 16.4.3 — DEVELOPER API & INTEGRATION EXPERIENCE COMPLETE / VERIFIED INTERNALLY — PUBLIC WIDGET API NOT YET AUTHORIZED`

This revision provides the requested product vision, capability/gap matrix,
widget architecture, package boundaries, UI inventory, developer API sketches,
datafeed/storage contracts, accessibility/performance requirements,
implementation dependencies, release acceptance criteria, exclusions, and exact
owner authorization request. Subsequent owner authorizations permit the
internal Phase 16.4.0 foundation, Phase 16.4.1 UI, Phase 16.4.2
multi-chart/advanced panels, and Phase 16.4.2.1 Datafeed/Composition integrity
hardening documented in the phase reports; they do not authorize the complete
widget roadmap, public exports, or release readiness. No release gate is closed
by this implementation.

## 32. Phase 16.4.0 implementation reconciliation

The implementation uses a dependency-clean DOM controller over the existing
`Chart` handle. It provides offline local-candle initialization, optional host
Datafeed and storage injection, chart-type/timeframe/symbol controls, indicator
and drawing entry points, theme and RTL controls, accessible status regions,
workspace serialization/restoration, plugin installation, stale-request
cancellation, and idempotent widget-owned cleanup. The complete details and
evidence are in the Phase 16.4.0 report.

The following design items remain deliberately deferred: host-owned Chart
ownership mode, a separately published `@openkline/widget` package, public
root/subpath exports, locale catalogs beyond label injection, multi-panel
watchlists/comparison/replay UI, formal assistive-technology verification, and
official Firefox/WebKit/mobile-Safari evidence. The implementation does not
copy the Next.js Studio or create a second renderer/calculation engine.

## 33. Phase 16.4.1 UI reconciliation

The internal controller now implements the five authorized UI workstreams:
metadata-backed indicator discovery and parameter editing; grouped drawing
tool activation/cancellation with undo/redo; a live object/layer tree; selected
drawing style/visibility/lock editing; and Chart settings for theme, RTL,
price-scale mode, autoscale, axis visibility, and precision. The panels are
scoped to each Widget root, use native keyboard/touch-capable controls, and
refresh from Chart events. The implementation does not expose these controls
from `src/index.ts`, `@openkline/react`, the package export map, or a new public
Widget package.

Focused Chromium and Mobile Chrome emulation evidence is recorded in
`docs/reports/phase-16-4-1-professional-widget-ui.md` and
`docs/reports/phase-16-4-2-multichart-advanced-panels.md`. Firefox, WebKit,
Mobile Safari, physical-device, formal assistive-technology, CSP, public API,
legal, and release gates remain open. Phase 16.4.3 work is not authorized by
this reconciliation.

## 34. Phase 16.4.2 multi-chart and advanced-panel reconciliation

The internal Widget now owns multi-chart layouts (`single`,
`two-horizontal`, `two-vertical`, `four-grid`) with stable chart IDs,
active-chart targeting, archived layout restoration, opt-in
`ChartSynchronizationController` reuse, Watchlist/Comparison/Replay panels,
modal focus management, and an internal versioned composition document. The
controller was decomposed into focused modules; drawing cancellation uses an
internal registry rather than a public Chart API. Public exports, protected
baselines, React adapters, and publication remain unauthorized.

## 35. Phase 16.4.2.1 Datafeed and Composition integrity reconciliation

Phase 16.4.2.1 restores ChartSlot Datafeed behavior through
`Chart.setDatafeed()` (resolveSymbol, getBars, subscribeBars, unsubscribe),
generation-aware pending diagnostics, request-id guards for stale realtime
callbacks, canonical Composition chart IDs, finite comparison numerics,
hostile-input rejection, and prevalidated import with best-effort rollback.
Evidence is recorded in
`docs/reports/phase-16-4-2-1-datafeed-composition-integrity.md`.

## 36. Phase 16.4.3 developer API and integration reconciliation

Phase 16.4.3 hardens the internal Developer API (ownership, events, option
validation), adds Vanilla/Next.js client fixtures, CSP external stylesheet
mode, and Composition hostile-input protections. Evidence is recorded in
`docs/reports/phase-16-4-3-developer-api-integration.md` and
`docs/guides/widget-developer-integration.md`. Public Widget package adoption
remains unauthorized.

## 37. Phase 16.4.4 cross-browser and accessibility quality reconciliation

Phase 16.4.4 exercises Chromium/Firefox/Mobile-Chrome Widget workflows,
hardens Widget accessibility semantics and responsive touch targets, verifies
CSP under enforced `style-src 'self'`, records responsive screenshots, measures
performance/cleanup, and documents WebKit/Mobile Safari as BLOCKED when system
libraries are missing. Evidence:
`docs/reports/phase-16-4-4-cross-browser-accessibility-quality.md`. Public
Widget package adoption and Phase 16.4.5 remain unauthorized.
