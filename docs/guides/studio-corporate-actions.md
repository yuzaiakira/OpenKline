# Studio corporate-action workflow

The private Next.js Studio includes a deterministic, offline **Corporate
Actions & Total Return** panel for exercising the public OpenKline contracts.
It is a consumer example, not a market-data provider.

## Views and event details

The panel can select:

- `Raw OHLCV`, which remains the executable candle domain;
- `Split-adjusted OHLCV`, which applies the selected split volume policy; and
- `Total-return index`, which is an analytical index and is never presented as
  OHLCV or a historical execution price.

The two fixture events (a 2-for-1 split and a cash dividend) are marked on the
chart through the existing overlay path. The event selector exposes effective,
revision, knowledge, and payment fields. The fixture is deliberately labeled
illustrative and uses no credentials or live network data.

The panel also runs a small deterministic portfolio preview with a fixed
10-share entry. It displays post-split quantity, dividend income, cash,
equity, and corporate-action ledger count. This preview is for demonstrating
the accounting contract, not for trading or investment decisions.

## Replay and workspace behavior

While replay is active, view and marker controls are read-only. Future event
markers are masked by the chart replay boundary, and split-adjusted replay
uses the causal action context. The raw action dataset is not rewritten.

Chart workspace serialization stores only the corporate-action source ID and
version, instrument association, selected mode/context/policy, as-of boundary,
and marker visibility. It does not store action datasets, derived candles,
portfolio results, runtime clients, or credentials. If a restored source is
not available, Studio keeps the reference unresolved and warns instead of
silently substituting the illustration. The **Load offline illustration**
button is an explicit user choice.

Provider coverage, corrections, timezone interpretation, dividend
reinvestment conventions, and event completeness must be verified by the host
application before using a production source.

