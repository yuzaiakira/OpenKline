# Indicator Engine Architecture

The indicator engine is a framework-independent calculation layer under
`src/indicators`. It has no dependency on React, Next.js, the DOM, Canvas2D, or
chart layout.

```text
Candle[] -> IndicatorInstance -> IndicatorResult
              |                       |
        IndicatorDefinition      output series[]
              |
      IndicatorRegistry -> built-ins / custom TypeScript definitions
```

## Ownership and lifecycle

`IndicatorRegistry` owns immutable definitions by normalized ID. A definition
contains metadata, parameter validation, calculation, and an optional append
calculation. `IndicatorRegistry.create()` creates an independent
`IndicatorInstance`; instances own their input store, parameters, and result.
No calculation state is shared between instances.

`setInput()` validates and replaces the full ordered candle input.
`update(candle)` replaces or inserts a timestamp. Append-only updates use a
definition's optional incremental path, including opaque state and a bounded
trailing input window where appropriate; historical corrections and definitions
without that path use deterministic full recalculation. Incremental results are
validated at the appended point and full results are validated on replacement.
`dispose()` clears the input/result and makes later operations fail
predictably.

## Result model

Every output is aligned to the input timestamps and uses `{ time, value }`,
where `value` is a number or explicit `null`. Warm-up periods therefore do not
silently shorten or shift a series. Multi-output indicators return multiple
named output series with a rendering kind (`line`, `histogram`, or `band`).

Built-ins currently use closing prices unless their formula requires OHLCV:

- `SMA(period)` and `EMA(period)`;
- `RSI(period)` using Wilder smoothing;
- `MACD(fastPeriod, slowPeriod, signalPeriod)`;
- `BOLLINGER_BANDS(period, standardDeviations)`;
- `ATR(period)` using true range and Wilder smoothing;
- `STOCHASTIC(kPeriod, dPeriod)`;
- `VWAP(session)`.

VWAP requires an explicit `session` value: `none` for a continuous cumulative
calculation or `utc-day` for UTC calendar-day resets. The engine never infers a
trading session from a timestamp or exchange.

## Architectural decisions

1. Definitions are stateless and instances are stateful. This prevents one
   chart or consumer from changing another instance's calculation.
2. Full recalculation is the correction-safe default. Incremental calculation
   is opt-in per definition and only used for a strictly newer timestamp.
3. Warm-up values are aligned `null`s, not omitted points. Consumers can map
   outputs to chart series without timestamp reconstruction.
4. Parameter validation belongs to each definition, while lifecycle and input
   validation belong to the shared engine.
5. KlineScript can later call registered definitions through the same typed
   `IndicatorDefinition` contract; no dynamic code execution is used.

Append-only engine state is never shared between instances. The public
`getResult()` remains defensive; the renderer may use the internal reference
only during a synchronous chart update and must not mutate it.

Pane assignment and rendering are intentionally not part of this layer. The
multi-pane chart consumes `IndicatorResult.outputs` and owns pane layout without
duplicating formula or input alignment logic.
