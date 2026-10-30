# Order-flow data contracts

OpenKline treats trade prints as an optional market-data domain. They do not
replace the chart's OHLCV candle source. `MarketTrade.time` is the UTC event
timestamp; `receiveTime` is optional transport metadata and is never used as an
event timestamp implicitly.

Each print carries a stable `id`, instrument and optional venue identity,
positive execution `price` and base-asset `quantity`, source `{ id, version }`,
and an explicit `aggressorSide`: `buy`, `sell`, or `unknown`. Unknown-side
volume remains unknown. Candle colour, OHLCV volume, and a missing provider
classification are not valid substitutes for executed buy/sell volume.

`sideQuality` distinguishes source-observed classification from a host-labelled
estimate. An estimate must still be produced by an explicitly supplied host
algorithm; the core never derives it from candles.

`MarketTradeStore` is correction-aware and bounded. A higher `revision`
replaces an earlier print with the same stable ID; an exact duplicate is
ignored. Reads are defensive, sorted by event time/sequence/ID, and can be
bounded by an as-of timestamp. `InMemoryMarketTradeDatafeed` is a deterministic
offline provider for tests and examples.

Range reads use a lazily maintained chronological index and binary time bounds.
This keeps the defensive-copy contract while avoiding a full-history filter and
sort for every visible-window query. Out-of-order inserts and revisions
invalidate the index; the next read rebuilds it deterministically.

Trade coverage reports known-side volume, unknown-side volume, time bounds,
completeness, and a source note. Coverage metadata is required before a
consumer describes CVD or Footprint output as exhaustive.

## Chart integration

`Chart.setMarketTrades` replaces the bounded trade-print store and
`Chart.updateMarketTrade` inserts or revises one print. `getMarketTrades` and
`getTimeAndSales` return defensive event-time-ordered records; an explicit
`asOfTime` applies even when no range is supplied. `setMarketTradeSource`
loads a historical result with an `AbortSignal`, ignores stale responses, and
cleans up its optional live subscription on replacement or chart destruction.

`setFootprintOptions` controls the chart-native overlay. `setCvdOptions`
controls the derived line series and its pane. A session reset is only
causal when an explicit `TradingCalendarEngine` is attached to the chart;
otherwise the CVD result is unavailable rather than split at an assumed UTC
boundary. `getOrderFlowState` exposes the current bounded trade coverage,
Footprint, CVD, depth state, and depth metrics without exposing renderer
internals. The chart overlay reads only the visible event-time window and
caches its deterministic Footprint result by data revision, viewport, replay
cutoff, and aggregation options; a viewport render therefore does not repeat a
full-history snapshot when the visible window is unchanged.

`CumulativeVolumeDeltaCalculator` keeps a cached result, applies strictly
chronological appends to the affected bucket, and falls back to a full
deterministic rebuild for corrections, out-of-order events, option changes, or
as-of boundaries. `CvdResult` remains the complete analytical result. Canvas
line rendering may apply a first/min/max/last per-pixel-column visual LOD while
retaining the complete series for queries and tooltips. High-frequency chart
trade and depth mutations update state synchronously but coalesce their visual
commit to one animation frame; destruction cancels that pending frame.
