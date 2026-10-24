# OpenKline Phase 2 Final Verification

Date: 2026-10-25 Asia/Tehran

Status: **Open — Chromium and Mobile Chrome emulation pass, but Phase 2 is not
closed because Firefox, WebKit, and Mobile Safari are blocked before launch by
the environment.**

Phase 3 Plugin SDK work was intentionally not started. The milestone gate
requires Phase 2 verification to close before Phase 3 begins.

## Implemented and hardened scope

- Technical indicators, synchronized analysis panes, independent scales, and
  correction-safe lifecycle remain implemented and tested.
- Browser-neutral drawings support creation, selection, editing, styling,
  visibility, locking, z-order, hit testing, undo/redo, and serialization.
- Filled Bollinger Bands use the reusable band rendering contract with output
  roles and configurable fill styling.
- Candlestick, line, area, and volume series share one viewport, crosshair,
  tooltip, style, dynamic lifecycle, and Canvas2D renderer.
- Historical/realtime datafeed contracts and deterministic REST/WebSocket
  reference adapters remain vendor-neutral and tested.
- `CandleStore` and `PointStore` use an O(1) strictly-newer append path while
  preserving binary-search replacement and historical correction semantics.
- The browser benchmark now uses aligned timestamps, measures median/p95
  navigation, crosshair event work, frame intervals, synchronous frame work,
  memory, and destruction cleanup. `profile:browser` records diagnostic hot
  spots for the 100,000-candle append path.
- Playwright projects now explicitly cover Chromium, Firefox, WebKit, Pixel 7
  mobile Chrome, and iPhone 13 mobile Safari. Mobile Chrome includes a real
  Playwright touch-tap drawing assertion.

## Verification commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 26 tests |
| `npm run test:browser` | Pass — Chromium 154, 1 Playwright test |
| `npx playwright test --project=mobile-chrome` | Pass — Chromium 154, Pixel 7 emulation, touch assertion |
| `npx playwright test --project=firefox` | Blocked — missing `firefox-1555` executable |
| `npx playwright test --project=webkit` | Blocked — missing `webkit-2370/pw_run.sh` |
| `npx playwright test --project=mobile-safari` | Blocked — missing `webkit-2370/pw_run.sh` |
| `npm run benchmark` | Pass — Node 1k/10k/100k |
| `npm run benchmark:browser` | Pass — Canvas2D 1k/10k/100k |
| `npm run profile:browser` | Pass — 100k append instrumentation |
| `npm run package:check` | Pass |
| `npm run package:smoke` | Pass — packed ESM consumer |
| React package dry run | Pass |
| Next.js production build | Pass — Next.js 15.5.28 |
| `git diff --check` | Pass |

The Chromium test covers candles, line/area/volume series, multiple series,
indicator panes, filled bands, crosshair, zoom, pan, theme changes, realtime
correction, dynamic series and indicator lifecycle, drawing creation and
serialization, resize, and chart destruction.

## Cross-browser status and blocker

Chromium 154 is available at `/usr/bin/chromium` and passed. Mobile Chrome
emulation also passed, including a touch-created drawing. Firefox and WebKit
binaries are not installed. Playwright 1.64.1 installation was tried with a
task-local cache:

```text
PLAYWRIGHT_BROWSERS_PATH=/tmp/openkline-playwright-browsers npx playwright install firefox webkit
Error: Download failed: server returned code 403 body 'Domain forbidden'
https://cdn.playwright.dev/...
https://playwright.download.prss.microsoft.com/...
```

The same official installation was retried with elevated local execution
permission and returned the same 403. The pinned official Docker image
`mcr.microsoft.com/playwright:v1.64.1-noble` was also attempted twice and
failed with `Forbidden` while pulling its image configuration. The system has
no `firefox` executable and no compatible Playwright browser cache. Firefox,
WebKit/Safari, and Mobile Safari are therefore **blocked**, not silently
treated as passing. No test was disabled and no arbitrary browser binary was
used.

## Performance and memory

See the detailed reproducible report:
[phase-2-performance-and-compatibility.md](phase-2-performance-and-compatibility.md).

The reference run used Linux headless Chromium 154, a 1,200 × 520 viewport,
`--disable-gpu`, four indicators including a filled Bollinger band, two
drawings, 100 appends, five corrections, and a 30-frame update loop:

| Candles | Load (ms) | Append/update (ms) | 5 corrections (ms) | Frame interval p50/p95 (ms) | Frame-work p50/p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 24.9 | 1.445 | 48.0 | 16.6 / 16.9 | 1.0 / 1.5 | 64.79 |
| 10,000 | 95.0 | 0.636 | 373.9 | 16.7 / 16.9 | 1.1 / 1.4 | 62.62 |
| 100,000 | 1,306.0 | 0.525 | 5,403.3 | 16.6 / 16.9 | 0.7 / 1.3 | 61.97 |

Observed heap in this rerun was 1.47 MB before loading, 9.07 MB after 1,000
candles, 60.20 MB after 10,000, and 751.48 MB before destruction after
100,000. After `destroy()` and an explicit GC opportunity it was 1.69 MB;
remaining canvas count was zero. The peak is allocation/GC-sensitive and is
not treated as a leak or a memory limit; post-destroy cleanup remained stable.

The earlier approximately 12.88 FPS / 719 MB result was diagnosed as an
invalid append fixture: primary and secondary series used different timestamp
epochs, forcing historical union-time invalidation. It is not used as the
current append result. The corrected benchmark still records the slower
full-recalculation correction path separately and makes no universal 60 FPS
claim.

## Acceptance matrix

| Mandatory Phase 2 requirement | Evidence | Status |
| --- | --- | --- |
| Technical indicators and correction-safe lifecycle | Unit/integration tests | Pass |
| Synchronized panes and independent scales | Model tests and Chromium interaction | Pass |
| Drawing creation, editing, serialization, undo/redo | Engine tests and Chromium interaction | Pass with full browser matrix open |
| Filled Bollinger Bands | Renderer contract and pixel assertion | Pass |
| Chromium browser interaction | `npm run test:browser` | Pass |
| Firefox browser interaction | Playwright binary download and launch blocked with 403 / missing `firefox-1555` | Open |
| WebKit browser interaction | Playwright binary download and launch blocked with 403 / missing `webkit-2370` | Open |
| Mobile Chrome/touch verification | Pixel 7 emulation on Chromium 154 with touch assertion | Pass |
| Mobile Safari/touch verification | WebKit binary unavailable | Open |
| Performance and memory with indicators/drawings | Corrected Canvas2D benchmark and profiler | Pass with correction debt documented |
| React and Next.js compatibility | React checks and Next production build | Pass in available environment |
| Package installation and declarations | Package dry run and ESM smoke consumer | Pass |
| No GitHub Actions | No `.github/workflows/` directory | Pass |

Phase 2 cannot be marked complete while the open browser rows remain. Proposed
owner action: rerun the unchanged Firefox, WebKit, and Mobile Safari projects
from an environment with access to the official Playwright CDN or pinned
official Docker image. This preserves the existing gate and does not change
acceptance criteria unilaterally.

## Public API and documentation status

The public TypeScript API remains framework-independent; the append optimization
and profiler instrumentation are internal and do not expose implementation
details. API and architecture documentation covers the implemented series,
indicators, panes, drawings, datafeeds, extension boundary, lifecycle, and
integration examples. The PDR and roadmap explicitly keep Plugin SDK,
KlineScript runtime, accessibility UI, visual regression baselines,
vendor-specific adapters, and WebGL/WebGPU deferred.

## Phase 2 readiness assessment

**Ready for continued engineering and a rerun in an environment with permitted
Firefox/WebKit downloads; not a closed release milestone.** Phase 3 remains
gated and was not started.

## Git verification

- All commits in this increment use `Akira Yuzai <yuzai.akira@gmail.com>` as
  author and committer.
- No `.github/workflows/` directory exists.
- No force-push or history rewrite was used.
- Each successful commit is pushed immediately to `origin/work`.
- Performance increment `e8a3c06` (`perf(chart): optimize append updates and
  browser profiling`) was pushed immediately to `origin/work`.
- The final local/remote SHA verification is repeated after this report
  synchronization commit and is included in the delivery.
