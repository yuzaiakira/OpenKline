# Chart synchronization API

`ChartSynchronizationController` is an opt-in, framework-independent link
between independent `Chart` instances. It forwards UTC coordinates through
the public Chart API; it does not share candles, symbols, price scales, or
rendering state.

```ts
import { ChartSynchronizationController } from "openkline";

const synchronization = new ChartSynchronizationController({
  crosshair: true,
  visibleRange: true,
});

const removeFirst = synchronization.addChart("btc-1h", firstChart);
synchronization.addChart("btc-4h", secondChart);

// Options can be changed independently at runtime.
synchronization.setCrosshairEnabled(false);
synchronization.setVisibleRangeEnabled(true);

removeFirst();
synchronization.removeChart("btc-4h");
synchronization.destroy();
```

The controller subscribes to `crosshairMove`, `viewportChange`, `dataUpdated`,
`replayChange`, and `chartDestroy`. Repeated coordinates are deduplicated,
recursive event feedback is blocked, and chart destruction automatically
unregisters its listeners. Registration IDs must be unique and non-empty.

Crosshair synchronization forwards the actual UTC time. Each target chart
selects its own nearest visible bar, so different intervals, missing bars,
symbols, and dataset lengths remain independent. Visible-range synchronization
reads the source chart's UTC range through `getVisibleTimeRange()` rather than
forwarding internal bar indexes; each target clamps the range to its own data
and replay cutoff.

The controller is disabled by default for both synchronization channels. A
controller is opt-in and can be used from Vanilla TypeScript, React, or any
other host. It has no datafeed or backend dependency. `destroy()` is idempotent
and final; create a new controller if a later mount needs a new link.
