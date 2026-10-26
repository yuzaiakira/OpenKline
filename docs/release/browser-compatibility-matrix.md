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

## Phase 8.8.1 integrated standalone evidence

The compact evidence pack from `qa/phase-8-8-1-browser-evidence` was reviewed
and integrated at commit `f77e124f8277022e36247fd5ab2326fdf192c5ea`. It tests
source commit `2aabccf184e3c791c18ac3daa4bbeef89d89ed63` in the official
Playwright 1.64.1 container. The cloud validator keeps this provenance
separate from current source verification and does not recompute the trusted
archive SHA-256.

| Project | Result | Browser distribution |
| --- | --- | --- |
| Chromium | **14/14** | Playwright-managed |
| Firefox | **14/14** | Playwright-managed |
| WebKit | **14/14** | Playwright-managed |
| Mobile Chrome | **14/14** | Playwright-managed Pixel 7 emulation |
| Mobile Safari | **14/14** | Playwright-managed iPhone 13 / WebKit emulation |
| **Total** | **70 expected, 0 unexpected, 0 skipped, 0 flaky** | |

Archive SHA-256 stated by the trusted host:
`ade5be7fb4fb598d2db79b59c489673244c73315f6e060f059f2880687634bbe`.
The archive remains on that host and was not transferred to the cloud.

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

## Phase 8.8 current-revision boundary

Phase 8.8.2 changes are prepared on `work` after the Phase 8.8.1 evidence run.
The latest source commit is `81ce4c351ab13419ed21852f549063ea9cdb6bdc`; the
trusted 70/70 records target the earlier `2aabccf…` source and do not certify
the viewport fix or the Studio workflow. The next trusted-machine handoff
must run the final source revision in both the standalone and separate Studio
managed-browser workflows before any current-revision compatibility statement
is made.

## Phase 8.8.2 Studio compatibility boundary

Studio is a private Next.js reference consumer, not part of the standalone
library acceptance matrix. The trusted supplemental probe (21 functional
tests per project, visual captures excluded) remains unresolved:

| Project | Passed | Failed | Status |
| --- | ---: | ---: | --- |
| Chromium | 21 | 0 | Trusted supplemental result |
| Firefox | 21 | 0 | Trusted supplemental result |
| WebKit | 18 | 3 | **Open** |
| Mobile Chrome | 5 | 16 | **Open** |
| Mobile Safari | 10 | 11 | **Open** |

The compact GitHub pack contains aggregate totals only, not individual failure
names, errors, or traces. No cause is inferred for the WebKit or mobile
failures from those totals. Cloud system Chromium ran 42 diagnostic cases
(21 desktop + 21 mobile emulation) before the viewport fix: desktop passed
21/21 and mobile passed 5/21. A focused post-fix diagnostic confirmed the
viewport metadata is rendered, but this system browser still reported a
870px layout viewport for a 390/412px emulated page; it is insufficient to
certify managed mobile behavior.

The new optional workflow is `npm run studio:browser:verify` with
`playwright.studio.compat.config.ts`. It excludes only the two visual-review
capture tests, uses five Playwright-managed projects, writes timestamped
artifacts under `artifacts/studio-browser-verification/`, and classifies
results as `PASS`, `BLOCKED`, or `FAIL`. It is independent from
`playwright.portable.config.ts` and never falls back to system browsers.

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
