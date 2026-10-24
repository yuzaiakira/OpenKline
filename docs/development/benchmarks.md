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
| 1,000 | 2.220 | 0.067 | 0.140 |
| 10,000 | 7.753 | 0.008 | 0.047 |
| 100,000 | 64.909 | 0.011 | 0.021 |

## Observed Chromium baseline

The browser run used system Chromium 154 in headless mode with a 1,200 × 520
viewport, `--disable-gpu`, and the deterministic vanilla fixture:

| Candles | Load (ms) | Navigation (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | rAF frame (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 20.6 | 14.4 | 122.7 | 1.227 | 32.1 | 15.493 | 64.54 |
| 10,000 | 68.9 | 5.8 | 355.8 | 3.558 | 225.1 | 15.937 | 62.75 |
| 100,000 | 1,193.4 | 6.2 | 5,713.3 | 57.133 | 3,319.9 | 55.940 | 17.88 |

Chromium reported heap observations of 1.39 MB before loading, 6.73 MB after
1,000 candles, 53.53 MB after 10,000, and 194.35 MB after 100,000. The heap
remained reserved after `destroy()` in this headless run; that is not by itself
evidence of a retained chart leak because browser heaps are not necessarily
returned to the OS. The deterministic cleanup assertion passed:
`remainingCanvasCount = 0`, and `Chart.destroy()` clears stored series state.

These values are reproducible observations for this environment, not release
targets or universal FPS guarantees. Repeat the benchmark on reference
hardware before setting a performance budget.
