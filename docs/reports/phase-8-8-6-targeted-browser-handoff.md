# Phase 8.8.6 — Targeted Browser Handoff

This handoff is for execution on the trusted Manjaro machine with the official
Playwright container. It is not a result report and contains no pass claim.

## Exact source and environment

- Behavioral/test source revision: `796b930658353b22300955789efc90aa635b3327`
- Branch: `work`
- Playwright: `1.64.1`
- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Expected digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`
- Required distribution: Playwright-managed binaries only
- Physical devices: not covered

The later documentation-only commits do not change the chart or browser test
source. The trusted operator must still checkout the final `work` revision and
record the exact checked-out SHA in the generated evidence.

## Focused order

Run the focused cases before the full Studio matrix. Keep each project and
browser identity in the output; do not substitute system Chromium or native
Safari.

| ID | Project(s) | Test identity / focus | Expected observable | Diagnostic evidence |
| --- | --- | --- | --- | --- |
| F1 | `studio-mobile-chrome` | `multi-chart-studio.spec.ts` — `mobile Studio keeps critical controls visible and hit-testable after responsive layout changes` | Four-grid → active chart 2 → `Add` receives the pointer; single layout → `Run Backtest` receives the pointer and reaches `completed`. | On failure, `studio-diagnostics.json` records viewport, target rect, top hit-test element, active panel, and resize count. |
| F2 | `studio-mobile-chrome` | `multi-chart-studio.spec.ts` — `Studio runs a real chart-scoped backtest` and `optimization-studio.spec.ts` — bounded controls/cancellation | No optimizer/fieldset intercepts `Run Backtest` or `Start optimization`; cancellation leaves no partial result. | Target and ancestor hit-test chain plus named test steps. |
| F3 | `studio-mobile-safari` | `multi-chart-studio.spec.ts` and `studio.spec.ts` drawing/replay tests | Touch-emulated canvas taps create `Drawings (1)` and persist two raw anchors through scale/replay changes. | Canvas rect, hit-test, input project, page errors. |
| F4 | `studio-mobile-safari` | `multi-chart-studio.spec.ts` — panel identity/state/workspace | Select each panel before asserting its synchronized symbol; inactive panels may remain hidden at narrow width. | Active panel value and all panel visibility/display summaries. |
| F5 | `studio-webkit`, `studio-mobile-safari` | representative chart mount/resize tests plus `studio.spec.ts` workspace/alert tests | No `ResizeObserver loop completed with undelivered notifications.` page error; callback count remains bounded during layout transitions. | Resize callback count and last bounded target entries. |
| F6 | `studio-webkit`, `studio-mobile-safari`, `studio-mobile-chrome` | `paper-trading-studio.spec.ts`, `multi-chart-studio.spec.ts` alert, `screener.spec.ts` scan | Pending order, alert list, and screener `completed` state appear after the named action without timeout. | Last action, active panel, status controls, page/console errors. |

## Trusted execution commands

From the checked-out repository, use the proven isolated container setup:

```bash
docker run --rm \
  -v "$REPO:/work" -w /work \
  -e HOME=/tmp/openkline-home \
  -e npm_config_cache=/tmp/openkline-npm-cache \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  bash -lc 'npm ci --ignore-scripts --no-audit --no-fund && npm run build'
```

Then run focused projects inside the same container, for example:

```bash
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-mobile-chrome \
  --grep 'mobile Studio keeps critical|chart-scoped backtest|bounded optimization'
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-mobile-safari \
  --grep 'drawing anchors|replay playback|panel identity'
npx playwright test --config playwright.studio.compat.config.ts \
  --project=studio-webkit --project=studio-mobile-safari \
  --grep 'ResizeObserver|workspace reload|local alert|paper trading|screener'
```

After the focused run, execute the complete workflow and preserve the full
`environment.json`, `summary.json`, `playwright-results.json`,
`playwright-stderr.log`, and `test-results/` directory. The project’s existing
`npm run studio:browser:verify` collector may be used for the full matrix; its
result, not the expected count, is authoritative.

## Decision rule

Do not mark any baseline row resolved from a focused pass alone. A failure is
resolved only when the same test identity and project passes in a trusted
rerun, the old failure record is reconciled, and the full Studio matrix shows
no regression. If the focused or full run remains blocked, preserve the
failure output and keep the Phase 8.8.6 gate open.
