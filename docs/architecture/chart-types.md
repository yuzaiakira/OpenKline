# Professional chart types

Phase 7 keeps one shared series store, viewport, time scale, pane layout,
price-scale contract, crosshair, and lifecycle for every chart type. Chart
types select a renderer and an input shape; they do not own navigation or
duplicate interaction math.

## Candle-based types

`candlestick`, `ohlc`, `hollow-candlestick`, and `heikin-ashi` accept validated
raw `Candle` OHLCV data. OHLC renders a high/low stem with left open and right
close ticks. Hollow candles outline up bars and fill down bars; `upColor`,
`downColor`, and optional `hollowUpColor` customize direction colors.

Heikin–Ashi is a display projection, not a replacement market-data series:

- `haClose = (open + high + low + close) / 4`
- the first `haOpen = (open + close) / 2`
- later `haOpen = (previousHaOpen + previousHaClose) / 2`
- `haHigh`/`haLow` are the maximum/minimum of raw high/low and derived
  open/close.

The raw candle store is retained. `SeriesApi.getData()`, workspace data,
`Chart.getData()`, and indicator input remain raw OHLCV. Visible renderer and
crosshair snapshots derive Heikin–Ashi from the complete raw history before
slicing a viewport, so panning does not change the first visible HA open.
Historical corrections recompute later display candles deterministically.

## Baseline

`baseline` accepts `LinePoint` data and splits its line/fill around
`SeriesStyle.baseline` (default `0`). `aboveColor`, `belowColor`,
`aboveFillColor`, `belowFillColor`, `aboveFillOpacity`, and
`belowFillOpacity` control the two regions. The renderer clips regions to the
pane and includes a configured baseline in automatic scale range calculation.

## Persistence and extension boundary

All four types use existing dynamic add/remove, high-DPI Canvas, pan/zoom,
crosshair, style, workspace, and cleanup paths. Workspaces retain their raw
data and selected type. The `CandleSeriesType` union and shared candle-series
utilities provide an extension boundary for later candle-based types without
changing viewport or price-scale ownership.
