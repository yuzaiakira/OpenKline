# Phase 8.5 browser compatibility matrix

Playwright version: `1.64.1`  
Portable managed-browser commit: `4d689c86f619f32e4d91f90c4e3b03576ea38d6c`  
Official container: `mcr.microsoft.com/playwright:v1.64.1-noble`  
Container digest: `sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`  
Managed artifact policy: exact Playwright-managed binaries only

Local Chromium diagnostic evidence (system `/usr/bin/chromium`) remains a
separate provenance lane and is **not** a substitute for the portable
managed-browser gate below.

| Project | Status | Evidence |
| --- | --- | --- |
| Chromium desktop | **PASS** (portable managed) | 13/13 on commit `4d689c8` inside the pinned Playwright container. |
| Firefox | **PASS** (portable managed) | 13/13 on the same commit and container. |
| WebKit | **PASS** (portable managed) | 13/13; desktop wheel zoom remains native `mouse.wheel`. |
| Mobile Chrome / Pixel 7 emulation | **PASS** (portable managed) | 13/13; touch drawing and native wheel zoom covered. |
| Mobile Safari / iPhone 13 emulation | **PASS** (portable managed) | 13/13. Zoom uses labeled **API** `chart.zoom(0.8)` because Playwright rejects `mouse.wheel` on mobile WebKit; not a native pinch claim. |
| Physical Android/iOS | **NOT TESTED** | Emulation is not physical-device verification. |

**Gate label:** `CROSS-BROWSER AUTOMATED EMULATION VERIFIED`  
This is **not** native iOS Safari verification, physical-device compatibility,
accessibility conformance, visual-regression approval, or release authorization.

## Trusted-machine evidence

Host: Manjaro Linux (`CodeLab`, `7.1.13-2-MANJARO`)  
Archive: `openkline-post-harness-fix-matrix-20261026T1545Z.tar.gz`  
SHA-256: `3cec7e41be217ade9aa0c3275daf7d4f2ecacbad332f2b60e7cefa12b2d230ec`  
Totals: 65 expected, 0 unexpected, 0 skipped, 0 flaky; status `verified`

Prior Manjaro reports are preserved, including
`openkline-webkit-container-verification-20261026T140430Z.tar.gz`
(SHA-256 `48057d80fa79d6dd9e0b77abfbbd20c7a14a7125662725508aea84b79cff5c14`),
which recorded the pre-fix Mobile Safari `mouse.wheel` harness failure.

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
