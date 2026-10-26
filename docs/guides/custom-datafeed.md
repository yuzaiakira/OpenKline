# Custom Datafeed

Use a `Datafeed` when the application owns a symbol service, exchange API,
database, or WebSocket transport. The adapter is injected; OpenKline does not
discover providers or make a request on its own.

```ts
const datafeed: Datafeed = {
  async resolveSymbol(symbol, signal) {
    return exchange.resolveMarket(symbol, signal);
  },
  async getBars(query) {
    return exchange.getHistoricalCandles(query);
  },
  subscribeBars({ symbol, timeframe, onBar, onError }) {
    return exchange.subscribeCandles(symbol, timeframe, onBar, onError);
  },
};

await chart.setDatafeed(datafeed, {
  symbol: "ACME-USD",
  timeframe: "1h",
  from: startTime,
  to: endTime,
});
```

`setDatafeed` resolves the symbol before requesting history. Returned candles
must use UTC integer milliseconds and valid OHLCV values. Updates may append a
new timestamp or correct an existing timestamp. `stopDatafeed()` and
`destroy()` invalidate pending requests and dispose the subscription.

The [custom exchange example](../../examples/vanilla/custom-datafeed.html) is
fully deterministic and uses an injected in-memory transport. It does not
contact Binance, OpenKline, or any backend. Replace that fake transport with
your own authorized exchange/backend implementation in the consuming
application.
