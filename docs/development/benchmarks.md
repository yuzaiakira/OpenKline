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
| 1,000 | 2.065 | 0.156 | 0.147 |
| 10,000 | 11.159 | 0.008 | 0.025 |
| 100,000 | 93.835 | 0.041 | 0.168 |

## Observed Chromium baseline

The browser run used system Chromium 154 in headless mode with a 1,200 × 520
viewport, `--disable-gpu`, and the deterministic vanilla fixture:

| Candles | Load (ms) | Navigation (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | rAF frame (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 20.8 | 11.5 | 130.5 | 1.305 | 91.3 | 23.410 | 42.72 |
| 10,000 | 88.9 | 8.2 | 532.4 | 5.324 | 381.5 | 16.300 | 61.35 |
| 100,000 | 1,403.2 | 6.5 | 7,693.0 | 76.930 | 4,489.3 | 51.840 | 19.29 |

Chromium reported heap observations of 1.39 MB before loading, 11.71 MB after
1,000 candles, 34.73 MB after 10,000, and 205.31 MB after 100,000. After
`destroy()` the observed heap was 62.25 MB. The heap remaining reserved after
destruction is not by itself evidence of a retained chart leak because browser
heaps are not necessarily returned to the OS. The deterministic cleanup
assertion passed: `remainingCanvasCount = 0`, and `Chart.destroy()` clears
stored series state.

These values are reproducible observations for this environment, not release
targets or universal FPS guarantees. Repeat the benchmark on reference
hardware before setting a performance budget.
