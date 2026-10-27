# Phase 8.8.9 — Trusted Touch Drawing and Mobile Regression Verification

Sanitized evidence from the Manjaro trusted-machine focused run against source `112213abb8383e78511b63de2f891a8a49e97536` (behavioral/test source `95cbf47aede8046b03fba9ce476ab5e211359989`; intervening commit documentation-only, verified).

## Verdict

**FULL MATRIX NOT EXECUTED — TARGETED FAILURES REMAIN**

Priority A–C: **6** executions, **1** passed, **5** failed. Extended targeted suites and the full Studio/standalone matrices were not run.

Do **not** treat partial behavioral progress (drawings appearing before a ResizeObserver pageerror assert) as an official PASS for those identities.

| Group | Focus | Records | Passed | Failed |
| --- | --- | ---: | ---: | ---: |
| PA | studio-mobile-safari drawing / touch / reload / replay | 4 | 1 | 3 |
| PB | studio-mobile-safari panel identity after workspace restore | 1 | 0 | 1 |
| PC | studio-mobile-chrome overflow / hit-testing | 1 | 0 | 1 |

## Environment

- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` (host-verified)
- Playwright: `1.64.1`
- Managed browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2

## Priority results (official)

1. **PASS** — `studio-mobile-safari` · Studio snaps drawing anchors to visible candle timestamps and preserves raw anchors across scale changes
2. **FAIL** — `studio-mobile-safari` · Studio accepts drawing anchors from touch events without pointer compatibility events — `TypeError: Illegal constructor` in `dispatchTouchPoint` (`new Touch` / `TouchEvent`) on managed WebKit; product touch fallback **not** exercised
3. **FAIL** — `studio-mobile-safari` · Studio preserves chart type… workspace reload — final `expect(errors).toEqual([])` hit ResizeObserver pageerrors (drawing assertions had progressed)
4. **FAIL** — `studio-mobile-safari` · Studio exposes deterministic replay… — same ResizeObserver pageerror class after Drawings(1) was visible
5. **FAIL** — `studio-mobile-safari` · multi-chart Studio preserves panel identity… — Phase 8.8.8 select-before-assert restore step completed; final ResizeObserver pageerror assert failed
6. **FAIL** — `studio-mobile-chrome` · mobile Studio keeps critical controls visible… — 30s timeout awaiting chart-2 `3 indicators`; bounded overflow: `innerWidth=833`, `clientWidth=390`, `scrollWidth=833`

## Actionable findings for Cloud Agent

1. Replace or polyfill `dispatchTouchPoint` Touch/TouchEvent construction for managed WebKit (or drive touches via Playwright touchscreen APIs that still assert no synthetic pointer compatibility path) so the new regression can exercise product code.
2. Treat ResizeObserver loop pageerrors as a first-class WebKit/Safari compatibility defect or revise the pageerror contract deliberately — currently they alone FAIL reload/replay/panel-identity after drawing/restore behavior progressed.
3. Mobile Chrome layout still has excessive horizontal overflow (`scrollWidth`/`innerWidth` ~833 vs 390 CSS viewport) and the critical-controls flow still times out after four-grid + Add.
4. Only one historical failing identity is an official focused PASS: snaps drawing on `studio-mobile-safari`.

## Local archive (not published)

- `openkline-phase-8-8-9-studio-focused-diag-20261027T092523Z.tar.gz` — see `manifest.json` for SHA-256

Prior Phase 8.8.7/8.8.5/8.8.3 archives were preserved and not overwritten.

## Limitations

Not native iOS Safari / physical-device testing. Not WCAG certification. Not visual baseline approval. **Not release-ready.** Focused results do not certify the full Studio matrix.
