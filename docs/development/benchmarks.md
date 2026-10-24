# Performance Benchmarks

Run the deterministic model and browser measurements with:

```bash
npm run benchmark
npm run benchmark:browser
npm run profile:browser
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

## Observed Node baseline

One run on Node.js v24.19.0 produced these model timings:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.080 | 0.090 | 0.147 |
| 10,000 | 8.694 | 0.011 | 0.031 |
| 100,000 | 78.708 | 0.011 | 0.021 |

## Observed Chromium run

Environment: Linux headless Chromium 154 at `/usr/bin/chromium`, Playwright
1.64.1, 1,200 × 520 viewport, `--disable-gpu`, and
`--js-flags=--expose-gc`. The result below is one completed run after the
append-store optimization:

| Candles | Load (ms) | Nav p50/p95 (ms) | Crosshair p50/p95 (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | Frame interval p50/p95 (ms) | Frame-work p50/p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 24.9 | 1.6 / 3.9 | 0.1 / 0.7 | 144.5 | 1.445 | 48.0 | 16.6 / 16.9 | 1.0 / 1.5 | 64.79 |
| 10,000 | 95.0 | 1.0 / 5.0 | 0.1 / 0.4 | 63.6 | 0.636 | 373.9 | 16.7 / 16.9 | 1.1 / 1.4 | 62.62 |
| 100,000 | 1,306.0 | 0.8 / 7.5 | 0.2 / 0.4 | 52.5 | 0.525 | 5,403.3 | 16.6 / 16.9 | 0.7 / 1.3 | 61.97 |

The browser loop reached approximately 60 FPS for this run's append workload;
that is an observation, not a release target. Frame intervals measure the
browser scheduler, while frame-work measures synchronous JavaScript/chart work.
Crosshair values are the public runtime's event/calculation path; they do not
claim a full physical-pointer paint cost.

Chromium heap observations in this compatibility-gate rerun were 1.47 MB
before loading, 9.07 MB after 1,000 candles, 60.20 MB after 10,000, and 751.48
MB before destruction after 100,000. After `destroy()` and an explicit GC
opportunity the observed heap was 1.69 MB; `remainingCanvasCount` was zero.
The peak differs from the earlier 305.32 MB observation because these are
allocation/GC-sensitive engine measurements. They are observations, not memory
limits or proof of leak-freedom.

## Profile observations

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
