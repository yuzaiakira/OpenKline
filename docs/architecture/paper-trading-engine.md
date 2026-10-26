# Paper Trading Engine

## Scope

`src/paper-trading/` is a framework-independent virtual spot-account engine.
It is separate from the chart, replay, alert, and strategy runtimes. It does
not connect to a broker and never submits a real order.

The account is single-symbol, long-only, non-leveraged, and supports market
buy/sell orders. An order is accepted into a pending state and can fill only
on a later eligible `fresh` market event. The event used to submit the order
is therefore never reused as its fill.

## Causal event boundary

Each market event has an application id, UTC millisecond timestamp, source,
source sequence, quote status, and explicit simulated/live/replay mode. The
engine rejects replay events, ignores duplicate application ids, and ignores
timestamp or source-sequence regressions. Stale and disconnected quotes are
recorded diagnostically but cannot fill an order or authorize a new order.

The account accepts an injectable clock. Tests and the deterministic stream
use a fixed clock; production hosts should use a clock compatible with the
data source. No historical or restored event is automatically replayed into a
fill.

## Accounting

The engine keeps cash, reserved cash, available cash, position cost basis,
allocated open-entry fees, realized P&L, mark-to-market unrealized P&L,
equity, high-water mark, drawdown, total fees, order audit records, trade
records, and a journal. Commission and adverse slippage use the same pure
mathematics as the backtest engine. Buy orders reserve estimated notional and
fees; the reserve is released before the actual fill-time affordability check.

The snapshot exposes the identity `equity = cash + current market value of
the open long position`. `realizedPnl` is populated only by completed sell
trades. `unrealizedPnl` is gross mark-to-market P&L and `openEntryFees`
remains visible for fee-adjusted reporting.

## Extension boundary

The public order, market-event, risk-limit, listener, and persistence types
are versioned and serializable. Future order types or multi-symbol accounts
must introduce an explicit document version and compatibility policy rather
than silently widening the current market-order assumptions.

