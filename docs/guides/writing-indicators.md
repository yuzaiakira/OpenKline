# Writing KlineScript indicators

1. Write an `indicator` declaration and one or more immutable bindings.
2. Use `input.int`, `input.float`, or `input.bool` for host-editable values.
3. Select OHLCV/time series and call a documented `ta.*` function.
4. Add `plot` outputs or `hline` references.
5. Compile, show all diagnostics, and only add the program after
   `result.success` is true.

The compiler is independent of React and Canvas. In a chart, call
`chart.addScriptIndicator(program)`. Overlay programs use the main pane by
default; oscillator programs use a new pane. Input changes and all datafeed
corrections use the existing indicator lifecycle.

