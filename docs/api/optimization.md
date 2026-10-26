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
Worker execution, walk-forward splitting, robustness diagnostics, and exports
are available. The private Next.js Studio adds chart-scoped optimizer and
Walk-Forward controls; see `docs/guides/studio-strategy-optimizer.md`.
Applying a result updates only Strategy Tester inputs and never submits Paper
Trading orders.

## Worker execution

`createOptimizationWorker(options, { workerCount, candidateTimeoutMs,
overallTimeoutMs })` runs the same candidate summaries through a bounded pool
of the existing Backtest Workers. Its status includes job ID, active Worker
count, aggregate progress, and lifecycle state. A second run supersedes the
first; `cancel()` rejects the active job and disposes all active Worker
sessions. Worker startup/crash failures receive one fresh-session retry by
default. No partial cancellation result is reported as completed.

## Walk-Forward Analysis

`runWalkForward()` creates chronological anchored or rolling bar-count folds.
Each fold optimizes on its training slice, freezes the selected parameters,
and then evaluates optional validation and out-of-sample slices separately.
Configure `gapBars` and `warmupBars` explicitly. Warm-up context is passed to
the strategy, while the additive Backtest `tradingStartIndex` prevents
warm-up signals and account state from crossing into the test interval.

The initial aggregation policy is `reset-per-fold`; every fold starts with
fresh configured capital and the result deliberately exposes no continuous
portfolio equity curve. Overlapping tests are detected and warned about.
Fold reports include boundaries, fingerprints, selected parameters, training
score, out-of-sample metrics/trades/equity, assumptions, and diagnostics.
Out-of-sample results are historical simulated evidence, not predictions.

## Robustness and export

`analyzeParameterSensitivity()` evaluates valid neighboring parameter
combinations and reports descriptive score, drawdown, and trade-count
variation. `analyzeWalkForwardRobustness()` reports training/OOS degradation,
adjacent parameter changes, profitable-fold consistency, and explicit
overfitting warnings. Neither function produces predictive probabilities.

Use `serializeOptimizationReportJson()` and
`serializeOptimizationLeaderboardCsv()` for optimization output, or the
corresponding Walk-Forward JSON/CSV helpers. Pass an explicit local
`analysisCompletedAt` timestamp to make export provenance clear; market candle
timestamps remain separate. Exports are data-only and do not include
executable functions or secrets.
