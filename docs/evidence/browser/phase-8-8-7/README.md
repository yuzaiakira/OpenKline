# Phase 8.8.7 — Trusted Targeted Browser Diagnostics

Sanitized evidence from the Manjaro trusted-machine focused run against source `d79abbabcc3e4c055310b2058f68f19dfb179d8a` (behavioral/test source `796b930658353b22300955789efc90aa635b3327`; intervening commits documentation-only, verified).

## Verdict

**FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN**

Phase 8.8.6 harness/diagnostic repairs did **not** clear the previously failing managed-browser interactions under F1–F6. No baseline Phase 8.8.5 failure is marked resolved.

| Group | Project focus | Records | Passed | Failed |
| --- | --- | ---: | ---: | ---: |
| F1 | studio-mobile-chrome hit-testing | 1 | 0 | 1 |
| F2 | studio-mobile-chrome backtest/optimizer | 2 | 0 | 2 |
| F3 | studio-mobile-safari drawing/replay | 3 | 0 | 3 |
| F4 | studio-mobile-safari panel identity | 1 | 0 | 1 |
| F5 | studio-webkit + studio-mobile-safari ResizeObserver/workspace | 12 | 5 | 7 |
| F6 | webkit + mobile-safari + mobile-chrome async state | 15 | 4 | 11 |

## Environment

- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` (host-verified)
- Playwright: `1.64.1`
- Managed browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2

## Actionable findings for Cloud Agent

1. **F1** — After four-grid/`chart-2`/Add, timeout on single-layout `Run Backtest`/`completed`. Capture shows `Run Backtest` far off-viewport (`hitTest: null`).
2. **F2** — Both mobile-chrome backtest and bounded-optimization still timeout. End-state capture shows `Run Backtest` hittable; optimizer section large. Do not assume fieldset interception without re-checking click-time geometry.
3. **F3** — Touch step completes; canvas hit-tests to itself; `Drawings (1)` still absent. Drawing product/gesture path still broken on managed mobile Safari.
4. **F4** — Post-reload assertion still requires hidden `chart-2` indicators while `activePanel=chart-1`. Extend the narrow-layout select-before-assert pattern to the workspace-restore assertion (test contract).
5. **F5** — `ResizeObserver loop completed with undelivered notifications.` confirmed with fixture callback counts; present on failing WebKit/Safari cases. Do not suppress the warning to greenwash.
6. **F6** — `pending` order text, alert close control, and several mobile completions still missing/stalled.

## Local archive (not published)

- `openkline-phase-8-8-7-studio-focused-diag-20261027T080332Z.tar.gz` — `4bc71598f8862a43a40edf243fda2d8194f0cc80ebdbfc8f3c408a9c15cae034`

Prior Phase 8.8.5/8.8.3 archives were preserved and not overwritten.

## Limitations

Not native iOS Safari / physical-device testing. Not WCAG certification. Not visual baseline approval. **Not release-ready.** Focused results do not certify the full Studio matrix.
