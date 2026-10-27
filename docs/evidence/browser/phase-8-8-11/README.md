# Phase 8.8.11 — Trusted Targeted Cross-Browser Repair Verification

Sanitized evidence from the Manjaro trusted-machine run against source `0e84d13ca83b81866900571ad798ca69de90911f` (behavioral/test source `e03d93722d743fda0c00e860ac1b41d07187214e`; intervening commit documentation-only, verified).

## Verdict

**NOT RELEASE READY** — focused Priority A–D largely green; full Studio matrix still has **7** failures.

| Scope | Records | Passed | Failed |
| --- | ---: | ---: | ---: |
| Primary focused (A–D) | 9 | 8 | 1 |
| Extended focused (PE1–PE2) | 18 | 14 | 4 |
| Standalone portable full | 70 | 70 | 0 |
| Studio compat full | 120 | 113 | 7 |

## Environment

- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` (host-verified)
- Playwright: `1.64.1`
- Managed browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2

## Primary focused results

1. **PASS** mobile-safari · touch fallback without pointer compatibility events (no Illegal constructor; synthetic harness ≠ native touch claim)
2. **PASS** mobile-safari · snaps drawing anchors…
3. **PASS** mobile-safari · workspace reload drawing state (ResizeObserver cleared)
4. **PASS** mobile-safari · replay restore (ResizeObserver cleared)
5. **PASS** mobile-safari · multi-chart panel identity restore (ResizeObserver cleared)
6. **PASS** mobile-chrome · critical controls / indicator transition
7. **PASS** mobile-chrome · top actions within representative widths (new)
8. **PASS** webkit · workspace reload drawing state (new)
9. **FAIL** webkit · local alert — `Studio close alert` text not found after Alerts (1)

## Phase 8.8.9 comparison

All five previously failing focused identities are now **PASS**. The prior single PASS (snaps drawing) remains PASS.

## Remaining full-matrix failures (7)

- `studio-firefox` drawing trio (snaps / reload / replay) — Drawings (1) never appears
- `studio-webkit` + `studio-mobile-safari` paper trading — `pending` text missing
- `studio-webkit` + `studio-mobile-safari` local alert — `Studio close alert` text missing

## Local archives (not published)

- focused: `openkline-phase-8-8-11-studio-focused-diag-20261027T110549Z.tar.gz` — `3d0f89692fb6a51c14d0e988c1de53af7a7d9bd9def425ce38dee601f6e088bb`
- standalone: `openkline-phase-8-8-11-standalone-20261027T110549Z.tar.gz` — `0ce99243970cad1af38921d2fa7552904ffd6be625af86429a037c71a67432ca`
- studio full: `openkline-phase-8-8-11-studio-full-20261027T110549Z.tar.gz` — `9a2299183575d162ca346ff6407567782452b77e4e06c6d7fb6bfbf9b08fdd20`

Prior Phase 8.8.9/8.8.7 archives preserved unchanged.

## Limitations

Not native iOS/Android. Synthetic touch fallback is not a native-touch verification. Not WCAG/visual approval. **Not release-ready.**
