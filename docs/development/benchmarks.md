# Performance Benchmarks

Run:

```bash
npm run benchmark
npm run benchmark:browser
```

`benchmark` generates deterministic synthetic candles and measures the
framework-independent model's initial data load, viewport navigation, and
latest-candle update. `benchmark:browser` serves the vanilla example in
headless Chromium and measures actual Canvas2D-backed chart load, shared
viewport navigation, 100 append-style realtime updates, five same-timestamp
corrections, and a 30-frame requestAnimationFrame/update loop. It also records
Chromium heap observations and checks that destruction removes the chart
canvas. The append and correction paths are intentionally reported separately:
append updates use incremental indicator state, while corrections recalculate
the affected history for accuracy.

Record results from the target environment here when comparing revisions. Do
not turn one machine's timings into universal performance guarantees.

## Observed Node baseline

One run on Node.js v24.19.0 produced these model timings:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.009 | 0.073 | 0.138 |
| 10,000 | 7.788 | 0.008 | 0.025 |
| 100,000 | 47.600 | 0.012 | 0.018 |

## Observed Chromium baseline

The browser run used system Chromium 154 in headless mode with a 1,200 × 520
viewport, `--disable-gpu`, and the deterministic vanilla fixture:

| Candles | Load (ms) | Navigation (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | rAF frame (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 27.0 | 17.9 | 233.7 | 2.337 | 92.5 | 15.970 | 62.62 |
| 10,000 | 281.3 | 11.1 | 702.7 | 7.027 | 274.6 | 16.017 | 62.43 |
| 100,000 | 908.1 | 6.4 | 5,445.9 | 54.459 | 3,815.7 | 50.127 | 19.95 |

Chromium reported heap observations of 1.39 MB before loading, 11.14 MB after
1,000 candles, 37.59 MB after 10,000, and 426.52 MB after 100,000. After
`destroy()` the observed heap was 1.55 MB in this run. The deterministic
cleanup assertion passed: `remainingCanvasCount = 0`, and `Chart.destroy()`
clears stored series and indicator state. Heap readings remain engine-specific
observations rather than release thresholds.

These values are reproducible observations for this environment, not release
targets or universal FPS guarantees. Repeat the benchmark on reference
hardware before setting a performance budget.
