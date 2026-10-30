# Portfolio execution architecture

Phase 12 adds a portfolio layer beside the existing single-symbol backtest
engine. The synchronous `PortfolioBacktestSession` is the financial reference;
the Worker is only an execution transport and does not implement a second
accounting model.

```text
PortfolioBacktestOptions
  ├─ normalize instruments and duplicate timestamps
  ├─ evaluate each trusted StrategyRegistry instance causally
  ├─ build canonical market/bar/order/valuation timeline
  ├─ execute one shared cash ledger and long-only positions
  ├─ mark using causal completed-close/execution prices
  └─ calculate portfolio and per-instrument metrics
        │
        ├─ createPortfolioBacktest().run()
        └─ createPortfolioBacktestWorker()
             └─ versioned serializable protocol → same reference engine
```

## Timeline and causal boundary

Each source candle is evaluated only as a completed bar. Its signal has an
`availableAt` equal to the candle open plus the fixed timeframe duration. The
engine selects the first later or equal eligible opening for a fill. Missing
timestamps are not filled synthetically. Equal-time events use the fixed
priority `market-open`, `bar-complete`, `order-fill`, `valuation`, then stable
instrument/order/event IDs. This makes input order irrelevant and keeps
replay/as-of use cases free of future bars.

## Shared ledger

The account has one quote-currency cash balance, reserved/available cash,
realized P&L, causal unrealized P&L, exposure, high-water equity, drawdown, and
one optional long position per instrument. Entry sizing can be fixed quantity,
fixed notional, percent equity, or target weight. Commission and slippage are
applied at execution. The initial model rejects shorts and leverage and does
not convert currencies. Risk rejection is recorded as an order with a stable
reason; it does not mutate cash or positions.

No synthetic end-of-data close is created. Open positions are reported with
their mark quality and valuation status. A caller choosing
`valuation.incomplete: "reject"` receives a validation/lifecycle failure when
complete marks are unavailable rather than an invented result.

## Worker ownership and cancellation

The Worker protocol carries a defensive JSON-compatible options clone, request
ID, and generation. The handler creates a built-in registry per run, forwards
throttled progress, and disposes the reference session in a `finally` path.
The host accepts only matching request/generation responses. Cancellation,
supersession, timeout, Worker crash, malformed messages, and host disposal
terminate the Worker and reject the active promise. No partial portfolio result
is retained.

The browser Studio attempts the Worker first. If a host cannot serve the module
Worker artifact, it reports that condition and uses the same synchronous public
engine for the deterministic offline fixture. This fallback is intentionally
visible and does not change the library Worker contract.

## Workspace boundary

Studio workspace persistence stores only `PortfolioBacktestWorkspaceDocument`.
It is bounded to at most five instruments and validates IDs, strategies,
JSON-compatible parameters, sizing, costs, risk limits, and valuation age.
Candles are reacquired from the consumer's data source; results and exports are
operator actions, not hidden workspace state. Older Studio documents omit the
optional portfolio field and continue to parse unchanged.
