# Backtesting execution model

The Phase 8 reference backtest is a deterministic, single-symbol historical
execution layer under `src/backtesting`. It consumes strategy signals and does
not render charts, run replay timers, send alerts, or connect to a broker.

## Event order

For every completed candle at index `N`, the engine performs this sequence:

1. Fill eligible orders submitted from signals on bar `N-1` at bar `N.open`.
2. Apply configured adverse slippage and commission.
3. Update cash, position, realized P&L, and the mark-to-market account value at
   `N.close`.
4. Submit signals generated on completed bar `N` for the next bar.

Consequently, a signal at `N` never executes at `N.open`. A signal on the last
bar is recorded but cancelled with an explicit no-next-bar reason. The engine
does not fabricate future candles or fill a final signal at the close.

Signal timestamps and fill timestamps are separate fields in both orders and
the completed trade ledger.

## Supported order model

The initial model supports market intent actions: `enter-long`, `exit-long`,
`enter-short`, and `exit-short`. Orders transition through
`submitted -> pending -> filled`, `rejected`, or `cancelled`; terminal states
cannot transition again. Pyramiding is disabled. Exits in the wrong position
state are rejected.

Short selling is disabled unless `shortSelling.maxNotional` is explicitly
configured. The cap is checked against the simulated execution notional. This
model does not include margin lending, borrow fees, financing, liquidation, or
broker-specific rules. Reversal is explicitly configured as `reject` (the
default) or `close-and-reverse`.

Stop loss, take profit, bracket orders, intrabar path assumptions, partial
fills, and order-book simulation are intentionally deferred. OHLC bars do not
disclose the intrabar order of a stop and target touch; no favorable ordering
is invented here.

## Costs and sizing

Commission and slippage are required options. Each accepts `percent` (a
decimal fraction) or `fixed`. Percent commission is charged on fill notional;
fixed commission is account currency per fill. Percent slippage adjusts the
reference price adversely by that fraction; fixed slippage adjusts the price
by the configured absolute amount. Adjusted prices must remain positive.

The reference engine supports fixed quantity, fixed notional, and a decimal
fraction of available equity. Fractional quantities are rejected unless
`allowFractionalQuantity: true` is explicit. Percentage sizing is evaluated at
the execution price and uses the account equity observed immediately before
the order event.

## Lifecycle

`createBacktest()` validates the historical source, strategy configuration,
costs, and sizing before a run. The synchronous reference `run()` exposes
status/progress, supports cancellation through `AbortSignal` or `cancel()`,
returns no partial result on cancellation, and can be disposed. Worker-backed
execution and an asynchronous UI adapter are later milestones; they must
preserve the same event order and generation isolation.
