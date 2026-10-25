# Performance Benchmarks

Run the deterministic model and browser measurements with:

```bash
npm run benchmark
npm run benchmark:browser
npm run benchmark:replay
npm run benchmark:alerts
npm run profile:browser
npm run benchmark:plugins
npm run benchmark:klinescript
```

`benchmark` measures the framework-independent model. `benchmark:browser`
serves the vanilla example in headless Chromium and measures actual Canvas2D
chart work for 1,000, 10,000, and 100,000 candles. The workload includes four
indicators (including a filled Bollinger band), two active drawings, shared
viewport navigation, 100 new-timestamp append updates, five same-timestamp
corrections, crosshair event dispatch, and a 30-frame `requestAnimationFrame`
update loop. It records median/p95 navigation, crosshair, synchronous update
work, and frame-interval samples, plus Chromium heap observations and canvas
cleanup.

The fixture starts all series at the same UTC timestamp. This is important:
using different time epochs makes each append look like a historical union-time
insertion and measures cache invalidation rather than the intended realtime
path. Append and correction paths remain separate because corrections
recalculate affected history for financial-data accuracy.

`profile:browser` instruments the 100,000-candle append path in the same
headless Chromium environment. It reports inclusive time spent in visible-data
snapshots, renderer work, drawing collection, series updates, indicator updates,
and shared time-cache operations. The profiler is diagnostic, not a release
benchmark.

Do not turn one machine's timings into universal performance guarantees.

`benchmark:plugins` is a deterministic Node microbenchmark for registry
activation/command/disposal, a 100,000-candle indicator initialization path,
and JSON workspace parsing. It is intentionally reported separately from the
Canvas2D benchmark and is not a cross-device performance claim.

`benchmark:klinescript` measures compile time, full historical execution at
1,000/10,000/100,000 candles, ten update calls through the existing Indicator
Engine lifecycle, four concurrent 10,000-bar instances, operation counts,
pre-cancelled execution, disposal, and the small pointwise incremental
candidate against full reference output. These are local observations for the
printed Node/runtime environment; the script makes no universal FPS, memory,
or latency claim. The candidate benchmark is not evidence that TA functions
are incrementally optimized.

Worker transport is not represented as a universal performance claim yet. The
7.3.1 deterministic tests verify lifecycle behavior; a later benchmark must
separate structured-clone transfer cost, compile-cache hits, full execution,
incremental session updates, restart cost, and memory after disposal before an
incremental KlineScript optimization is accepted.

## Phase 7.3 append regression investigation

The first Phase 7.3 Canvas2D rerun exposed a real large-history regression:
100,000-candle append work measured approximately 69 ms per update and 9 FPS.
The cause was in the alert integration path, not the native indicator
incremental calculation or Canvas renderer: every update cloned all indicator
output points and then linearly searched for the current timestamp. The fix
uses the internal result reference, the newest point for append events, and a
binary timestamp lookup for corrections. It preserves alert values while
restoring the append path to the following local observation:

| Candles | Append/update average | Frame-work p95 | Observed rAF FPS |
| ---: | ---: | ---: | ---: |
| 1,000 | 1.647 ms | 1.9 ms | 64.35 |
| 10,000 | 0.954 ms | 1.4 ms | 62.59 |
| 100,000 | 0.938 ms | 1.4 ms | 63.33 |

The same run measured 100,000-candle historical corrections at 5,241.8 ms for
five updates, with 589.5 MB observed before destruction, 2.2 MB after the GC
opportunity, and zero remaining canvases. These are local Chromium 154
observations under the benchmark workload, not universal performance targets.
The corrected run was repeated after the fix; no O(1) claim is made for
historical corrections or arbitrary KlineScript seeks.

`benchmark:replay` uses a real headless Chromium Canvas2D chart and measures
replay start, ten sequential steps, four non-sequential seeks, a short
play/pause cycle, exit restoration, and destruction at 1,000, 10,000, and
100,000 candles. It runs separate one-indicator, multiple-indicator, and
KlineScript scenarios. Sequential stepping uses the existing verified
append-incremental indicator path; arbitrary seeks intentionally measure full
prefix recalculation. The benchmark verifies restored data length and zero
remaining chart canvases after destruction.

`benchmark:alerts` measures the framework-neutral Alert Engine at 1,000,
10,000, and 100,000 bars with price, indicator, and script rules. It reports
live evaluation, a correction path, replay-prefix evaluation, bounded history,
event counts, and disposal time. These are Node-only measurements and are not
Canvas2D, FPS, memory-limit, or external-delivery claims. The command prints
the Node version and run timestamp so results can be reproduced locally.

The Phase 7.2 regression investigation found that `ChartModel` was copying the
entire defensive candle snapshot on every ordinary `Chart.update()` while
checking the latest timestamp. The fix uses a cutoff-aware ordered-store
lookup instead. The before/after measurements, profiler evidence, and replay
active observations are recorded in
`docs/reports/phase-7-2-performance-baseline.md`.

## Observed replay run

Environment: Linux headless Chromium 154 at `/usr/bin/chromium`, Playwright
1.64.1, 1,200 × 520 viewport, `--disable-gpu`, and
`--js-flags=--expose-gc`, run on 2026-10-25. Values are local observations, not
performance guarantees. Step and seek columns are median/p95 milliseconds;
heap is the browser's `usedJSHeapSize` immediately before chart destruction.

| Candles | Scenario | Step p50/p95 | Seek p50/p95 | Exit (ms) | Play/pause (ms) | Heap (MB) | Canvas after destroy |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | one indicator | 2.2 / 2.9 | 2.7 / 3.4 | 12.8 | 38.3 | 7.3 | 0 |
| 1,000 | multiple indicators | 2.4 / 3.8 | 3.7 / 6.0 | 11.7 | 36.5 | 10.1 | 0 |
| 1,000 | KlineScript | 1.3 / 2.4 | 1.4 / 2.5 | 5.5 | 35.3 | 5.2 | 0 |
| 10,000 | one indicator | 1.2 / 1.5 | 7.3 / 10.3 | 31.4 | 35.7 | 40.2 | 0 |
| 10,000 | multiple indicators | 1.3 / 1.6 | 23.8 / 36.6 | 65.5 | 36.8 | 56.2 | 0 |
| 10,000 | KlineScript | 2.2 / 8.4 | 4.4 / 9.3 | 25.5 | 37.9 | 37.7 | 0 |
| 100,000 | one indicator | 4.1 / 9.7 | 67.1 / 138.8 | 507.4 | 40.4 | 156.5 | 0 |
| 100,000 | multiple indicators | 2.7 / 8.4 | 371.8 / 794.8 | 1,185.2 | 43.0 | 425.5 | 0 |
| 100,000 | KlineScript | 23.0 / 27.3 | 101.7 / 156.6 | 405.8 | 39.3 | 311.2 | 0 |

The measured sequential step path is materially lower than arbitrary seek for
large native-indicator histories because the chart reuses the existing
append-incremental calculation contracts. KlineScript currently recomputes its
visible prefix on step/seek; this is measured technical debt, not an
unsupported constant-time claim. The benchmark reports no FPS target.

## Observed Node baseline

One run on Node.js v24.19.0 produced these model timings:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.080 | 0.090 | 0.147 |
| 10,000 | 8.694 | 0.011 | 0.031 |
| 100,000 | 78.708 | 0.011 | 0.021 |

## Observed Chromium run (Phase 7.0 final local observation)

Environment: Linux headless Chromium 154 at `/usr/bin/chromium`, Playwright
1.64.1, 1,200 × 520 viewport, `--disable-gpu`, and
`--js-flags=--expose-gc`. The result below is one completed Phase 7.0 run on
2026-10-25. It is a local observation, not a cross-device performance claim:

| Candles | Load (ms) | Nav p50/p95 (ms) | Crosshair p50/p95 (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | Frame interval p50/p95 (ms) | Frame-work p50/p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 25.7 | 3.4 / 6.4 | 0.1 / 0.3 | 198.1 | 1.981 | 44.2 | 16.6 / 17.0 | 1.5 / 2.2 | 64.61 |
| 10,000 | 97.9 | 2.2 / 2.7 | 0.1 / 0.2 | 102.0 | 1.020 | 350.5 | 16.7 / 17.5 | 1.1 / 1.7 | 61.68 |
| 100,000 | 1,363.3 | 1.6 / 2.3 | 0.1 / 0.2 | 104.3 | 1.043 | 5,947.8 | 16.6 / 17.0 | 1.1 / 1.6 | 62.81 |

The browser loop reached approximately 60 FPS for this run's append workload;
that is an observation, not a release target. Frame intervals measure the
browser scheduler, while frame-work measures synchronous JavaScript/chart work.
Crosshair values are the public runtime's event/calculation path; they do not
claim a full physical-pointer paint cost.

Chromium heap observations in this run were 1.80 MB before loading, 12.02 MB
after 1,000 candles, 61.80 MB after 10,000, and 553.42 MB before destruction
after 100,000. After `destroy()` and an explicit GC opportunity the observed
heap was 2.02 MB; `remainingCanvasCount` was zero. These are
allocation/GC-sensitive engine observations, not memory limits or proof of
leak-freedom.

## Earlier profile observation (diagnostic)

The compatibility-gate 100,000-candle append profile measured approximately
3.8 ms in visible-data snapshots, 18.2 ms in renderer calls, 4.6 ms in series
updates, 3.3 ms in collection updates, 2.6 ms in store updates, 6.3 ms in
indicator updates, and no append-time shared-time-cache invalidation after the
initial cache was built. Historical corrections still intentionally use the
slower full-recalculation path; optimizing that path further requires a
correctness-preserving incremental strategy and is tracked as technical debt.

An earlier run reported approximately 12.88 FPS and 719 MB for 100,000 candles.
That result was invalid for the append claim: the benchmark's primary candle
timestamps were earlier than the example's other series, so every append was
treated as a historical union-time insertion. The fixture now aligns epochs and
the corrected result is recorded above; the old result is retained only as a
diagnosed baseline, not a current performance measurement.

Repeat the benchmark on reference hardware before setting a performance budget.
