# Phase 8.8.6 — Studio Root-Cause Matrix

Status: diagnostic baseline; no managed-browser rerun has been performed on the Phase 8.8.6 source yet.

Baseline evidence: `docs/evidence/browser/phase-8-8-5/`, source
`241026e3b1eb3cebd0bbb78dd17daea8028b3203`, Playwright `1.64.1`, trusted
official container. The baseline is evidence-integrity validated locally, but
the Studio behavior result remains **79 passed / 31 failed / 110 total**.

## Falsifiable hypotheses

| ID | Observed class | Current hypothesis | Falsifiable observation | Status before trusted rerun |
| --- | --- | --- | --- | --- |
| H1 | Mobile Chrome timeouts | A responsive flow waits on a control or state that is covered, hidden, or never reached after the first layout transition. | Diagnostics show the last completed named step, active panel, target rect, hit-test result, and whether the awaited status node exists. | Unconfirmed |
| H2 | Pointer interception | The strategy optimizer or another normal-flow/overlay element is the top hit-test target for a control that Playwright tries to click. | At the target center, `elementFromPoint` is not the intended button; computed `position`, `z-index`, and `pointer-events` identify the interceptor. | Supported by baseline error text; geometry unmeasured |
| H3 | Drawing not found | Mobile runs use mouse input against a touch-emulated page, so the chart does not receive the expected gesture contract. | Repeating the same test with `touchscreen.tap` on touch contexts produces `Drawings (1)` and two persisted anchors without changing chart code. | Test-harness repair applied; managed rerun pending |
| H4 | Hidden-panel assertion | Narrow layout intentionally hides inactive panels; asserting an inactive panel as visible is inconsistent with the documented responsive behavior. | Selecting the panel before asserting makes the state visible while preserving synchronized symbol state. | Confirmed from CSS and test contract; test assertion repaired |
| H5 | WebKit/Safari ResizeObserver errors | Resize notifications are delivered in a loop during responsive layout or chart mount, and the browser reports an undelivered notification error. | The diagnostic fixture records callback count and targets; a focused test shows whether the error is present before/after the resize transition. | Supported by six baseline records; product cause unconfirmed |
| H6 | Paper `pending`, alert, screener, optimization, replay | An asynchronous state update, active-panel selection, or browser-specific scheduling issue is masking the expected result. | Focused steps and diagnostics identify the last completed action and status text; a source-level fix is only accepted after a trusted reproduction and focused rerun. | Unconfirmed; no speculative product fix |

## Diagnostic measurements

The Studio browser fixture (`tests/react-browser/studio-test.ts`) installs a
bounded diagnostic-only `ResizeObserver` wrapper before page application code
runs. On an unexpected test result it attaches `studio-diagnostics.json` with:

- CSS viewport, `innerWidth`, document client size, visual viewport, DPR,
  viewport meta, media-query result, and document scroll width;
- active panel value and a bounded summary of every chart panel's visibility,
  rectangle, and computed display state;
- hit-test summaries for the chart canvas, strategy optimizer, alerts, and
  critical controls (`Add`, `Run Backtest`, `Create alert`, `Run scan`, and
  related actions), including the top element and ancestor chain;
- bounded page errors, console warnings/errors, and the last 30 resize entries.

The fixture captures no local storage, credentials, host paths, screenshots, or
unbounded DOM. It does not suppress errors or alter application behavior.

## Baseline reconciliation

Every one of the 31 Phase 8.8.5 Studio failure records is accounted for below.
The classification and title are copied from the sanitized evidence ledger;
“pending” means that the record is not considered resolved until the trusted
focused rerun observes the expected behavior.

| # | Project | Test | Class | Current disposition |
| ---: | --- | --- | --- | --- |
| 1 | mobile-chrome | accessibility: interactive controls | timeout | pending H1 |
| 2 | mobile-chrome | accessibility: dialog focus | timeout | pending H1 |
| 3 | mobile-chrome | multi-chart: panel/state/workspace | timeout | pending H1/H4 |
| 4 | mobile-chrome | multi-chart: management dialogs | timeout | pending H1 |
| 5 | mobile-chrome | multi-chart: drawing anchors | element-not-found | H3 repair; rerun pending |
| 6 | mobile-chrome | multi-chart: chart-scoped backtest | pointer-interception | pending H2 |
| 7 | mobile-chrome | responsive controls regression | timeout | pending H1/H2 |
| 8 | mobile-chrome | large Worker backtest cancellation | timeout | pending H1/H6 |
| 9 | mobile-safari | multi-chart: panel/state/workspace | element-hidden | H4 test contract repaired; rerun pending |
| 10 | mobile-safari | multi-chart: drawing anchors | element-not-found | H3 repair; rerun pending |
| 11 | mobile-safari | multi-chart: chart-scoped backtest | ResizeObserver error | pending H5 |
| 12 | mobile-safari | multi-chart: Worker cancellation | ResizeObserver error | pending H5 |
| 13 | mobile-chrome | optimization: run/apply/paper state | timeout | pending H1/H6 |
| 14 | mobile-chrome | optimization: bounded controls/cancel | pointer-interception | pending H2 |
| 15 | mobile-safari | optimization: run/apply/paper state | ResizeObserver error | pending H5/H6 |
| 16 | webkit | paper trading: fill/account scope | element-not-found | pending H6 |
| 17 | mobile-chrome | paper trading: fill/account scope | timeout | pending H1/H6 |
| 18 | mobile-safari | paper trading: fill/account scope | element-not-found | pending H5/H6 |
| 19 | mobile-chrome | screener: scan/filter/watch | timeout | pending H1/H6 |
| 20 | mobile-safari | screener: scan/filter/watch | ResizeObserver error | pending H5/H6 |
| 21 | webkit | workspace reload and drawing state | ResizeObserver error | pending H5/H6 |
| 22 | webkit | local alert lifecycle | element-not-found | pending H6 |
| 23 | mobile-chrome | workspace reload and drawing state | timeout | pending H1/H3 |
| 24 | mobile-chrome | touch-sized viewport | timeout | pending H1 |
| 25 | mobile-chrome | replay playback/workspace restore | timeout | H3 repair; pending rerun |
| 26 | mobile-chrome | local alert lifecycle | timeout | pending H1/H6 |
| 27 | mobile-chrome | KlineScript editor/Worker | timeout | pending H1/H6 |
| 28 | mobile-safari | workspace reload and drawing state | element-not-found | H3 repair; pending rerun |
| 29 | mobile-safari | replay playback/workspace restore | element-not-found | H3 repair; pending rerun |
| 30 | mobile-safari | local alert lifecycle | element-not-found | pending H5/H6 |
| 31 | mobile-safari | KlineScript editor/Worker | ResizeObserver error | pending H5/H6 |

## Acceptance boundary

The local Chromium focused run after the diagnostic/test-harness changes passed
4/4 selected tests. This is not a replacement for the five-browser managed
rerun. No row above is marked resolved from local Chromium evidence, and Phase
8.8.6 remains open until the trusted focused and full matrices are rerun.
