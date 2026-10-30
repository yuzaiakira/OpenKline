# Studio order-flow walkthrough

OpenKline Studio exposes the public order-flow APIs in the **Order Flow &
Market Depth** panel. The panel is available on the real multi-chart Studio
route (`/`) and is intentionally provider-neutral.

The default Studio session uses deterministic offline illustration fixtures:

- trade prints include buy, sell, and unknown aggressor-side records;
- Level-2 data includes a snapshot followed by an absolute delta;
- the fixture source IDs are `studio-illustrative-order-flow` and
  `studio-illustrative-depth`;
- the values are not observed exchange transactions and must not be used for
  trading or execution decisions.

The panel supports:

- Footprint visibility backed by actual trade prices and explicit tick policy;
- a CVD pane with continuous or calendar-backed session reset;
- depth bars and the optional non-interpolating liquidity heatmap;
- coverage, order-book status, best bid/ask, spread, and imbalance summaries;
- bounded Time & Sales records sorted by event time.

## Provider integration

Applications should attach their own validated `MarketTradeDatafeed` and
`OrderBookDatafeed` through the `Chart` API. The core requires explicit
instrument/source identity, event timestamps, and aggressor uncertainty. It
does not infer buy/sell volume from candle colour or OHLCV volume. A provider
must also supply an exchange calendar before session-reset CVD can claim
session semantics.

For a custom application, use the same lifecycle pattern as the panel:

```ts
chart.setMarketTrades(trades);
chart.setFootprintOptions({ visible: true, tickSize: 0.01, intervalMs: 60_000 });
chart.setCvdOptions({ visible: true, reset: "continuous", pane: "new" });
chart.setDepthOptions({ visible: true, maxLevels: 10 });
chart.setOrderBookSnapshot(snapshot);
```

Use `setMarketTradeSource` and `setOrderBookSource` when historical loading,
stale-response cancellation, and live cleanup should be managed by the chart.
Call `removeOrderFlow()` during an explicit source replacement when a provider
restarts sequence numbers or changes instrument/source identity.

Workspace serialization stores canonical source references and display
settings only. Raw trades and live book state are not serialized. The host is
responsible for reattaching a matching source after restore; Studio reattaches
its deterministic fixtures for demonstration and keeps the disclaimer visible.

See [Order-flow data contracts](../api/order-flow.md), [Market depth
contracts](../api/market-depth.md), and [Replay API](../api/replay.md) for
causality and lifecycle details.
