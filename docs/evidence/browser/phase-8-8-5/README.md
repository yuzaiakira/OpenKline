# Phase 8.8.5 — Trusted Cross-Browser Regression Verification

Sanitized evidence from the Manjaro trusted-machine run against source `241026e3b1eb3cebd0bbb78dd17daea8028b3203`.

## Verdict

Phase 8.8.4 Studio remediation **did not clear** the Phase 8.8.3 Studio failure set.

| Suite | Result |
| --- | --- |
| Standalone portable (`playwright.portable.config.ts`) | **70/70 passed** (exit 0) |
| Studio compat (`playwright.studio.compat.config.ts`) | **79 passed / 31 failed** of 110 (exit 1) |

Compared with Phase 8.8.3 (`8a62e324cf0bcb25c79d380d25269ddda33c3deb`, 105 tests, 75/30):

- **Old failures resolved:** 0 / 30
- **Old failures remaining:** 30 / 30
- **Tests added:** 5 (one new regression test × five projects)
- **Newly failing:** 1 (`mobile Studio keeps critical controls…` on `studio-mobile-chrome`, timeout)

## Environment

- Image: `mcr.microsoft.com/playwright:v1.64.1-noble`
- Digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea` (host-verified)
- Playwright: `1.64.1`
- Managed browsers: Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2

## Studio per-project

| Project | 8.8.3 P/F | 8.8.5 P/F | Notes |
| --- | ---:| ---:| --- |
| studio-chromium | 21/0 | 22/0 | New regression test passed |
| studio-firefox | 21/0 | 22/0 | New regression test passed |
| studio-webkit | 18/3 | 19/3 | New test passed; prior 3 still fail |
| studio-mobile-chrome | 5/16 | 5/17 | Prior 16 remain; new test timed out |
| studio-mobile-safari | 10/11 | 11/11 | New test passed; prior 11 remain |

## High-priority observations (from failing records)

1. **Pointer interception** still observed on mobile Chrome (e.g. `Run Backtest` blocked by `strategy-optimizer` fieldset/overlay).
2. **Drawing persistence** still fails where asserted: UI stays at `Drawings (0)` / `Drawings (1)` not found (mobile Chrome/Safari; related workspace flows).
3. **ResizeObserver** page errors still fail WebKit/mobile Safari assertions expecting an empty page-error list.
4. **Paper trading `pending`**, **alerts**, **screener**, **optimization**, and **replay/drawing** flows remain broken on the previously failing projects.
5. New Phase 8.8.4 hit-test regression test **passes** on Chromium, Firefox, WebKit, and mobile Safari emulation; **times out** on mobile Chrome.

## Local archives (not published)

- `openkline-phase-8-8-5-standalone-20261026T191031Z.tar.gz` — `87cb6754c84f75a3c82435f6f0da72eb89029d4ae3616c8234fbb07af1aa795e`
- `openkline-phase-8-8-5-studio-20261026T191031Z.tar.gz` — `38509a628a39f561e689bf6a4a5a30a7cdb7f0960ce4a440f55c70b8c7bac47a`
- `openkline-phase-8-8-5-studio-focused-diag-20261026T191031Z.tar.gz` — `8a06a0a7f46510107b98433339f74633cbef75436dae7a5bda66be33402a0ffd`

Phase 8.8.3 archives were preserved and not overwritten.

## Limitations

Not native iOS Safari / physical-device testing. Not WCAG certification. Not visual baseline approval. **Not release-ready.**
