# Strategy history evaluation optimization

The StrategyRegistry keeps the anti-lookahead boundary while avoiding an
unnecessary allocation for strategies that do not use historical context.

## Contract

`StrategyDefinition.requiresHistory` is an additive trusted-definition hint. It
defaults to `true`, preserving the original behavior for custom strategies.
When it is `false`, the evaluator receives a shared immutable empty history and
must use its own state, `candle`, and `previousCandle` inputs instead. The four
built-in Indicator Engine strategies use this mode because none reads
`context.history`.

When history is required, each bar receives an array-compatible causal view.
The view has a fixed boundary for that bar and supports normal indexed access,
iteration, `slice`, `map`, and `reduce` without copying the entire prefix when
the view is created. A retained view remains bounded to its original bar; it
does not become a reference to the complete source as evaluation advances.

The view is a compatibility optimization for trusted TypeScript strategies,
not a sandbox. A strategy must not close over external future data. Explicit
materialization such as `history.slice()` remains available and intentionally
costs memory proportional to the requested range.

## Verification

The strategy tests cover legacy array consumers, indexing, map/reduce, retained
references, future-index attempts, `Array.isArray`, deterministic large input,
and built-in signal parity. The Phase 8.0 benchmark compares the old
per-bar-prefix workload with the optimized built-in path at 1k/10k/100k bars.
The recorded 100k EMA Trend workload changed from approximately 14.5 seconds
to 0.354 seconds, while signal IDs, counts, exports, fingerprints, and trade
results remained equal. These are local observations, not universal latency
guarantees.
