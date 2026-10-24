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
corrections, and a 30-frame requestAnimationFrame/update loop with multiple
indicators, a filled Bollinger band, and two active drawings. It also records
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
| 1,000 | 1.949 | 0.066 | 0.134 |
| 10,000 | 8.041 | 0.008 | 0.024 |
| 100,000 | 68.261 | 0.011 | 0.020 |

## Observed Chromium baseline

The browser run used system Chromium 154 in headless mode with a 1,200 × 520
viewport, `--disable-gpu`, and the deterministic vanilla fixture:

| Candles | Load (ms) | Navigation (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | rAF frame (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 22.9 | 12.3 | 126.0 | 1.260 | 44.1 | 15.540 | 64.35 |
| 10,000 | 103.3 | 10.1 | 466.6 | 4.666 | 414.4 | 16.337 | 61.21 |
| 100,000 | 1,453.1 | 8.1 | 6,679.0 | 66.790 | 5,800.5 | 77.630 | 12.88 |

Chromium reported heap observations of 1.47 MB before loading, 8.64 MB after
1,000 candles, 72.48 MB after 10,000, and 719.33 MB after 100,000. After
`destroy()` the observed heap was 1.65 MB in this run. The deterministic
cleanup assertion passed: `remainingCanvasCount = 0`, and `Chart.destroy()`
clears stored series and indicator state. Heap readings remain engine-specific
observations rather than release thresholds.

These values are reproducible observations for this environment, not release
targets or universal FPS guarantees. Repeat the benchmark on reference
hardware before setting a performance budget.
