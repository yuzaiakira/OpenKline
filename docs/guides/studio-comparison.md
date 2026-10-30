# Studio asset comparison

The private Next.js Studio reference consumer exposes **Compare assets** below
the chart toolbar. It uses deterministic local fixtures for BTC-USD, ETH-USD,
and AAPL, so the workflow does not require exchange credentials.

1. Choose the active chart and click **Compare assets**.
2. Select **Percentage change** or **Indexed · base 100**.
3. Choose a UTC baseline from the deterministic fixture options. The latest
   observation at or before that timestamp is used for each asset, subject to
   the displayed freshness window; no future bar is used.
4. Add or remove non-primary assets with the checkboxes. The primary symbol is
   always included and remains the source of the chart's ordinary market data.
5. Use the chart crosshair to inspect normalized values in the comparison
   legend. Exit comparison to restore the previous presentation, price-scale
   configuration, and ordinary series visibility.

Comparison lines share the active chart viewport and are replay-aware. Raw
OHLC, indicators, drawings, and datafeed state are not overwritten. During
replay, the chart's inclusive cutoff also limits comparison observations and
controls are disabled where a structural or future-data mutation would be
unsafe.

The Studio's deterministic demo source uses the public controller in
`realtimeWindowMode: "follow"`. **Advance demo stream** appends a new bar
without rebuilding the historical request. **Simulate disconnect** suppresses
delivery while retaining provider history, and **Reconnect and recover** emits
the lifecycle event that requests the missed `[frontier, target)` interval.
These controls are offline regression fixtures, not market data. The displayed
per-asset status distinguishes `disconnected`, `recovering`, and incomplete
bounded recovery from a connected/freshness claim.

The optional provider source uses only explicitly mapped Binance symbols
(BTC-USD and ETH-USD in this Studio). Unsupported symbols such as AAPL are
reported as provider errors rather than being silently renamed to a plausible
exchange symbol. External connectivity remains optional and unverified.

Comparison settings are included in a `StudioWorkspaceDocument` when present:
mode, baseline timestamp, freshness window, active state, and ordered asset
IDs. Older documents omit this optional field and continue to load unchanged.
Import remains schema-validated; duplicate or empty asset IDs are rejected.

This page describes the private example host, not a new React dependency in the
core package. Applications using the public library should compose
`ComparisonEngine` with their own chart, legend, persistence, and datafeed
adapters.
