# Optimization API

The optimization API is framework-independent and uses the trusted built-in
strategy registry plus the existing financial backtest engine.

```ts
import { runOptimization } from "openkline";

const report = runOptimization({
  strategy: "EMA_CROSSOVER",
  candles,
  searchSpace: [
    { name: "fastPeriod", type: "integer-range", start: 5, end: 15, step: 5 },
    { name: "slowPeriod", type: "integer-range", start: 20, end: 40, step: 10 },
  ],
  objective: "net-profit",
  initialCapital: 10_000,
  positionSizing: { type: "fixed-quantity", quantity: 1 },
  commission: { type: "percent", value: 0.001 },
  slippage: { type: "percent", value: 0.0005 },
  limits: { maxCandidates: 100 },
});

const best = report.rankedCandidates[0];
```

The search space must contain exactly the strategy metadata parameters. Use
`fixed` for values that should not vary. `maxCandidates` is required to make
the resource budget explicit. Invalid strategy combinations are included in
`invalidCandidates`; they are not changed to nearby valid values.

`objective` accepts `net-profit`, `total-return`, `max-drawdown`, `win-rate`,
and `profit-factor`. The first, second, fourth, and fifth are maximized;
maximum drawdown is minimized. `minimumTradeCount` and
`minimumObservationCount` prevent thin results from ranking. A zero-trade
candidate and an undefined metric have `objective.available === false` and a
human-readable `unavailableReason`.

The report includes candidate counts, stable IDs, canonical parameters,
metrics, input fingerprint, assumptions, elapsed time, progress observations,
and deterministic ranking. Set `retainBacktestResults: true` only when full
candidate details are needed; full results are still bounded by
`limits.maxRetainedResults`.

`createBacktest()` remains the financial reference. Optimization does not
place Paper Trading orders, connect to a broker, or imply future performance.
Worker execution, walk-forward splitting, robustness diagnostics, and Studio
controls are documented when their later Phase 8.2 milestones are completed.
