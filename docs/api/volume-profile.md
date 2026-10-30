# Estimated Volume Profile API

`calculateEstimatedVolumeProfile` creates a deterministic horizontal volume
distribution from OHLCV candles. It is explicitly an **Estimated Volume
Profile**: OHLCV does not reveal the actual volume traded at every price.
OpenKline therefore does not claim exchange-reported volume-at-price,
bid/ask volume, delta, order-book liquidity, or institutional positioning.

```ts
import { calculateEstimatedVolumeProfile } from "openkline";

const profile = calculateEstimatedVolumeProfile(candles, {
  from: candles[0]!.time,
  to: candles.at(-1)!.time + 1, // exclusive upper bound
  binCount: 32,
  allocation: "range-uniform", // or "close"
  valueAreaPercentage: 0.7,
});
```

The range is `[from, to)`. `binCount` is bounded to 1–10,000 and the value
area percentage must be greater than zero and at most one. Missing and zero
volume candles remain counted as eligible observations but contribute no
volume. An empty range or a range with no positive volume returns an explicit
`empty` result without POC, VAH, or VAL geometry.

## Allocation methods

- `close` assigns all reported candle volume to the bin containing its close.
- `range-uniform` distributes reported volume across the candle's high/low
  interval in proportion to each bin's overlap. A zero-range candle uses its
  close bin.

Both methods conserve eligible positive volume within normal floating-point
tolerance and are approximations. POC is the highest-volume bin; ties choose
the lower-price bin. The value area starts at POC and expands contiguously.
When left and right candidates tie, the lower-price candidate is selected.
The discrete result may exceed the requested percentage; the result reports
`percentageAchieved` instead of claiming an exact fraction.

`pointOfControl.price` is the selected bin center. `valueArea.low` is the
lower boundary of the lowest selected bin and `valueArea.high` is the upper
boundary of the highest selected bin. Results and bins are defensive and
read-only at the public boundary.

Extreme finite prices are mapped through a scaled normalized interval before
bin selection so calculations avoid avoidable overflow. Explicit price bounds
are optional; when omitted, the eligible candle low/high range is used.

The chart-native `Chart.addVolumeProfile` integration adds fixed-range or
visible-range rendering, theme-aware estimated bars, POC/VAH/VAL labels, and
workspace persistence without changing the raw candle series. `setRange` uses
canonical UTC boundaries and switches to fixed mode; `setMode("visible")`
follows the chart's replay-visible viewport. The integration is intentionally
non-interactive at the pixel layer: hosts should edit timestamps through
labelled controls or existing drawing/snap workflows rather than persisting
canvas coordinates. See the chart and Studio documentation for control
behavior.
