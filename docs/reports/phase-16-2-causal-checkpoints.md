# Phase 16.2 — bounded causal checkpoints

Status: **INTERNAL IMPLEMENTATION VERIFIED — NOT PUBLIC**

The owner explicitly authorized this phase with: “I authorize implementation
of OpenKline Phase 16.2 bounded internal research checkpoints and causal
warm-seek restoration.” Work started from `origin/main` at
`719e693ad2afedb786bc41557c5e2f47982d5c27`, using
`Akira Yuzai <yuzai.akira@gmail.com>`. The implementation is confined to the
internal research-execution boundary and does not alter the protected public
API baseline.

## Delivered behavior

The research session now has an internal format-1 checkpoint containing the
complete causal frontier: tape and policy identity, decision revision/frontier,
ledger and reservations, orders, fills, order-book state, source and session
observations, corporate-action entitlements/revisions, marks, quality and
warning diagnostics, journal ring contents/head/sequence/evictions, identity
counters, and terminal state. Copies are defensive and contain no listeners,
callbacks, promises, browser resources, or external references.

Backward seeks select the latest compatible checkpoint at or before the target,
restore it through a fresh exact order-book snapshot, and replay the remaining
events through the existing `MarketReplayController`. Any rejected or missing
candidate falls back to event-zero reconstruction. Forward stepping and
decision activation remain on the original causal path.

New submit/cancel decisions increment a decision-history revision and invalidate
retained checkpoints before the edit can affect replay. Same-cursor ordering,
idempotency, cancellation, future-branch rejection, and schema-1 artifact
restoration remain unchanged.

Only live synchronized order books are checkpointable. Gapped, recovering,
stale, unavailable, crossed, or otherwise non-live states fail closed and
record `order-book-state-not-restorable`; incompatible identity/policy state,
over-budget copies, and rejected exact restores have distinct structured
fallback codes. Disposal clears all checkpoint references and remains
idempotent.

Controls are internal and bounded at a default interval of 250 events, 32
checkpoints, and an approximate 32 MiB structural estimate. The acceleration is
opt-in (`enabled` defaults to `false`) so schema-1 artifact restoration and
existing research runs retain their full-replay behavior; the Phase 16.2
benchmark enables it explicitly. Oldest event-index entries are evicted
deterministically. The estimate is deliberately separate from process heap
measurements and is not a JavaScript heap bound.

## Verification

The focused command compiled the internal tests and passed 41 tests, including
the four new checkpoint tests. They compare enabled and disabled sessions for
complete orders, fills, ledger, journal, diagnostics, repeated backward and
forward seeks, same-cursor edits, over-budget and gapped-book fallbacks,
bounded retention, and disposal. Existing `ReferenceExecutionLedger` and
research correctness fixtures remain the independent financial reference.

Baseline evidence was captured before source edits at the starting SHA:

- focused research, correctness, and scenario-artifact tests: 37 passed;
- `npm run benchmark:research`: deterministic 1k/10k/100k run completed;
- `npm run benchmark:research-scenario`: deterministic schema-1 artifact run
  completed, including 1k/10k/100k restoration and cleanup measurements.

The new controlled benchmark uses Linux x64, Node `v24.19.0`, `--expose-gc`,
ordinary/decision-heavy/order-book-heavy tapes, enabled and disabled controls,
three samples at 1k/10k, and two samples at 100k. It reports medians and
nearest-rank p95; 100k p95 is weak because it has only two observations. Times
are milliseconds; retained bytes are the structural estimate unless labelled
heap delta. The captured benchmark JSON was produced at implementation commit
`bbe9d8e74f1c1fd64d1e4836b6aff35fff24a2fd`.

| Events / workload | Enabled cold backward median/p95 | Disabled cold backward median/p95 | Speedup | Capture median ms | Estimated bytes / retained / evictions |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1k ordinary | 0.738 / 1.690 | 3.016 / 3.379 | 4.09× | 33.158 | 10,154,044 / 20 / 0 |
| 1k decision-heavy | 10.949 / 12.553 | 6.330 / 6.535 | 0.58× | 54.399 | 13,004,270 / 20 / 0 |
| 1k order-book-heavy | 0.389 / 1.446 | 2.192 / 2.512 | 5.63× | 2.927 | 296,384 / 20 / 0 |
| 10k ordinary | 83.815 / 93.463 | 96.593 / 107.338 | 1.15× | 283.465 | 99,704,644 / 20 / 0 |
| 10k decision-heavy | 131.376 / 151.627 | 115.903 / 117.485 | 0.88× | 327.232 | 102,427,148 / 20 / 0 |
| 10k order-book-heavy | 0.342 / 0.404 | 14.689 / 15.591 | 42.98× | 4.814 | 297,384 / 20 / 0 |
| 100k ordinary | 642.656 / 642.656 | 420.714 / 420.714 | 0.65× | 4,303.943 | 95,168,172 / 1 / 95 |
| 100k decision-heavy | 939.633 / 939.633 | 694.086 / 694.086 | 0.74× | 4,650.881 | 95,377,556 / 1 / 76 |
| 100k order-book-heavy | 211.155 / 211.155 | 367.006 / 367.006 | 1.74× | 8.130 | 298,384 / 20 / 0 |

The results support warm-seek acceleration for ordinary and order-book-heavy
fixtures, while decision-heavy and large ordinary workloads show checkpoint
capture cost dominating the measured path. The safe full-replay fallback remains
the required behavior; no universal speedup or cold-restore claim is made. A
500k run was not executed and is **NOT VERIFIED**. Forced-GC post-disposal
observations are process readings and do not establish a zero-heap-retention
property.

## Phase 16.2 acceptance matrix

| Checkpoint criterion | Result | Evidence / limitation |
| --- | --- | --- |
| M5.1 versioned bounded contract | PASS | Internal format 1, identity/policy binding, diagnostics, bounded controls |
| M5.2 complete causal restoration | PASS | Full ledger/order/fill/journal/source/session/corporate state copied and replayed |
| M5.3 order-book fail-closed boundary | PASS | Live-only exact snapshot restore; gaps/stale/recovery fall back with code |
| M5.4 deterministic bounded storage | PASS | Count/estimate budgets, oldest eviction, over-budget fallback, disposal cleanup |
| M5.5 decision invalidation and no-lookahead | PASS | Revision invalidation, controller-driven eligible replay, same-cursor tests |
| M5.6 reference parity and schema compatibility | PASS | 41 focused tests; schema-1 artifacts remain checkpoint-free and hash-compatible |
| M5.7 measured warm-seek benchmark | PASS | Controlled enabled/disabled 1k/10k/100k, medians/p95 and weak-p95 caveat |
| M5.8 lifecycle, documentation, public boundary | PASS internally | Repeated seeks/dispose covered; docs added; no root/React/Studio/Worker/broker export |

## Open gates

The protected public API baseline remains unchanged and its owner-review gate is
open. Official Playwright-managed Firefox, WebKit, Mobile Safari, physical
device, formal accessibility, licensing, npm publication, release, and GitHub
Actions gates remain open or environment-dependent. System Chromium evidence,
when available, remains separate from managed-browser acceptance. Phase 16.2
does not claim public support readiness and does not authorize Studio, Worker,
broker, live execution, tags, releases, or publication.
