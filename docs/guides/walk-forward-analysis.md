# Walk-Forward Analysis Guide

Walk-Forward Analysis selects parameters chronologically and evaluates frozen
parameters only after the selection boundary. Use `runWalkForward()` or the
private Studio panel.

```ts
import { runWalkForward } from "openkline";

const report = runWalkForward({
  strategy: "EMA_CROSSOVER",
  candles,
  searchSpace: [
    { name: "fastPeriod", type: "integer-range", start: 5, end: 15, step: 5 },
    { name: "slowPeriod", type: "integer-range", start: 20, end: 40, step: 10 },
  ],
  objective: "net-profit",
  initialCapital: 10_000,
  positionSizing: { type: "fixed-quantity", quantity: 1 },
  commission: { type: "percent", value: 0.001 },
  slippage: { type: "percent", value: 0.0005 },
  limits: { maxCandidates: 64 },
  split: { mode: "anchored", trainingWindowLength: 240, testWindowLength: 60, stepSize: 60, gapBars: 2, warmupBars: 40 },
});
```

Training ranking uses only that fold's training slice. Validation and test/OOS
slices cannot change selected parameters. Warm-up bars are available for
indicator context, but `tradingStartIndex` suppresses warm-up signals, orders,
fills, and equity observations. Each fold starts with fresh capital and no
carried position.

The aggregate is deliberately `reset-per-fold`. Inspect fold metrics,
fingerprints, selected parameters, trades, and diagnostics independently.
Overlapping test windows are warned about and never represented as a fabricated
continuous portfolio curve. Export helpers produce data-only JSON and CSV
with a caller-supplied local completion timestamp.
