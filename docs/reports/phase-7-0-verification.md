# Phase 7.0 verification

Verification date: 2026-10-25 (UTC)

Phase 7.0 implementation is complete through the Studio integration increment,
but the milestone is **not formally closed**. Local Chromium, mobile Chromium
emulation, package, and performance evidence is positive. Firefox, WebKit, and
Mobile Safari still cannot be run because the matching Playwright-managed
executables are absent. Inherited Phase 6 accessibility and physical-device
acceptance also remain open. This report does not treat an unavailable browser
as a passing browser.

## Delivered capabilities

- One canonical primary `PriceScale` now supports linear, logarithmic,
  percentage, and indexed modes. It owns raw/display conversion for rendering,
  crosshair formatting, drawings, plugin contexts, autoscale/manual range,
  margins, diagnostics, and workspace state.
- The shared `TimeScale` produces adaptive UTC tick candidates from
  milliseconds through years. `Intl` formats locale and named-timezone labels,
  and the Canvas renderer suppresses overlapping measured labels.
- OHLC, hollow candlesticks, display-only Heikin-Ashi, and baseline series use
  the existing series store, pane layout, time viewport, price scale,
  interaction, and lifecycle. Heikin-Ashi derives only its visible projection;
  public data, workspaces, and indicators retain raw OHLCV.
- The private Next.js Studio uses only public chart APIs to select Candles,
  OHLC, Hollow Candles, Heikin-Ashi, Line, Area, and Baseline presentations.
  It exposes primary scale mode, autoscale, axis visibility, margins, and
  reset, then reconstructs its controls from a restored workspace.

## Public API verification

The public surface was exercised without importing model, renderer, series
store, or indicator internals:

| API area | Verification |
| --- | --- |
| Price scale | Node tests cover raw-anchor conversion, invalid domains, workspace parsing, and `PriceScale` modes; Studio changes settings through `getPriceScaleOptions()`, `setPriceScaleOptions()`, and `resetPriceScale()`. |
| Time axis | Node tests cover adaptive UTC ticks and named-timezone formatting; Chromium renders the public chart. |
| Series | Node and Chromium tests cover `addOhlcSeries()`, `addHollowCandlestickSeries()`, `addHeikinAshiSeries()`, and `addBaselineSeries()`, including data retention, serialization, rendering, and removal. |
| Workspace | The Studio Chromium workflow saves and reloads presentation, linear scale mode, light theme, EMA, and two raw trend-line anchors. |
| Lifecycle | The React Strict Mode/remount workflow and browser destruction assertions pass; the browser benchmark observes zero remaining canvases after `destroy()`. |

## Local test results

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test` | Passed: 59 Node tests. |
| `npm run test:browser` | Passed: 4 Chromium Canvas/browser tests. |
| `npm run test:react:browser` | Passed: 3 Chromium React/Studio tests. |
| `npx playwright test --project=mobile-chrome` | Passed: 4 Pixel 7 Chromium-emulation tests. |
| `npm run build --prefix examples/nextjs-app-router` | Passed: Next.js 16.4.3 optimized production build. |
| `npm run package:smoke` | Passed: packed `openkline` ESM consumer and packed Vanilla ESM/TypeScript React consumer checks. |
| `node scripts/consumer-preview-smoke.mjs` | Passed: independent packed `openkline` ESM installation. |

The Studio workflow explicitly performs the required sequence with deterministic
data: Candles, OHLC, Heikin-Ashi, logarithmic scale, EMA, two-point trend line,
linear scale with anchor equality, light theme, save, reload, load, resize, Fit,
and cleanup through the existing React lifecycle test. It also records no page
errors. The mobile test verifies Area, OHLC, and percentage-scale selection at
a touch-sized viewport.

## Browser compatibility status

Playwright is 1.64.1. The local Chromium executable is
`/usr/bin/chromium` reporting HeadlessChrome 154.0.0.0. It is intentionally
configured for Chromium and Pixel 7 emulation only. It is not substituted for
Firefox, WebKit, or Mobile Safari.

| Target | Status | Evidence |
| --- | --- | --- |
| Chromium 154 | Verified locally | Four browser tests cover rendering, interactions, KlineScript cleanup, plugin example, and the professional chart types. |
| Mobile Chrome (Pixel 7 emulation) | Verified locally | The same four browser tests pass with Playwright's Pixel 7 device profile and the configured Chromium executable. |
| Firefox | Blocked by environment | Playwright requires `firefox-1555/firefox/firefox`; the managed executable is absent. No system Firefox was used. |
| WebKit | Blocked by environment | Playwright requires `webkit-2370/pw_run.sh`; the managed executable is absent. |
| Mobile Safari | Blocked by environment | This project correctly uses Playwright WebKit with the iPhone 13 profile; its required managed WebKit executable is absent. |
| Physical touch devices | Not tested | Pixel 7 emulation is responsive/input evidence, not hardware validation. |

`npm run test:browser:compat` was run once against the exact project
configuration. The four Mobile Chrome tests passed after the rendering test was
corrected to add its series inside the active narrow viewport. All Firefox,
WebKit, and Mobile Safari cases were blocked before test execution by the
missing managed binaries. No browser download was retried and no TLS or binary
trust policy was weakened.

## Canvas2D performance and memory observation

`npm run benchmark:browser` completed in headless Chromium 154 at a
1,200 × 520 viewport with `--disable-gpu` and `--js-flags=--expose-gc`. The
workload includes Canvas rendering, four indicators including filled Bollinger
bands, two drawings, navigation, 100 realtime appends, five corrections,
crosshair dispatch, and a 30-frame loop. Values are one local observation, not
a device-independent guarantee.

| Candles | Load ms | Nav p50 / p95 ms | 100 appends ms | Append/update ms | Corrections (5) ms | Frame-work p50 / p95 ms | rAF FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 25.7 | 3.4 / 6.4 | 198.1 | 1.981 | 44.2 | 1.5 / 2.2 | 64.61 |
| 10,000 | 97.9 | 2.2 / 2.7 | 102.0 | 1.020 | 350.5 | 1.1 / 1.7 | 61.68 |
| 100,000 | 1,363.3 | 1.6 / 2.3 | 104.3 | 1.043 | 5,947.8 | 1.1 / 1.6 | 62.81 |

For 100,000 candles, crosshair p50/p95 was 0.1/0.2 ms and frame-interval
p50/p95 was 16.6/17.0 ms. Heap observations were 1.80 MB before loading,
12.02 MB after 1,000 candles, 61.80 MB after 10,000, 553.42 MB before
destruction after 100,000, and 2.02 MB after `destroy()` plus a GC opportunity.
The benchmark reported zero remaining canvases. Correction cost remains a known
accuracy-preserving full recalculation path, not an O(1) realtime append path.

## Documentation and remaining technical debt

The PDR, roadmap, price-scale, time-axis, chart-types, Studio architecture,
Studio guide, chart/customization API references, and benchmark guide describe
only implemented behavior. In particular, they distinguish display-only
Heikin-Ashi from raw market data and responsive Chromium evidence from Safari
verification.

Remaining work is intentionally visible:

- Install the exact Playwright-managed Firefox and WebKit artifacts through an
  approved supported source or trusted offline transfer, then run the blocked
  compatibility suite. Do not replace them with arbitrary system browsers.
- Complete the inherited Phase 6 manual assistive-technology/visual-regression
  and physical mobile-device gates.
- Exchange-session calendars remain outside Phase 7.0; time labels are elapsed
  UTC with locale/timezone formatting.
- Historical corrections on very large datasets deliberately recompute affected
  history for financial correctness and are measurably slower than appends.

## Acceptance matrix and release decision

| Phase 7.0 criterion | Status | Basis |
| --- | --- | --- |
| Canonical primary price-scale modes and raw anchors | Verified locally | Node tests, public API, workspace tests, Studio workflow. |
| Adaptive locale/timezone time axis | Verified locally | Node tick/formatting test and Chromium renderer coverage. |
| OHLC, hollow, Heikin-Ashi, baseline | Verified locally | Node data/workspace tests and Chromium rendering/removal test. |
| Shared viewport, crosshair, panes, lifecycle | Verified locally | Existing core/React/browser coverage and benchmark destruction check. |
| Studio end-to-end workflow | Verified locally | Three Chromium React/Studio tests, including persisted scale/series/indicator/drawing state. |
| Package and production Next.js consumer | Verified locally | Packed-consumer smoke checks and Next.js production build. |
| 1k/10k/100k Canvas2D measurements | Measured locally | Reproducible browser benchmark values above. |
| Firefox | Blocked by environment | Required official Playwright executable missing. |
| WebKit and Mobile Safari | Blocked by environment | Required official Playwright executable missing. |
| Mobile Chrome emulation | Verified locally | Four Pixel 7 Chromium-emulation tests pass. |
| Formal accessibility and physical-device acceptance | Not tested / inherited open gate | Not satisfied by browser automation or emulation. |

Therefore Phase 7.0 remains **open** until the blocked managed-browser tests
and inherited mandatory gates are completed or the project owner explicitly
approves a documented exception. No GitHub Actions, package publication, tag,
release, license-state change, force-push, or history rewrite was performed.

## Git verification

The implementation increments were committed with author and committer
`Akira Yuzai <yuzai.akira@gmail.com>` and pushed to `origin/work` immediately:

- `346bb9a6b58b6a13dae9ebfea7dde0bcf2f440cf` — primary price scales
- `7d1533d509903fbe8153abd7d03f37ae677b938f` — adaptive time axis
- `b322f7a35953c8e19a3d06f9d36408c98d9afea6` — professional chart types
- `02ab0adf60add3e7652941107d9f0f60deed4ef7` — Studio controls

Each source increment was verified with `HEAD` equal to `origin/work` after
its push. The documentation verification commit that contains this report is
also pushed and checked against `origin/work` as part of final delivery.
