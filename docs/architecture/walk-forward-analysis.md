# Walk-Forward Analysis

Phase 8.2.3 adds `runWalkForward()` as a chronological evaluation layer above
the optimization core and `createBacktest()`.

## Fold construction

Splits are bar-count based and never shuffle observations. Anchored mode keeps
the training start at the first candle while advancing its end. Rolling mode
keeps a fixed training length and advances both boundaries. Each fold records
training, optional validation, gap, test, warm-up, and trading-boundary
indices. Incomplete final windows are omitted; a configuration producing no
complete fold is rejected.

## Selection and isolation

For each fold, the engine optimizes candidates on the training slice only. It
then freezes the best available candidate according to the requested training
objective and evaluates validation (when configured) and out-of-sample data
separately. Validation and out-of-sample metrics never participate in that
fold's parameter selection. Later folds are not read while earlier folds are
selected.

Out-of-sample evaluation may prepend an explicit historical warm-up slice.
The additive Backtest `tradingStartIndex` boundary lets indicators see only
bars available before the test start while suppressing warm-up signals,
orders, equity observations, and fills. Each out-of-sample account starts flat
with the configured initial capital. There is no hidden position carry between
folds.

## Aggregation

The initial aggregation policy is `reset-per-fold`. Fold metrics, trades, and
equity curves are retained independently. The aggregate reports fold count,
profitable fold count, average return/drawdown, and an independent net-profit
sum, but exposes no continuous executable equity curve. Overlapping test
windows are detected and warned about; their outcomes must not be interpreted
as a portfolio or summed trading history.

Reports retain fold IDs, boundaries, fingerprints, selected parameters,
training score/metrics, validation metrics, out-of-sample metrics/trades/equity,
assumptions, and diagnostics. A warning about historical simulated evidence,
multiple-testing bias, and overfitting is always included.
