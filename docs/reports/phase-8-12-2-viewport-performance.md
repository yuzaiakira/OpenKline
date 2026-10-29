# Phase 8.12.2 — Viewport Performance Verification

Date: 2026-10-29  
Branch: `phase-8.12.2-viewport-performance`  
Base branch: `main`  
Starting SHA: `56129012933dfc935857708fcd68f840b76f8bc2`  
Final implementation SHA: `e11785b56ada8e323150af077dd921a38441850b`

This increment targeted high-frequency pan, zoom, and visible-range
synchronization. It did not change the public Chart or
`ChartSynchronizationController` contracts, data ordering, scale semantics,
replay visibility, or crosshair overlay architecture.

## 1. Confirmed bottlenecks

The Phase 8.12.1 profile was reproduced in local headless Chromium 154 before
the change. Linked dual-chart visible-range work was approximately
`158.2/185.5 ms` median/p95 for 100k candles and `20.2/27.1 ms` for 10k
candles. Crosshair work remained low at approximately `5.7/6.8 ms` and
`1.4/2.3 ms`, respectively.

The new component profiler confirmed that the 100k linked viewport path is
Canvas2D-bound:

- full renderer: approximately `59.1 ms` median per chart in the diagnostic
  sample;
- series/pane drawing: approximately `57.4 ms` median per chart;
- visible-data construction: sub-millisecond median, with a diagnostic p95 of
  approximately `20.2 ms`;
- base-frame capture: approximately `6.7 ms` median per chart;
- axis/grid, labels, and viewport state: each below `1 ms` median;
- transient crosshair overlay: approximately `0.6 ms` median.

The previous synchronous benchmark did not represent event-to-visual latency
after scheduling. The updated benchmark reports synchronous state cost and a
single `requestAnimationFrame` next-frame proxy separately.

## 2. Implemented improvements

- Viewport state and synchronization notifications remain synchronous, while
  repeated `setVisibleTimeRange`, `pan`, `zoom`, fit, reset, wheel, and drag
  updates coalesce into one full render per chart per animation frame.
- A pending viewport frame is cancelled by `Chart.destroy()`. A destroyed or
  resized chart cannot execute an obsolete queued viewport render.
- Crosshair rendering remains on the Phase 8.12.1 transient overlay path. A
  pending viewport frame consumes the latest crosshair state instead of
  forcing a redundant synchronous full render.
- Candle, OHLC, and hollow-candle renderers reuse computed x coordinates for
  body-width and drawing work. Financial values, time mapping, and appearance
  behavior are unchanged.
- The multi-chart benchmark now covers visible-range changes, continuous pan,
  continuous zoom, rapid alternating navigation, realtime updates during
  navigation, cleanup, heap observations, and next-frame latency.
- The diagnostic profiler now records visible-data, viewport-state, full
  Canvas2D, series/pane, grid/axis, label, crosshair, and base-frame spans.

## 3. Before/after benchmark observations

Environment: Linux cloud workspace, system Chromium 154, Playwright local
Chromium launcher, 1,440 × 900 viewport, Canvas2D with `--disable-gpu` and
`--js-flags=--expose-gc`. These are reproducible observations for this
environment, not universal performance guarantees.

The Phase 8.12.1 baseline below measured synchronous full-render calls. The
Phase 8.12.2 values measure synchronous state calls separately and the
scheduled next visual frame, so the columns are intentionally not presented as
an apples-to-apples FPS claim.

| Workload | Phase 8.12.1 synchronous range p50/p95 | Phase 8.12.2 state p50/p95 | Phase 8.12.2 visual p50/p95 |
| --- | ---: | ---: | ---: |
| Dual 10k visible range | 20.2 / 27.1 ms | 0.4 / 0.8 ms | 18.2 / 24.0 ms |
| Dual 100k visible range | 158.2 / 185.5 ms | 3.7 / 19.0 ms | 152.7 / 216.4 ms |

Phase 8.12.2 multi-chart visual scenarios:

| Workload | Dual 10k p50/p95 | Dual 100k p50/p95 |
| --- | ---: | ---: |
| Visible-range synchronization | 18.2 / 24.0 ms | 152.7 / 216.4 ms |
| Continuous pan | 17.8 / 26.2 ms | 152.9 / 161.5 ms |
| Continuous zoom | 18.4 / 20.5 ms | 154.1 / 215.5 ms |
| Rapid alternating navigation | 18.1 / 25.3 ms | 154.5 / 170.7 ms |
| Realtime update during navigation | 17.8 / 22.7 ms | 158.9 / 186.7 ms |

Crosshair state cost remained `0.4/0.9 ms` for dual 10k and `3.5/4.0 ms`
for dual 100k in the same run. The dedicated crosshair profile remained below
`5.5 ms` p95 for rapid alternating crosshair updates. The 100k viewport path
is still above a 16.7 ms frame budget because two full Canvas2D charts must be
redrawn; no unsupported 60 FPS claim is made.

The independent single-chart browser benchmark measured approximately 63.18,
62.49, and 62.20 FPS for 1k, 10k, and 100k append workloads, with frame-work
p95 values of `3.0`, `1.8`, and `1.8 ms`. It reported zero canvases after
destruction. This append benchmark is not interchangeable with dual-chart
viewport latency.

The Studio benchmark passed its single, two-horizontal, two-vertical, and
four-grid layouts. Its combined local layout/interaction observation was
`351.5 ms`; it is not decomposed into React scheduling and core Canvas2D
rendering and is not used as a core viewport target.

## 4. Regression verification

| Command | Result |
| --- | --- |
| `npm test` | PASS — 192/192 Node tests |
| `npm run typecheck` | PASS |
| `npm run api:check` | PASS; no removed or changed exports |
| `npm run package:smoke` | PASS; ESM consumer installed local tarball |
| `npm run distribution:check` | PASS; 398 files, no distribution problems |
| `npm run studio:check` | PASS; core remains framework-independent |
| `npm run test:browser` | PASS — 24/24 system Chromium |
| `npm run test:react:browser` | PASS — 28/28 system Chromium |
| `npm run stress:ci` | PASS; 0 orphan failures, 0 Worker orphans, 0 canvases |
| `npm run benchmark:browser` | PASS; 1k/10k/100k Canvas2D observations |
| `npm run benchmark:multi-chart` | PASS; single, dual 10k, dual 100k scenarios |
| `npm run profile:multi-chart` | PASS; component profile and trace written |

The new focused synchronization suite is 4/4, including one-frame
coalescing and destruction cancellation. The broader 11-test interaction
subset is also 11/11.

## 5. Interaction and synchronization correctness

- LTR interaction remains covered by the standalone chart, replay, drawing,
  and synchronization tests.
- RTL wheel zoom preserves the crosshair time anchor; the RTL regression passed
  in system Chromium.
- Existing multi-chart Studio tests passed with different timeframes, missing
  timestamps, independent chart state, mixed layouts, synchronization, and
  mobile panel selection.
- Replay visibility, datafeed switching, drawing anchors, indicator panes, and
  crosshair alignment remain covered by the full standalone and React/Studio
  suites.
- The model still publishes the final viewport synchronously. Only the
  visual render is deferred and coalesced, preserving deterministic event
  ordering and UTC range mapping.

## 6. Resource cleanup

The focused destruction regression observed zero `clearRect` calls from a
cancelled post-destroy frame and zero canvases. The full browser stress run
reported `orphanFailures: 0`, `workerOrphans: 0`, and
`remainingCanvasCount: 0`. Multi-chart benchmark scenarios also reported zero
owned canvases after controller and chart disposal. No new subscriptions or
Workers were introduced by this increment.

## 7. Remaining limitations and open gates

- Official Playwright-managed Firefox, WebKit, Mobile Chrome, and Mobile
  Safari were not executed in this cloud environment. The supported browser
  artifact path is blocked by the environment’s registry/network policy;
  system Chromium is not a substitute for those engines.
- Physical-device, screen-reader, formal accessibility, visual-approval, and
  device-specific performance gates remain open. This report makes no claim
  for them.
- Dual 100k viewport navigation remains Canvas2D render-bound. Further gains
  would require separately justified rendering work; no WebGL dependency or
  new rendering architecture was introduced here.
- The profiler is diagnostic and adds instrumentation overhead. Its component
  values are not release thresholds.

## 8. Pull request and Git verification

Commits were created with `Akira Yuzai <yuzai.akira@gmail.com>` as both author
and committer, using Conventional Commits:

- `63640cc91941b50fe5a975480248b8b21dc62640`
  `perf(viewport): coalesce synchronized renders`
- `e11785b56ada8e323150af077dd921a38441850b`
  `perf(viewport): measure and streamline chart frames`

Both commits were pushed to `origin/phase-8.12.2-viewport-performance`, and
the remote branch matched the local branch after the second push. The review
URL targeting `main` is:

<https://github.com/yuzaiakira/OpenKline/pull/new/phase-8.12.2-viewport-performance>

No merge, GitHub Actions workflow, npm publication, release, license change,
or tag was performed. The branch is ready for owner review; Phase 8.12.2 is
not a cross-browser or physical-device release gate closure.
