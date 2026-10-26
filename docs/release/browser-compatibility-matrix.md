# Phase 8.6 browser compatibility matrix

Playwright version: `1.64.1`  
Current tested source commit: `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`
GitHub evidence branch: `qa/phase-8-6-1-browser-evidence`
Evidence branch commit: `ac408424f8c1880615fea6b0994dc3b7abbddb0a`
Integrated into `work`: `13091be35f16faba1257fc1efa7bad2d72209096`
Official container: `mcr.microsoft.com/playwright:v1.64.1-noble`  
Container digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`  
Managed artifact policy: exact Playwright-managed binaries only

Local Chromium diagnostic evidence (system `/usr/bin/chromium`) remains a
separate provenance lane and is **not** a substitute for the portable
managed-browser gate below.

| Project | Status | Evidence |
| --- | --- | --- |
| Chromium desktop | **PASS — TRUSTED MACHINE; RECORDS VALIDATED** | 14/14 Playwright-managed tests for source commit `19c8698`; compact records validated from GitHub. |
| Firefox | **PASS — TRUSTED MACHINE; RECORDS VALIDATED** | 14/14 Playwright-managed tests for source commit `19c8698`; compact records validated from GitHub. |
| WebKit | **PASS — TRUSTED MACHINE; RECORDS VALIDATED** | 14/14 Playwright-managed tests for source commit `19c8698`; compact records validated from GitHub. |
| Mobile Chrome / Pixel 7 emulation | **PASS — TRUSTED MACHINE; RECORDS VALIDATED** | 14/14 Playwright-managed tests; Pixel 7 is emulation, not a physical device. |
| Mobile Safari / iPhone 13 emulation | **PASS — TRUSTED MACHINE; RECORDS VALIDATED** | 14/14 Playwright-managed tests; zoom uses labeled public API `chart.zoom`, not native pinch. |
| Physical Android/iOS | **NOT TESTED** | Emulation is not physical-device verification. |

**Gate label:** `TRUSTED-MACHINE CROSS-BROWSER PASS; GITHUB RECORD CONSISTENCY VALIDATED`
The cloud validated the compact GitHub records and their provenance. It did
not execute Firefox, WebKit, or mobile projects, and it did not recompute the
original trusted-machine archive hashes. This is **not** native iOS Safari
verification, physical-device compatibility, accessibility conformance,
visual-regression approval, or release authorization.

## Current trusted-machine evidence

Host: Manjaro Linux (`CodeLab`, `7.1.13-2-MANJARO`)  
Source commit: `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`
Archive: `openkline-phase-8-6-1-matrix-20261026T153655Z.tar.gz`
SHA-256 (trusted host): `73bc6e2b12db91c87a85c1e82bcaf35395ba8291a1d2b39629f7ebf69d77fe3c`
Totals: 70 expected, 0 unexpected, 0 skipped, 0 flaky; status `verified`

The compact records are preserved at
[`docs/evidence/browser/phase-8-6-1/`](../evidence/browser/phase-8-6-1/).
`npm run evidence:browser:check` validates their source SHA, official
container provenance, five project totals, unique test records, SHA-256
formats, and sanitization. It does not recompute the archive hash because the
original archive remains on the trusted machine.

## Historical Phase 8.5 evidence

Archive: `openkline-post-harness-fix-matrix-20261026T1545Z.tar.gz`
SHA-256 (trusted host): `3cec7e41be217ade9aa0c3275daf7d4f2ecacbad332f2b60e7cefa12b2d230ec`
Source commit: `4d689c86f619f32e4d91f90c4e3b03576ea38d6c`
Totals: 65 expected, 0 unexpected, 0 skipped, 0 flaky; status `verified`

Prior Manjaro reports are preserved, including
`openkline-webkit-container-verification-20261026T140430Z.tar.gz`
(SHA-256 `48057d80fa79d6dd9e0b77abfbbd20c7a14a7125662725508aea84b79cff5c14`),
which recorded the pre-fix Mobile Safari `mouse.wheel` harness failure.

### Cloud validation boundary

The cloud checkout contains compact GitHub evidence, not either original
compressed archive. The two archive SHA-256 values above are trusted-machine
records and were not recomputed in cloud. The cloud result is therefore
`PASS` for evidence consistency and provenance, while archive transfer/hash
validation remains a separate handoff task.

## Executed commands

```bash
docker run --rm \
  -v "$REPO:/work" -w /work \
  -e HOME=/tmp \
  -e npm_config_cache=/tmp/npm-cache \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  bash -lc 'npm ci && npm run build && npm run browser:verify'
```

## Behavioral scope

The suite exercises chart rendering, candle/OHLC/line/area/volume series,
indicators, panes, Bollinger fills, pan/zoom (desktop wheel + Mobile Safari API
zoom), crosshair, drawings, pointer/touch interactions, themes, resize, replay,
alerts, Datafeed cleanup, Workers, Screener fixtures, and chart destruction.
Accessibility, visual regression, and physical-device gates remain separate.
