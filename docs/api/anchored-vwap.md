# Anchored VWAP API

OpenKline exposes Anchored VWAP as both a pure framework-neutral calculation
and the built-in `ANCHORED_VWAP` indicator. The calculation uses only candle
prices and available positive volume; it does not use future candles, ticks,
trades, or order-book data.

```ts
import { calculateAnchoredVwap } from "openkline";

const result = calculateAnchoredVwap(candles, {
  anchorTime: Date.UTC(2026, 0, 1, 12),
  priceSource: "typical", // or "close"
});

console.log(result.currentValue, result.points);
```

The anchor is inclusive. If no candle has exactly the anchor timestamp, the
first candle after it is the first eligible observation. The result contains
one point for every eligible candle. A point is `null` until a positive volume
observation contributes to the cumulative denominator.

Missing and zero volume are not converted into synthetic volume. Invalid OHLCV
records are rejected using the same candle validation rules as the core chart.
Input timestamps may arrive out of order for correction-oriented calculations;
the last record for a duplicate timestamp wins and the calculation then sorts
chronologically. The weighted mean is accumulated using bounded normalized
weights so finite extreme values do not silently emit `NaN` or `Infinity`.

## Indicator integration

```ts
const anchored = chart.addIndicator("ANCHORED_VWAP", {
  id: "session-anchor",
  pane: "main",
  parameters: {
    anchorTime: candles[20]!.time,
    priceSource: "typical",
  },
});

anchored.setOutputStyle("value", {
  color: "#f59e0b",
  lineWidth: 2,
});
```

The indicator follows the normal chart lifecycle: data replacement,
equal-timestamp corrections, historical insertion, replay masking, workspace
restore, and disposal. Changing `anchorTime` or `priceSource` through
`ChartIndicatorApi.setParameters` causes a fresh causal calculation.

For an object that can be updated independently of a chart, use
`AnchoredVwapCalculator`. Its correction path invalidates the calculation
instead of retaining a stale append cache.

## Financial limits

Anchored VWAP is a candle-derived estimate of the volume-weighted average price
for the selected source. It is not a tick-accurate execution benchmark and
does not imply bid/ask direction, delta, or institutional positioning.
