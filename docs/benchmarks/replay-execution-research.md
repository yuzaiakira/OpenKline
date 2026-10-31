# Replay execution research benchmark plan

Status: **NOT VERIFIED — IMPLEMENTATION NOT AUTHORIZED**

This is the benchmark protocol for the proposed Phase 16.0 internal simulator.
It contains no measurements and must not be read as evidence that the engine
exists or supports the listed sizes.

## Workloads

Use the same deterministic event generator and fixed assumptions for each
run. Measure separate tapes containing observed candles/trades/Level-2/source
events, plus a mixed tape where the fixture is independently auditable.

| Workload | Required | Notes |
| --- | --- | --- |
| 1,000 events | Yes | Fast correctness/reference workload |
| 10,000 events | Yes | Steady-state lifecycle workload |
| 100,000 events | Yes | Primary performance workload |
| 500,000 events | Optional | Run only when memory is suitable; never claim support without an actual run |

Each workload must execute identical scenarios for the synchronous reference
and optimized implementation:

- market buy and sell with valid eligible books;
- partial modeled depth;
- pending passive limit under each passive policy;
- cancellation and duplicate idempotency;
- stale/gapped/unavailable source;
- fixed latency;
- corporate-action/session boundary;
- forward processing and backward/forward reconstruction.

## Measurements

Report sample count, median, p95, minimum, maximum, and environment for:

1. tape validation and input normalization;
2. simulator construction;
3. order submission and eligibility calculation;
4. per-event processing;
5. order lifecycle transition;
6. ledger update and mark valuation;
7. cold seek/reconstruction;
8. warm checkpoint seek/reconstruction;
9. result serialization/import validation;
10. disposal and retained heap.

Construction, event processing, and reconstruction must not be combined into
one number. Heap measurements must record the measurement method, forced-GC
availability, retained journal policy, and post-disposal state. No stochastic
sampling is permitted in the reference benchmark; if a later scenario adds
sampling, it must identify a seed.

## Correctness and regression gates

Every optimized result must compare the complete order journal, fills, cash,
reserved cash, position, fees, P&L, diagnostics, and lifecycle status with the
reference result. Matching final equity alone is insufficient.

The existing chart, Canvas2D, Order Flow, and Market Replay benchmarks remain
separate. Fresh local comparison must preserve the previously reported
approximately 62 FPS plain 100k Canvas2D, approximately 60 FPS realistic 100k
combined navigation, and approximately 57 FPS realistic realtime baselines;
these are historical context, not current Phase 16 results. Dense Fit Content
limitations remain reported as an open limitation.

## Resource checks

Each workload must assert zero orphan Workers, zero retained subscriptions,
zero stale callbacks, bounded journal growth, and no remaining chart canvases
when a chart consumer is used. The simulator itself must reject new orders
after disposal and release all event listeners and checkpoint references.

Until owner authorization and implementation are recorded, all benchmark
acceptance rows are **NOT VERIFIED**.
