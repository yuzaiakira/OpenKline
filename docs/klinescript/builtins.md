# KlineScript built-ins

Only these names are registered in v0.1. Calls are not host property lookup.

## Declarations and plots

```python
indicator(name: string, overlay: bool = True)
input.int(label: string, default: int, min: int?, max: int?) -> int
input.float(label: string, default: float, min: float?, max: float?) -> float
input.bool(label: string, default: bool) -> bool
plot(series<float>, title: string?, color: color?, width: int?, visible: bool?)
hline(value: int|float, color: color?)
```

`input.*` calls are only valid as the right side of a binding. A plot creates a
line output. An hline creates a constant aligned output; the renderer applies
the declared color/width/visibility as a normal OpenKline series style.

## Technical functions

```python
ta.sma(source: series<float>, period: int) -> series<float>
ta.ema(source: series<float>, period: int) -> series<float>
ta.rsi(source: series<float>, period: int) -> series<float>
ta.macd(source: series<float>, fastPeriod: int, slowPeriod: int, signalPeriod: int) -> macd
ta.atr(period: int) -> series<float>
ta.stdev(source: series<float>, period: int) -> series<float>
ta.highest(source: series<float>, period: int) -> series<float>
ta.lowest(source: series<float>, period: int) -> series<float>
```

The MACD bundle exposes only the fixed projections `.macd`, `.signal`, and
`.histogram`. SMA/EMA/RSI/ATR initialization follows the existing Indicator
Engine's warm-up convention: insufficient history is missing, EMA starts from
the first complete simple average, RSI uses Wilder-style averages, and ATR
uses true range plus Wilder smoothing. Scripts are evaluated from the complete
ordered snapshot on every correction/update in v0.1; no unsupported stateful
shortcut is claimed.

## Scalar math

`abs`, `min`, `max`, `sqrt`, `pow`, `round`, `floor`, and `ceil` accept scalar
numbers only. Invalid mathematical domains return missing. All other calls are
compile errors.

