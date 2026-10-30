# Provider-backed comparison datafeed API

`ComparisonDatafeedController` is a framework-independent coordinator for
driving the public `ComparisonEngine` from several provider-neutral `Datafeed`
instances. It does not know exchange protocols, credentials, React, or chart
objects. Use one controller per comparison view or per independently owned
data lifecycle.

## Historical and realtime window semantics

`window` is the historical acquisition/display request and retains its
exclusive `[from, to)` meaning. The default `realtimeWindowMode: "fixed"`
keeps normalized output inside that range, even when a provider delivers a
newer realtime candle; the newer candle remains available through raw
acquisition state. Opt into `realtimeWindowMode: "follow"` for a live view:
accepted realtime and recovered candles at or after the original `to` extend
normalized output for that asset without reloading historical data or changing
the original request window.

```ts
const liveComparison = new ComparisonDatafeedController({
  window: { from, to },
  mode: "percentage",
  realtimeWindowMode: "follow",
});
```

Follow mode tracks a monotonic recovery frontier per asset. An older
out-of-order correction can replace its timestamp but cannot move that frontier
backward. `setReplayCutoff()` is applied after the window policy, so raw data
can continue arriving while replay hides every point newer than the inclusive
cursor. Exiting replay restores the current follow view.

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
last-write-wins semantics. When a freshness-limited baseline is configured,
the acquisition lower bound is `min(window.from, baseline.time - maxAgeMs)`
with safe non-negative UTC arithmetic. Baseline-supporting candles are retained
in `getRawCandles()` but are not emitted as visible comparison points outside
the configured window. It never fabricates candles for closures or missing
sessions.

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

### Coverage and calendars

An asset may provide an optional schedule policy:

```ts
comparison.registerAsset({
  id: "BTC-USD",
  symbol: "BTCUSD",
  timeframe: "1m",
  datafeed: btcFeed,
  coverage: { kind: "continuous", intervalMs: 60_000 },
});

const coverage = comparison.getState().assets[0]?.coverage;
// coverage.completeness: "complete" | "incomplete" | "uncertain" | "empty"
```

`continuous` policies model fixed slots. A `sessions` or `sparse` policy can
provide `isExpectedTime` to exclude known closures or irregular schedules. With
no sufficient policy, coverage is `uncertain`; the coordinator does not infer
that a missing fixed-timeframe bar is a provider failure. Coverage reports the
visible requested range, observed range, missing intervals, calendar
knowledge, and whether recovery was attempted.

### Bounded historical recovery

`backfill()` requests only confirmed missing intervals by default. Consumers
may pass explicit ranges when a provider has no observable connection
lifecycle:

```ts
const recovery = await comparison.backfill({
  maxRanges: 16,
  maxAttempts: 3,
  maxConcurrency: 2,
  retryBackoffMs: 100,
});
```

Retries, ranges, concurrency, cancellation, and disposal are bounded. Equal
timestamps use the same correction rule as initial history. A live candle
received while a recovery request is pending is authoritative for that
timestamp, so an older historical response cannot overwrite it. A failed
recovery remains visible in `coverage.recovery`, `recovery.lastError`, and the
per-asset status; no market closure is filled automatically.

## Realtime lifecycle and cancellation

After a successful history load, the controller subscribes independently to
each feed that implements `subscribeBars`. Equal-timestamp updates replace
the existing candle; out-of-order updates are inserted chronologically. An
identical duplicate is ignored. Invalid events and provider errors affect only
the corresponding asset and cannot corrupt its stored candles.

The additive `DatafeedRealtimeSubscriptionArgs.onStatus` callback is optional.
Providers such as `WebSocketDatafeed` report `connecting`, `connected`,
`reconnected`, `disconnected`, `error`, and `stopped`. When a reconnect is
observable, a follow-mode controller requests `[frontier, target)` recovery
instead of stopping at the original historical upper bound. `target` comes
from `recoveryNow()` (default `Date.now()`), and the automatic request is
bounded by `maxRecoveryRangeMs` (default seven days). A bounded recovery is
reported as incomplete in the per-asset error/recovery state; callers can use
manual `backfill()` for an older interval. A provider that cannot expose
lifecycle events remains safe; the application can call `backfill()`
explicitly.

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

Recovery merges preserve the conflict policy: a timestamp received from the
live subscription is authoritative over an older historical response. Request
generations and abort signals prevent cancelled, replaced, or disposed
controllers from mutating current state. Recovery uses a valid exclusive upper
bound and does not issue a request when the target is not ahead of the known
frontier.

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
validated load. Changing mode is synchronous. Changing a baseline is
synchronous when the retained acquisition range is sufficient; if the new
freshness window precedes retained history, the controller starts a validated
reload automatically. Applications may still call `load()` explicitly when
they need to coordinate the refresh with other state.

The private Next.js Studio uses this public controller with deterministic
`InMemoryDatafeed` instances. Those fixtures demonstrate the integration
offline and are not claims of live exchange connectivity.
