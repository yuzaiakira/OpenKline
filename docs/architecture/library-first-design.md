# Library-first design

OpenKline is a framework-independent JavaScript/TypeScript charting and
analysis library. The application that embeds it owns the market data, symbol
permissions, credentials, persistence, network transport, and user interface.

## Boundary

```text
Consumer application
  ├─ local arrays/files/database
  ├─ own exchange/backend adapter
  ├─ generic REST/WebSocket adapter
  └─ optional example provider adapter
          │ supplies validated candles
          ▼
OpenKline chart, indicators, drawings, replay, analysis, and simulation
```

The core package does not require a provider, backend, cloud account, API key,
user account, database, internet connection, React, or Next.js. Importing the
core package does not create a network request. Browser APIs are accessed only
when the consumer constructs the DOM-backed `Chart`; calculation, persistence,
datafeed contracts, indicators, replay, screener, backtesting, and paper
trading models remain framework-neutral.

## Data ownership

Consumer data stays in the consumer process. OpenKline does not upload candles,
collect telemetry, authenticate users, or choose a storage service. A host may
explicitly supply a `Datafeed`, REST fetcher, WebSocket factory, persistence
store, or Worker boundary, but those are application-owned choices.

Direct `chart.setData(candles)` and `chart.update(candle)` are the smallest
integration surface. A custom `Datafeed` is an optional lifecycle adapter for
applications that want symbol resolution, historical loading, and streaming.

## Optional integrations

Provider examples are kept under `examples/` and are not imported by the root
package. A provider adapter may depend on OpenKline, never the reverse. The
optional Binance example is a public-market-data demonstration only; it does
not establish a supported vendor dependency, ship credentials, or change the
core architecture.

The private Next.js Studio is a reference consumer. Its deterministic demo
provider, Watchlists, and UI controls are not part of the package's required
runtime or data boundary.

## Non-negotiable invariants

- No automatic third-party request or provider initialization.
- No mandatory backend, cloud service, or framework.
- No provider-specific identity or rate-limit assumptions in chart APIs.
- All advanced features consume supplied data rather than acquiring it.
- Host-owned network and storage behavior is explicit and disposable.
- Browser and device support claims are made only from executed tests.
