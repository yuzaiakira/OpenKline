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
viewport navigation, 100 realtime updates, and a 30-frame
requestAnimationFrame/update loop. It also records Chromium heap observations
and checks that destruction removes the chart canvas.

Record results from the target environment here when comparing revisions. Do
not turn one machine's timings into universal performance guarantees.

## Observed Node baseline

One run on Node.js v24.19.0 produced these model timings:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.142 | 0.127 | 1.244 |
| 10,000 | 6.669 | 0.026 | 2.154 |
| 100,000 | 53.499 | 1.543 | 32.832 |

## Observed Chromium baseline

The browser run used system Chromium 154 in headless mode with a 1,200 × 520
viewport, `--disable-gpu`, and the deterministic vanilla fixture:

| Candles | Load (ms) | Navigation (ms) | 100 updates (ms) | Update work (ms) | rAF frame (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.8 | 8.6 | 49.7 | 0.497 | 15.687 | 63.75 |
| 10,000 | 3.4 | 5.6 | 134.3 | 1.343 | 15.737 | 63.55 |
| 100,000 | 72.5 | 18.0 | 1,570.2 | 15.702 | 17.310 | 57.77 |

Chromium reported heap observations of 1.02 MB before loading, 2.34 MB after
1,000 candles, 18.39 MB after 10,000, and 141.22 MB after 100,000. The heap
remained reserved after `destroy()` in this headless run; that is not by itself
evidence of a retained chart leak because browser heaps are not necessarily
returned to the OS. The deterministic cleanup assertion passed:
`remainingCanvasCount = 0`, and `Chart.destroy()` clears stored series state.

These values are reproducible observations for this environment, not release
targets or universal FPS guarantees. Repeat the benchmark on reference
hardware before setting a performance budget.
