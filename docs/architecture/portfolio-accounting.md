# Backtest portfolio accounting

Phase 8 starts with one instrument and one net position. Account values are
kept in the strategy's account currency and are deterministic floating-point
observations; no hidden rounding is applied.

## State and identities

The engine maintains:

- available cash;
- signed position quantity (positive long, negative short);
- average entry price and entry commission for the open position;
- realized P&L from completed trades;
- unrealized P&L at each candle close;
- mark-to-market position value; and
- equity, high-water mark, and drawdown.

For a long position of quantity `q`:

```text
position value = q * mark price
unrealized P&L = (mark price - entry price) * q
equity = cash + position value
```

For a short position the signed position value and P&L use the opposite sign:

```text
position value = -q * mark price
unrealized P&L = (entry price - mark price) * q
equity = cash + position value
```

Opening fees are deducted from cash and retained on the open position. Closing
a position records gross P&L and subtracts both entry and exit fees for net
P&L. An open position is marked at the last available close and is not counted
as a completed trade.

## End of data and limitations

The initial end-of-data policy is `mark-to-market-no-liquidation`. It never
creates a synthetic exit or treats an open trade as a win. There is no leverage,
financing, borrow-cost, multi-asset portfolio, currency conversion, tax,
settlement, or exchange-session model. These limitations are part of the
serialized assumptions and must remain visible in user-facing reports.
