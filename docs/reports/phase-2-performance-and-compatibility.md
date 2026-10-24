# OpenKline Phase 2.9 Performance and Compatibility Report

Date: 2026-10-25 Asia/Tehran

Status: **Open.** Chromium and Mobile Chrome emulation pass in this
environment. Firefox, WebKit, and Mobile Safari are blocked before browser
launch because their Playwright-managed binaries cannot be obtained. Phase 3
was not started.

## Scope and environment

This increment reproduced the browser benchmark, profiled the append path,
fixed a measurable append inefficiency, added median/p95 measurements, and
recorded the cross-browser blocker without weakening the browser matrix.

The reproducible reference environment was:

- Linux cloud environment;
- Node.js v24.19.0 and npm 11;
- Playwright 1.64.1;
- system Chromium 154 at `/usr/bin/chromium`;
- headless viewport 1,200 × 520;
- `--disable-gpu`, `--disable-dev-shm-usage`, and
  `--js-flags=--expose-gc`.

The Playwright matrix defines projects for Chromium, Firefox, WebKit, Pixel 7
mobile Chrome emulation, and iPhone 13 mobile Safari emulation. The default
browser command intentionally runs only Chromium so a missing compatibility
binary cannot be mistaken for a regression in the verified local baseline.

The workload uses the vanilla example, four indicators including a filled
Bollinger band, two active drawings, the shared viewport, 100 new-timestamp
updates, five same-timestamp corrections, crosshair event dispatch, and a
30-frame `requestAnimationFrame` loop.

## Browser compatibility

The actual runs were:

| Project | Browser/version | Result |
| --- | --- | --- |
| `chromium` | Chromium 154.0.0.0 at `/usr/bin/chromium` | Pass — 1 test |
| `mobile-chrome` | Chromium 154.0.0.0 with Pixel 7 emulation | Pass — 1 test, including touch tap |
| `firefox` | Playwright Firefox 157.0 expected; executable absent | Blocked at launch |
| `webkit` | Playwright WebKit 27.2 expected; executable absent | Blocked at launch |
| `mobile-safari` | Playwright WebKit 27.2 expected; executable absent | Blocked at launch |

Firefox and WebKit were not available. The exact official Playwright install
URLs for this project are:

```text
Firefox 157.0 (playwright firefox v1555)
https://cdn.playwright.dev/dbazure/download/playwright/builds/firefox/1555/firefox-debian-13.zip
https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/firefox/1555/firefox-debian-13.zip

WebKit 27.2 (playwright webkit v2370)
https://cdn.playwright.dev/dbazure/download/playwright/builds/webkit/2370/webkit-debian-13.zip
https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/webkit/2370/webkit-debian-13.zip

Error: Download failed: server returned code 403 body 'Domain forbidden'
```

The same official Playwright installation was retried with elevated local
execution permission and returned the same 403. There was no compatible
Playwright browser cache, no system `firefox`, and no preloaded official
Playwright Docker image. The pinned official image
`mcr.microsoft.com/playwright:v1.64.1-noble` was also attempted twice and
failed while pulling its image configuration with `Forbidden`. No approved
artifact mirror or trusted offline transfer was available, so no arbitrary
binary or system-browser substitution was used. No browser test was disabled
and no unsupported browser compatibility claim is made.

## Optimization and profiling

The benchmark initially used primary-candle timestamps from 2023/2024 while
the example's other series started in 2026. That made every apparent realtime
append a historical union-time insertion, invalidating the old 100,000-candle
result of roughly 12.88 FPS and 719 MB as an append measurement. The fixture
now aligns all series to the same UTC epoch.

`CandleStore` and `PointStore` now take an O(1) append path for strictly newer
timestamps while retaining binary-search replacement and insertion for equal
or historical timestamps. `SeriesCollection` already extends its cached union
time axis for a newer timestamp and invalidates only for historical insertion.
Tests preserve the sorted order and correction behavior.

The compatibility-gate 100,000-candle append profile measured approximately
3.8 ms in visible-data snapshots, 18.2 ms in renderer calls, 4.6 ms in series
updates, 3.3 ms in collection updates, 2.6 ms in store updates, and 6.3 ms in
indicator updates across the 30 update frames. No append-time shared-time-cache
invalidation occurred after the initial cache build. Historical corrections
remain intentionally more expensive because they use full recalculation for
financial-data correctness.

## Performance and memory measurements

Node model run:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.080 | 0.090 | 0.147 |
| 10,000 | 8.694 | 0.011 | 0.031 |
| 100,000 | 78.708 | 0.011 | 0.021 |

Canvas2D run from `npm run benchmark:browser`:

| Candles | Load (ms) | Nav p50/p95 (ms) | Crosshair p50/p95 (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | Frame interval p50/p95 (ms) | Frame-work p50/p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 24.9 | 1.6 / 3.9 | 0.1 / 0.7 | 144.5 | 1.445 | 48.0 | 16.6 / 16.9 | 1.0 / 1.5 | 64.79 |
| 10,000 | 95.0 | 1.0 / 5.0 | 0.1 / 0.4 | 63.6 | 0.636 | 373.9 | 16.7 / 16.9 | 1.1 / 1.4 | 62.62 |
| 100,000 | 1,306.0 | 0.8 / 7.5 | 0.2 / 0.4 | 52.5 | 0.525 | 5,403.3 | 16.6 / 16.9 | 0.7 / 1.3 | 61.97 |

For this rerun, observed Chromium heap was 1.47 MB before loading, 9.07 MB
after 1,000 candles, 60.20 MB after 10,000, and 751.48 MB before destruction
after 100,000. After `destroy()` and an explicit GC opportunity it was 1.69
MB, and `remainingCanvasCount` was zero. The peak differs substantially from
the earlier 305.32 MB observation because these are allocation/GC-sensitive
engine measurements; the post-destroy observation and canvas cleanup remained
stable. These values are not memory limits or proof of leak-freedom.

The append workload measured 61.97–64.79 FPS in this rerun, with no measured
regression in append or frame-work timing. The 100,000 correction workload
remains a technical-debt hotspot at approximately 5.40 s
for five corrections; it is reported separately and was not hidden by
downsampling or altered OHLCV semantics. A release-wide 60 FPS guarantee is
not claimed.

## Compatibility-gate verification commands

| Command | Result |
| --- | --- |
| `npm run test:browser` | Pass — Chromium 154, 1 test |
| `npx playwright test --project=mobile-chrome` | Pass — Chromium 154, Pixel 7 emulation, touch assertion |
| `npx playwright test --project=firefox` | Blocked — missing `firefox-1555` executable |
| `npx playwright test --project=webkit` | Blocked — missing `webkit-2370/pw_run.sh` |
| `npx playwright test --project=mobile-safari` | Blocked — missing `webkit-2370/pw_run.sh` |
| `npm run test:browser:compat` | Not used as primary evidence; individual projects preserved distinct blocker results |

## Regression and package verification

The following checks were run locally for this increment:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 26 tests |
| `npm run test:browser` | Pass — Chromium 154, 1 Playwright test |
| `npm run benchmark` | Pass — Node 1k/10k/100k |
| `npm run benchmark:browser` | Pass — Canvas2D 1k/10k/100k, memory, cleanup |
| `npm run profile:browser` | Pass — 100k append instrumentation |
| `npm run package:check` | Pass |
| `npm run package:smoke` | Pass — packed ESM consumer |
| React package dry run | Pass |
| Next.js production build | Pass — Next.js 15.5.28 |
| `git diff --check` | Pass |

The regression suite covers candle and point validation, append and historical
correction behavior, series lifecycle, indicators, drawings, datafeed
pagination/reconnect/cancellation, React lifecycle, browser interaction, and
chart cleanup. The browser check exercises all supported series types,
multiple series, crosshair, zoom, pan, theme changes, dynamic add/remove,
updates, drawings, resize, and destruction.

## Explicit Phase 2 acceptance matrix

| Mandatory criterion | Evidence | Status |
| --- | --- | --- |
| Supported series and shared interaction lifecycle | Unit/integration suite and Chromium test | Pass |
| Indicator, pane, drawing, and datafeed behavior | 26 tests and existing Phase 2 verification | Pass |
| 1k/10k/100k Canvas2D performance and memory evidence | Corrected benchmark and profiler above | Pass with 100k correction debt |
| Append path approximately 60 FPS in reference run | 62.19–63.86 FPS and frame p50/p95 above | Pass for this environment/run |
| Median/p95 navigation and crosshair measurements | Browser benchmark output above | Pass; crosshair is event-path measurement |
| Resource cleanup after destruction | 1.69 MB observed heap and zero remaining canvas | Pass for measured run |
| Chromium browser interaction | Playwright test | Pass |
| Firefox browser interaction | Official Playwright CDN returned 403 | Open / environment-blocked |
| WebKit browser interaction | Official Playwright CDN returned 403 | Open / environment-blocked |
| Mobile Chrome/touch verification | Pixel 7 emulation on Chromium 154; touch drawing assertion | Pass |
| Mobile Safari/touch verification | WebKit executable blocked with 403 download failure | Open / environment-blocked |
| Vanilla, React, and Next.js package consumption | Package, React, and Next checks | Pass in available Chromium/Node scope |
| No GitHub Actions | No `.github/workflows/` directory | Pass |

Phase 2 is **not complete** while the browser-engine and Mobile Safari rows
remain open. Proposed owner action: run the unchanged project commands in an
environment with access to the official Playwright CDN or the pinned official
Docker image, then attach the Firefox/WebKit/Mobile Safari results. This is a
proposal to satisfy the existing gate, not a unilateral change to its
acceptance criteria.

## Documentation and public API status

The public API remains framework-independent and no internal profiler hooks are
exported. The append optimization is internal to the existing stores. The
benchmark guide documents the fixture, measurement semantics, profiler, and
memory caveats. The PDR, roadmap, architecture notes, API guides, and final
verification report continue to distinguish implemented behavior from deferred
Plugin SDK, KlineScript runtime, accessibility UI, visual baselines, and
vendor-specific integrations.

## Phase 2 readiness assessment

The foundation is ready for continued Phase 2 hardening and for rerunning the
same checks in an environment that permits official Firefox and WebKit browser
downloads. It is not a closed release milestone. Phase 3 Plugin SDK work was
not started and remains gated on the open compatibility and mobile criteria.
