# Studio Market Screener

The private Next.js Studio exposes the Phase 8.3 screener under the Market
Screener panel. It uses the public, framework-independent screener contracts
with the credential-free deterministic demo provider. Demo results are not
exchange prices and never create alerts, orders, paper trades, or broker
actions.

## Run a scan

1. Select a Watchlist universe and one timeframe.
2. Choose the close threshold. Optionally add an SMA, EMA, or RSI threshold
   and choose `AND` or `OR` for the nested rule group.
3. Choose **Run scan**. Progress, matched/unmatched/unavailable state, source
   bar, and diagnostics are shown in the table.
4. Search, filter, sort, open a matching symbol in the active chart, or mark
   it as a Watchlist favorite.

Developing bars are not eligible for the default evaluation. `unavailable` is
intentional and can indicate warm-up, missing volume, invalid data, or a
provider error; it is not presented as a successful match.

## Watch mode

**Watch** starts `ScreenerWatchSession` after the initial snapshot. **Pause**,
**Resume**, **Cancel**, and **Step demo** exercise the real session lifecycle.
Confirmed append events use the existing indicator incremental instances;
duplicate events are suppressed, and corrections recalculate only the
affected instrument. The demo step is a deterministic simulated event, not a
live market connection.

## Presets

Presets are versioned JSON state separate from workspace documents. Save/load
keeps the selected watchlist, timeframe, rules, and display name together.
Exported presets contain no callbacks, providers, credentials, sockets, or
browser storage assumptions. Validate imported JSON before using it and keep
the current configuration if import is rejected.

