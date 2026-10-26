# Optional Binance example

`examples/vanilla/binance-datafeed.js` is an opt-in demonstration of mapping
Binance public REST klines and public WebSocket kline events to OpenKline's
generic `Datafeed` contract. It is not imported by the root package, does not
ship credentials, and does not make Binance a supported core dependency.

Open the standalone page and click its explicit connect button to opt into the
public network endpoints. The page may fail when the network, CORS policy, or
Binance service is unavailable; that does not affect offline OpenKline usage.
The fixture mode in the browser test injects REST and WebSocket transports and
verifies timestamp/OHLCV normalization and subscription cleanup without making
an external request. No real Binance connectivity claim is made by local tests.

Applications needing Binance authentication, regional routing, persistence,
or secrets must keep those concerns in their own backend or adapter. Do not
embed credentials in a browser bundle.
