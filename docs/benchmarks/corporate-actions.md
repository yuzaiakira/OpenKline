# Corporate-action benchmark

The reproducible benchmark is `npm run benchmark:corporate-actions`. It uses
deterministic Node.js data and runs sequentially with `--expose-gc`; it does not
measure Canvas2D FPS, browser Worker startup, or physical-device behavior.

Run recorded on 2026-10-30 in the cloud workspace:

- Node.js `v24.19.0`
- 1,000 candles: 3 samples
- 10,000 candles: 3 samples
- 100,000 candles: 2 samples

Median / p95 milliseconds from the run:

| Candles | Split adjustment | Total return | Causal as-of | Comparison | Portfolio lifecycle | Export |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.897 / 2.337 | 1.360 / 1.367 | 1.225 / 1.927 | 2.755 / 4.834 | 15.807 / 20.660 | 2.377 / 2.472 |
| 10,000 | 1.397 / 7.922 | 3.022 / 4.623 | 1.947 / 6.174 | 10.258 / 13.052 | 123.210 / 128.462 | 15.978 / 21.067 |
| 100,000 | 43.415 / 52.041 | 45.471 / 54.069 | 53.882 / 74.165 | 104.495 / 110.809 | 1,219.903 / 1,220.985 | 250.008 / 250.452 |

The benchmark includes five deterministic events per instrument, indexed split
boundaries, monotonic dividend processing, a source correction, one explicit
total-return comparison asset, and a no-signal portfolio lifecycle. The
portfolio column intentionally isolates timeline/action overhead; the
Worker-specific transport benchmark remains `npm run benchmark:portfolio-worker`.

Observed heap deltas after forced GC were approximately `0.50 MB`, `0.02 MB`,
and `0.01 MB` for the three scenarios. These are process observations, not
memory-limit or leak-proof claims. The 100,000-candle export was approximately
69.15 MB, so consumers should prefer chunked result serialization for large
results.

No Canvas2D or browser performance conclusion is inferred from this document.

