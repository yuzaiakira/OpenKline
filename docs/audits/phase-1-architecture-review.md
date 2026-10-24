# Phase 1 Architecture Review

## Current audit addendum — 2026-10-25

This addendum is the current code-level review after the Phase 2 foundation was
implemented. The earlier sections preserve the historical Phase 1 starting
snapshot and its original resolutions. The repository was rechecked at
`3c810bc` before the hardening changes below.

### Current architecture assessment

The dependency direction remains sound:

```text
Datafeed / stores -> ChartModel -> CanvasRenderer -> Chart browser adapter
                         |                \-> DrawingEngine
                         \-> IndicatorEngine -> chart-managed output series
React adapter -> Chart API <- Next.js client boundary
```

The calculation, storage, pane, drawing, and renderer modules remain
framework-independent. Browser ownership is concentrated in `Chart`; React
only owns mounting and prop synchronization. The public root exports typed
contracts and does not export the renderer implementation.

### Current findings and resolutions

#### P1-004 — Indicator instances were not disposed by chart destruction

- **Affected file:** `src/chart.ts`
- **Root cause:** `Chart.destroy()` cleared the model and drawing engine but did
  not call `dispose()` on indicator instances held by `this.indicators`.
- **Impact:** a long-lived chart with indicators could retain input/result
  arrays and incremental state after its DOM canvas was removed.
- **Resolution:** `destroy()` now disposes every managed indicator and clears
  the registry before destroying the model.
- **Status:** Resolved.
- **Evidence:** source-level lifecycle review, `npm test`, and the browser
  destruction path pass.

#### P1-005 — Indicator IDs could collide after non-tail removal

- **Affected file:** `src/chart.ts`
- **Root cause:** IDs were generated from `this.indicators.size + 1`, so removing
  `indicator-1` while `indicator-2` and `indicator-3` remained caused the next
  indicator to reuse `indicator-3`.
- **Impact:** valid indicator replacement could throw a duplicate series-ID
  error and leave callers with an inconsistent lifecycle.
- **Resolution:** a monotonic chart-local `nextIndicatorId` allocator is now
  used.
- **Status:** Resolved.
- **Evidence:** Playwright regression removes `indicator-1`, creates a new RSI,
  asserts `indicator-4`, and completes without page errors.

#### P2-003 — Pane minimum height was accepted but ignored

- **Affected files:** `src/core/chart-model.ts`,
  `src/renderer/canvas-renderer.ts`
- **Root cause:** `PaneConfig.minHeight` was not carried into visible pane data,
  and the renderer allocated only preferred heights.
- **Impact:** a documented layout constraint was silently ineffective when
  panes were rendered.
- **Resolution:** visible pane data now carries `minHeight`; layout honors the
  minimum when the available space permits and scales deterministically when
  the viewport is too small to satisfy every requested height.
- **Status:** Resolved.
- **Evidence:** `tests/series.test.ts` asserts the rendered pane height and
  `npm test` passes.

### Current security, performance, and test posture

- No credentials, arbitrary code execution, `eval`, `new Function`, or GitHub
  Actions were introduced. Extension activation remains explicitly trusted
  in-process code.
- Visible-data slicing, cached union timestamps, and incremental indicator
  paths avoid repeated full-history work in the normal append path. The
  100,000-candle Canvas2D result remains environment-specific and below a
  60-FPS target; it is recorded as follow-up rather than hidden.
- Local verification currently includes typecheck, 26 unit/integration tests,
  one Chromium Playwright interaction test, package smoke checks, React pack
  verification, Next.js production build, and Node/Canvas2D benchmarks.
  Firefox, WebKit/Safari, mobile, and visual-regression runs remain open.

### Current recommendation

The Phase 1 chart foundation is stable for continued development, and the
confirmed lifecycle/layout issues above are resolved. Keep the release gate
open for the documented cross-browser matrix, full drawing interaction browser
coverage, and large-dataset rendering budget. The consolidated acceptance
record is `docs/reports/phase-2-verification.md`.

**Review date:** 2026-10-24
**Scope:** repository state at the start of the Phase 1 completion task and the
verified fixes made in this increment.

## Executive summary

The starting repository was a small, coherent TypeScript/Canvas2D prototype,
not a Phase 1 release candidate. Its core separation was directionally sound,
but datafeed contracts, framework integration, browser verification, package
boundaries, and performance evidence were missing. The implementation now has
a typed datafeed contract and deterministic in-memory provider, explicit chart
lifecycle guards, clipped rendering, package/test separation, a thin React
adapter, a minimal Next.js App Router example, Playwright interaction coverage,
and reproducible model benchmarks.

Phase 1 remains intentionally bounded: there is no external market-data
provider, volume/line/area series, indicators, drawings, plugin SDK, or
KlineScript runtime. Those are documented as later work rather than implied by
the current API.

## Actual starting status

| Area | Starting state | Current state |
| --- | --- | --- |
| Core data/scales | Implemented and unit-tested | Expanded edge-case coverage |
| Canvas chart | Implemented, lightly verified | Clipped, lifecycle-guarded, browser-tested |
| Historical/realtime data | No formal contract | `Datafeed` and `InMemoryDatafeed` |
| React/Next.js | Not present | Thin React adapter and production Next build |
| Browser tests | None | Playwright interaction test passes |
| Benchmarks | None | 1k/10k/100k model baseline |
| Package build | Included tests in `dist` | Core and adapter outputs separated |

## Architecture assessment

The dependency direction is now:

```text
Datafeed / CandleStore -> ChartModel -> CanvasRenderer -> Chart browser adapter
                                      \-> React lifecycle adapter
```

`CandleStore` owns validation and ordered data. `ChartModel` owns viewport
state, zoom, and pan without DOM access. `CanvasRenderer` owns Canvas2D drawing
and coordinate mapping. `Chart` owns browser resources, events, datafeed
subscription, and teardown. React and Next.js consume the same chart API; they
do not duplicate rendering or calculations.

## Findings and resolutions

### P1-001 — No formal historical/realtime data contract

- **Affected modules:** `src/types.ts`, `src/datafeed.ts`, `src/chart.ts`
- **Root cause:** the original chart accepted only direct arrays, with no
  interface for symbol metadata, historical ranges, subscriptions, aborts, or
  cleanup.
- **Impact:** consumers could not integrate REST/WebSocket providers without
  coupling to chart internals, and realtime lifecycle behavior was undefined.
- **Proposed solution:** define `Datafeed`, `GetBarsQuery`, `SymbolInfo`, and
  subscription contracts; provide `InMemoryDatafeed` for deterministic local
  development; connect it through `Chart.setDatafeed` and `stopDatafeed`.
- **Resolution:** Implemented.
- **Evidence:** datafeed unit tests cover range filtering, updates,
  subscription cleanup, unknown symbols, and aborts; `npm test` passes.

### P1-002 — No browser or framework integration verification

- **Affected modules:** browser example, missing React/Next integration,
  test configuration.
- **Root cause:** the project had no Playwright harness and the prior Chromium
  command was an unbounded dump process.
- **Impact:** rendering, crosshair, pan, zoom, theme, resize, update, and
  cleanup behavior were not independently verified.
- **Proposed solution:** use Playwright with a bounded local server and the
  installed system Chromium; add a thin React wrapper and a client-boundary
  Next.js example.
- **Resolution:** Implemented.
- **Evidence:** `npm run test:browser` passes one interaction test; the Next.js
  example passes `next build`.

### P1-003 — Lifecycle and interaction edge cases

- **Affected modules:** `src/chart.ts`, `src/renderer/canvas-renderer.ts`.
- **Root cause:** methods remained callable after destroy, datafeed requests had
  no stale-request guard, pointer drag rendered twice, crosshair conversion
  diverged from plot bounds, and candles were not clipped to the plot.
- **Impact:** stale async updates could reach a disposed chart; interactions
  could cause redundant work or report coordinates outside the plotted data;
  candle geometry could overwrite labels/axes.
- **Proposed solution:** add alive guards, request generations, subscription
  disposal, shared plot bounds, one render per pointer move, and a Canvas clip
  region.
- **Resolution:** Implemented.
- **Evidence:** Playwright covers interaction and destruction; unit tests cover
  viewport and scale boundary behavior.

### P2-001 — Build output mixed package code and tests

- **Affected files:** `package.json`, TypeScript configurations.
- **Root cause:** the original build compiled `src` and `tests` into `dist`,
  which made the package tarball include tests and had no adapter build.
- **Impact:** package contents were less predictable and not representative of
  a publishable library.
- **Resolution:** Implemented separate core, React, and test compilation
  targets; `npm run package:check` passes and the tarball contains runtime and
  declaration output only.

### P2-002 — Missing measurable performance evidence

- **Affected files:** no benchmark existed.
- **Root cause:** no deterministic fixture or measurement script.
- **Impact:** large-dataset behavior was asserted only by design intent.
- **Resolution:** Implemented `scripts/benchmark.mjs` for 1k/10k/100k model
  loads, navigation, and updates. Canvas frame-rate performance remains open.

## Security review

No credentials, external provider keys, arbitrary script execution, `eval`, or
network access were introduced. The static test server rejects paths outside
the repository root. The future plugin and KlineScript threat models remain
open; Web Workers must not be treated as a complete sandbox when those features
are implemented.

## Follow-up status

Phase 1 follow-up work completed the previously open chart foundation items:

- `SeriesCollection` and `PointStore` now support candlestick, line, area, and
  volume series on one shared viewport and price scale.
- `RestDatafeed` and `WebSocketDatafeed` provide injected, vendor-neutral
  reference adapters with pagination, normalization, validation, correction,
  reconnection, and cleanup behavior.
- `scripts/browser-benchmark.mjs` measures actual Canvas2D update work and
  requestAnimationFrame loops for 1k/10k/100k datasets, with engine-specific
  heap observations and destruction checks.
- Public chart and datafeed contracts, React/Next guides, and package smoke
  verification are documented and tested.

## Remaining technical debt

- Browser heap readings are observations rather than portable leak thresholds;
  reference hardware and visual regression baselines remain future work.
- Session calendars, timezone-aware timeframe policy, authentication, and
  vendor-specific protocol packages remain outside the core adapter scope.
- Drawings, indicators, accessibility UI, plugin SDK, ChartScript, and
  WebGL/WebGPU rendering remain Phase 2 or later work.

## Recommended next steps

1. Add explicit session-calendar and timeframe policy packages.
2. Add visual regression and accessibility coverage before expanding UI surface.
3. Freeze the public API and license before publishing the package.
