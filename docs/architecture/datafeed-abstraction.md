# Datafeed abstraction

`Datafeed` is an optional, provider-neutral lifecycle contract. It lets an
application keep market-data acquisition outside the chart while preserving
the same chart, indicator, drawing, replay, and cleanup APIs used by direct
data input.

```ts
interface Datafeed {
  resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo>;
  getBars(query: GetBarsQuery): Promise<readonly Candle[]>;
  subscribeBars?(args: SubscribeBarsArgs): () => void;
}
```

`InMemoryDatafeed` is a deterministic local reference implementation.
`RestDatafeed` and `WebSocketDatafeed` are generic adapters whose transport,
URL, payload normalization, and credentials are supplied by the application.
They are not vendor integrations and are not used by `createChart` unless the
consumer explicitly calls `setDatafeed`.

## Lifecycle

1. The application constructs or injects a datafeed.
2. `chart.setDatafeed(datafeed, query)` resolves the symbol, loads the bounded
   historical interval, validates the returned candles, and installs the
   optional subscription.
3. A subscription may deliver a newer bar or a correction for an existing
   timestamp. `Chart.update` preserves the existing ordered-store semantics.
4. `stopDatafeed()` or `destroy()` invalidates stale loads and calls the
   unsubscribe function exactly once.

All asynchronous acquisition accepts cancellation where the contract exposes
an `AbortSignal`. The chart owns the session boundary but not the transport;
the application remains responsible for authentication, server policy,
pagination endpoints, retries, and provider-specific payloads.

## Provider-neutral rules

Adapters must normalize timestamps to integer UTC milliseconds, validate OHLCV
relationships and volume, preserve corrections, and never fabricate missing
bars. A provider may use any symbol namespace or backend. Binance, Alpaca,
OANDA, and hosted OpenKline services are not special cases in the core API.

See [the public Datafeed API](../api/datafeed.md),
[direct data input](../guides/direct-data-input.md), and
[custom exchange integration](../guides/integrating-with-your-exchange.md).
