# KlineScript types

The v0.1 type checker has scalar `int`, `float`, `bool`, `string`, `color`,
and `missing` types; `series<int>`, `series<float>`, and `series<bool>`; and a
private typed `macd` bundle. A missing runtime value is represented as `null`
inside a series and propagates through arithmetic, comparisons, and
conditionals.

`open`, `high`, `low`, `close`, and `volume` are `series<float>` (`volume` is
missing when the candle has no volume). `time` is `series<int>` in UTC Unix
milliseconds. Scalar values are promoted pointwise when combined with a
series. Integer arithmetic stays integer except division, which is float;
numeric series operations use float values. Implicit string/number/bool
conversion is never performed.

`close[1]` is a `series<float>` and means the value one completed bar before
the current bar. Index zero is the current bar. A non-negative integer index is
required; a negative, non-integer, or over-limit index is rejected. Before the
first available bar the result is missing. Dynamic integer indexes are checked
again at runtime.

Periods are positive integer scalars. Division by zero, square root of a
negative value, non-finite powers, and non-finite input/results produce a
missing value and never a non-finite output. Input ranges are validated both at
compile time for literals and at instantiation time for host-supplied values.

