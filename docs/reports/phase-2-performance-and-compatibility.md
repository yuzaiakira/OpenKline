# OpenKline Phase 2.9 Performance and Compatibility Report

Date: 2026-10-24 UTC

Status: **Open.** Chromium performance and lifecycle checks pass in this
environment. Firefox and WebKit installation is blocked by the environment's
network policy, and mobile/device verification was not available. Phase 3 was
not started.

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

The workload uses the vanilla example, four indicators including a filled
Bollinger band, two active drawings, the shared viewport, 100 new-timestamp
updates, five same-timestamp corrections, crosshair event dispatch, and a
30-frame `requestAnimationFrame` loop.

## Browser compatibility

Chromium passed the existing Playwright interaction test and the Canvas2D
benchmark. Firefox and WebKit were not available:

```text
PLAYWRIGHT_BROWSERS_PATH=/tmp/openkline-playwright-browsers npx playwright install firefox webkit
Error: Download failed: server returned code 403 body 'Domain forbidden'
https://cdn.playwright.dev/...
https://playwright.download.prss.microsoft.com/...
```

The same official Playwright installation was retried with elevated local
execution permission and returned the same 403. No system `firefox` executable
was present. Therefore Firefox, WebKit/Safari, mobile emulation, and physical
mobile-device testing remain **unverified**. No browser test was disabled and
no unsupported browser compatibility claim is made.

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

The corrected 100,000-candle append profile measured approximately 7.6 ms in
visible-data snapshots, 35.8 ms in renderer calls, 7.2 ms in series updates,
6.5 ms in collection updates, 5.5 ms in store updates, and 16.4 ms in
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
| 1,000 | 28.7 | 1.2 / 2.3 | 0.1 / 0.2 | 157.0 | 1.570 | 52.4 | 16.7 / 17.1 | 1.0 / 1.5 | 63.86 |
| 10,000 | 116.4 | 0.9 / 5.6 | 0.1 / 0.4 | 78.7 | 0.787 | 515.0 | 16.7 / 18.4 | 0.9 / 4.4 | 62.19 |
| 100,000 | 1,678.9 | 0.9 / 11.4 | 0.1 / 0.4 | 54.5 | 0.545 | 6,980.7 | 16.6 / 16.8 | 0.8 / 1.3 | 63.09 |

For this run, observed Chromium heap was 1.47 MB before loading, 11.18 MB
after 1,000 candles, 57.21 MB after 10,000, and 305.32 MB before destruction
after 100,000. After `destroy()` and an explicit GC opportunity it was 1.69
MB, and `remainingCanvasCount` was zero. These are engine-specific
observations, not memory limits or proof of leak-freedom.

The append workload measured approximately 60 FPS in this run. The 100,000
correction workload remains a technical-debt hotspot at approximately 6.98 s
for five corrections; it is reported separately and was not hidden by
downsampling or altered OHLCV semantics. A release-wide 60 FPS guarantee is
not claimed.

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
| Mobile/touch verification | No mobile browser/device available | Open |
| Vanilla, React, and Next.js package consumption | Package, React, and Next checks | Pass in available Chromium/Node scope |
| No GitHub Actions | No `.github/workflows/` directory | Pass |

Phase 2 is **not complete** while the browser-engine and mobile rows remain
open. The milestone stays open rather than converting blocked checks into
passes.

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
