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

`cancel()` or an aborted signal ends the run without a partial result.
`getStatus()` and `subscribe()` expose local lifecycle/progress observations.
`dispose()` is terminal. This API does not execute arbitrary JavaScript and is
not a prediction or profitability service.

The result includes deterministic `inputFingerprint` metadata and
`engineVersion`. `calculatePerformanceMetrics()` reports total return, net and
gross P&L, drawdown, trade counts, win rate, averages, profit factor,
commissions, exposure, and open-position unrealized P&L. Undefined ratios use
`null`; they are never represented as `Infinity` or an invented zero.
`serializeBacktestResult()` exports JSON assumptions and results, while
`serializeTradeLedgerCsv()` exports only the completed trade ledger.
