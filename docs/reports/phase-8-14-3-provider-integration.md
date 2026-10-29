# Phase 8.14.3 — Provider Integration Verification

Date: 2026-10-30

## Scope

The framework-independent package remains provider-neutral. Provider-specific
code is isolated in `examples/vanilla/binance-datafeed.js` and the private
Next.js Studio's optional Binance source. Neither path is exported as a core
package dependency, and no credentials are accepted or persisted.

## Implemented integration path

The optional Binance example maps the documented public REST kline response and
public WebSocket kline events to the existing `Datafeed` contract. It provides:

- explicit Binance interval validation and symbol metadata;
- bounded REST pagination using at most 100 requests of 1,000 rows;
- integer UTC millisecond timestamps and validated OHLCV normalization;
- last-write-wins deduplication for overlapping pages;
- exclusive `[from, to)` filtering;
- abort checks, provider error propagation, and WebSocket cleanup;
- the existing bounded `WebSocketDatafeed` reconnect/status behavior.

The Studio source selector keeps deterministic demo fixtures as the default and
offers the provider only as an explicit optional source. Studio workspaces
persist only the serializable source identifier (`demo` or `binance`), never a
transport, endpoint credential, or socket object.

## Offline evidence

`tests/browser/provider-examples.spec.ts` injects all transports and blocks
external requests. The Binance fixture exercises a 1,001-row result over two
REST pages, timestamp/OHLCV normalization, duplicate-safe ordering, WebSocket
parsing, and unsubscribe cleanup. The generic REST/WebSocket fixtures remain
offline as well.

The provider path therefore has deterministic contract evidence without making
network access a test prerequisite.

## Live-provider status

Live Binance connectivity is **NOT VERIFIED** in the managed cloud environment.
No DNS, CORS, geographic, TLS, or provider-security restriction was bypassed,
and no external result is presented as a passing test. Applications that need
reliable production access should own the provider endpoint, authentication,
regional routing, and server-side CORS/security policy outside OpenKline.

## Remaining limitations

The example is a reference adapter, not a guarantee of Binance availability or
market-data licensing. Provider calendars, rate limits, symbol availability,
and exchange-specific authentication remain application responsibilities.
