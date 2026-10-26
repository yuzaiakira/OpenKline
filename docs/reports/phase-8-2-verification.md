# OpenKline Phase 8.2 Verification

## Scope and status

This report is intentionally incremental. Phase 8.2.0 is implemented and
locally verified. Phase 8.2.1 through 8.2.6 remain open until their actual
optimization, walk-forward, worker, robustness, Studio, and final verification
evidence is produced. No historical result is interpreted as a profitability
prediction.

## Phase 8.2.0 — baseline and Paper Trading hardening

Implemented:

- Added explicit `Save account locally` and `Restore account locally` actions
  to the existing Studio Paper Trading panel.
- Used `serializePaperTradingDocument()` and
  `restorePaperTradingAccount()` rather than duplicating account state logic.
- Scoped the local-storage key by chart panel and symbol.
- Kept simulated account state separate from chart workspace state and did not
  add cloud storage, broker connectivity, or an optimization-to-order bridge.
- Documented the example's single-writer limitation: concurrent browser tabs
  are not merged or coordinated.

Baseline evidence:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass: 121 tests |
| `npm run build && npx playwright test --project=mobile-chrome` | Pass: 8 tests |

The Mobile Chrome run used Playwright's configured Pixel 7 emulation with the
repository's system Chromium executable. It is not physical-device evidence.

## Open gates

Firefox, WebKit, Mobile Safari, physical-device testing, formal accessibility
review, and visual-regression review remain open. No claim is made for those
targets. Optimization and Walk-Forward acceptance are not started by this
focused hardening increment.

## Phase 8.2.1 — optimization core

Implemented:

- Framework-independent `src/optimization/` public API.
- Deterministic bounded Grid Search with integer ranges, decimal ranges,
  explicit values, fixed parameters, canonical serialization, stable IDs, and
  duplicate accounting.
- Strategy-specific validation through the actual `StrategyRegistry`, with
  invalid combinations recorded instead of silently repaired.
- Net profit, total return, maximum drawdown, win rate, and profit factor
  objectives with explicit maximize/minimize direction, minimum trade and
  observation filters, null-safe ratios, zero-trade exclusion, and stable
  tie-breaking.
- Candidate progress, resource-limit diagnostics, cancellation that cannot
  publish a partial completed report, input fingerprints, assumptions, and
  opt-in bounded full-result retention.
- Direct parity test against `serializeBacktestResult()` from `createBacktest()`.

Verification:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 128 tests |
| `npm run typecheck` | Pass |

Worker execution, walk-forward leakage tests, robustness reports, Studio
optimizer UI, optimization benchmarks, and export formats remain open for
their specified milestones.

## Phase 8.2.2 — Worker orchestration

Implemented:

- Added `createOptimizationWorker()` over the existing typed
  `createBacktestWorker()` boundary.
- Added bounded concurrency, deterministic candidate-index result ownership,
  progress/status aggregation, job IDs, candidate timeout, overall timeout,
  crash/startup retry, cancellation, supersession, and disposal cleanup.
- Kept Worker execution restricted to the built-in trusted strategy registry;
  custom registries remain synchronous.
- Added tests for maximum active Worker count, financial result ranking,
  startup crash recovery, cancellation, supersession, and cleanup.

Verification:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 128 tests |
| `npm run typecheck` | Pass |

Strict Walk-Forward isolation, robustness analysis, Studio workflows, and
optimization benchmarks remain open.

## Phase 8.2.3 — Walk-Forward engine

Implemented:

- Added anchored and rolling chronological fold construction with training,
  optional validation, gap, test, warm-up, and trading-boundary metadata.
- Added the additive Backtest `tradingStartIndex` contract. Warm-up signals
  cannot create an OOS order/fill, OOS equity starts at the boundary, and each
  fold account starts flat.
- Added training-only candidate selection, frozen-parameter validation/OOS
  runs, fold fingerprints, metrics, trades, equity, assumptions, diagnostics,
  reproducibility IDs, and reset-per-fold aggregation.
- Detects overlapping tests and explicitly withholds a continuous executable
  equity curve; reports historical/overfitting warnings.
- Added anti-leakage tests for changed OOS data, later folds, boundary fills,
  warm-up observations, overlap handling, and repeated-run identity.

Verification:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 132 tests |
| `npm run typecheck` | Pass |

Robustness sensitivity/degradation analysis, Studio integration, and
optimization benchmarks remain open.

## Phase 8.2.4 — robustness and reporting

Implemented:

- Added deterministic neighboring-parameter sensitivity with valid-neighbor
  counts, score distribution/range, drawdown variation, trade-count
  variation, and descriptive stability diagnostics.
- Added Walk-Forward training versus OOS return/drawdown/trade-count
  degradation, adjacent parameter-change counts, profitable-fold consistency,
  and explicit multiple-testing/overfitting warnings.
- Added versioned JSON optimization and Walk-Forward reports, candidate
  leaderboard CSV, and fold summary CSV. Exports separate local analysis time
  from market timestamps and omit executable functions/secrets/full payloads.
- Added deterministic tests for sensitivity, degradation, export metadata,
  CSV columns, and data-only serialization.

Verification:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 133 tests |
| `npm run typecheck` | Pass |

Studio integration and dedicated optimization performance benchmarks remain
open.
