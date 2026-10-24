# Performance Benchmarks

Run:

```bash
npm run benchmark
```

The benchmark generates deterministic synthetic candles and measures the
framework-independent model's initial data load, viewport navigation, and
latest-candle update for 1,000, 10,000, and 100,000 candles. It reports the
Node version and timings as JSON. These measurements do not claim Canvas2D
frame-rate performance; browser rendering benchmarks require a reference
browser and hardware and remain a separate follow-up.

Record results from the target environment here when comparing revisions. Do
not turn one machine's timings into universal performance guarantees.

## Observed baseline

One cloud run on Node.js v24.19.0 produced these model-only timings:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 1.360 | 0.137 | 0.074 |
| 10,000 | 2.522 | 0.008 | 0.014 |
| 100,000 | 12.554 | 0.013 | 0.012 |

These values are a reproducible baseline for this environment, not release
targets. Canvas rendering and browser frame timing are intentionally not
included in this benchmark.
