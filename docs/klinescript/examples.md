# KlineScript examples

## SMA

```python
indicator("SMA")
period = input.int("Period", default=20, min=1, max=500)
plot(ta.sma(close, period), title="SMA", color="#38BDF8")
```

## RSI with reference lines

```python
indicator("RSI", overlay=False)
period = input.int("Period", default=14, min=1, max=500)
value = ta.rsi(close, period)
plot(value, title="RSI", color="#8B5CF6")
hline(70, color="#EF4444")
hline(30, color="#22C55E")
```

## MACD multi-plot

```python
indicator("MACD", overlay=False)
bundle = ta.macd(close, 12, 26, 9)
plot(bundle.macd, title="MACD")
plot(bundle.signal, title="Signal")
plot(bundle.histogram, title="Histogram")
```

Historical references, conditional expressions, and safe math are covered by
the compiler tests in `tests/klinescript.test.ts`. Loops, user functions,
strategies, orders, and arbitrary drawing calls are intentionally not working
examples in v0.1.

