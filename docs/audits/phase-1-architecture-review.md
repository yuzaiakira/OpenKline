# Phase 1 Architecture Review

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
