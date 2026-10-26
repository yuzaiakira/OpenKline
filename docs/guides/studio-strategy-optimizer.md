# Studio Strategy Optimizer

The private Next.js Studio exposes the Phase 8.2 optimization API in a
chart-scoped **Strategy Optimizer** panel. It is an analysis tool: it never
submits Paper Trading orders and does not mutate the paper account.

## Grid optimization

1. Select a built-in strategy and either active chart history or a deterministic
   100k/500k-bar fixture.
2. Enter inclusive parameter ranges and a step for every strategy parameter.
3. Select an objective, execution capital, sizing, commission, slippage, and a
   maximum candidate budget.
4. Start the run. Candidates execute through the bounded public
   `createOptimizationWorker()` boundary and report progress.
5. Sort/filter the bounded leaderboard, export JSON/CSV, or apply an available
   candidate to the chart-scoped Strategy Tester.

Applying a candidate only changes Strategy Tester inputs. The active panel,
symbol, and timeframe scope prevents stale selections from another chart from
being applied. The result must still be explicitly run in Strategy Tester
before historical markers are displayed.

## Walk-Forward

The Walk-Forward tab accepts anchored or rolling training, test, step,
validation, gap, and warm-up bars. It calls `runWalkForward()` with the same
execution assumptions and bounded search space. The result shows an explicit
fold timeline, training/OOS metrics, selected parameters, independent OOS
return bars, warnings, and JSON/fold-CSV exports.

Walk-Forward results are reset-per-fold historical observations. Overlapping
test windows and the absence of a continuous executable equity curve are shown
explicitly. A report is not a prediction and cannot be interpreted as paper
or live execution.

## Lifecycle and mobile behavior

Changing the active chart remounts the optimizer with its new scope. Worker
sessions, timers, subscriptions, and pending Walk-Forward cancellation
signals are disposed on unmount. Native labels, progress elements, tables,
and buttons remain available at the compact mobile layout. Firefox, WebKit,
Mobile Safari, physical-device, and formal accessibility review remain
separate acceptance gates.
