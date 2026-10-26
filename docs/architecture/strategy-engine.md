# Strategy engine architecture

The Phase 8 strategy subsystem is a framework-independent TypeScript layer
under `src/strategies`. It has no dependency on React, Next.js, the DOM,
Canvas2D, replay scheduling, or broker connectivity.

```text
validated Candle[]
       |
       v
 StrategyInstance -> isolated StrategyEvaluator -> StrategySignal[]
       |                         |
 StrategyDefinition         completed-bar prefix only
       |
 StrategyRegistry -> trusted TypeScript strategy definitions
```

## Contracts and ownership

`StrategyDefinition` owns stable metadata, parameter validation, and creation
of a stateful evaluator. `StrategyRegistry` owns normalized IDs and creates
independent instances. A strategy evaluator is created for one evaluation and
is disposed when the run ends. Indicator instances requested by an evaluator
are created through the supplied service boundary and are not shared between
runs.

The initial contract intentionally supports trusted TypeScript definitions.
It does not execute arbitrary user-provided JavaScript and is not a sandbox.
KlineScript strategy syntax is a separate milestone. The existing restricted
KlineScript runtime may later provide numeric/boolean signal adapters only
through an explicit, tested boundary.

## Anti-lookahead boundary

The evaluation loop validates and clones the complete input with `CandleStore`,
then invokes the evaluator once per completed bar. The context contains:

- the current completed candle;
- `history`, a defensive prefix ending at the current index;
- the prior candle or `null`; and
- validated parameters.

No future candle, complete source array, next-bar open, fill price, or broker
state is part of a strategy context. A signal is timestamped at the completed
bar where it was generated. The future fill policy belongs to the backtest
execution layer and remains separate from signal generation.

The additive `StrategyDefinition.requiresHistory` hint defaults to `true`.
Trusted definitions that never read the history field may set it to `false`
to avoid constructing an unused view. All other definitions receive an
array-compatible causal view with a fixed per-bar boundary; indexing,
iteration, `slice`, `map`, and `reduce` remain bounded to that bar, and a
retained view cannot expose later source candles. The optimization does not
hand a full source array to a strategy.

This is a correctness boundary, not a security boundary for trusted code. A
host must not register an evaluator that closes over external future data.
Untrusted source must use the restricted KlineScript path after a separate
security review.

## Signal semantics

The initial signal actions are `enter-long`, `exit-long`, `enter-short`, and
`exit-short`. A signal contains a deterministic ID, strategy ID, bar index,
completed-bar timestamp, action, reason, and an optional finite diagnostic
value. Signals do not contain execution prices or imply that an order was
filled. The order simulator will apply the documented next-bar-open policy in
the next Phase 8 increment.

The first built-in definitions are EMA crossover, RSI threshold reversal,
Donchian breakout, and EMA trend following. They use independent instances of
the existing EMA, RSI, and Donchian indicator definitions. Built-ins are
ordinary `StrategyDefinition` values and do not receive special access to
Chart or rendering state.

Input timestamps must be non-negative UTC integer milliseconds in strict
ascending order. OHLC relationships and optional volume are validated by the
existing `CandleStore`; missing volume is preserved as missing and is never
fabricated. Empty input is valid and produces an empty evaluation result.

## Lifecycle and cancellation

`StrategyInstance.evaluate()` is synchronous and deterministic. It accepts an
`AbortSignal`, emits optional progress observations, and throws a typed
`StrategyCancellationError` without returning partial results when cancelled.
`dispose()` is terminal for the instance. Backtest orchestration adds async
status, Worker generation tracking, result ownership, and concurrent-run
isolation without changing this reference evaluation contract. The implemented
Backtest Worker delegates to this synchronous engine rather than duplicating
signal or accounting logic; see
`docs/architecture/strategy-worker-runtime.md`.

## Decisions recorded for Phase 8.0.0

1. Strategy signals and simulated orders are separate domain objects.
2. Signal timestamps are completed-bar timestamps; they are never fill times.
3. Only next-bar execution may consume a signal in the initial backtest model.
4. The engine supports one-symbol historical input first; multi-asset portfolio
   simulation is deferred.
5. No live trading, broker connectivity, margin, financing, or profitability
   claim is part of Phase 8.0.
