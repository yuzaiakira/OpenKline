# Portfolio backtesting benchmark

The reproducible command is:

```text
npm run benchmark:portfolio
```

It builds the package and runs the synchronous reference engine under Node with
`--expose-gc` for 1,000, 10,000, and 100,000 candles. The matrix uses two,
three, and five deterministic instruments respectively, fixed 1-minute bars,
EMA Trend/EMA Crossover built-ins, shared USD cash, costs, and exposure
limits. It reports validation, execution, export, median/p95 run time, result
size, signal/order/trade counts, pre/post heap observations, and lifecycle
status. The same input object is reused for repeated runs and fingerprints are
compared by the script output.

These are Node calculation measurements, not Canvas2D frame rates, browser
Worker throughput, or capacity guarantees. Worker protocol parity, cancellation,
supersession, and disposal are covered by `tests/portfolio-backtesting.test.ts`.
The Chromium Studio workflow also records whether a host used the Worker or the
explicit synchronous fallback. Official Firefox/WebKit/mobile, physical-device,
accessibility, and visual gates remain separate acceptance criteria.

The protocol-handler benchmark can be run with:

```text
npm run benchmark:portfolio-worker
```

It measures deterministic handler execution and response production for 1,000 ×
2 and 10,000 × 3 scenarios, including progress and disposal acknowledgements.
It intentionally does not claim browser Worker startup, structured-clone, or
thread scheduling latency; those require an available browser Worker harness.

## Latest local observation

The benchmark is executed as part of Phase 12 verification. Its JSON output is
copied into `docs/reports/phase-12-final-verification.md` without replacing
measurements with estimates. If a 100,000-candle case is too slow or memory
limited in a particular environment, that case is recorded as blocked with the
actual error and no unsupported extrapolation.
