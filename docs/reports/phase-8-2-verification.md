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

## Phase 8.2.5 — Studio integration

Implemented:

- Added a chart/panel/symbol/timeframe-scoped Strategy Optimizer to the private
  Next.js Studio. It exposes built-in strategy selection, bounded parameter
  ranges, objectives, execution costs, dataset selection, progress, cancel,
  sorting/filtering, ranked results, and data-only JSON/CSV export.
- Added a Walk-Forward Studio tab for anchored/rolling configuration,
  training/test/step/validation/gap/warm-up bars, fold timeline, training/OOS
  metrics, selected parameters, warnings, fold-return visualization, and JSON
  and CSV export.
- Added an explicit Apply-to-Strategy-Tester path. It is scoped to the active
  chart and does not submit or mutate Paper Trading orders or balances.
- Added cleanup for optimization Worker sessions, Walk-Forward timers, abort
  signals, stale results, and panel remounts. Deterministic large fixtures
  support local cancel verification.

Verification:

| Check | Result |
| --- | --- |
| `npm test` | Pass: 133 tests |
| `npm run typecheck` | Pass |
| `npm --prefix examples/nextjs-app-router run build` | Pass |
| `npx playwright test --config playwright.react.config.ts --project=chromium` | Pass: 15 tests |

The new browser coverage is real local Chromium evidence only. Firefox,
WebKit, Mobile Safari, physical-device, formal accessibility, and dedicated
optimization benchmark gates remain open for Phase 8.2.6.

## Phase 8.2.6 — final local verification

### Optimization benchmark

Command: `npm run benchmark:optimization` followed by a direct rerun of the
same built script after correcting the small-sample p95 selection. Environment:
Node.js `v24.19.0`, Linux, three repetitions, nine EMA Crossover candidates,
compact summaries, and `--expose-gc`. These are local reference-engine
observations, not browser or Worker capacity claims.

| Candles | Median grid ms | p95 grid ms | Heap delta MB | Evaluated |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 55.288 | 90.460 | +0.53 | 9/9 |
| 10,000 | 314.551 | 430.850 | +0.15 | 9/9 |
| 100,000 | 4,433.167 | 5,865.533 | -0.65 | 9/9 |

The deterministic 1,000-candle anchored Walk-Forward workload produced seven
folds on every repetition: median `259.759 ms`, p95 `505.710 ms`. Neighboring
parameter sensitivity took `28.994 ms`, evaluated eight valid neighbors, and
reported descriptive `stable: true`. Heap deltas are process observations
after explicit GC opportunities and are not leak-proof limits. No unsupported
FPS, throughput, or profitability target is inferred.

### Browser and package evidence

| Check | Result | Provenance |
| --- | --- | --- |
| `npm test` | Pass: 133 tests | Node reference suite |
| `npm run typecheck` | Pass | TypeScript/core/React packages |
| Next.js production build | Pass | Next.js 16.4.3, Webpack |
| React Studio browser suite | Pass: 15 tests | System Chromium 154.0.8037.57; Playwright 1.64.1 |
| Vanilla Chromium + Mobile Chrome | Pass: 16 tests, 8 each | System Chromium 154.0.8037.57; Mobile Chrome is Pixel 7 emulation |
| `npm run package:check` | Pass, 342 package files | dry-run tarball; no publish |
| `npm run package:smoke` | Pass | clean tarball ESM consumer |
| `npm run package:audit` | Pass | license remains pending owner approval |

The Chromium configurations use the repository's explicitly configured system
Chromium executable. This is diagnostic/emulation evidence and is not a
Playwright-managed artifact claim.

Firefox, WebKit, and Mobile Safari remain blocked, not passed. Playwright
1.64.1 requires Firefox `157.0` build `1555` and WebKit `27.2` build `2370`;
their managed executables are absent. The official download attempt with
`PLAYWRIGHT_BROWSERS_PATH=/tmp/openkline-playwright-browsers npx playwright
install firefox webkit` returned HTTP 403 `Domain forbidden` from both official
CDN/fallback endpoints. The pinned official Docker image
`mcr.microsoft.com/playwright:v1.64.1-noble` also failed with HTTP 403 while
pulling its image configuration. The real compatibility run attempted all 24
Firefox/WebKit/Mobile Safari test cases and all stopped at browser launch due
to missing managed executables. No system Firefox, WebKit, or Safari substitute
was used, TLS verification was not disabled, and no arbitrary binary was
introduced.

Physical devices, formal accessibility/assistive-technology review, visual
regression review, and long-duration mobile memory evidence were not tested.

### Acceptance matrix

| Criterion | Status | Evidence or blocker |
| --- | --- | --- |
| 8.2.0 account recovery follow-up | Implemented / verified | `6ecef92`, Node/React/Chromium checks |
| 8.2.1 deterministic optimization core | Implemented / verified | `07aa8a4`, Node parity and diagnostics |
| 8.2.2 bounded Worker orchestration | Implemented / verified | `327cfa1`, concurrency/crash/cancel tests and Chromium UI |
| 8.2.3 leakage-safe WFA | Implemented / verified | `a3d4c24`, fold and anti-leak tests |
| 8.2.4 robustness and exports | Implemented / verified | `225f39b`, sensitivity/degradation/export tests |
| 8.2.5 Studio integration | Implemented / verified locally | `d9cfa9c`, 15 React Chromium tests and mobile cancel path |
| 8.2.6 optimization benchmark | Implemented / verified locally | benchmark command and measurements above |
| Firefox | Blocked by environment | Managed Firefox 157 artifact unavailable; CDN/Docker HTTP 403 |
| WebKit | Blocked by environment | Managed WebKit 27.2 artifact unavailable; CDN/Docker HTTP 403 |
| Mobile Safari | Blocked by environment | Depends on managed WebKit artifact |
| Physical-device verification | Not tested | No physical device attached |
| Formal accessibility review | Not tested | No assistive-technology audit performed |
| Public release/npm/license adoption | Not authorized | No publish, tag, release, or effective license change |

### Git and phase readiness

All Phase 8.2 commits were created with author and committer
`Akira Yuzai <yuzai.akira@gmail.com>`, use Conventional Commit messages, and
were pushed immediately to `origin/work`. The final documentation/benchmark
commit is the only remaining synchronization step for this report; its hash
will be recorded after push.

Phase 8.2 remains **open**. The optimization, WFA, Worker, robustness, Studio,
testing, package, and local benchmark implementation gates are complete and
evidence-backed, but the mandatory cross-browser and other explicitly
unverified gates are not closed. The milestone must not be represented as
full cross-browser compatibility or as authorization to publish. The next
safe action is to rerun the unchanged compatibility matrix from a trusted
machine or official pinned Playwright environment with Firefox/WebKit
artifacts available, then update this matrix with actual versions and results.
