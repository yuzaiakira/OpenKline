# Internal research execution checkpoints

Status: **INTERNAL PHASE 16.2 IMPLEMENTATION VERIFIED — NOT PUBLIC**

Phase 16.2 adds a bounded acceleration cache to the unexported
`src/research-execution/` engine. The owner authorization covers internal
research checkpoints, bounded storage, causal warm seeks, replay/controller
integration, parity tests, benchmarks, and documentation. It does not cover a
root export, React export, Studio, Worker, broker, live order, package
publication, tag, release, or a public performance promise.

## State contract

A checkpoint is an immutable in-memory copy taken after one complete causal
event frontier. Its format version is currently `1`. The copy binds to the
scenario, instrument, venue, tape fingerprint, tape and ordering versions,
clock policy, knowledge policy, event index/id/clock, and a decision-history
revision plus decision frontier. A candidate is usable only when every binding
matches the active session and the decision revision is unchanged.

The captured research state includes:

- the complete cash, reservation, position, cost-basis, fee, realized-P&L, and
  high-water-mark ledger;
- every order and simulated fill, including remaining quantity, weighted price,
  reservation, status, and fill references;
- order-book state and provenance for every instrument/venue/source key,
  consumed displayed quantities, last synchronized event, and observed count;
- source coverage/status, observed trades, session boundaries, corporate-action
  revisions and dividend entitlements;
- the journal ring contents, ring head, monotonic journal sequence, and eviction
  count, together with warnings, quality classifications, marks, and terminal
  state;
- identity counters and the checkpoint fallback diagnostics needed to continue
  deterministically.

Subscribers, callbacks, promises, controller subscriptions, browser objects,
and external references are never captured. Mutable maps, arrays, book levels,
orders, fills, trades, actions, and journal records are defensively copied.
The checkpoint is therefore independent of later event processing.

`decisionFrontier` is the captured event frontier, while the durable decision
journal remains owned by the session. A new submit or cancellation increments
the decision-history revision and invalidates all retained checkpoints before
the edit can affect replay. Same-cursor ordering, idempotency, and future-branch
validation stay on the existing decision path.

## Bounded retention and diagnostics

Checkpoint controls are internal `ResearchExecutionOptions.checkpoints` values:

| Control | Default | Hard maximum |
| --- | ---: | ---: |
| `enabled` | `false` | — |
| `interval` (events) | `250` | `100,000` |
| `maxCheckpoints` | `32` | `1,000` |
| `memoryBudgetBytes` (approximate) | `32 MiB` | `1 GiB` |

The retained-byte value is a deterministic structural estimate of copied
values. It is not a JavaScript heap measurement and does not prove a heap
bound. A checkpoint larger than the budget is rejected with
`checkpoint-over-budget`. When count or estimated bytes exceed the configured
bound, the oldest event-index checkpoint is evicted deterministically. The
diagnostics report retained count, estimated bytes, evictions, invalidations,
and structured fallback records.

Disposal clears checkpoint copies and all research maps after replay and book
controllers are disposed. Repeated disposal remains idempotent and all public
session operations retain the existing post-disposal rejection behavior.

## Order-book safety boundary

An order-book checkpoint is captured only when its controller reports a live,
synchronized state. The exact levels, sequence, tick size, source, last event,
and consumed quantities are copied and restored through a fresh
`OrderBookController` snapshot application. A gapped, recovering, stale,
unavailable, crossed, or otherwise non-live book is never promoted to live by a
checkpoint. Capture records `order-book-state-not-restorable` and the seek uses
deterministic full reconstruction. A rejected exact snapshot records
`checkpoint-restore-rejected`; identity or policy mismatches record
`checkpoint-incompatible`.

This deliberately does not claim that a simple best bid/ask pair can restore a
recovery state. Sequence gaps and stale-source semantics remain fail-closed and
are re-derived from the tape.

## Seek algorithm and causality

For a backward target, the session selects the latest compatible checkpoint at
or before the target. It restores the complete state, then asks the existing
`MarketReplayController` for each remaining eligible event and applies the same
event processing and decision activation path as a full replay. A checkpoint
after the requested frontier is never considered. If no candidate exists, or a
candidate is rejected, the session resets and reconstructs from event zero.

Forward stepping continues to use the controller lifecycle. No future event,
trade, Level-2 liquidity, corporate action, receive timestamp, or decision is
made visible by checkpoint selection. Checkpoints are computational caches, not
market evidence, and simulated fills never enter observed trade, CVD, Footprint,
or market-trade stores.

## Compatibility with schema-1 artifacts

Schema-1 scenario artifacts remain unchanged. They persist tape identity,
assumptions, causal frontier, durable decisions, journal-retention metadata,
and optional expected-result evidence; they do not persist runtime checkpoints.
An imported artifact still creates a fresh session and recomputes orders, fills,
ledger, journal, and diagnostics from the validated tape. The UTF-16 FNV-1a
integrity hash and all schema-1 validation limits remain unchanged.

## Evidence and limits

The focused checkpoint suite compares checkpoint-enabled and disabled sessions
for complete orders, fills, ledger, journal, diagnostics, seek loops,
decision invalidation, over-budget behavior, gapped-book fallback, bounded
retention, and disposal. The independent `ReferenceExecutionLedger` parity
fixtures and the existing research correctness suite remain the financial
reference; final equity alone is not an acceptance criterion.

The controlled benchmark at
`scripts/research-execution-checkpoint-benchmark.mjs` covers ordinary,
decision-heavy, and order-book-heavy 1k/10k/100k tapes with enabled and
disabled controls. It records capture time, estimated bytes, retained count,
evictions, cold backward seek, forward seek, repeated warm seeks, and a forced
GC post-disposal observation. The benchmark reports medians and nearest-rank
p95 values; two-sample 100k p95 values are explicitly weak. A 500k run was not
executed and is **NOT VERIFIED**.

This remains an internal computational optimization. Public API, managed
Firefox/WebKit/Mobile Safari, physical-device, accessibility, licensing,
release, and publication gates remain open.
