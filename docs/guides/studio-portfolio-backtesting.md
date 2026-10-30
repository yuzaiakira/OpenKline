# Studio portfolio backtesting

OpenKline Studio includes a deterministic offline Portfolio Backtesting panel
for exercising the public multi-asset API without vendor credentials. It starts
with BTC-USD, ETH-USD, and AAPL fixtures, allows two to five instruments, and
assigns built-in EMA Trend or EMA Crossover strategies to each instrument.

The panel exposes initial capital, sizing, commission, slippage, gross
exposure, active-position, minimum-cash, and drawdown controls. Run results show
shared-account metrics, per-instrument contributions, order/trade/equity
ledgers, and JSON/CSV downloads. A result is never placed into the chart
workspace or treated as live/paper trading.

Named Studio workspace Save/Load/Import/Export stores only validated portfolio
configuration. It does not store candle history, Worker handles, progress,
results, credentials, or subscriptions. On restore, the deterministic fixture
is reacquired by the panel. Older workspaces without a `portfolioBacktest`
field remain valid.

The panel first attempts `createPortfolioBacktestWorker()`. Some hosts and
development bundlers do not serve module Worker dependency assets correctly; in
that case the UI shows a notice and runs the identical synchronous reference
engine on the main thread. This visible fallback is a host integration aid, not
a claim that Worker execution is available in every deployment.

For application-owned data and custom trusted strategies, use the framework-
independent API documented in `docs/api/portfolio-backtesting.md` and supply
your own `PortfolioInstrumentInput` values. Do not treat deterministic fixtures
or backtest metrics as market forecasts.
