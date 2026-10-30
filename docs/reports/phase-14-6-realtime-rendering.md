# Phase 14.6 — Realtime Rendering Verification

## Status

Phase 14.6 is engineering-complete for the available local Node and
system-Chromium environment, with explicit partial and blocked gates below.
Phase 15 was not started. This report records new executions from the final
validation run; the older Phase 14.5 numbers are used only as a controlled
before comparison.

## Git evidence

- Repository: `yuzaiakira/OpenKline`
- Branch: `main` (the Phase 14.6 specification required direct work on `main`)
- Starting SHA: `41a3cbc875555323dd6172b2ee237d8c89e28990`
- Engineering validation tip before this report commit:
  `9df096745f77a8d3f11c9eb086a2802ac5bb4f59`
- Implementation commits:
  - `4b0ee0f839b85820824901197bd03951d452ae26`
    `perf(orderflow): preserve realtime cvd and dense candle rendering`
  - `f0b19e23c664dfa4a2301d253d09d8e2fb6de1fa`
    `perf(chart): remove realtime orderflow metadata cloning`
  - `9df096745f77a8d3f11c9eb086a2802ac5bb4f59`
    `test(renderer): verify dense candle aggregation semantics`
- Author and committer for all Phase 14.6 commits: `Akira Yuzai
  <yuzai.akira@gmail.com>`
- No branches, force-pushes, releases, npm publication, licensing changes, or
  GitHub Actions were used.
- The protected `docs/audits/public-api-baseline.json` was not modified.

The final documentation commit will supersede the engineering validation tip;
the final remote SHA is recorded in the Git evidence section of the completed
report commit.

## Reproduced root cause

The standalone `CumulativeVolumeDeltaCalculator` was already incremental, but
the chart path defeated that work in two ways:

1. The live chart CVD options key included the advancing `range.to`. Every new
   frontier timestamp therefore looked like an options change and cleared the
   calculator cache.
2. `refreshOrderFlowPresentation()` updated the workspace reference by calling
   `MarketTradeStore.getAll()` and constructing a dataset on every trade. That
   was an O(N) defensive copy on the main-thread realtime path, even when the
   CVD calculator itself could append one bucket.

The pre-change 100k combined benchmark reproduced the symptom in the same
system Chromium workload: approximately 3.89 FPS realistic realtime,
4.32 FPS medium realtime, and 2.25 FPS fit-content realtime. The focused
benchmark also showed chart append calls around 43.2 ms median before the
workspace-reference fix.

## Implemented changes

### Realtime CVD contract

- The chart keeps stable live aggregation configuration (`from`, interval,
  reset, source coverage, and calendar identity) separate from the advancing
  frontier. The internal live calculator uses an open upper boundary while
  the public chart result projects `from`, `to`, and the final bucket end back
  to the current chart range.
- Public bounded `CvdOptions` semantics remain unchanged. Explicit bounded and
  as-of calculations still exclude events beyond their boundary and use the
  deterministic reference path when incremental eligibility is not valid.
- The mutable calculator result is private. `getLatestObservation()` returns a
  defensive observation for incremental consumers; `getResult()` continues to
  return a complete defensive snapshot.
- Chronological same-bucket trades replace one derived point and new buckets
  update one point through `ChartModel.updateSeries()`. Corrections,
  out-of-order events, changed options, calendar changes, replay, and source
  replacement use a full safe rebuild.
- CVD style application is keyed and does not call `setSeriesStyle()` when the
  style is unchanged.
- Workspace metadata now retains normalized source identity separately from
  the trade history. Live prints no longer clone the complete trade store just
  to update presentation metadata.

### Dense Canvas2D rendering

- Candlestick, OHLC, and hollow-candlestick display commands use a deterministic
  per-pixel-column envelope only when individual source candles are too dense.
- Each display group preserves the first open, last close, highest high, and
  lowest low. Optional volume is summed only inside the display object; the
  stored OHLCV series is never changed.
- The high-zoom path returns original source candle objects to the renderer.
  Crosshair, tooltip, indicators, scales, replay, and public getters continue
  to use the original source observations.
- Heikin-Ashi remains exact because its open is recursively derived from prior
  bars. Volume and histogram series retain their point semantics and are not
  passed through the candle aggregation formula.
- Existing Footprint culling/LOD, depth heatmap budgets, command caches, dense
  line reduction, sequence handling, and frame coalescing were preserved.

## Correctness evidence

- Node suite: **307 passed, 0 failed**.
- Dedicated CVD test covers same-bucket append, new-bucket append, defensive
  latest observation, correction fallback, and full reference parity.
- Dedicated dense renderer unit test covers first/last boundaries, high/low
  extrema, volume aggregation, RTL column direction, and exact high-zoom
  source-object retention.
- Chromium order-flow test covers live append, historical correction, replay
  causality, full chart CVD parity, and `1 canvas -> 0` cleanup.
- Chromium dense-render test observes reduced display commands while asserting
  10,000 source candles and their first/last values remain unchanged.
- Existing suites continue to cover unknown/estimated side coverage, session
  calendars, DST/overnight sessions, as-of reads, source replacement,
  Footprint/Depth parity, replay seek backward/forward, multi-chart isolation,
  indicator correctness, corporate actions, portfolio Workers, React lifecycle,
  and Studio workspace restore.
- Focused realtime benchmark correction parity: `true`.
- Focused Node cache benchmark correction parity: `true`.

## Focused CVD benchmark

Environment: local system Chromium user agent
`Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)
HeadlessChrome/154.0.0.0 Safari/537.36`, DPR 1, 920×560 viewport.

`npm run benchmark:cvd-cache`:

| Stage | Samples | Median | P95 | Max |
|---|---:|---:|---:|---:|
| Calculator update | 100 | 0.003 ms | 0.014 ms | 0.946 ms |
| Latest observation | 100 | 0 ms | 0.001 ms | 0.025 ms |
| Historical correction update | 1 | 0.029 ms | — | — |
| Full corrected snapshot | 1 | 247.435 ms | — | — |

`npm run benchmark:realtime-cvd` on 100,000 historical observations plus 100
append trades:

| Stage | Samples | Median | P95 | Max |
|---|---:|---:|---:|---:|
| Calculator update | 100 | 0 ms | 0 ms | 0.9 ms |
| Calculator latest observation | 100 | 0 ms | 0.1 ms | 0.1 ms |
| Calculator full snapshot | 5 | 20.7 ms | 24.1 ms | 24.1 ms |
| Chart API update call | 100 | 0.1 ms | 0.2 ms | 0.7 ms |
| Chart event-to-visual frame | 100 | 46.5 ms | 71 ms | 234.5 ms |
| Renderer commit | 101 | 10 ms | 31.3 ms | 40.1 ms |
| ChartModel updateSeries | 100 | 0 ms | 0.1 ms | 0.3 ms |
| ChartModel setSeriesData | 1 | 68.4 ms | — | — |
| Full public `getCvdResult()` | 5 | 39.9 ms | 44.4 ms | 44.4 ms |

The chart counters recorded `incrementalRefresh=100`,
`updateSeries=100`, `fullRefresh=1`, and `setSeriesData=1`. The one full
refresh/set-data event is the historical correction, not an ordinary append.
The correction call was 564.2 ms and its event-to-frame measurement was
593.1 ms; this is expected broader work and remains explicitly measured rather
than hidden. The focused run reported `1 canvas -> 0` after destruction.

## Dense OHLCV benchmark

`npm run benchmark:dense-ohlcv` ran 1,000, 10,000, and 100,000 source points
for six presentations. The following 100,000-point command counts show the
display-only distinction; counts include background/grid commands where
applicable.

| Series | Fit fillRect | Fit stroke | Source length | Fit ms | Navigation ms | Canvas cleanup |
|---|---:|---:|---:|---:|---:|---|
| Candlestick | 841 | 844 | 100,000 | 33.0 | 43.6 | 1 -> 0 |
| OHLC | 1 | 844 | 100,000 | 26.9 | 66.3 | 1 -> 0 |
| Hollow candlestick | 391 | 844 | 100,000 | 24.7 | 53.6 | 1 -> 0 |
| Heikin-Ashi | 100,001 | 100,004 | 100,000 | 208.0 | 189.7 | 1 -> 0 |
| Volume | 100,001 | 9 | 100,000 | 94.9 | 71.6 | 1 -> 0 |
| Histogram | 100,001 | 9 | 100,000 | 106.7 | 91.6 | 1 -> 0 |

At 1,000 points the candle path remained exact (1,001 body/background
`fillRect` calls). At 10,000 points the standard candle types were bounded to
the approximately 840-pixel display width, while Heikin-Ashi, volume, and
histogram retained exact point commands. The pure renderer unit test verifies
that this reduction retains the OHLCV envelope and chronological boundaries.

## Complete 45-case Chromium matrix

The following is the final output of `npm run benchmark:order-flow:browser`.
Each row is a separate chart instance. Latency columns are
`median / p95 / measured FPS`; heap values are browser observations, not leak
proofs. Cleanup is `remaining canvases / active Workers` after destruction.

| Size | Viewport | Mode | Navigation median / p95 ms / FPS | Realtime median / p95 ms / FPS | Heap before | Heap after | Cleanup canvases/workers |
|---:|---|---|---:|---:|---:|---:|---:|
| 1000 | realistic | plain | 16.6 / 17 / 60.03 | 16.7 / 16.8 / 59.88 | 5922783 | 5922783 | 0/0 |
| 1000 | realistic | cvd | 16.7 / 16.9 / 60.05 | 16.7 / 17.4 / 59.6 | 6371474 | 6371474 | 0/0 |
| 1000 | realistic | footprint | 16.7 / 17 / 60.07 | 16.7 / 18 / 59.33 | 6402762 | 6402762 | 0/0 |
| 1000 | realistic | depth | 16.7 / 17.1 / 60.05 | 16.7 / 16.9 / 60 | 7874829 | 7874829 | 0/0 |
| 1000 | realistic | combined | 16.7 / 17 / 60.09 | 16.5 / 17 / 59.88 | 10224805 | 10224805 | 0/0 |
| 1000 | medium | plain | 16.7 / 17.2 / 60.03 | 16.6 / 16.8 / 60.04 | 10958609 | 10958609 | 0/0 |
| 1000 | medium | cvd | 16.6 / 17 / 59.94 | 16.7 / 18 / 59.41 | 8659705 | 8659705 | 0/0 |
| 1000 | medium | footprint | 16.6 / 17.4 / 60.7 | 16.5 / 20.1 / 58.86 | 23926561 | 23926561 | 0/0 |
| 1000 | medium | depth | 16.6 / 17.5 / 59.96 | 16.6 / 17 / 60.08 | 12207101 | 12207101 | 0/0 |
| 1000 | medium | combined | 16.6 / 17.2 / 60.03 | 16.5 / 19.2 / 59.45 | 10438065 | 10438065 | 0/0 |
| 1000 | fit | plain | 16.6 / 17 / 59.92 | 16.7 / 16.8 / 59.96 | 18321225 | 18321225 | 0/0 |
| 1000 | fit | cvd | 16.6 / 16.8 / 60.01 | 16.7 / 18 / 58.9 | 25972461 | 25972461 | 0/0 |
| 1000 | fit | footprint | 16.7 / 17.2 / 59.9 | 16.7 / 20.5 / 58.63 | 13549369 | 13549369 | 0/0 |
| 1000 | fit | depth | 16.7 / 16.9 / 59.97 | 16.7 / 17.1 / 60 | 24889605 | 24889605 | 0/0 |
| 1000 | fit | combined | 16.6 / 17.3 / 59.99 | 16.5 / 17.5 / 59.96 | 14918017 | 14918017 | 0/0 |
| 10000 | realistic | plain | 16.6 / 16.9 / 60.01 | 16.6 / 16.7 / 60 | 25078529 | 25078529 | 0/0 |
| 10000 | realistic | cvd | 16.7 / 17 / 60.01 | 16.6 / 17.8 / 59.68 | 38673081 | 38673081 | 0/0 |
| 10000 | realistic | footprint | 16.6 / 17.2 / 59.99 | 16.6 / 17.8 / 59.41 | 16740705 | 16740705 | 0/0 |
| 10000 | realistic | depth | 16.7 / 16.9 / 59.99 | 16.6 / 17.3 / 60.2 | 17629809 | 17629809 | 0/0 |
| 10000 | realistic | combined | 16.6 / 17.1 / 59.99 | 16.7 / 17.3 / 59.8 | 38659833 | 38659833 | 0/0 |
| 10000 | medium | plain | 16.7 / 16.9 / 59.86 | 16.7 / 16.7 / 60.04 | 27252513 | 27252513 | 0/0 |
| 10000 | medium | cvd | 16.7 / 16.8 / 59.96 | 16.6 / 18.6 / 59.29 | 29956741 | 29956741 | 0/0 |
| 10000 | medium | footprint | 16.7 / 18.2 / 60.16 | 16.5 / 22.9 / 58.06 | 51618461 | 51618461 | 0/0 |
| 10000 | medium | depth | 16.6 / 16.9 / 59.97 | 16.7 / 16.9 / 59.92 | 24104205 | 24104205 | 0/0 |
| 10000 | medium | combined | 16.6 / 18.9 / 59.9 | 16.6 / 17.3 / 59.56 | 60068329 | 60068329 | 0/0 |
| 10000 | fit | plain | 16.6 / 17 / 59.97 | 16.7 / 16.9 / 60 | 35714696 | 35714696 | 0/0 |
| 10000 | fit | cvd | 20.5 / 24.8 / 46.58 | 19.9 / 21 / 61.43 | 27524212 | 27524212 | 0/0 |
| 10000 | fit | footprint | 16.6 / 17.2 / 60.03 | 16.5 / 19.5 / 59.09 | 26551460 | 26551460 | 0/0 |
| 10000 | fit | depth | 16.7 / 18.2 / 59.94 | 16.8 / 19.5 / 59.13 | 26940316 | 26940316 | 0/0 |
| 10000 | fit | combined | 23.2 / 26.8 / 42.11 | 22.8 / 25.9 / 42.84 | 44964868 | 44964868 | 0/0 |
| 100000 | realistic | plain | 16.6 / 16.8 / 60.06 | 16.6 / 16.8 / 59.88 | 129076532 | 54384804 | 0/0 |
| 100000 | realistic | cvd | 16.8 / 17.3 / 59.7 | 16.5 / 17.6 / 58.65 | 176700780 | 55197152 | 0/0 |
| 100000 | realistic | footprint | 16.7 / 17.3 / 60.06 | 16.6 / 19.5 / 55.4 | 157219156 | 55289948 | 0/0 |
| 100000 | realistic | depth | 16.8 / 17.1 / 60.06 | 16.7 / 16.9 / 59.88 | 194755632 | 56066804 | 0/0 |
| 100000 | realistic | combined | 16.5 / 16.8 / 60.24 | 16 / 18.7 / 57.64 | 286280864 | 56159096 | 0/0 |
| 100000 | medium | plain | 16.4 / 17.2 / 59.88 | 16.6 / 16.7 / 59.88 | 137161440 | 56325456 | 0/0 |
| 100000 | medium | cvd | 16.5 / 17 / 59.97 | 16.5 / 18.7 / 56.82 | 227976028 | 56429756 | 0/0 |
| 100000 | medium | footprint | 16.4 / 22.4 / 60.24 | 16.9 / 23.5 / 49.5 | 171214152 | 57343204 | 0/0 |
| 100000 | medium | depth | 16.7 / 16.9 / 60.33 | 16.8 / 17.7 / 57.97 | 203713960 | 56334628 | 0/0 |
| 100000 | medium | combined | 11.4 / 17.9 / 70.18 | 16.5 / 18 / 57.97 | 291008668 | 57446728 | 0/0 |
| 100000 | fit | plain | 29.4 / 31 / 34.25 | 33.4 / 34.1 / 40 | 268461928 | 68140556 | 0/0 |
| 100000 | fit | cvd | 72.2 / 74.6 / 15.01 | 18.6 / 25 / 45.87 | 467056884 | 72906288 | 0/0 |
| 100000 | fit | footprint | 60.7 / 104.1 / 12.42 | 4.4 / 42.3 / 42.92 | 172835720 | 68422576 | 0/0 |
| 100000 | fit | depth | 60.4 / 142.7 / 13.28 | 12.6 / 25.8 / 53.48 | 193235496 | 68142924 | 0/0 |
| 100000 | fit | combined | 121 / 133.4 / 8.46 | 67.9 / 109.2 / 11.29 | 883136192 | 73196920 | 0/0 |

## Controlled before/after comparison

The before run was executed locally from the pre-Phase 14.6 tip with the same
benchmark command and system Chromium. It is not the earlier report's
environment-independent claim.

| Viewport | Before combined nav FPS | After combined nav FPS | Before combined realtime FPS | After combined realtime FPS | Before realtime median/p95 ms | After realtime median/p95 ms |
|---|---:|---:|---:|---:|---:|---:|
| realistic | 59.97 | 60.24 | 3.89 | 57.64 | 188 / 392.3 | 16 / 18.7 |
| medium | 63.69 | 70.18 | 4.32 | 57.97 | 150.8 / 312.3 | 16.5 / 18 |
| fit | 2.93 | 8.46 | 2.25 | 11.29 | 511.3 / 564.7 | 67.9 / 109.2 |

| Plain 100k fit metric | Before | After |
|---|---:|---:|
| Navigation FPS | 6.5 | 34.25 |
| Realtime FPS | 6.8 | 40 |
| Navigation median/p95 ms | 153.7 / 155.6 | 29.4 / 31 |
| Realtime median/p95 ms | 154.2 / 154.5 | 33.4 / 34.1 |

The realistic and medium combined realtime gates improved materially and are
not dominated by a full CVD copy. Fit-content combined remains limited by the
cost of drawing multiple full-history overlays and is marked PARTIAL below;
the required 45-case fit workload was not removed or reduced.

## Full validation results

All build-backed commands were run sequentially on 2026-10-30. The following
commands passed: `npm run typecheck`, `npm test` (307/307), `npm run
api:inventory`, `npm run api:diagnostics`, `npm run studio:check`, `npm run
package:check`, `npm run package:smoke`, `npm run package:audit`, `npm run
package:portability`, `npm run distribution:check`, `npm run test:browser`
(35/35), `npm run test:react:browser` (37/37), `npm run test:react:production`
(1/1), `npm --prefix examples/nextjs-app-router run build`, `npm run
benchmark:order-flow`, `npm run benchmark:order-flow:browser` (45 scenarios),
`npm run benchmark:browser`, `npm run benchmark:multi-chart`, `npm run
profile:multi-chart`, `npm run benchmark:corporate-actions`, `npm run
benchmark:corporate-actions:chart`, `npm run benchmark:portfolio`, `npm run
benchmark:portfolio-worker`, `npm run benchmark:portfolio-result`, `npm run
benchmark:multi-timeframe`, `npm run benchmark:calendar`, `npm run stress:ci`,
`npm run benchmark:cvd-cache`, `npm run benchmark:realtime-cvd`, and `npm run
benchmark:dense-ohlcv`.

`npm run api:check` returned **FAIL** by design of the protected historical
baseline. It reported no removals, but the existing strict hashes for `Chart`,
`WorkspaceDocument`, and `WorkspaceRestoreOptions` remain changed. The
diagnostic command classified this as `PASS_ADDITIVE_REVIEW_REQUIRED`; the
baseline file was not approved or rewritten. The new defensive latest-point
method is additive and is included in the current inventory, not silently
approved in the historical baseline.

The package, distribution, and portability checks passed without publishing or
creating a release. `stress:ci` reported zero orphan Workers and the browser
lifecycle cases returned zero canvases after destruction.

## Browser, device, and memory boundaries

The new browser evidence is system Chromium only. Official Playwright-managed
Firefox and WebKit, Mobile Chrome/Safari projects, physical devices, formal
accessibility approval, and visual approval were not available in this cloud
environment and remain **BLOCKED / NOT VERIFIED**. System Chromium is not a
universal browser-compatibility claim.

The benchmark matrix consistently recorded `1 -> 0` canvas cleanup and `0`
active Workers per scenario. The focused CVD benchmark recorded 587,350,643
bytes before destroy and 87,350,551 after its explicit GC observation. The
100k combined matrix rows recorded 286,280,864 -> 56,159,096 bytes realistic,
291,008,668 -> 57,446,728 bytes medium, and 883,136,192 -> 73,196,920 bytes
fit. These are workload-specific heap observations, not proof of leak freedom;
the repeated lifecycle/stress suite is the stronger cleanup evidence.

## Acceptance matrix

| Criterion | Result | Evidence / remaining gate |
|---|---|---|
| Live frontier no longer invalidates stable CVD options | PASS | Dedicated calculator/chart counters and parity |
| Ordinary CVD series append/update avoids full replacement | PASS | 100 `updateSeries`, one correction `setSeriesData` |
| No O(N) workspace snapshot per live trade | PASS | Root-cause fix plus chart update median 0.1 ms |
| 100k realistic combined realtime improves materially | PASS | 3.89 -> 57.64 FPS, 188/392.3 -> 16/18.7 ms |
| Dense candle display representation | PASS | Unit extrema test and command-count benchmark |
| Full-history plain fit performance improves | PASS | 6.5 -> 34.25 FPS navigation; 6.8 -> 40 FPS realtime |
| Numerical CVD/Footprint/Depth correctness | PASS | 307 Node tests, browser parity, correction parity |
| Replay/as-of/calendar causality | PASS | Existing and new replay/order-flow tests |
| Plain-chart performance regression | PASS | 100k realistic plain 60.06 FPS; fit improved in controlled run |
| 45-case order-flow browser matrix | PASS | 45 real system-Chromium cases, cleanup 0/0 |
| React/Studio and Next.js integration | PASS | 37 React, 1 production, Next build |
| Package/distribution/portability | PASS | All local gates passed |
| Stress and resource cleanup | PASS | `stress:ci`, zero orphan Workers, zero post-destroy canvases |
| Strict protected API baseline | PARTIAL / OPEN | No removals; changed hashes require owner approval |
| Fit-content combined realtime target | PARTIAL | Improved to 11.29 FPS but remains overlay/render bound |
| Firefox/WebKit/mobile/physical-device verification | BLOCKED | Browser artifacts/devices unavailable in cloud |
| Accessibility/visual approval and release authorization | NOT VERIFIED | Outside this engineering run |

Phase 14.6 is therefore closed for the verified local engineering scope, but
the strict API, external browser/device, fit-content performance, and formal
release/approval gates remain open. No Phase 15 work was started.

