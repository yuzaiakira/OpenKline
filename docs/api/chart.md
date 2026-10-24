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

const price = chart.addCandlestickSeries({ id: "price", title: "Price" });
price.setData(candles);
const trend = chart.addLineSeries({ id: "trend", style: { color: "#f59e0b" } });
trend.setData(candles.map(({ time, close }) => ({ time, value: close })));
const volume = chart.addVolumeSeries({ id: "volume" });
volume.setData(candles.map(({ time, volume = 0 }) => ({ time, value: volume })));

// Legacy convenience methods target the primary candlestick series.
chart.setData(candles);
chart.update(nextCandle); // replace the same timestamp or insert chronologically
const unsubscribe = chart.subscribe("crosshairMove", console.log);

unsubscribe();
chart.destroy();
```

## Lifecycle methods

- `setData(candles)` replaces the complete validated, strictly ascending
  primary candlestick dataset.
- `update(candle)` replaces an existing timestamp or inserts a corrected bar
  in chronological order.
- `addCandlestickSeries`, `addLineSeries`, `addAreaSeries`, and
  `addVolumeSeries` create typed series backed by the same viewport and
  interaction model. Each series supports `setData`, `update`, `getData`,
  `setStyle`, and `remove`.
- `getSeriesIds()` lists live series. `removeSeries(id)` disposes one series.
- `pan(deltaBars)` and `zoom(scale, anchorRatio)` navigate the shared viewport.
- `resize(width, height)` updates CSS-pixel dimensions and the device-pixel
  backing store.
- `setOptions(options)` updates theme, locale, timezone, precision, or explicit
  dimensions without recreating the chart.
- `setDatafeed(datafeed, query)` loads historical bars and subscribes to future
  bars when the provider exposes `subscribeBars`.
- `stopDatafeed()` removes the active subscription and invalidates stale loads.
- `getVisibleRange()` and `getData()` provide defensive diagnostic snapshots.
- `destroy()` is idempotent and releases the canvas, observer, listeners,
  datafeed subscription, and stored series data. Other methods throw after
  destruction.

## Data contract

`Candle.time` is a UTC Unix timestamp in integer milliseconds. OHLC values must
be finite and satisfy `high >= open/close` and `low <= open/close`. Volume is
optional and must be finite and non-negative. Complete datasets must be strictly
ascending; updates may replace or insert a timestamp.

## Series contract

`LinePoint` and `AreaPoint` use `{ time, value }`. `VolumePoint` uses the same
shape and may provide a per-bar `color`. Times are UTC Unix milliseconds and
must be strictly ascending in `setData`; `update` accepts an out-of-order point
and inserts it in order. `SeriesStyle` supports visibility, line/fill colors,
line width, and candlestick up/down colors. Volume renders in a lower pane;
other series share the OHLC/point price scale.

`crosshairMove` includes a `series` array with the nearest value for every
series. Tooltip text uses the same values, so interaction behavior remains
consistent as series are added or removed.
