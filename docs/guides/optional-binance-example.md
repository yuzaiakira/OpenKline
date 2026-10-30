# Optional Binance example

`examples/vanilla/binance-datafeed.js` re-exports the shared example adapter
from `examples/shared/binance-datafeed.js`. It is an opt-in demonstration of mapping
Binance public REST klines and public WebSocket kline events to OpenKline's
generic `Datafeed` contract. It is not imported by the root package, does not
ship credentials, and does not make Binance a supported core dependency.

The example validates the configured Binance interval, requests the public
`/api/v3/klines` endpoint in bounded pages of at most 1,000 rows, fails rather
than silently truncating a range when the configured page bound is exceeded,
normalizes timestamps and OHLCV values, deduplicates overlapping page results,
and keeps the requested `[from, to)` range. The WebSocket adapter uses the
public kline stream, rejects other symbols or intervals, and inherits bounded
reconnect and unsubscribe behavior from `WebSocketDatafeed`.

The private Studio consumes the same adapter and exposes only explicit
BTC-USD→BTCUSDT and ETH-USD→ETHUSDT mappings for its provider source. An
unsupported Studio asset is surfaced as an asset error; it is not presented as
a valid Binance instrument.

Open the standalone page and click its explicit connect button to opt into the
public network endpoints. The page may fail when the network, CORS policy, or
Binance service is unavailable; that does not affect offline OpenKline usage.
The fixture mode in the browser test injects REST and WebSocket transports and
verifies pagination, timestamp/OHLCV normalization, duplicate handling, and
subscription cleanup without making an external request. No real Binance
connectivity claim is made by local tests. A blocked network, CORS policy,
regional restriction, or provider outage is an expected optional-provider
failure and does not change offline OpenKline behavior.

Applications needing Binance authentication, regional routing, persistence,
or secrets must keep those concerns in their own backend or adapter. Do not
embed credentials in a browser bundle.
