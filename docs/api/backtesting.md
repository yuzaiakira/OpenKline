# Backtesting API

`createBacktest()` is a framework-independent synchronous reference engine.
It consumes a registered trusted TypeScript strategy and validated historical
OHLCV data.

```ts
import { createBacktest, serializeBacktestResult, serializeTradeLedgerCsv } from "openkline";

const backtest = createBacktest({
  strategy: "EMA_CROSSOVER",
  parameters: { fastPeriod: 12, slowPeriod: 26 },
  candles,
  initialCapital: 10_000,
  positionSizing: { type: "fixed-quantity", quantity: 1 },
  commission: { type: "percent", value: 0.001 },
  slippage: { type: "percent", value: 0.0005 },
});

const result = backtest.run();
console.log(result.trades, result.equityCurve, result.finalAccount);
console.log(result.metrics);
const json = serializeBacktestResult(result);
const csv = serializeTradeLedgerCsv(result);
backtest.dispose();
```

The default registry contains EMA crossover, RSI reversal, Donchian breakout,
and EMA trend strategies. Pass `strategyRegistry` to use an application-owned
trusted TypeScript definition.

## Execution and result semantics

Signals are evaluated on completed bars. Market orders fill at the next bar's
open after configured slippage and commission. The result preserves the signal
and fill timestamps, final order state, completed trade ledger, optional open
position, mark-to-market equity curve, and all execution assumptions. A signal
on the final bar is cancelled because no future fill exists.

The current engine supports long positions by default. Short positions require
an explicit `shortSelling.maxNotional`; reversal requires explicit
`reversal: "close-and-reverse"`. The default end-of-data behavior is
mark-to-market without liquidation. Protective stops, targets, intrabar fills,
multi-asset portfolios, and live trading are not implemented.

For isolated historical evaluation, `tradingStartIndex` may identify a bar
after an indicator warm-up prefix. Strategy signals are still evaluated
causally across the supplied input, but signals before this boundary cannot
create orders, fills, or equity observations. The account starts flat at the
boundary and the validated boundary is included in `assumptions`. This is the
contract used by Walk-Forward out-of-sample evaluation.

`cancel()` or an aborted signal ends the run without a partial result.
`getStatus()` and `subscribe()` expose local lifecycle/progress observations.
`dispose()` is terminal. This API does not execute arbitrary JavaScript and is
not a prediction or profitability service.

## Worker execution

`createBacktestWorker()` runs the same built-in strategies and backtest engine
in a dedicated versioned Worker. It is intended for browser UI work where a
long simulation must not occupy the main thread. Its serializable options
contain validated candles, strategy ID/parameters, and execution assumptions;
custom registries, callbacks, abort signals, and arbitrary source are not
accepted at this boundary. See `docs/api/backtesting-worker.md` and
`docs/architecture/strategy-worker-runtime.md`.

Subscribe to `BacktestWorkerStatus` for throttled progress. `cancel()` is a
hard cancellation: the active Worker is terminated, the promise rejects with
`BacktestWorkerError` code `CANCELLED`, and no partial result is retained.
Repeated runs reuse the initialized defensive dataset. Superseding a run,
timeouts, Worker crashes, malformed messages, and disposal have stable error
codes and do not apply stale results.

The result includes deterministic `inputFingerprint` metadata and
`engineVersion`. `calculatePerformanceMetrics()` reports total return, net and
gross P&L, drawdown, trade counts, win rate, averages, profit factor,
commissions, exposure, and open-position unrealized P&L. Undefined ratios use
`null`; they are never represented as `Infinity` or an invented zero.
`serializeBacktestResult()` exports JSON assumptions and results, while
`serializeTradeLedgerCsv()` exports only the completed trade ledger.

To display a result on an existing chart without persisting it as workspace
data:

```ts
const markers = createStrategyMarkers(result, candles);
chart.setStrategyMarkers(markers);
// chart.getStrategyMarkers() is replay-aware and hides future markers.
chart.clearStrategyMarkers();
```

For multiple instruments and one shared cash ledger, use the additive
`createPortfolioBacktest()` API. It preserves the same completed-bar causal
strategy boundary but adds canonical multi-instrument ordering, next-eligible
open fills, shared cash/exposure/risk controls, portfolio marks, per-instrument
contributions, and versioned JSON/CSV exports. See
`docs/api/portfolio-backtesting.md`; the single-symbol API above remains
backward-compatible and is not silently converted to a portfolio run.
