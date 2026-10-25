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
  priceScale: { mode: "linear", marginTop: 0.08, marginBottom: 0.08 },
});

const price = chart.addCandlestickSeries({ id: "price", title: "Price" });
price.setData(candles);
const ohlc = chart.addOhlcSeries({ id: "ohlc", style: { upColor: "#22c55e", downColor: "#ef4444" } });
ohlc.setData(candles);
const heikinAshi = chart.addHeikinAshiSeries({ id: "ha", title: "HA" });
heikinAshi.setData(candles); // stores raw OHLCV; transforms only for display
const momentum = chart.addBaselineSeries({ id: "momentum", style: { baseline: 0 } });
momentum.setData(candles.map(({ time, close }) => ({ time, value: close - 100 })));
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

const workspace = chart.serializeWorkspace({ symbol: "BTC-USD", timeframe: "1h" });
chart.restoreWorkspace(workspace);

unsubscribe();
chart.destroy();
```

## Lifecycle methods

- `setData(candles)` replaces the complete validated, strictly ascending
  primary candlestick dataset.
- `update(candle)` replaces an existing timestamp or inserts a corrected bar
  in chronological order.
- `addCandlestickSeries`, `addOhlcSeries`, `addHollowCandlestickSeries`, and
  `addHeikinAshiSeries` accept raw `Candle` data; `addLineSeries`,
  `addAreaSeries`, and `addBaselineSeries` accept time/value points;
  `addVolumeSeries`/`addHistogramSeries` remain histogram point series. Every
  type uses the same viewport and interaction model and supports `setData`,
  `update`, `getData`, `setStyle`, and `remove`.
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
- `installPlugin(plugin)`, `uninstallPlugin(id)`, `getPlugins()`,
  `executeCommand(id)`, `executeShortcut(shortcut)`, and `getCommands()` expose
  the chart-scoped Phase 3 plugin registry. Plugins can register indicators,
  drawings, controlled overlays, typed events, commands, and JSON state.
- `serializeWorkspace(metadata)` and `restoreWorkspace(document, options)` save
  and restore versioned chart configuration, series, indicators, drawings,
  viewport, and plugin state. See `docs/api/workspaces.md`.
- `registerDrawingTool(definition)` and `unregisterDrawingTool(type)` manage
  custom drawing definitions. `addDrawing` creates a typed analysis object;
  `startDrawing` creates one from pointer clicks. `getDrawings`,
  `selectDrawing`, `removeDrawing`, `undoDrawing`, `redoDrawing`,
  `serializeDrawings`, and `restoreDrawings` manage the drawing lifecycle.
- `getSeriesIds()` lists live series. `getSeriesInfo()` returns defensive
  object-management metadata (type, pane, title, style, and data length), and
  `setSeriesStyle(id, style)` updates one appearance without resetting data or
  the viewport. `removeSeries(id)` disposes one series.
- `pan(deltaBars)` and `zoom(scale, anchorRatio)` navigate the shared viewport.
  `fitContent()` shows the complete shared time range; `resetView()` restores
  default density and follows the newest data. Ordinary resizing preserves the
  current visible-bar count and position where possible, while a view already
  at the right edge remains right-edge anchored as new data arrives.
- `resize(width, height)` updates CSS-pixel dimensions and the device-pixel
  backing store.
- `setOptions(options)` updates theme, locale, timezone, precision, direction,
  price-scale configuration, interaction policy, or explicit dimensions without
  recreating the chart.
- `setPriceScaleOptions(options)` configures the main pane as `linear`,
  `logarithmic`, `percentage`, or `indexed`. `setPriceScaleRange({ min, max })`
  freezes a raw-price range; `resetPriceScale()` restores visible-data
  autoscaling. `getPriceScaleOptions()` returns configuration and
  `getPriceScaleState()` additionally reports the effective mode and a
  deterministic invalid-domain fallback diagnostic.
- `setDatafeed(datafeed, query)` loads historical bars and subscribes to future
  bars when the provider exposes `subscribeBars`.
- `stopDatafeed()` removes the active subscription and invalidates stale loads.
- `createReplay(options)` creates a chart-owned replay controller around a
  complete validated candle source. `startAt` selects the first source bar at
  or after its timestamp. The inclusive cursor masks every chart series,
  indicator, crosshair/tooltip value, autoscale input, drawing anchor, and
  plugin render context after the cursor. Source and structural mutations are
  rejected while replay is active; `exit()` restores the complete pre-replay
  workspace and resubscribes a suspended datafeed.
- `getVisibleRange()` and `getData()` provide defensive diagnostic snapshots.
- `destroy()` is idempotent and releases the canvas, observer, listeners,
  datafeed subscription, and stored series data. Other methods throw after
  destruction.

`ChartEvents` includes `chartReady`, `chartDestroy`, `dataUpdated`,
`viewportChange`, `indicatorChange`, `drawingSelection`, `toolActivation`,
`themeChange`, `crosshairMove`, `datafeedError`, `replayChange`, and
`replayError`.

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
`SeriesStyle` supports visibility, line/fill colors, line width, and
candlestick direction colors. Hollow candles can specify `hollowUpColor`.
Baseline series split at `baseline` (default `0`) with independently configurable
`above*`/`below*` colors and fill opacities. Volume renders in a lower pane;
other series share the OHLC/point price scale. See
[chart-type architecture](../architecture/chart-types.md) for display and raw
data semantics.

`crosshairMove` includes a `series` array with the nearest value for every
series. Tooltip text uses the same values, so interaction behavior remains
consistent as series are added or removed.

For the main price pane, `CrosshairMoveEvent.price` remains a raw financial
price in every scale mode. Its optional `formattedPrice` is the displayed
linear/logarithmic, percentage, or indexed value; `priceScaleMode` records the
effective transform. See [the scale architecture](../architecture/price-scale-system.md)
for logarithmic-domain fallback, reference-price, workspace, and raw-anchor
semantics.

## Package consumption

The root `openkline` package exposes the ESM/types entry shown above. The
optional `@openkline/react` package exposes `FinancialChart` and its typed
props; it is a separate package and is not bundled into the root tarball.
Local tarball installation is verified by
`node scripts/consumer-preview-smoke.mjs` for Vanilla ESM and TypeScript React
consumers. Package publication remains pending the project-license decision;
see the [developer-preview plan](../release/developer-preview-plan.md).

For a release-candidate-level check, `npm run preview:prepare` stages ignored
`0.1.0-alpha.1` archives and `npm run preview:verify` installs only those
archives into Vanilla, TypeScript, React, Next.js, and browser fixtures. The
browser fixture exercises chart creation, datafeed history/streaming, all core
series, indicators, plugins, KlineScript, workspace restore, and destruction
through public exports. It is local evidence only until licensing and managed
browser gates are complete.

`direction: "rtl"` reverses visual time coordinates while stored timestamps
remain ascending. `locale` and `timeZone` use the platform `Intl` formatter;
host-owned controls should provide their own translated strings.

`TimeScale.getTicks({ locale, timeZone, minimumLabelSpacing? })` exposes the
same adaptive UTC tick candidates used by Canvas. It returns UTC millisecond
positions and localized labels without changing stored timestamps. Canvas
measures text and suppresses overlapping candidates. See
[time-axis architecture](../architecture/time-axis.md) for daylight-saving,
elapsed-time, and trading-session boundaries.

Indicator outputs can be assigned to `pane: "new"`, `pane: "main"`, or a
named pane. RSI, MACD, and Stochastic therefore use independent scales while
remaining synchronized with price and volume.

Drawing anchors use UTC millisecond timestamps and prices in the main pane.
Built-in tools are horizontal/vertical lines, trend lines, rectangles,
Fibonacci retracements, and text. Drawing styles support color, fill, line
width, visibility, and locking. See `docs/api/drawings.md` for the complete
contract and `docs/guides/custom-drawing-tools.md` for extensions.
