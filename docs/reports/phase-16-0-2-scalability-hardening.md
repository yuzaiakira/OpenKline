# Phase 16.0.2 — Replay Research Scalability, Snapshot Efficiency, and Lifecycle Hardening

Status: **INTERNAL INCREMENT VERIFIED — EXTERNAL GATES OPEN**

Verification date: 2026-10-31

## Scope and authorization

This increment continues the owner-authorized internal Phase 16 research
simulator. The authorization recorded at `76ad54525958e5689b752b49855209beacdb37ee`
covers internal implementation, numerical and lifecycle tests, benchmarks, and
technical documentation only. It does not authorize a public export, protected
API-baseline adoption, licensing change, npm publication, tag, release, broker
connectivity, or live order execution. Phase 15.5 acceptance and release gates
remain open.

The implementation started from the clean Phase 16.0.1 revision
`87d36cea3dfc6f44d8f4036442feb9ab5935b141`. The verified implementation was
committed and pushed as:

| Revision | SHA | Result |
| --- | --- | --- |
| Phase 16.0.2 implementation | `21372f17ccfd135abe05c16fe0f8f066a6b6a5fe` | Pushed to `origin/main` |

All code and test changes use `Akira Yuzai <yuzai.akira@gmail.com>` as author
and committer. No force-push or history rewrite was used.

## Implemented improvements

### Snapshot efficiency

- A canonical internal snapshot is built once per runtime revision and reused
  by repeated reads and listener emission. Public reads still receive fresh
  defensive object, array, ledger, journal, diagnostics, order, and fill
  copies, so callers cannot mutate cached state.
- `getOrders()`, `getFills()`, and `getJournal()` reuse the canonical snapshot
  without rebuilding unrelated diagnostics or sorting mutable runtime maps a
  second time.
- Runtime mutations, replay state transitions, reconstruction, and error
  transitions invalidate the cache explicitly. No asynchronous render or
  stale snapshot path was introduced.

### Bounded journal and indexed decisions

- Bounded journal retention now uses an in-place ring buffer. Appending after
  the retention limit no longer creates a full `slice`/spread copy of the
  retained journal. Chronological order and monotonic journal IDs remain
  observable at snapshot/export boundaries.
- Decisions are indexed by replay cursor at insertion time. Reconstruction
  activates only the decisions for the current cursor instead of filtering and
  sorting the complete decision history for every event. The canonical ordered
  export remains unchanged.

### Diagnostics and lifecycle

- Research order-book diagnostics maintain an accepted-observation counter and
  no longer clone every retained `OrderBookController` history just to count
  events.
- Disposal now clears decisions, source observations, trade observations,
  dividend entitlements, quality/warning state, decision indexes, journal
  storage, and the snapshot cache in addition to unsubscribing and disposing
  replay/order-book controllers. Repeated disposal remains idempotent.
- The change is internal to `src/research-execution/`; no root or React export
  was added and existing Paper Trading semantics were not changed.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | **PASS** |
| Focused research suites | **PASS — 21/21** |
| Full `npm test` | **PASS — 346/346** |
| `npm run api:inventory` | **PASS**; baseline not written |
| `npm run api:diagnostics` | **PASS_ADDITIVE_REVIEW_REQUIRED**; inherited additive declarations only |
| `npm run package:smoke` | **PASS**; local packed ESM consumer |
| `npm run distribution:check` | **PASS**; 534 files, no distribution problems |
| Snapshot defensive-isolation regression | **PASS** |
| Bounded journal chronological-retention regression | **PASS** |
| Repeated disposal and post-disposal safety | **PASS** through research lifecycle fixtures |

The strict historical `api:check` gate remains open because the protected
baseline still reports the previously documented additive changes in `Chart`,
`WorkspaceDocument`, and `WorkspaceRestoreOptions`. This increment did not
modify `docs/audits/public-api-baseline.json`.

## Benchmark evidence

Command:

```text
npm run benchmark:research
```

The run was executed at implementation revision
`21372f17ccfd135abe05c16fe0f8f066a6b6a5fe` on Linux x64 with Node
`v24.19.0` and `--expose-gc`. The benchmark schema is `3`. It processes the
same deterministic source-status, Level-2 snapshot, and observed-trade tape
at 1k/10k/100k events, performs backward/forward reconstruction, and measures
25 repeated snapshot reads separately. The benchmark does not include chart,
Canvas2D, Worker, broker, or exchange execution behavior.

Times are milliseconds; heap values are bytes. Each row reports median/p95
over five samples for 1k/10k and three for 100k.

| Events | Processing | Processing ms/event | Repeated snapshot reads | Seek/reconstruction | Serialization | Heap before dispose | Retained after dispose |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 34.921 / 42.194 | 0.03609 / 0.03901 | 0.051 / 0.058 | 12.117 / 13.806 | 0.079 / 0.200 | 5,740,128 / 5,859,640 | 118,784 / 660,920 |
| 10,000 | 453.253 / 508.314 | 0.04901 / 0.06588 | 0.051 / 0.077 | 313.385 / 349.279 | 0.085 / 0.119 | 6,114,296 / 6,162,880 | 152,920 / 288,344 |
| 100,000 | 3,096.729 / 3,101.842 | 0.03187 / 0.03222 | 0.055 / 0.056 | 1,332.838 / 1,346.145 | 0.075 / 0.105 | 5,235,808 / 5,266,808 | 142,224 / 202,832 |

The repeated-read measurement demonstrates the cache-hit path while retaining
defensive copies. The processing loop no longer calls `getSnapshot()` merely
to poll completion on every iteration; completion is driven by the existing
replay controller and the final snapshot is read after processing. Therefore
the prior schema-2 processing values are historical evidence, not a controlled
before/after performance comparison. The current benchmark is a cleaner
event-processing measurement and does not support a universal throughput or
capacity claim.

The corrective cancellation/reconstruction scenario remained deterministic:
the 1k/10k/100k seek medians were `0.509/0.663/0.519ms`, respectively, with
four retained journal entries and 21 evictions. Its complete order, fill,
ledger, journal, and retention comparisons passed.

## Acceptance and remaining work

| Criterion | Status | Evidence or limitation |
| --- | --- | --- |
| Snapshot reads remain defensive and deterministic | **PASS** | New focused regression plus full suite |
| Bounded journal append and chronological export | **PASS** | Ring-buffer regression and existing parity fixtures |
| Indexed same-cursor decision activation | **PASS** | Full causal/reconstruction suite |
| Order-book diagnostic scalability path | **PASS** | Counter replaces per-read retained-history clone |
| Disposal releases research runtime references | **PASS** | Lifecycle fixtures, repeated dispose, full suite |
| 1k/10k/100k internal benchmark | **PASS** | Reproducible schema-3 run above |
| Public API compatibility baseline | **OPEN** | Owner approval is still required for inherited additive changes |
| Managed Firefox/WebKit/Mobile Safari | **BLOCKED** | Official Playwright executables are unavailable in this cloud environment |
| Physical devices, formal accessibility, visual approval | **NOT VERIFIED** | Requires a separate approved environment |
| Licensing, npm publication, tags, releases, live broker | **NOT AUTHORIZED / NOT PERFORMED** | Outside the owner-authorized internal scope |

Historical seek remains a full event reconstruction path; no new checkpoint
format or public replay persistence contract was introduced in this increment.
That is the next measured scalability opportunity if seek latency becomes a
blocking internal workload, and it must preserve order-book gap state and
causal decision semantics rather than restoring a partial snapshot.

The Phase 16 research simulator remains internal and its simulated fills are
not observed exchange transactions. This increment does not close Phase 15.5
or any browser, accessibility, legal, licensing, or release gate.
