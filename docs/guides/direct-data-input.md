# Direct data input

The smallest OpenKline integration owns its data in the consuming application
and never constructs a provider:

```ts
import { createChart } from "openkline";

const chart = createChart(container, { pricePrecision: 4 });
chart.setData(localCandles);
chart.update(nextCandle);
```

`setData` validates and replaces the complete ordered candle source.
`update` validates a realtime append or a correction and preserves the ordered
store when the timestamp is historical. Empty arrays are valid and leave an
empty chart until data arrives. Symbols are application metadata; the chart
only requires valid UTC millisecond candle timestamps and OHLCV values.

Indicators and drawings use the same local data:

```ts
chart.addIndicator("SMA", { period: 20, pane: "main" });
chart.addDrawing("horizontal-line", {
  points: [{ time: localCandles.at(-1)!.time, price: localCandles.at(-1)!.close }],
});
```

No Binance, backend, API key, account, cloud service, or internet connection
is involved. See the executable [direct-data example](../../examples/vanilla/direct-data.html)
and the [offline guide](offline-usage.md). The chart constructor itself is a
browser operation; importing non-rendering OpenKline modules remains safe for
SSR and Node consumers.
