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
| `npm test` | Pass: 126 tests |
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
