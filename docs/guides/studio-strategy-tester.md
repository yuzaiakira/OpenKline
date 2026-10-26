# Studio Strategy Tester

OpenKline Studio includes a chart-scoped Strategy Tester for deterministic
historical simulations. It consumes the active chart's validated OHLCV data
through the public `Chart.getData()` API and calls `createBacktest()`; it does
not contact a vendor, place orders, or predict future performance.

## Workflow

1. Select a chart panel and open the Strategy Tester below the workspace.
2. Choose one of the built-in strategies and edit its validated parameters.
3. Set initial capital, position sizing, commission, and slippage.
4. Run the backtest and inspect Overview, Trades, Equity, Settings, and
   Diagnostics tabs.
5. Use Show/Hide markers to control non-persistent signal and fill overlays on
   the active chart.
6. Export the versioned JSON result or the completed-trade CSV ledger.

The result dashboard displays engine-generated net profit, total return,
maximum drawdown, win rate, profit factor, closed-trade count, equity, and
drawdown. React does not recompute those financial statistics.

## Scope and lifecycle

Tester configuration and result display are scoped to the active chart panel,
symbol, and timeframe. Simulations are not synchronized between panels and a
market-data change creates a new scope. A session is disposed when its panel
is unmounted; cancellation never retains a partial result. Strategy markers
use the existing Chart overlay renderer and are not workspace series or
drawing records.

The current reference engine is synchronous. The Cancel button and lifecycle
path are real, but a long synchronous calculation can only observe cancellation
at engine progress checkpoints; a dedicated versioned Strategy Worker is not
yet implemented. Worker execution must not be inferred from the Studio UI.

The built-in strategies are EMA crossover, RSI threshold reversal, Donchian
breakout, and EMA trend following. Short selling, protective orders, intrabar
fills, portfolio-wide simulation, and broker execution remain outside this
milestone.
