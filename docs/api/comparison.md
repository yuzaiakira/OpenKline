# Asset comparison API

`ComparisonEngine` is a framework-independent utility for displaying several
assets on one relative-performance scale. It does not alter candles, chart
price scales, or vendor data. Raw observations remain available through
`getRawData`; normalized points are a separate derived output.

```ts
import { ComparisonEngine } from "openkline";

const comparison = new ComparisonEngine({ mode: "percentage" });
comparison.addAsset({
  id: "BTC-USD",
  label: "Bitcoin",
  color: "#f59e0b",
  data: candles.map(({ time, close: price }) => ({ time, price })),
});
comparison.addAsset("ETH-USD", ethPoints);

// UTC milliseconds. The engine chooses the latest observation at or before
// this time and never uses a future observation as a baseline.
comparison.setBaseline(Date.UTC(2026, 0, 10), { maxAgeMs: 3_600_000 });
const lines = comparison.getNormalizedData();
for (const line of lines) {
  const series = chart.addLineSeries({ id: `comparison-${line.id}`, title: line.label, style: { color: line.color } });
  series.setData(line.data);
}

comparison.updateAsset("BTC-USD", { time: Date.UTC(2026, 0, 10, 1), price: 101 });
comparison.removeAsset("ETH-USD");
comparison.dispose();
```

## Contracts and lifecycle

- `ComparisonPricePoint` is `{ time, price }`, with UTC integer milliseconds and
  a finite positive price. Input data must be strictly ascending and cannot
  contain duplicate timestamps.
- `setBaseline(time, { maxAgeMs })` makes the baseline policy explicit. A
  `null` time disables normalization. If an asset has no valid observation at
  or before the requested time, or its latest eligible observation is older
  than `maxAgeMs`, its normalized data is empty and its status is ineligible.
- `percentage` returns `((price / baselinePrice) - 1) * 100`. `indexed` returns
  `(price / baselinePrice) * 100`.
- Normalized output begins at observations on or after the requested baseline
  time. A prior observation may establish the baseline, but it is not projected
  forward into the output.
- `updateAsset` replaces equal timestamps and inserts out-of-order corrections
  chronologically. `replaceAssetData`/`setAssetData` replace a complete series.
- `subscribe` reports asset, mode, baseline, and lifecycle changes. The
  unsubscribe function is safe to call repeatedly. `dispose` is idempotent and
  releases all retained data and listeners; later API calls throw.

The engine is intentionally renderer-neutral. A host owns line-series creation,
legend and tooltip presentation, chart synchronization, and removal of derived
series. Do not replace a chart's raw candlestick series with normalized values.
For the private Next.js reference consumer, see
`docs/guides/studio-comparison.md`.
