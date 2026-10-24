# Chart API

The browser entry point is `createChart(container, options)`. The core data,
scales, and viewport modules do not require React or browser globals; only
chart construction and Canvas2D rendering require a browser.

```ts
import { createChart } from "openkline";

const chart = createChart(document.querySelector("#chart")!, {
  theme: "dark",
  autoSize: true,
  timeZone: "UTC",
  pricePrecision: 2,
});

chart.setData(candles);
chart.update(nextCandle); // replace the same timestamp or insert chronologically
const unsubscribe = chart.subscribe("crosshairMove", console.log);

unsubscribe();
chart.destroy();
```

## Lifecycle methods

- `setData(candles)` replaces the complete validated, strictly ascending
  dataset.
- `update(candle)` replaces an existing timestamp or inserts a corrected bar
  in chronological order.
- `resize(width, height)` updates CSS-pixel dimensions and the device-pixel
  backing store.
- `setOptions(options)` updates theme, locale, timezone, precision, or explicit
  dimensions without recreating the chart.
- `setDatafeed(datafeed, query)` loads historical bars and subscribes to future
  bars when the provider exposes `subscribeBars`.
- `stopDatafeed()` removes the active subscription and invalidates stale loads.
- `getVisibleRange()` and `getData()` provide defensive diagnostic snapshots.
- `destroy()` is idempotent and releases the canvas, observer, listeners, and
  datafeed subscription. Other methods throw after destruction.

## Data contract

`Candle.time` is a UTC Unix timestamp in integer milliseconds. OHLC values must
be finite and satisfy `high >= open/close` and `low <= open/close`. Volume is
optional and must be finite and non-negative. Complete datasets must be strictly
ascending; updates may replace or insert a timestamp.
