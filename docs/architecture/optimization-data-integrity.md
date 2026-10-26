# Optimization Data Integrity

The optimization and Walk-Forward layers preserve the existing causal
financial boundary:

- candle input is validated and fingerprinted before evaluation;
- strategy selection sees only the current training slice;
- warm-up bars are historical context and cannot create test-period trades;
- the Backtest `tradingStartIndex` starts a fresh flat account at the test
  boundary;
- out-of-sample equity contains only observations at or after that boundary;
- candidate results carry strategy/version, parameters, fingerprints,
  assumptions, job/fold identity, and diagnostics;
- cancellation never returns a partial completed optimization report;
- Paper Trading is not called and no backtest result activates an account.

The data-integrity tests mutate out-of-sample candles and later folds, compare
selected parameters, verify boundary order behavior, and compare repeated
analysis IDs and metrics. These tests do not establish predictive power.
