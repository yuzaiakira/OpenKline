# Internal research scenario comparison

Status: **IMPLEMENTED / VERIFIED INTERNALLY — NOT PUBLIC**

Phase 16.3 compares provider-neutral replay-causal research scenarios without
turning simulated fills into observed exchange transactions. The implementation
is intentionally confined to `src/research-execution/`; it is not exported by
the root package or React package and has no Studio, Worker, broker, or live
execution boundary.

## Current internal contract

`compareResearchScenarios()` accepts one validated baseline artifact and up to
seven candidates, for a maximum of eight scenarios including the baseline.
Candidates are either:

- an explicit validated schema-1 artifact; or
- an allowlisted assumption patch over an immutable baseline artifact.

Patches support commission, slippage, price impact, latency, execution policy,
risk limits, and precision policy. Unknown fields are rejected. Candidate
artifacts are materialized independently, preserve the baseline's durable
decision records, and are validated again before reconstruction. Assumption
changes that would require rewriting decision metadata, such as an incompatible
latency change, fail closed instead of silently changing history.

Every candidate is restored through the existing scenario restoration path with
a fresh execution session. The baseline tape is validated once and every
scenario must match its exact tape ID, fingerprint, version, ordering, source
generations, instrument set, and causal frontier requirements. Candidate
sessions are disposed after their bounded data-only result is captured, on
failure, and on cancellation.

## Comparison semantics

Decision histories are classified as:

- `identical-decision-history` when durable decision references match;
- `compatible-fixed-history` when normalized actions match despite identity
  differences;
- `decision-history-different` when actions differ; and
- `incompatible-tape` when the historical source binding is not exact.

Different histories may be shown descriptively, but they are not represented as
a controlled single-assumption experiment and are never ranked as superior.
Unknown, partial, and indeterminate valuation remains explicit; no missing
equity or P&L value is converted to zero.

The output contains stable artifact, assumption, decision-history, action,
result-evidence, and comparison fingerprints. It retains bounded order/fill
summaries, ledger metrics, quality/source diagnostics, provenance, and
baseline-relative null-aware deltas. Monetary deltas compare the validated
accounting currency of both scenarios. When currencies differ and no approved
FX conversion exists, the original values and currency provenance are kept,
but the delta is `null` with status `not-comparable` and a deterministic
currency-mismatch reason. Valuation uncertainty is evaluated after that unit
check, so currency mismatch takes precedence over an indeterminate mark. Counts,
quantities, and drawdown percentages retain their independent semantics;
valuation-dependent ratios remain `unknown` when their basis is incomplete.
The output never retains a live session, full tape, checkpoint cache, or
provider credential.

## Phase 16.3.1 financial unit comparability

The Phase 16.3.1 corrective maintenance fixes a reproduced USD/EUR defect
without changing scenario restoration, artifact schema 1, tape fingerprints,
durable decisions, causal evidence, or reference-ledger arithmetic. The
comparison result now exposes `monetaryUnits` provenance and applies the
currency gate to realized/unrealized P&L, equity, market value, drawdown,
total fees, and modeled monetary execution fees. Slippage and price-impact
fields remain explicitly price-unit deltas rather than being mislabeled as
currency costs. Same-currency monetary sensitivity remains numeric; different
decision histories remain descriptive; verified reconstruction is independent
from financial-delta comparability.

## Causality, checkpoints, and budgets

The default execution is sequential with one active session. The aggregate
preflight budget is 1,000,000 eligible event visits, the scenario limit is
eight, and the initial serialized result budget is 8 MiB. Result records and
diagnostic arrays are independently bounded. These are resource limits, not
V8 heap guarantees.

Cancellation is checked before validation and at every restored event boundary.
Cancellation produces an explicit terminal status and disposes temporary
sessions; incomplete results are not marked verified.

Research checkpoints remain disabled unless explicitly supplied. They are
candidate-local computational caches, never shared mutable state. The existing
Phase 16.2.1 causal evidence projection excludes checkpoint enablement,
retention, estimates, evictions, invalidations, timings, and fallback history,
so enabled and disabled reconstruction can be compared without operational
cache metadata changing the result fingerprint.

## Verification boundary

The focused suite covers baseline isolation, same/different currency units,
same-currency financial deltas, initial capital, precision policy, different
decision histories, incompatible tape identity, fail-closed latency patches,
event/result budgets, checkpoint-independent evidence, cancellation,
unsupported patch fields, deterministic ordering, indeterminate valuation,
and disposal. The full Node, Market Replay, Chromium, React/Studio Chromium,
package, distribution, API inventory/diagnostics, and stress checks are
recorded in `docs/reports/phase-16-3-1-financial-comparability.md`. Browser,
physical-device, accessibility, legal, publication, and release gates remain
independent. A 500k event workload is not verified.
