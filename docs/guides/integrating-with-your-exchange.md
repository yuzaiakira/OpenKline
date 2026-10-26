# Integrating with your exchange

An exchange or company backend can implement the public `Datafeed` contract
without adding vendor logic to OpenKline:

```ts
const datafeed: Datafeed = {
  async resolveSymbol(symbol, signal) {
    return companyExchange.resolveMarket(symbol, signal);
  },
  async getBars(query) {
    return companyExchange.getCandles(query.symbol, query.timeframe, query.from, query.to, query.signal);
  },
  subscribeBars({ symbol, timeframe, onBar, onError }) {
    return companyExchange.subscribeCandles({ symbol, timeframe, onBar, onError });
  },
};

await chart.setDatafeed(datafeed, { symbol, timeframe, from, to });
```

The host owns authentication, permissions, retries, rate limits, transport,
and storage. Normalize timestamps to integer UTC milliseconds and validate the
OHLCV boundary before emitting a candle. A stream may replace an existing
timestamp for a correction or append a newer one. Call `stopDatafeed()` when
the symbol or timeframe changes; `destroy()` also cleans up the active
subscription.

The [custom Datafeed guide](custom-datafeed.md) and the deterministic
[custom exchange example](../../examples/vanilla/custom-datafeed.html) show
the complete lifecycle without Binance or an OpenKline backend.
