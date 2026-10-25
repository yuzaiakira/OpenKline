# Indicator API

Indicators are calculated without browser or framework dependencies.

```ts
import { createDefaultIndicatorRegistry } from "openkline";

const registry = createDefaultIndicatorRegistry();
const rsi = registry.create("RSI", { period: 14 });
rsi.setInput(candles);

const result = rsi.getResult();
const values = result.outputs[0]?.points ?? [];

rsi.update(nextCandle);
rsi.setParameters({ period: 21 });
rsi.dispose();
```

## Built-in definitions

| ID | Parameters | Outputs |
| --- | --- | --- |
| `SMA` | `period` | `value` |
| `EMA` | `period` | `value` |
| `RSI` | `period` | `value` |
| `MACD` | `fastPeriod`, `slowPeriod`, `signalPeriod` | `macd`, `signal`, `histogram` |
| `BOLLINGER_BANDS` | `period`, `standardDeviations` | `middle`, `upper`, `lower` |
| `ATR` | `period` | `value` |
| `STOCHASTIC` | `kPeriod`, `dPeriod` | `k`, `d` |
| `VWAP` | `session: "none" | "utc-day"` | `value` |

All periods are positive integers. MACD requires `fastPeriod < slowPeriod`.
`standardDeviations` is finite and non-negative. VWAP rejects missing or
unknown session semantics.

## Warm-up and missing values

Results have one point for each input candle. Values before an indicator's
minimum sample size are `null`. VWAP returns `null` for candles without a
positive volume and does not add those candles to its cumulative denominator.
Constant-price edge cases use defined values: RSI is 50 when both average gain
and loss are zero, and stochastic %K is 50 when its high/low range is zero.

## Historical correction and updates

`update()` replaces an equal timestamp or inserts an older timestamp in order.
Historical corrections trigger a full calculation, preserving correctness.
Definitions can provide an append-only calculation for safe strictly-new
timestamps; SMA and EMA use this path. `getInput()` and `getResult()` return
defensive copies. Calling any operation after `dispose()` throws
`IndicatorLifecycleError`.

## Filled band rendering

The built-in Bollinger upper and lower outputs are marked as a band pair when
created through `Chart.addIndicator`. The Canvas2D renderer fills the region
between matching timestamps, clips it to the active pane, and leaves warm-up
points undefined until both boundaries have values. Use the returned
`ChartIndicatorApi` to customize the output at runtime:

```ts
const bands = chart.addIndicator("BOLLINGER_BANDS", {
  period: 20,
  standardDeviations: 2,
  pane: "main",
});

bands.setOutputStyle("upper", {
  color: "#60a5fa",
  fillColor: "#60a5fa",
  fillOpacity: 0.2,
});
bands.setOutputStyle("lower", { color: "#60a5fa" });
```

Custom indicator definitions can mark two `band` outputs with
`bandRole: "upper"` and `bandRole: "lower"`; definitions without roles use
output order.

## Registration

`IndicatorDefinition` is the custom TypeScript extension contract. Register a
definition with `registry.register(definition)` and remove it with
`registry.unregister(id)`. Definitions must provide metadata, parameter
validation, and a pure `calculate(input, parameters)` function. They may also
provide `calculateIncremental` when they can prove append-only correctness.

Registered definitions are not arbitrary scripts and are never evaluated with
`eval` or `new Function`. KlineScript v0.1 now calls this same contract through
`compileKlineScript` and `Chart.addScriptIndicator` after restricted lexical,
semantic, type, budget, and runtime validation. See
`docs/api/klinescript.md`; the DSL is not an OS-level sandbox and is not full
Python/Pine compatibility.
