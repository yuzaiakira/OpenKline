# Volume analytics benchmark

Run the deterministic Node benchmark from the repository root:

```sh
npm run benchmark:volume-analytics
```

The command builds the public package first and then measures five samples per
scenario on deterministic UTC OHLCV data. It reports median and p95 wall-clock
time for Anchored VWAP, close allocation, range-uniform allocation, a moving
visible-range calculation, calculator append updates, correction plus result
recalculation, and disposal.

The following run was recorded on 2026-10-30 in the managed cloud environment:

- Node `v24.19.0`, Linux x64
- CPU: Intel(R) Xeon(R) Platinum 8573C
- samples: 5 per scenario
- no Canvas2D, browser frame-time, FPS, or physical-device claim

| Candles | VWAP median/p95 ms | Close profile median/p95 ms | Range-uniform median/p95 ms | Visible range median/p95 ms | Append update median/p95 ms | Correction + result median/p95 ms | Dispose ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.421 / 1.464 | 0.789 / 1.110 | 3.145 / 6.704 | 0.153 / 0.175 | 0.003 / 0.010 | 0.253 / 0.994 | 0.001 |
| 10,000 | 3.115 / 3.673 | 4.893 / 6.125 | 4.412 / 4.976 | 1.377 / 1.458 | 0.004 / 0.005 | 1.452 / 4.022 | 0.003 |
| 100,000 | 35.198 / 89.123 | 30.160 / 41.252 | 53.903 / 74.239 | 27.484 / 44.265 | 0.003 / 0.010 | 29.038 / 41.158 | 0.008 |

The append column measures the calculator's state update only; the correction
column intentionally includes `getResult()` and therefore represents a full
causal recalculation after a historical correction. The profile engine still
asserts volume conservation and POC/value-area ordering for every measured
sample. These numbers are reproducible workload evidence, not performance
guarantees across browsers or hosts.
