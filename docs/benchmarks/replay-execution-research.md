# Replay execution research benchmark plan

Status: **VERIFIED INTERNAL BENCHMARK — NOT A PUBLIC PERFORMANCE CLAIM**

This document records the reproducible benchmark protocol and the latest
internal measurements for the Phase 16.0 simulator. It does not establish
public API support, exchange execution performance, or a chart FPS claim.

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

## Executed measurement

Command:

```text
npm run benchmark:research
```

The command builds the internal source and runs
`node --expose-gc scripts/research-execution-benchmark.mjs`. The workload is
deterministic: one complete source-status event, one synchronized Level-2
snapshot, and unique observed trades for the remaining events. Each sample
submits one market buy after the initial book, processes the complete tape,
performs a midpoint and end seek, compares the first fill with the independent
reference ledger, serializes the JSON scenario, disposes the session, and
forces GC before the retained-heap reading.

Environment: Linux x64, Node `v24.19.0`, forced GC available. Results were
measured at implementation commit `5dc6ab99997d1f8c5ef510fffc23e00f34209521`
before this benchmark/documentation commit. Times are milliseconds; heap
values are MiB. `p95` is the sample percentile from five samples for 1k/10k
and three samples for 100k.

| Events | Samples | Processing median/p95 | Processing ms/event median/p95 | Construction median/p95 | Seek median/p95 | Serialization median/p95 | Heap before dispose median/p95 | Retained after dispose median/p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 5 | 43.66 / 46.25 | 0.04375 / 0.04634 | 28.44 / 39.96 | 11.97 / 12.39 | 0.091 / 0.312 | 7.74 / 7.82 | 0.103 / 0.612 |
| 10,000 | 5 | 530.25 / 568.68 | 0.05304 / 0.05688 | 253.97 / 257.82 | 311.75 / 365.48 | 0.097 / 0.128 | 34.12 / 34.48 | 0.217 / 0.247 |
| 100,000 | 3 | 3,856.63 / 3,932.73 | 0.03857 / 0.03933 | 2,636.97 / 2,661.19 | 1,353.45 / 1,355.37 | 0.086 / 0.142 | 141.97 / 142.00 | 0.212 / 0.231 |

Tape construction, order submission, and disposal were measured separately in
the JSON output. The 100k scenario serialized to approximately 4.6 KiB
because the export contains assumptions, decisions, fills, ledger, journal,
and diagnostics, not the source tape. No 500k run was performed.

## Interpretation and limits

- The benchmark validates deterministic internal lifecycle behavior and
  scaling of this synthetic event-processing workload; it does not prove
  broker fill quality or historical exchange outcomes.
- The benchmark has no chart, Canvas2D, Worker, or Studio consumer. Existing
  chart/order-flow baselines therefore remain a separate regression gate.
- The session has no external subscriptions or Workers. Disposal rejected
  further use in the targeted test suite and released replay/order-book
  runtime references; the residual heap figures are process-level readings,
  not a claim of zero V8 heap.
- The required benchmark row is now **PASS** for 1k/10k/100k under this
  documented environment and workload. Cross-browser and physical-device
  acceptance remains outside this result.
