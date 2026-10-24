# OpenKline Phase 2 Final Verification

Date: 2026-10-24 UTC

Status: **Open — Chromium and local production checks pass, but Phase 2 is not
closed because Firefox, WebKit, and mobile verification are blocked or
unavailable in this environment.**

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

## Verification commands

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 26 tests |
| `npm run test:browser` | Pass — Chromium 154, 1 Playwright test |
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

Chromium 154 is available at `/usr/bin/chromium` and passed. Firefox and
WebKit binaries are not installed. Playwright 1.64.1 installation was tried
with a task-local cache:

```text
PLAYWRIGHT_BROWSERS_PATH=/tmp/openkline-playwright-browsers npx playwright install firefox webkit
Error: Download failed: server returned code 403 body 'Domain forbidden'
https://cdn.playwright.dev/...
https://playwright.download.prss.microsoft.com/...
```

The same official installation was retried with elevated local execution
permission and returned the same 403. The system has no `firefox` executable.
Firefox, WebKit/Safari, mobile emulation, and physical mobile-device testing
are therefore **unverified**, not silently treated as passing. No test was
disabled.

## Performance and memory

See the detailed reproducible report:
[phase-2-performance-and-compatibility.md](phase-2-performance-and-compatibility.md).

The reference run used Linux headless Chromium 154, a 1,200 × 520 viewport,
`--disable-gpu`, four indicators including a filled Bollinger band, two
drawings, 100 appends, five corrections, and a 30-frame update loop:

| Candles | Load (ms) | Append/update (ms) | 5 corrections (ms) | Frame interval p50/p95 (ms) | Frame-work p50/p95 (ms) | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 28.7 | 1.570 | 52.4 | 16.7 / 17.1 | 1.0 / 1.5 | 63.86 |
| 10,000 | 116.4 | 0.787 | 515.0 | 16.7 / 18.4 | 0.9 / 4.4 | 62.19 |
| 100,000 | 1,678.9 | 0.545 | 6,980.7 | 16.6 / 16.8 | 0.8 / 1.3 | 63.09 |

Observed heap was 1.47 MB before loading, 11.18 MB after 1,000 candles, 57.21
MB after 10,000, and 305.32 MB before destruction after 100,000. After
`destroy()` and an explicit GC opportunity it was 1.69 MB; remaining canvas
count was zero. These are engine-specific observations, not memory limits.

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
| Firefox browser interaction | Playwright binary download blocked with 403 | Open |
| WebKit browser interaction | Playwright binary download blocked with 403 | Open |
| Mobile/touch verification | No mobile browser/device available | Open |
| Performance and memory with indicators/drawings | Corrected Canvas2D benchmark and profiler | Pass with correction debt documented |
| React and Next.js compatibility | React checks and Next production build | Pass in available environment |
| Package installation and declarations | Package dry run and ESM smoke consumer | Pass |
| No GitHub Actions | No `.github/workflows/` directory | Pass |

Phase 2 cannot be marked complete while the open browser and mobile rows
remain. The exact blocker and rerun command are preserved above.

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
- Final local/remote SHA verification is recorded in the delivery after the
  performance increment is committed.
