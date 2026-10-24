# OpenKline Phase 2 Final Verification

Date: 2026-10-25 (Asia/Tehran)

Status: **Open — hardening implementation is complete, but Phase 2 is not
closed because Firefox and WebKit verification is blocked by the environment.**

Phase 3 Plugin SDK work was intentionally not started. The execution brief
requires Phase 2 to close before Phase 3 begins, and this report preserves that
gate.

## Scope completed in this increment

- Filled Bollinger Bands are now a reusable Canvas2D band-region rendering
  contract rather than three unrelated lines.
- Band outputs support `upper`/`lower` roles, matching timestamps, warm-up
  gaps, pane clipping, zoom/pan, realtime updates, HiDPI rendering, theme
  defaults, and configurable `fillColor`/`fillOpacity` through
  `ChartIndicatorApi.setOutputStyle`.
- The vanilla example demonstrates a filled Bollinger band.
- Playwright verifies visible filled-band pixels, output styling, and the
  existing interaction/lifecycle surface.
- The browser benchmark now runs with four indicators, a filled Bollinger
  band, and two active drawings during the measured workload.
- Earlier hardening fixed indicator ID collisions after non-tail removal,
  indicator disposal during chart destruction, and pane `minHeight` handling.

## Verification commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 26 tests |
| `npm run test:browser` | Pass — Chromium 154, 1 Playwright test |
| `npm run benchmark` | Pass — Node model 1k/10k/100k |
| `npm run benchmark:browser` | Pass — Canvas2D indicators/drawings 1k/10k/100k |
| `npm run package:check` | Pass |
| `npm run package:smoke` | Pass — packed ESM consumer |
| React package dry run | Pass |
| Next.js production build | Pass — Next.js 15.5.28 |
| `git diff --check` | Pass |

The Chromium test covers candles, line/area/volume series, indicator panes,
filled bands, crosshair, zoom, pan, theme changes, realtime correction,
dynamic series and indicator lifecycle, drawing creation/serialization,
resize, and chart destruction.

## Cross-browser status and blocker

Chromium 154 is available at `/usr/bin/chromium` and passed. Firefox and
WebKit binaries are not installed in this environment. Both installation
attempts were made with Playwright 1.64.1 using a task-local browser cache:

```text
PLAYWRIGHT_BROWSERS_PATH=/tmp/openkline-playwright-browsers npx playwright install firefox webkit
Error: Download failed: server returned code 403 body 'Domain forbidden'
https://cdn.playwright.dev/...
https://playwright.download.prss.microsoft.com/...
```

The retry with elevated local execution permission produced the same 403, and
the system has no `firefox` executable. Consequently Firefox, WebKit/Safari,
mobile emulation, and actual mobile-device testing are **unverified**, not
silently treated as passing. No failing browser test was disabled.

## Performance and memory measurements

Node.js v24.19.0 model baseline:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 1.949 | 0.066 | 0.134 |
| 10,000 | 8.041 | 0.008 | 0.024 |
| 100,000 | 68.261 | 0.011 | 0.020 |

Canvas2D baseline: headless Chromium 154, Linux, 1,200 × 520 viewport,
`--disable-gpu`, four indicators including filled Bollinger Bands, two active
drawings, 100 append updates, five corrections, and a 30-frame update loop:

| Candles | Load (ms) | Navigation (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | rAF frame (ms) | FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 22.9 | 12.3 | 126.0 | 1.260 | 44.1 | 15.540 | 64.35 |
| 10,000 | 103.3 | 10.1 | 466.6 | 4.666 | 414.4 | 16.337 | 61.21 |
| 100,000 | 1,453.1 | 8.1 | 6,679.0 | 66.790 | 5,800.5 | 77.630 | 12.88 |

Observed Chromium heap values were 1.47 MB before loading, 8.64 MB after 1,000
candles, 72.48 MB after 10,000, and 719.33 MB after 100,000. The observed
value after destruction was 1.65 MB and `remainingCanvasCount` was zero. These
are environment-specific observations, not release limits. The 100,000-candle
workload is below a 60 FPS target and remains a measurable performance debt;
the benchmark does not hide that result or alter OHLCV semantics through
downsampling.

## Acceptance matrix

| Mandatory Phase 2 requirement | Evidence | Status |
| --- | --- | --- |
| Technical indicators and correction-safe lifecycle | 26 unit/integration tests | Pass |
| Synchronized panes and independent scales | Model tests and Chromium interaction | Pass |
| Drawing creation, selection, editing, serialization, undo/redo | Engine tests and Chromium interaction | Partial — full browser matrix blocked |
| Filled Bollinger Bands | Renderer contract, API docs, pixel assertion in Playwright | Pass |
| Chromium browser interaction | `npm run test:browser` | Pass |
| Firefox browser interaction | Playwright binary download blocked with 403 | Open |
| WebKit browser interaction | Playwright binary download blocked with 403 | Open |
| Mobile/touch verification | No actual mobile device; no mobile browser binary | Open |
| Performance and memory with indicators/drawings | Reproducible Node/Canvas2D benchmark above | Pass with 100k debt |
| React and Next.js compatibility | React tests/package and Next production build | Pass — Chromium-only client behavior |
| Package installation and declarations | Package dry run and ESM smoke consumer | Pass |
| No GitHub Actions | No `.github/workflows/` directory | Pass |

Phase 2 cannot be marked complete while the Open rows remain. The exact
environment blocker is recorded so a later environment with permitted browser
downloads can rerun the same local Playwright suite without changing the
acceptance definition.

## Phase 3 gate

The Plugin SDK and Customization Platform were not implemented in this
increment. This is deliberate: beginning Phase 3 while the required Phase 2
browser matrix is unverified would violate the milestone gate. Once Firefox,
WebKit, and the agreed mobile/touch scope are available and pass, Phase 3 can
start with the existing trusted extension seam as its compatibility boundary.

## Git verification

- Branch: `work`
- Latest implementation commit: `b4411de` (`feat(indicators): render filled
  band regions`)
- Previous hardening commit: `f032342`
- Author and committer: `Akira Yuzai <yuzai.akira@gmail.com>`
- Both commits were pushed immediately after successful verification.
- No force-push, history rewrite, or GitHub Actions was used.
- The final documentation commit for this report will be recorded after the
  report is committed and the remote SHA is checked against `HEAD`.

## Documentation updated

- `docs/api/chart.md`
- `docs/api/indicators.md`
- `docs/architecture/indicator-engine.md`
- `docs/development/benchmarks.md`
- `docs/reports/phase-2-verification.md`
- this report

The roadmap remains open for Phase 2 final browser verification. No Plugin SDK
or KlineScript runtime is documented as implemented.
