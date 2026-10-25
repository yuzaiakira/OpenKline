# Datafeed API

The core `Datafeed` contract is vendor-neutral:

```ts
interface Datafeed {
  resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo>;
  getBars(query: GetBarsQuery): Promise<readonly Candle[]>;
  subscribeBars?(args: SubscribeBarsArgs): () => void;
}
```

All timestamps exposed by the core are non-negative integer UTC milliseconds.
Historical results are ordered and validated. An update may replace an
existing timestamp or insert a correction before later bars.

## In-memory provider

`InMemoryDatafeed` is deterministic and useful for tests and examples. Its
`pushBar` method exercises correction and subscription behavior without
credentials or network access.

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
