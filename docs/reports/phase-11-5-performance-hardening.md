# Phase 11.5 — Incremental Session Analytics and Realtime Performance Hardening

Status: **PARTIALLY VERIFIED — milestone remains open**

This report records the Phase 11.5 implementation and local verification on the
managed Cloud Linux host. It does not close the historical Phase 11 browser,
device, accessibility, visual, or protected API-baseline gates.

## Revision and scope

- Starting SHA: `3394176c073f257f11ae6c40462d7f5d130cd0ab`
- Implementation commits: `b4735cf` and `8ee8620`
- Final implementation/evidence SHA: `e8a23d0c88d017321ee0e554eec3d75cd53c5a6a`
- Branch: `main` (the requested Phase 11.5 workflow does not create a feature
  branch)
- Git identity: `Akira Yuzai <yuzai.akira@gmail.com>`
- Node: `v24.19.0`
- Host: Linux x64, `INTEL(R) XEON(R) PLATINUM 8573C`
- Verified browser: system Chromium `HeadlessChrome/154.0.0.0`

No GitHub Actions, npm publication, release, license change, or Phase 12 work
was performed.

## Confirmed bottleneck

Before Phase 11.5, the Chart-managed session indicator/reference update path
ran the complete multi-timeframe refresh for every forming-bar update. That
path cloned the source history, rebuilt session aggregation, recreated the
time list, and remapped the complete output series. The same full-history work
was also paid when a caller only needed the latest causal value.

The isolated pre-change Node benchmark measured the following 100k-candle
operations on the same host:

| Operation | Previous median (ms) |
| --- | ---: |
| Session aggregation | 8,300.862 |
| Append plus result read | 7,736.699 |
| As-of seek | 15,966.065 |

The implementation also resolved the same calendar segment more than once for
each indexed candle. Profiling confirmed this was avoidable work; the indexed
membership path now carries the resolved segment forward.

## Implemented improvements

1. Added private indexed session state with sorted source timestamps,
   per-period candle membership, and cached OHLCV reductions. Appends and
   corrections update the affected membership/reduction state; out-of-order
   inserts rebuild the deterministic index. Calendar replacement and target
   period changes invalidate the dependent index without changing public API
   contracts.
2. Added an internal persistent Chart runtime for session indicators and
   previous-period references. It retains the aggregator and indicator-registry
   instances instead of reconstructing them for each Chart update.
3. Kept forming-bar updates lazy: the runtime records the new source candle,
   extends the visible indicator series/frontier when the available causal
   value is unchanged, and advances reference `asOfTime` without cloning all
   source history. Boundary transitions and corrections request a full causal
   snapshot.
4. Preserved the existing public session APIs, as-of behavior, replay
   isolation, calendar semantics, datafeed lifecycle, workspace persistence,
   and comparison behavior. No new root-level public exports were introduced.
5. Added focused Node/runtime tests, an actual Chart lifecycle browser test,
   and `benchmark:session-analytics`, which measures Chart update-only cost,
   update plus result-query cost, and the full-snapshot cost separately.

## Performance evidence

### Indexed Node calculation benchmark

Command: `npm run benchmark:calendar`

The final run was generated at `2026-10-30T13:57:49.718Z`. The 1k and 10k
cases use repeated samples; the 100k case is one cold sample, so its p95 is
not distributional.

| Operation | 1,000 median/p95 | 10,000 median/p95 | 100,000 median/p95 |
| --- | ---: | ---: | ---: |
| Session aggregation | 27.135 / 29.913 | 125.693 / 133.505 | 1,149.425 / 1,149.425 |
| Trading-week aggregation | 39.261 / 40.294 | 142.847 / 147.176 | 1,145.089 / 1,145.089 |
| Trading-month aggregation | 78.210 / 82.942 | 145.216 / 155.586 | 1,083.913 / 1,083.913 |
| Session SMA | 29.141 / 32.194 | 123.947 / 130.870 | 1,084.280 / 1,084.280 |
| Previous-session levels | 27.631 / 30.330 | 120.812 / 129.787 | 1,068.742 / 1,068.742 |
| Incremental append | 0.503 / 0.796 | 1.628 / 1.911 | 73.920 / 73.920 |
| Historical correction | 0.570 / 0.858 | 1.795 / 2.042 | 74.837 / 74.837 |
| As-of seek | 0.369 / 0.423 | 2.155 / 2.219 | 77.507 / 77.507 |
| Calendar replacement | 40.624 / 44.339 | 203.061 / 249.449 | 2,098.618 / 2,098.618 |

These are calculation timings, not Canvas2D FPS or universal device claims.
Calendar replacement and setup-plus-disposal intentionally include index
construction; they are not steady-state append costs.

### Actual Chart-owned session benchmark

Command: `npm run benchmark:session-analytics`

The scenario used the public `Chart` API with 100,000 one-minute candles, a
New York split-session calendar, a session SMA, and a previous-session
reference. It generated 304 session observations and 304 reference points.

| Measurement | Median | p95 | Samples |
| --- | ---: | ---: | ---: |
| Forming-bar `Chart.update` only | 1.700 ms | 4.300 ms | 50 |
| `Chart.update` plus latest result query | 21.700 ms | 23.800 ms | 5 |
| Pending update plus full snapshot | 18.800 ms | not distributional | 1 |

Load time was 96.600 ms. Browser heap was 158,072,590 bytes before destroy
and 19,268,895 bytes after destroy/GC. The harness reports one remaining
canvas because the example page owns one pre-existing canvas; the chart-owned
canvas was removed.

### Existing browser and stress baselines

`npm run benchmark:browser` passed under system Chromium:

- 100,000 candles: 62.03 FPS; frame interval median 16.7 ms, p95 16.8 ms.
- Navigation event latency: 0.1 ms median, 0.3 ms p95.
- Frame work: 1.3 ms median, 1.7 ms p95.
- Browser heap: 567,557,931 bytes before destroy and 3,336,756 bytes after
  destroy/GC; remaining canvases: 0.

`npm run stress:ci` passed both profiles. Node stress processed 4,000 events
with median latency 0.1679 ms, p95 13.6642 ms, maximum 80.6217 ms, and no
timeout. Browser stress reported zero orphan failures, zero Worker orphans,
and zero remaining canvases.

## Verification results

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run typecheck` | PASS | TypeScript checks completed |
| `npm test` | PASS | 260/260 tests passed |
| `npm run api:inventory` | PASS | Inventory generated for current revision |
| `npm run api:diagnostics` | PASS — review required | Additive review required; no removals |
| `npm run api:check` | FAIL — protected baseline | Three inherited declaration hash changes; no removals |
| `npm run studio:check` | PASS | Core/studio ownership audit passed |
| `npm run package:check` | PASS | 434-file package dry run |
| `npm run package:smoke` | PASS | Tarball installed and consumed as ESM |
| `npm run distribution:check` | PASS | No distribution problems; SHA recorded in audit |
| `npm run test:browser` | PASS | 30/30 Chromium tests |
| `npm run test:react:browser` | PASS | 34/34 React/Studio Chromium tests |
| `npm --prefix examples/nextjs-app-router run build` | PASS | Next.js 16.4.3 production build |
| `npm run benchmark:calendar` | PASS | Indexed Node matrix above |
| `npm run benchmark:multi-timeframe` | PASS | 1k/10k/100k causal matrix passed |
| `npm run benchmark:browser` | PASS | Chromium FPS, latency, memory, cleanup above |
| `npm run benchmark:session-analytics` | PASS | Actual Chart path above |
| `npm run stress:ci` | PASS | Node and browser stress passed |

The API check was not bypassed or its baseline rewritten. Its protected
baseline is `3e7a889a94c40255bbcce210a672856cfc98b32b`; it reports no removed
exports but inherited declaration changes for `Chart`, `WorkspaceDocument`,
and `WorkspaceRestoreOptions`. Phase 11.5 added no root-level public exports.

## Compatibility and acceptance matrix

| Gate | Status | Notes |
| --- | --- | --- |
| Indexed incremental session aggregation | PASS | Node tests and benchmark passed |
| Chart-managed realtime session path | PASS | Runtime tests, 30-test Chromium suite, and focused benchmark passed |
| Causal/as-of and calendar correctness | PASS | Node, browser, replay, and multi-timeframe coverage passed |
| Correction and out-of-order handling | PASS | Focused runtime tests plus full Node suite passed |
| Indicator/reference lifecycle cleanup | PASS | Disposal tests and zero-orphan stress results |
| Package/distribution verification | PASS | Package check, smoke, and distribution check passed |
| Chromium browser verification | PASS | System Chromium 154 only |
| Official Firefox/WebKit/mobile browser verification | BLOCKED / NOT VERIFIED | Managed browser binaries are unavailable in this cloud environment; no unsupported substitution or artifact download was used |
| Physical-device verification | NOT VERIFIED | No physical devices are attached |
| Full accessibility and visual-release gates | NOT VERIFIED | Existing Chromium checks passed, but the broader historical gates remain open |
| Protected public API baseline | FAIL / OPEN | Historical baseline requires owner review; no baseline update was authorized |
| Phase 12 work | NOT STARTED | Explicitly out of scope |

The cloud measurements are useful for regression detection in this environment
only. They do not replace the previously recorded trusted-machine browser or
physical-device evidence.

## Final assessment

The measured Chart update bottleneck was addressed with an indexed, persistent,
causal runtime and the ordinary forming-bar path is now materially cheaper than
the previous full-history path. The implementation is locally verified for
Node, package, Chromium, React/Studio, Next.js, stress, lifecycle cleanup, and
calendar correctness.

Phase 11.5 remains open because the official Firefox/WebKit/mobile gates,
physical-device/accessibility/visual gates, and the protected API baseline are
not all verified or approved. No Phase 12 work should begin under this report.
