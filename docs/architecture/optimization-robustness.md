# Optimization Robustness and Reporting

Phase 8.2.4 adds descriptive diagnostics without turning historical
optimization into a predictive claim.

## Parameter sensitivity

`analyzeParameterSensitivity()` evaluates a deterministic neighborhood around
one selected configuration. Numeric and integer metadata parameters vary by a
configured step and radius; nonnumeric parameters remain fixed. Every
neighbor still passes through the strategy registry and the existing
financial engine. Invalid neighbors are diagnostics, not repaired values.

The report gives valid neighbor count, score distribution, absolute/relative
score range, drawdown range, trade-count range, and a descriptive stability
flag. It does not provide confidence intervals or claim that a locally stable
surface predicts future markets.

## Fold degradation and stability

`analyzeWalkForwardRobustness()` compares each fold's training and
out-of-sample return, drawdown, and trade count. It counts parameter changes
between adjacent selected folds and reports the fraction of profitable OOS
folds. Warnings explicitly identify multiple-testing bias, overfitting risk,
and overlapping-window limitations.

## Reproducible exports

JSON exports include an explicit local analysis-completion timestamp separate
from market timestamps, schema version, engine/report metadata, fingerprints,
assumptions, ranges or split configuration, and data-only summaries. CSV
exports provide candidate leaderboards and fold summaries. Functions,
callbacks, secrets, and full backtest payloads are excluded from compact
exports.
