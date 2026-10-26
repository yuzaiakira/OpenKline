# Studio Strategy Tester

OpenKline Studio includes a chart-scoped Strategy Tester for deterministic
historical simulations. It consumes the active chart's validated OHLCV data
through the public `Chart.getData()` API and runs built-in strategies in a
dedicated Backtest Worker; the synchronous `createBacktest()` remains the
financial parity reference. It does not contact a vendor, place orders, or
predict future performance.

## Workflow

1. Select a chart panel and open the Strategy Tester below the workspace.
2. Choose one of the built-in strategies and edit its validated parameters.
3. Set initial capital, position sizing, commission, and slippage.
4. Optionally select a deterministic 100,000- or 500,000-bar fixture to test
   responsiveness and cancellation without network credentials.
5. Run the backtest and inspect Overview, Trades, Equity, Settings, and
   Diagnostics tabs.
6. Use Show/Hide markers to control non-persistent signal and fill overlays on
   the active chart.
7. Export the versioned JSON result or the completed-trade CSV ledger.

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

The Worker-backed Cancel button terminates the active Worker, so a long
synchronous engine loop cannot block cancellation. Progress is throttled before
it reaches React. Results are applied only when the panel is still mounted and
the panel/symbol/timeframe run token is current. Worker unavailability is shown
as an error; Studio does not silently fall back to synchronous execution.

The built-in strategies are EMA crossover, RSI threshold reversal, Donchian
breakout, and EMA trend following. Short selling, protective orders, intrabar
fills, portfolio-wide simulation, and broker execution remain outside this
milestone.
