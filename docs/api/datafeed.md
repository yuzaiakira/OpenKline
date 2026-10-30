# Datafeed API

The core `Datafeed` contract is vendor-neutral:

```ts
interface Datafeed {
  resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo>;
  getBars(query: GetBarsQuery): Promise<readonly Candle[]>;
  subscribeBars?(args: SubscribeBarsArgs): () => void;
}

`SubscribeBarsArgs` remains unchanged for compatibility. Consumers that need
transport lifecycle information may pass the additive
`DatafeedRealtimeSubscriptionArgs` shape, which adds an optional `onStatus`
callback. It reports provider-observable `connecting`, `connected`,
`reconnected`, `disconnected`, `error`, and `stopped` transitions. Existing
providers that cannot observe transport lifecycle events may omit it; consumers
should expose explicit `ComparisonDatafeedController.backfill()` recovery in
that case.
```

All timestamps exposed by the core are non-negative integer UTC milliseconds.
Historical results are ordered and validated. An update may replace an
existing timestamp or insert a correction before later bars.

## In-memory provider

`InMemoryDatafeed` is deterministic and useful for tests and examples. Its
`pushBar` method exercises correction and subscription behavior without
credentials or network access.

`Chart.setDatafeed(datafeed, query)` calls `resolveSymbol` before
`getBars`. Resolution is a lifecycle validation step; the returned symbol
metadata remains application-owned and does not turn the chart into a provider
registry. If a stale request is stopped, destroyed, or replaced while symbol
resolution or history is pending, the result is ignored.

## Calendar-aware coverage and recovery

`createComparisonDatafeedCalendarCoverage(calendar, intervalMs)` adapts a
resolved `TradingCalendarEngine` to `ComparisonDatafeedAsset.coverage`. The
controller then checks only source openings that fit wholly inside an open
session segment. Scheduled breaks, holidays, early closes, and overnight/DST
boundaries are not reported as missing provider data. A missing expected
opening is reported as an incomplete coverage range and can be repaired with
the existing bounded `backfill()` API.

```ts
import {
  ComparisonDatafeedController,
  createComparisonDatafeedCalendarCoverage,
} from "openkline";

controller.registerAsset({
  id: "market",
  symbol: "MARKET",
  timeframe: "1h",
  datafeed,
  coverage: createComparisonDatafeedCalendarCoverage(calendar, 60 * 60 * 1000),
});
```

The calendar adapter is provider-neutral and does not synthesize candles. It
uses the calendar version supplied by the host for the current runtime; hosts
must persist and audit that ID/version when historical reproducibility matters.
If schedule enumeration exceeds its configured `maxGapIntervals` bound or
returns invalid data, coverage becomes `uncertain` and recovery does not claim
that a gap is confirmed. The controller retains stale-response cancellation,
last-write-wins corrections, bounded retries, and disposal cleanup.

## REST adapter

`RestDatafeed` expects pages shaped like `{ bars, next }`, where `next` is a
cursor or absolute URL. It:

- sends symbol, timeframe, range, and cursor query parameters;
- follows pages up to `maxPages`;
- accepts numeric seconds, numeric milliseconds, or parseable date strings;
- validates OHLCV values, sorts the result, and applies last-write-wins
  duplicate correction;
- passes `AbortSignal` to every request and checks it between pages.

### Pagination security

The initial request and absolute pagination URLs must use `http` or `https`.
Absolute `next` links default to the `baseUrl` origin; an untrusted origin,
protocol-relative foreign URL, unsafe protocol, repeated page URL, malformed
page, and redirect loop are rejected before the next request. Fetch requests
use `redirect: "manual"`; same-origin redirects are followed only after their
target is validated, and unexpected cross-origin redirects are rejected.

Set `trustedPaginationOrigins` only for a provider whose pagination endpoint is
known and approved. Configured `headers` are sent to `baseUrl` by default but
are **not** forwarded to a trusted foreign origin unless
`forwardHeadersToTrustedOrigins: true` is explicitly selected. This avoids
leaking credentials through a server-controlled `next` URL. `maxRedirects`
defaults to five. These controls preserve cursor pagination, timestamp
normalization, deterministic deduplication, and `AbortSignal` semantics.

Inject `fetcher` for a deterministic mock or map the response in a thin vendor
adapter. The core does not know vendor authentication or response formats.

## WebSocket adapter

`WebSocketDatafeed` delegates historical bars to another `Datafeed` and maps
stream messages to `{ symbol, timeframe, candle }` by default. Supply
`createSubscribeMessage` and `parseMessage` for a vendor protocol. It provides:

- bounded exponential reconnect backoff;
- resubscription after reconnect;
- validation and duplicate suppression while preserving out-of-order
  corrections;
- `onError` delivery for invalid messages and socket failures;
- idempotent unsubscription and socket cleanup.

Inject `createSocket` in tests. Production applications should supply a socket
implementation appropriate to their browser or runtime.

## Consumer examples

The repository includes standalone consumers for [direct local data](../guides/direct-data-input.md),
[offline JSON](../guides/offline-usage.md), [custom exchanges](../guides/integrating-with-your-exchange.md),
and generic REST/WebSocket transports. The optional
[Binance example](../guides/optional-binance-example.md) is outside the core
package and is never initialized by importing `openkline`.

## Corporate-action datafeeds

Corporate actions use a separate provider-neutral `CorporateActionDatafeed`
contract so a bar provider does not have to own issuer-event semantics. The
in-memory and bounded REST reference adapters validate stable event IDs,
revisions, source identity, timestamp boundaries, and instrument association.
Attach the resulting `CorporateActionDataset` to a chart with
`setCorporateActions()`. The chart keeps raw candles canonical and derives
the selected display projection. A consuming application must declare whether
its source is known or has incomplete knowledge coverage; the core never
inventories exchange events or guesses missing corrections.
