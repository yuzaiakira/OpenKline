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
const rsi = chart.addIndicator("RSI", { period: 14, pane: "new" });
const support = chart.addDrawing("horizontal-line", {
  points: [{ time: candles.at(-1)!.time, price: candles.at(-1)!.close }],
  style: { color: "#f59e0b" },
});

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
  `addVolumeSeries`/`addHistogramSeries` create typed series backed by the same viewport and
  interaction model. Each series supports `setData`, `update`, `getData`,
  `setStyle`, and `remove`.
- `addPane(options)` creates a pane with an independent vertical scale and
  returns a `PaneApi` for height changes or removal. `height` is the preferred
  CSS-pixel height and `minHeight` is the minimum used by the renderer when
  space permits. `getPaneIds()` returns pane order. All panes share time
  navigation and the vertical crosshair.
- `registerIndicator(definition)` and `unregisterIndicator(id)` manage custom
  TypeScript definitions. `addIndicator(id, options)` creates a calculation
  instance, maps its outputs to line/histogram series, and supports parameter
  changes and disposal through `ChartIndicatorApi`. Band outputs are rendered
  as an upper/lower filled region; `setOutputStyle(outputId, style)` changes
  the output line and band fill color/opacity at runtime.
- `installExtension(extension)` activates a trusted versioned extension and
  returns an idempotent `ExtensionHandle`. The host currently exposes cleanup
  registrations for custom indicators and drawing tools.
- `registerDrawingTool(definition)` and `unregisterDrawingTool(type)` manage
  custom drawing definitions. `addDrawing` creates a typed analysis object;
  `startDrawing` creates one from pointer clicks. `getDrawings`,
  `selectDrawing`, `removeDrawing`, `undoDrawing`, `redoDrawing`,
  `serializeDrawings`, and `restoreDrawings` manage the drawing lifecycle.
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
and inserts it in order. Strictly newer updates use the realtime append path;
equal or historical timestamps retain replacement/correction semantics.
`SeriesStyle` supports visibility, line/fill colors,
line width, and candlestick up/down colors. Volume renders in a lower pane;
other series share the OHLC/point price scale.

`crosshairMove` includes a `series` array with the nearest value for every
series. Tooltip text uses the same values, so interaction behavior remains
consistent as series are added or removed.

Indicator outputs can be assigned to `pane: "new"`, `pane: "main"`, or a
named pane. RSI, MACD, and Stochastic therefore use independent scales while
remaining synchronized with price and volume.

Drawing anchors use UTC millisecond timestamps and prices in the main pane.
Built-in tools are horizontal/vertical lines, trend lines, rectangles,
Fibonacci retracements, and text. Drawing styles support color, fill, line
width, visibility, and locking. See `docs/api/drawings.md` for the complete
contract and `docs/guides/custom-drawing-tools.md` for extensions.
