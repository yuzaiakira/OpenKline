# Multi-Pane Layout Architecture

The multi-pane layer is owned by `ChartModel` and `PaneLayout`. It does not
duplicate time navigation or input alignment.

```text
one union time axis
        |
  PaneLayout -> main pane -> price scale -> candles/price indicators
             -> volume pane -> independent scale -> volume/histogram
             -> oscillator pane -> independent scale -> RSI/MACD/Stochastic
```

`PaneLayout` owns pane IDs, order, and preferred heights. The main pane is
responsive; non-main panes have a preferred CSS-pixel height and are scaled
down together when the chart is too short. The model moves a series to an
existing pane or creates a named pane on demand. Removing a pane moves its
series to the main pane; removing the last series in an auxiliary pane removes
that pane automatically.

Every pane receives the same visible timestamp window and `TimeScale`. Each
pane constructs its own `PriceScale` from its own series values. This keeps RSI
0–100 and MACD values independent from the price scale while preserving one
zoom/pan state and one synchronized vertical crosshair.

`CanvasRenderer` consumes pane snapshots and only owns drawing. It clips each
pane, draws its grid and series, draws one shared time axis, and draws the
crosshair vertical line across all panes. Indicator calculation remains in the
framework-independent registry; pane creation only maps indicator outputs to
line or histogram series.

## Public lifecycle

```ts
const rsiPane = chart.addPane({ id: "rsi", height: 160 });
const rsi = chart.addLineSeries({ pane: rsiPane.id });
rsiPane.setHeight(200);
rsiPane.remove(); // moves the series to main
```

`chart.addIndicator("RSI", { period: 14, pane: "new" })` creates an indicator
instance and maps its outputs into a new pane. `ChartIndicatorApi.remove()`
removes its output series and disposes the calculation instance. Chart destroy
disposes all indicators and clears pane state.

Pane layout is deliberately separate from framework components so React and
Next.js only pass lifecycle/configuration through the same Chart API.
