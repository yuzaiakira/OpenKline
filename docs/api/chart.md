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
const anchoredVwap = chart.addAnchoredVwap({
  id: "anchor-vwap",
  anchorTime: candles[20]!.time,
  priceSource: "typical",
  style: { color: "#f59e0b", lineWidth: 2 },
});
const profile = chart.addVolumeProfile({
  id: "estimated-profile",
  mode: "fixed",
  range: { from: candles[0]!.time, to: candles.at(-1)!.time + 1 },
  allocation: "range-uniform",
  binCount: 32,
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
- `addAnchoredVwap(options)` creates the built-in causal `ANCHORED_VWAP` on
  the main pane and returns its normal indicator lifecycle plus `setAnchor` and
  `setPriceSource` helpers. It uses the same raw OHLCV data and replay mask as
  other indicators.
- `addVolumeProfile(options)` creates an estimated OHLCV-derived horizontal
  profile overlay. `mode: "fixed"` uses the supplied `[from, to)` range;
  `mode: "visible"` follows the current visible time range. The returned API
  supports `getResult`, `setOptions`, `setMode`, `setRange`, `setVisible`, and
  `remove`. It renders through the existing Canvas2D overlay path, so it does
  not add a second canvas or mutate candle data. POC and value-area labels are
  explicitly estimated from OHLCV candles, not exchange-reported trade
  distributions.
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
- The Canvas2D surface is keyboard focusable and exposes `role="img"` with a
  dynamic accessible summary. The summary distinguishes an empty chart from
  visible time points or bars and includes the latest close, visible series,
  and pane counts when available. Hosts should provide surrounding controls
  with labels and a live status region for crosshair/navigation updates. This
  summary is an accessible overview, not a replacement for a complete data
  table or a formal screen-reader/WCAG conformance claim.
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
- `getVisibleTimeRange()` returns the visible UTC boundaries for optional host
  synchronization. `setVisibleTimeRange({ from, to })` applies those boundaries
  without assuming equal indexes across charts. `setCrosshairAtTime(time)`
  selects the nearest visible bar and returns the timestamp selected; passing
  `null` clears the crosshair. These are additive synchronization primitives;
  charts are never coupled automatically.
- `ChartSynchronizationController` provides the opt-in multi-chart layer over
  those primitives. See [Chart synchronization API](synchronization.md) for
  registration, independent channel options, UTC matching, replay limits, and
  cleanup.
- `ComparisonEngine` provides framework-independent percentage and indexed
  performance lines for multiple assets. It chooses an at-or-before baseline
  with an explicit freshness limit and preserves raw observations. See
  [Asset comparison API](comparison.md); hosts must render its derived points as
  separate series rather than replacing raw price data.
- Corporate-action presentation is explicit. `setCorporateActions()` attaches
  a versioned source; `setCorporateActionDisplayMode()` selects `raw`,
  `split-adjusted`, or analytical `total-return`; `getData()` returns raw
  candles during normal operation and the revealed raw prefix while replay is
  active, while `getDisplayedData()` returns the current rendered OHLCV
  domain. `getCorporateActionAdjustment()` exposes provenance and the explicit
  total-return index. Split/dividend markers use the existing overlay path.
  See [Corporate actions API](corporate-actions.md).
- `destroy()` is idempotent and releases the canvas, observer, listeners,
  datafeed subscription, analytics overlays, and stored series data. Other
  methods throw after destruction.

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

## Multi-timeframe overlays

`chart.addMultiTimeframeIndicator({ sourceTimeframe, targetTimeframe,
indicatorId, ... })` adds a derived indicator series while reusing the chart's
existing panes, time scale, renderer, replay lifecycle, and disposal path. The
source and target are fixed UTC durations with an integer ratio. Higher-timeframe
SMA, EMA, and RSI calculations use the public `IndicatorRegistry`; custom
registered indicator definitions can be used as well. The returned API exposes
`getResult()`, `setParameters()`, `setOutputStyle()`, `setVisible()`, and
`remove()`.

The chart maps a derived output onto source timestamps only after the output's
`availableAt` frontier. Forming or warm-up values are omitted from the drawn
series, while their metadata remains available in `getResult()`. `setData`,
corrections, realtime updates, datafeed replacement, replay cursors, resize,
and destruction all use the same managed lifecycle.

`chart.addMultiTimeframeReference()` draws previous completed target-period
OHLC levels through the existing Canvas overlay path. It supports configurable
level selection, labels, color, opacity, width, and solid/dashed/dotted line
styles. It never uses the current forming period as its own reference. Both
multi-timeframe APIs are additive; version-1 workspaces without them remain
valid. See [multi-timeframe analysis](multi-timeframe.md).

## Trading-calendar visualization and session analysis

Attach a resolved `TradingCalendarEngine` to render schedule-aware boundaries,
break shading, and localized session labels over the existing Canvas2D chart:

```ts
const calendarView = chart.setTradingCalendar(calendar, {
  showBoundaries: true,
  showBreaks: true,
  showLabels: true,
});
calendarView.setVisible(false);
```

The overlay enumerates only the bounded visible UTC range. It does not invent
bars for closed dates or breaks, and it uses the calendar's IANA timezone and
versioned schedule. `getTradingCalendar()` returns the current view API and
`removeTradingCalendar()` removes it without changing chart data.

`addSessionIndicator({ sourceTimeframe, targetPeriod, calendar, indicatorId,
... })` and `addSessionReference({ sourceTimeframe, targetPeriod, calendar,
... })` reuse the session aggregation engine, the existing Indicator Registry,
series store, pane layout, replay as-of boundary, and overlay renderer. Target
periods are `"session"`, `"week"`, and `"month"`; they are not guessed UTC
durations. Session outputs remain unavailable until their causal period
frontier, including early closes and holidays. The returned APIs mirror the
fixed multi-timeframe lifecycle with `getResult`, visibility/style controls,
parameter updates, and `remove`.

Workspace serialization stores only calendar ID/version, display settings, and
session analysis configuration. Resolved calendars and executable schedule
objects are runtime-only. Pass `tradingCalendarResolver(id, version)` to
`restoreWorkspace` to rehydrate them; without a resolver the serialized
configuration is validated and safely skipped.

Drawing anchors use UTC millisecond timestamps and prices in the main pane.
Built-in tools are horizontal/vertical lines, trend lines, rectangles,
Fibonacci retracements, and text. Drawing styles support color, fill, line
width, visibility, and locking. See `docs/api/drawings.md` for the complete
contract and `docs/guides/custom-drawing-tools.md` for extensions.

## Compatibility notes

Phase 9 volume analytics is additive to the existing `Chart` contract. Existing
series, indicator, drawing, Datafeed, viewport, and lifecycle methods retain
their signatures and behavior. The new `addAnchoredVwap`,
`getAnchoredVwaps`, `startAnchoredVwapPlacement`, `addVolumeProfile`, and
`getVolumeProfiles` methods share the existing indicator, Canvas2D, replay, and
disposal lifecycles; consumers may continue using the older methods without
understanding these additions. The pane-bounds helper is also additive.

The strict historical API checker remains the release gate. Run
`npm run api:diagnostics` to review an intentional additive delta before
requesting approval to update the stored baseline.
