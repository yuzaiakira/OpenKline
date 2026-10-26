# Screener Rule Evaluation

Phase 8.3 rules are versioned JSON data, not executable code. A rule set contains a nested `and`/`or` tree with `not` nodes and typed predicates for price, volume, and registered indicator outputs. Validation checks the version, node/depth limits, operators, finite thresholds, positive lookbacks, indicator parameters, and output IDs before evaluation. Unknown fields or rule kinds are rejected; the evaluator never uses `eval`, `new Function`, or dynamic source execution.

## Supported predicates

- price field thresholds and strict `above`/`below` crossings;
- percentage change over a fixed historical lookback;
- comparisons with the previous bar high or low;
- volume thresholds, trailing averages, and current-to-prior-average ratios;
- indicator output thresholds;
- crossings between price and an indicator, or between two registered indicator outputs;
- previous-channel breakouts using the prior completed indicator boundary.

The indicator predicate delegates parameter validation and calculation to `IndicatorRegistry`. This is the same registry used by charts and KlineScript; the screener does not maintain a second formula implementation. MACD/signal, EMA/SMA, ADX strength, Donchian, and Bollinger rules are represented through the generic indicator reference and crossing/breakout predicates.

## Causal and financial semantics

Evaluation accepts an explicit historical index and calculates indicators only from the prefix ending at that index. Future bars therefore cannot change a prior cutoff result. A crossing requires both current and previous comparable values and uses `previous <= right && current > right` for an upward cross (the inverse for downward). A persistent true condition is not re-labelled as a new crossing.

Completed bars are the default. A developing latest bar returns `unavailable` with `no-eligible-confirmed-bar`; the core does not infer finality from time. Indicator warm-up and missing volume also return `unavailable`, never false. Compound rules use three-valued logic: `AND` is false if any child is false, true only when all are true; `OR` is true if any child is true, false only when all are false; `NOT` preserves unavailable.

