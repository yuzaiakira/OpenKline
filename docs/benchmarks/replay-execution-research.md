# Replay execution research benchmark plan

Status: **VERIFIED INTERNAL BENCHMARK — NOT A PUBLIC PERFORMANCE CLAIM**

This document records the reproducible benchmark protocol and the latest
internal measurements for the Phase 16.0.3 headless-dispatch implementation.
It does not establish public API support, exchange execution performance, or a chart
FPS claim.

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

The corrective scenario additionally submits a partial market order, records
a durable cancellation, exercises the pending-order capacity boundary, emits
bounded journal entries, seeks backward and forward, and compares complete
orders/fills/ledger/journal state with `ReferenceExecutionLedger`.

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
`node --expose-gc scripts/research-execution-benchmark.mjs`. The base workload
is deterministic: one complete source-status event, one synchronized Level-2
snapshot, and unique observed trades for the remaining events. Each sample
submits one market buy after the initial book, processes the complete tape,
performs a midpoint and end seek, compares the first fill with the independent
reference ledger, serializes the JSON scenario, disposes the session, and
forces GC before the retained-heap reading. The corrective scenario uses a
small deterministic tape to validate cancellation persistence, reservation
release, journal retention metadata, and complete reconstruction parity.

Environment: Linux x64, Node `v24.19.0`, forced GC available. Results were
measured at corrective benchmark commit
`0b980ed1ef8d6807f51e1f7f553de5f9d2395d53`. Times are milliseconds; heap
values are MiB. `p95` is the sample percentile from five samples for 1k/10k
and three samples for 100k.

| Events | Samples | Processing median/p95 | Processing ms/event median/p95 | Construction median/p95 | Seek median/p95 | Serialization median/p95 | Heap before dispose median/p95 | Retained after dispose median/p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 5 | 41.84 / 45.13 | 0.04192 / 0.04522 | 34.48 / 41.49 | 12.52 / 13.34 | 0.086 / 0.276 | 7.92 / 7.99 | 0.109 / 0.627 |
| 10,000 | 5 | 558.41 / 576.17 | 0.05585 / 0.05763 | 262.72 / 268.82 | 331.03 / 376.16 | 0.076 / 0.080 | 34.35 / 34.66 | 0.253 / 0.275 |
| 100,000 | 3 | 3,958.32 / 4,004.49 | 0.03958 / 0.04005 | 2,681.97 / 2,684.06 | 1,399.19 / 1,493.43 | 0.092 / 0.096 | 142.05 / 142.11 | 0.235 / 0.241 |

Corrective scenario results (same run, four retained journal entries and 21
evictions in every sample) were:

| Events | Construction median/p95 (ms) | Processing median/p95 (ms) | Cancellation median/p95 (ms) | Seek median/p95 (ms) | Retained entries | Journal evictions | Retained heap after correction median/p95 (bytes) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.886 / 1.025 | 0.213 / 0.356 | 0.424 / 0.907 | 0.435 / 0.797 | 4 | 21 | 73,768 / 135,752 |
| 10,000 | 0.787 / 0.950 | 0.181 / 0.210 | 0.456 / 0.504 | 0.559 / 0.584 | 4 | 21 | 0 / 0 |
| 100,000 | 0.825 / 0.890 | 0.151 / 0.152 | 0.426 / 0.459 | 0.573 / 0.842 | 4 | 21 | 0 / 0 |

Tape construction, order submission, and disposal were measured separately in
the JSON output. The 100k scenario serialized to approximately 4.7 KiB
because the export contains assumptions, decisions, fills, ledger, journal,
and diagnostics, not the source tape. No 500k run was performed.

The previous Phase 16.0 base measurements were 43.66 ms, 530.25 ms, and
3,856.63 ms processing medians for 1k/10k/100k. The corrected run is not a
controlled before/after performance comparison: it includes changed
correctness work, a changed benchmark schema/scenario, and a different
process state. These values document reproducibility and lifecycle behavior,
not a supported performance regression or improvement claim.

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
- The required benchmark row is **PASS** for 1k/10k/100k under this documented
  environment and workload. Corrective reconstruction parity and journal
  retention checks are also **PASS**. Cross-browser and physical-device
  acceptance remains outside this result.

## Phase 16.0.2 snapshot/lifecycle addendum

The Phase 16.0.2 implementation at
`21372f17ccfd135abe05c16fe0f8f066a6b6a5fe` keeps the prior benchmark as
historical evidence and adds schema version `3`. The event-processing loop no
longer polls `getSnapshot()` merely to determine completion; it performs the
known replay steps and measures 25 repeated snapshot reads separately. This
isolates the cache-hit/defensive-copy path from the event hot path without
changing replay ordering or financial semantics.

Environment: Linux x64, Node `v24.19.0`, forced GC available. Values below are
median/p95 from five samples for 1k/10k and three samples for 100k. Times are
milliseconds and heap values are bytes.

| Events | Processing | Snapshot read | Seek | Serialization | Heap before dispose | Retained after dispose |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 34.921 / 42.194 | 0.051 / 0.058 | 12.117 / 13.806 | 0.079 / 0.200 | 5,740,128 / 5,859,640 | 118,784 / 660,920 |
| 10,000 | 453.253 / 508.314 | 0.051 / 0.077 | 313.385 / 349.279 | 0.085 / 0.119 | 6,114,296 / 6,162,880 | 152,920 / 288,344 |
| 100,000 | 3,096.729 / 3,101.842 | 0.055 / 0.056 | 1,332.838 / 1,346.145 | 0.075 / 0.105 | 5,235,808 / 5,266,808 | 142,224 / 202,832 |

The current processing numbers are not a controlled comparison with the
schema-2 numbers above because the measurement protocol changed. They are
reproducible internal evidence for the new path, not a universal performance
claim. The full Phase 16.0.2 report records the acceptance matrix and remaining
full-reconstruction seek limitation.

## Phase 16.0.3 schema-4 dispatch and benchmark-integrity addendum

The Phase 16.0.3 benchmark is schema `4` and must not be compared directly
with the schema-2 or schema-3 processing rows above. Its purpose is to isolate
observer-dispatch cost and verify that removing an unnecessary headless
snapshot does not change replay state. It records separate profiles for:

| Profile | Observer configuration and purpose |
| --- | --- |
| `headless` | Zero observers; validates the no-snapshot `emit()` fast path. |
| `oneSubscriber` | One observer; validates the existing notification contract. |
| `multiSubscriber` | Four observers; validates fan-out and shared snapshot identity. |
| `decisionHeavy` | Headless replay with deterministic limit-order submit/cancel decisions. |
| `bookHeavy` | Headless replay with one absolute Level-2 delta per event. |
| `fullSnapshotReads` | 25 explicit `getSnapshot()` calls after each completed workload, measured separately from processing. |
| `correctnessMicrobenchmark14` | A fixed 14-event corrective scenario, independent of the size-workload summaries. |

The three size workloads contain one source-status event, one Level-2
snapshot, and the remaining trade events. The 1,000 and 10,000 workloads use
five samples; the 100,000 workload uses three samples. The corrective
microbenchmark uses seven samples. The deterministic benchmark was run at
commit `a50fea743432b6d859c9ba2692155d3fd0042ef6` on Linux x64 with Node
`v24.19.0`, `--expose-gc`, and forced GC available.

Processing and full-seek medians/p95 (milliseconds) were:

| Events | Samples | Headless processing | One observer | Four observers | Decision-heavy | Book-heavy | Headless full seek |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 5 | 19.967 / 21.526 | 33.772 / 35.737 | 33.159 / 37.952 | 21.789 / 22.761 | 13.829 / 14.395 | 10.400 / 11.339 |
| 10,000 | 5 | 363.095 / 369.929 | 458.752 / 496.063 | 451.914 / 459.400 | 457.101 / 460.987 | 82.696 / 101.529 | 363.011 / 382.546 |
| 100,000 | 3 | 2,252.135 / 2,265.118 | 3,110.085 / 3,188.885 | 3,090.442 / 3,229.818 | 8,241.392 / 8,737.376 | 807.513 / 912.118 | 1,404.189 / 1,437.085 |

The explicit full-snapshot-read and decision-heavy rows are intentionally
separate. Full `getSnapshot()` reads were 0.037 / 0.250 ms at 1k, 0.043 /
0.188 ms at 10k, and 0.055 / 0.070 ms at 100k for the headless profile; the
decision-heavy profile was 0.276 / 0.360 ms, 5.601 / 6.184 ms, and 36.743 /
42.468 ms respectively. The one-observer and four-observer notification
counts were 1,004/4,016 at 1k, 10,004/40,016 at 10k, and 100,004/400,016 at
100k. Headless notification counts were zero, and one/multiple-observer final
exports matched the headless export at every size.

The independent fixed 14-event correctness microbenchmark contained one
source-status event, one Level-2 snapshot, and twelve trades. Median/p95
results were:

| Metric | Median / p95 |
| --- | ---: |
| Construction | 1.067 / 2.203 ms |
| Processing | 0.512 / 1.586 ms |
| Cancellation and repeated submit/cancel | 0.278 / 0.913 ms |
| Backward/forward seek reconstruction | 0.860 / 1.814 ms |
| Serialized scenario size | 10,954 / 10,954 bytes |
| Retained journal entries | 4 / 4 |
| Journal evictions | 21 / 21 |
| Retained heap after disposal delta | 124,784 / 508,064 bytes |

The corrective scenario compared complete orders, fills, ledger, journal,
diagnostics, and lifecycle state before and after reconstruction against the
independent reference ledger. All parity assertions passed. The benchmark
also unsubscribed observers, disposed every session (including repeated
disposal), rejected post-disposal use, and retained no simulator-owned
subscriptions or Workers. These are internal Node-session checks; chart
canvas cleanup remains covered by the separate browser benchmarks.

Before the implementation fix, an instrumented six-event session with zero
observers called `getSnapshot()` eight times while starting, stepping,
submitting one order, and completing replay. After the fix, the equivalent
headless correctness test observed zero snapshot calls. This is a direct
allocation-path measurement, not a claim that all replay work is constant
time.

The complete machine-readable result is retained outside the repository at
`/tmp/openkline-phase16-0-3-benchmark-final.json` for this verification run;
the tables above are the durable, reviewable summary. No stochastic sampling,
external market data, broker connection, chart consumer, or public performance
claim is implied. Full reconstruction remains an intentionally measured
limitation, and official Firefox/WebKit/mobile-browser evidence remains a
separate environment-gated acceptance criterion.

## Phase 16.1 schema-1 scenario persistence benchmark

The Phase 16.1 benchmark measures the complete offline artifact path rather
than chart or Order Flow rendering. Each workload constructs a deterministic
market replay tape, processes it in a fresh internal research session, exports
and validates a schema-1 artifact, restores it into another fresh session,
checks the derived-result fingerprint, executes a deliberately invalid import,
and disposes both sessions. The 1k and 10k workloads use three samples; the
100k workload uses two samples. Forced GC was available on Linux x64 with Node
`v24.19.0`. Results were collected after commit
`7b0733f24fadd716e84f954604e26202a77d319a` with `npm run
benchmark:research-scenario`.

Times are milliseconds and heap values are bytes. They are medians/p95s from
the stated samples and are not broker throughput or public performance claims.

| Events | Samples | Decisions | Artifact bytes | Tape build | Decision setup | Processing | Artifact export | Serialize | Validate | Reconstruction | Failed validation | Retained heap delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 3 | 64 | 25,094 | 35.097 / 50.604 | 0.949 / 2.606 | 24.152 / 25.736 | 9.082 / 11.784 | 2.568 / 2.971 | 2.238 / 2.578 | 88.350 / 93.377 | 0.110 / 0.184 | 636,280 / 1,324,840 |
| 10,000 | 3 | 198 | 75,278 | 267.845 / 287.232 | 2.586 / 2.951 | 462.560 / 466.345 | 22.736 / 22.960 | 5.262 / 7.750 | 5.060 / 5.966 | 977.980 / 1,001.896 | 0.203 / 0.225 | 5,008,024 / 5,009,072 |
| 100,000 | 2 | 1,998 | 759,182 | 2,606.511 / 2,606.511 | 42.031 / 42.031 | 12,064.573 / 12,064.573 | 185.082 / 185.082 | 53.746 / 53.746 | 59.753 / 59.753 | 17,551.162 / 17,551.162 | 1.029 / 1.029 | 48,658,448 / 48,658,448 |

The retained heap column is a process-level post-disposal delta after local
references are released and forced GC is requested. It is evidence for this
benchmark process, not a claim of zero process heap growth. Every workload
retained 64 journal entries and reported the remainder as evicted
presentation history (64/128 at 1k, 64/396 at 10k, and 64/3,996 at 100k).
The benchmark also confirms that a tampered artifact is rejected before
restoration and that the restored derived result matches the original result
when no fabricated expected result is supplied.

These schema-1 rows are not directly comparable with the schema-4
Phase 16.0.3 dispatch rows above: they include tape construction, artifact
validation, serialization, and a second full reconstruction, while schema 4
isolated observer dispatch and snapshot allocation. Browser, Canvas2D, worker,
and external-datafeed performance remain separate gates.

A later same-checkout rerun also passed but produced host-variable medians of
23.578 ms processing / 94.684 ms reconstruction at 1k, 501.609 ms / 1,059.950
ms at 10k, and 12,610.947 ms / 18,835.960 ms at 100k. The earlier captured
rows above remain the durable comparison set; both runs use the same schema,
workload sizes, decision counts, and forced-GC protocol. This variance is why
the benchmark is reported as reproducibility evidence rather than a universal
performance promise.

## Phase 16.1.1 continuation and bounded-resource benchmark addendum

The Phase 16.1.1 rerun used the same deterministic 1k/10k/100k workloads and
the updated `npm run benchmark:research-scenario` protocol at commit
`403ac9249bbd89c7b5d4fa694944b8d97e865372`. It keeps the prior 3/3/2 sample
budget: the first sample is labelled `cold`, later samples `warm`, and all
samples remain in the summaries. P95 uses a nearest-rank ceiling; for the
100k two-sample workload the reported p95 is only the maximum observed value
and is explicitly not a stable tail estimate.

In addition to the original tape/decision/export/serialize/validate/restore
measurements, each sample now validates and restores a paused continuation
artifact, submits one new order after restore, steps once, re-exports the
continued artifact, and attempts a deliberately invalid continuation restore.
The latter must fail after construction and exercise temporary-session
disposal. The continuation artifact has no expected result, so a successful
restore is reported as `no-expected-result` rather than being presented as an
exchange observation.

Times are milliseconds; heap values are bytes. Values are median / reported
p95 for the stated sample count.

| Events | Samples | Decisions | Artifact bytes | Processing | Validate | Full restore | Continuation restore | Continued submit | Continued re-export | Failed restore/cleanup | Retained heap delta |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 3 (1 cold, 2 warm) | 64 | 25,094 | 24.610 / 26.394 | 2.130 / 3.364 | 94.608 / 100.611 | 61.259 / 67.343 | 0.083 / 0.092 | 3.469 / 3.724 | 54.965 / 58.471 | 887,472 / 1,776,128 |
| 10,000 | 3 (1 cold, 2 warm) | 198 | 75,278 | 501.815 / 514.385 | 6.063 / 6.728 | 1,030.819 / 1,120.049 | 570.145 / 598.455 | 0.130 / 0.141 | 8.981 / 9.426 | 535.625 / 544.359 | 6,189,352 / 6,300,848 |
| 100,000 | 2 (1 cold, 1 warm) | 1,998 | 759,182 | 13,322.826 / 13,322.826 | 61.764 / 61.764 | 20,376.884 / 20,376.884 | 6,445.149 / 6,445.149 | 0.850 / 0.850 | 100.136 / 100.136 | 6,316.162 / 6,316.162 | 61,888,696 / 61,888,696 |

The updated run also recorded continuation-artifact validation medians/p95s
of 4.222/5.863 ms, 14.626/34.862 ms, and 143.789/143.789 ms for 1k/10k/100k.
Journal retention remained bounded at 64 entries; total emitted entries were
128, 396, and 3,996 respectively. The post-disposal heap column is a
process-level delta after forced GC and released local references; it is not a
zero-leak proof or a universal memory claim. The raw command capture was
retained outside the repository at
`/tmp/openkline-phase16-1-1-scenario-benchmark-403ac92.txt`.
