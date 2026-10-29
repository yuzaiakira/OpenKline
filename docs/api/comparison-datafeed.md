# Provider-backed comparison datafeed API

`ComparisonDatafeedController` is a framework-independent coordinator for
driving the public `ComparisonEngine` from several provider-neutral `Datafeed`
instances. It does not know exchange protocols, credentials, React, or chart
objects. Use one controller per comparison view or per independently owned
data lifecycle.

## Register and load several assets

Each asset supplies its own `Datafeed`, symbol, and timeframe. Timeframes may
differ explicitly; the controller still uses one UTC historical request window.
The `to` bound remains exclusive, matching `Datafeed.getBars`.

```ts
import {
  ComparisonDatafeedController,
  RestDatafeed,
} from "openkline";

const btcFeed = new RestDatafeed({
  baseUrl: "https://prices.example.test",
  symbols: { BTCUSD: { symbol: "BTCUSD", timezone: "UTC", pricePrecision: 2 } },
});
const ethFeed = new RestDatafeed({
  baseUrl: "https://prices.example.test",
  symbols: { ETHUSD: { symbol: "ETHUSD", timezone: "UTC", pricePrecision: 2 } },
});

const comparison = new ComparisonDatafeedController({
  window: { from: Date.UTC(2026, 0, 1), to: Date.UTC(2026, 1, 1) },
  mode: "percentage",
  // A baseline before `window.from` extends each historical request so a
  // valid at-or-before observation can establish the baseline.
  baseline: { time: Date.UTC(2026, 0, 1), maxAgeMs: 24 * 60 * 60 * 1000 },
});

comparison.registerAsset({
  id: "BTC-USD",
  symbol: "BTCUSD",
  timeframe: "1h",
  datafeed: btcFeed,
  color: "#f59e0b",
});
comparison.addAsset({
  id: "ETH-USD",
  symbol: "ETHUSD",
  timeframe: "4h",
  datafeed: ethFeed,
  color: "#60a5fa",
});

const result = await comparison.load();
if (result.status === "ready" || result.status === "partial") {
  for (const line of comparison.getNormalizedData()) {
    // Render `line.data` using the host chart's ordinary line-series API.
    console.log(line.id, line.data.length);
  }
}
```

`resolveSymbol` is called before `getBars` for every asset. Historical candles
are validated, filtered to `[from, to)`, sorted, and deduplicated with
last-write-wins semantics. If the baseline is earlier than `from`, the
controller requests from the baseline timestamp. It never fabricates candles
for closures or missing sessions.

## State and partial failures

`getState()` exposes an overall `idle`, `loading`, `ready`, `partial`,
`empty`, `error`, or `disposed` state and a status for every registered asset.
An asset failure does not discard successful assets. Empty history is reported
as `empty`, while a failed resolution or history request is reported as
`error` with a bounded error message.

Subscribe to lifecycle changes when a UI needs to refresh legends or loading
indicators:

```ts
const stopListening = comparison.subscribe((change) => {
  console.log(change.kind, change.assetId);
});
const state = comparison.getState();
stopListening();
```

The controller retains defensive raw candles through
`getRawCandles(assetId)`. Normalized values are available independently through
`getNormalizedData()` and are never written into the raw candle store.

## Realtime lifecycle and cancellation

After a successful history load, the controller subscribes independently to
each feed that implements `subscribeBars`. Equal-timestamp updates replace
the existing candle; out-of-order updates are inserted chronologically. An
identical duplicate is ignored. Invalid events and provider errors affect only
the corresponding asset and cannot corrupt its stored candles.

```ts
const abort = new AbortController();
const loading = comparison.load({ signal: abort.signal });
// Cancel from a route change, symbol switch, or component cleanup.
abort.abort();
const cancelled = await loading;

await comparison.replaceAsset({
  id: "ETH-USD",
  symbol: "ETHUSD",
  timeframe: "1h",
  datafeed: ethFeed,
});

comparison.removeAsset("BTC-USD");
comparison.dispose();
```

`cancel()` aborts the current historical load without disposing the
coordinator. Removing or replacing an asset invalidates its callback token,
so late provider events cannot recreate or update obsolete state. `dispose()`
is idempotent and releases all active subscriptions and retained engine data.

## Baselines, missing data, and replay

Baseline selection is still performed by `ComparisonEngine` independently for
each asset: the latest observation at or before the requested UTC timestamp is
used, subject to the explicit `maxAgeMs`. A future observation never establishes
an earlier baseline. Different calendars and opening timestamps therefore
remain missing or ineligible rather than being forward-filled.

`setReplayCutoff(timestamp)` masks normalized points newer than the inclusive
cursor while retaining acquired raw data and live subscriptions. Backward
seeks hide those points again, and `setReplayCutoff(null)` restores the current
comparison view. Hosts should call this method from their replay cursor
listener and keep the controller's acquired data separate from replay display
state.

Changing the historical window with `setWindow()` or `setRange()` starts a new
validated load. Changing mode or baseline is synchronous and does not refetch;
if a new baseline precedes the already loaded range, call `load()` again so the
coordinator can acquire the required earlier observation.

The private Next.js Studio uses this public controller with deterministic
`InMemoryDatafeed` instances. Those fixtures demonstrate the integration
offline and are not claims of live exchange connectivity.
