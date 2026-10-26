# Strategy Optimization Architecture

Phase 8.2.1 adds a framework-independent optimization core under
`src/optimization/`. It is a parameter search and ranking layer around the
existing `createBacktest()` reference engine; it is not a second simulator,
indicator engine, broker, or profitability service.

## Boundaries

```text
validated parameter space
        |
        v
deterministic candidate generation -> StrategyRegistry validation
        |
        v
createBacktest(candidate) -> compact metric summary -> deterministic ranking
```

The core has no React, Next.js, Canvas, DOM, Worker, network, or vendor
dependency. A strategy definition remains the source of truth for parameter
constraints. The current built-in Worker boundary is intentionally separate;
bounded asynchronous orchestration is Phase 8.2.2.

## Search space

`OptimizationParameterDefinition` supports integer ranges, numeric ranges,
explicit value lists, and fixed values. Ranges are inclusive when the final
value lies on the requested step. Decimal values are rounded at generation
boundaries to prevent binary floating-point artifacts from creating unstable
candidate keys. Parameter names must exactly match the selected strategy's
metadata, and all parameters must be supplied.

The Cartesian product is counted before allocation. `maxCandidates` is
mandatory, and an over-budget product raises `OptimizationResourceLimitError`.
Candidate IDs and canonical parameter serialization are stable across
repeated runs and input-definition ordering. Duplicate values are removed and
counted. Each candidate is validated by creating and disposing an actual
`StrategyRegistry` instance; invalid combinations are recorded with their
diagnostic rather than silently repaired. This preserves constraints such as
`fastPeriod < slowPeriod` and `oversold < overbought`.

## Objectives and ranking

The implemented objectives are net profit and total return (maximize), maximum
drawdown (minimize), win rate (maximize), and profit factor (maximize). A
minimum trade count and minimum observation count may be required. Null ratios,
zero-loss profit factor, and zero-trade histories are unavailable rather than
converted to infinity or a fabricated zero. Zero-trade candidates never rank
as profitable.

Ranking first prefers available scores, then applies the objective direction,
then lower maximum drawdown, then canonical parameter key order. Worker
completion order therefore cannot select a different winner.

## Financial and memory semantics

Every evaluated candidate calls `createBacktest()` with the same execution
assumptions and candle fingerprint model as a direct backtest. Candidate
summaries retain metrics, assumptions, trade/observation counts, diagnostics,
and fingerprints. Full `BacktestResult` retention is opt-in and bounded by
`maxRetainedResults`; compact summaries are the default. A run cancelled by
an `AbortSignal` throws `OptimizationCancellationError` and does not return a
partial completed result.

This phase does not claim walk-forward isolation, out-of-sample robustness,
Worker cancellation, or predictive validity. Those are subsequent milestones.
