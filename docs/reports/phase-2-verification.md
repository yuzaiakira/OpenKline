# OpenKline Phase 2 Verification Report

Date: 2026-10-24

Status: **Implemented foundation; milestone remains open for the explicitly
listed verification gaps and follow-up work.**

This report records what is present in the repository and what was actually
verified locally. It does not treat planned Plugin SDK, KlineScript runtime,
unexecuted browser engines, or unmeasured release targets as complete.

## Implemented capabilities

### Indicator calculation engine

- Framework-independent typed indicator registry and lifecycle contract.
- SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic Oscillator, and VWAP.
- Multiple aligned output series, metadata, parameter validation, explicit
  warm-up `null` values, deterministic calculations, and defensive API copies.
- Explicit VWAP session semantics (`none` or `utc-day`); no implicit session
  inference.
- Safe append updates for the built-ins where an incremental calculation is
  defined, including stateful RSI, MACD, ATR, and VWAP paths.
- Equal-timestamp replacement and historical insertion use full recalculation
  so corrections do not silently corrupt derived values.
- Independent indicator instances, custom TypeScript definitions, disposal,
  and validation of calculation results.

### Multi-pane analysis

- Shared time viewport across the main price pane, volume, and indicator panes.
- Independent price scales per pane with synchronized crosshair and tooltip
  time selection.
- Pane creation, configured heights, removal, automatic cleanup, consistent
  pan/zoom, and indicator output mapping.
- RSI, MACD, and Stochastic examples are wired through the same Chart API and
  React/Next adapters.

### Drawings

- Browser-neutral `DrawingEngine` with horizontal line, vertical line, trend
  line, rectangle, Fibonacci retracement, and text annotation tools.
- Financial-coordinate anchors (`time`, `price`), coordinate conversion,
  geometry generation, hit testing, selection, whole-object dragging, and
  anchor dragging for resize/edit behavior.
- Styling, visibility, locking, z-order, text editing, API deletion, undo,
  redo, versioned serialization/restoration, and invalid-state rejection.
- Public custom drawing-tool registration contract and Canvas2D rendering.

### Framework and data integration

- Existing vendor-neutral REST/WebSocket/in-memory datafeed contracts remain
  independent of indicators, panes, drawings, React, and Next.js.
- React mounting/unmounting and SSR-safe imports remain covered by local tests.
- The Next.js App Router example builds as a production application.
- The vanilla example uses the same public `createChart` API and includes
  series, panes, indicators, and interaction setup.

### KlineScript boundary

- Versioned source/envelope and AST-facing TypeScript contracts are documented
  for a future deterministic runtime.
- No parser, evaluator, `eval`, `new Function`, code generation, or arbitrary
  script execution was added.

## Remaining technical debt and open verification

- The browser matrix currently verifies headless Chromium only. Firefox,
  WebKit/Safari, mobile browsers, and device-pixel-ratio visual baselines were
  not executed in this environment.
- The 100,000-candle Canvas2D run is measurable but not a 60 FPS target:
  this run observed 19.29 FPS for the 30-frame update loop and 76.930 ms per
  append in the 100-update batch. Renderer profiling and a reference hardware
  budget remain follow-up work.
- Browser interaction coverage exercises the chart lifecycle and an
  interactive drawing creation path; a full browser matrix for every drawing
  tool, anchor edit, pane resize, and framework Strict Mode combination is not
  yet present.
- `IndicatorOutputKind` supports `band`, but the current chart mapping renders
  Bollinger upper/lower outputs as line series rather than a filled band.
- The extension seam is a trusted in-process contract for indicators and
  drawing tools. It is not a package loader, permissions system, marketplace,
  remote-code sandbox, or custom series/panel renderer SDK.
- KlineScript, accessibility controls beyond the canvas image/tab surface,
  visual regression baselines, vendor-specific adapters, and WebGL/WebGPU are
  intentionally deferred.

## Public API verification

The package root exports the documented Chart, series, pane, datafeed,
indicator, drawing, extension, and KlineScript boundary types. Public APIs
were checked with the repository TypeScript configuration and generated
declarations.

Verified usage surfaces include:

```ts
const chart = createChart(container);
const candles = chart.addCandlestickSeries();
candles.setData(data);
const rsi = chart.addIndicator("RSI", { period: 14, pane: "new" });
const line = chart.addDrawing("trend-line", { points });
chart.registerIndicator(customIndicator);
```

Lifecycle methods are explicit: series and indicators can be removed, datafeed
subscriptions can be stopped, drawing state can be restored or removed, and
`Chart.destroy()` releases the canvas, observers, listeners, subscriptions,
series, panes, drawings, and extension registrations.

## Test results

All commands below completed successfully on Node.js v24.19.0 unless noted:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 25 tests |
| `npm run test:browser` | Pass — 1 Playwright test in Chromium |
| `npm run benchmark` | Pass — 1k/10k/100k model runs |
| `npm run benchmark:browser` | Pass — Canvas2D, updates, memory, cleanup |
| `npm run package:check` | Pass — package dry run |
| `npm run package:smoke` | Pass — packed ESM consumer installed and imported |
| `@openkline/react` pack dry run | Pass |
| `examples/nextjs-app-router` production build | Pass — Next.js 15.5.28 |
| `git diff --check` | Pass |

The unit/integration suite covers candle and point validation, model viewport
behavior, REST pagination and cancellation, WebSocket reconnect and cleanup,
all built-in indicators, incremental/full equivalence, custom indicator
registration and disposal, drawings, pane synchronization, React imports, and
series lifecycle. The browser test covers visible chart rendering, zoom/pan,
theme changes, dynamic series/pane state, drawing creation, resize, and
destruction.

## Browser compatibility

Verified: headless Chromium 154 on Linux, including the Playwright interaction
test and the Canvas2D benchmark. The chart uses standard Canvas2D and DOM APIs
with a ResizeObserver fallback, but cross-browser compatibility is not marked
fully verified until Firefox, WebKit/Safari, and mobile viewport runs are
added.

## Performance and memory measurements

The deterministic Node model run was:

| Candles | Load (ms) | Navigation (ms) | Update (ms) |
| ---: | ---: | ---: | ---: |
| 1,000 | 2.065 | 0.156 | 0.147 |
| 10,000 | 11.159 | 0.008 | 0.025 |
| 100,000 | 93.835 | 0.041 | 0.168 |

The actual Canvas2D run used headless Chromium 154, a 1,200 × 520 viewport,
`--disable-gpu`, the deterministic vanilla fixture, 100 new-timestamp appends,
five same-timestamp corrections, and a 30-frame update loop:

| Candles | Load (ms) | Navigation (ms) | 100 appends (ms) | Append/update (ms) | 5 corrections (ms) | rAF frame (ms) | FPS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 20.8 | 11.5 | 130.5 | 1.305 | 91.3 | 23.410 | 42.72 |
| 10,000 | 88.9 | 8.2 | 532.4 | 5.324 | 381.5 | 16.300 | 61.35 |
| 100,000 | 1,403.2 | 6.5 | 7,693.0 | 76.930 | 4,489.3 | 51.840 | 19.29 |

Observed Chromium heap values were 1.39 MB before loading, 11.71 MB after
1,000 candles, 34.73 MB after 10,000, and 205.31 MB after 100,000. The value
observed after destruction was 62.25 MB. `remainingCanvasCount` was zero. Heap
reservation after destruction is not treated as proof of a leak because the
browser may retain heap capacity; the deterministic chart-owned resource check
passed.

These are observations from one environment, not universal performance
claims or release thresholds.

## Package installation verification

- The root `openkline@0.1.0` tarball dry run contained generated runtime code
  and declarations only under `dist` plus package metadata.
- A temporary consumer installed the packed tarball and successfully imported
  it as ESM.
- The `@openkline/react@0.1.0` package dry run succeeded with a task-specific
  npm cache.
- The Next.js App Router example completed its optimized production build.

## Documentation status

Updated and cross-checked:

- `docs/PDR.md`
- `docs/ROADMAP.md`
- `docs/architecture/indicator-engine.md`
- `docs/architecture/multi-pane-layout.md`
- `docs/architecture/drawing-engine.md`
- `docs/architecture/extension-contracts.md`
- `docs/architecture/klinescript-preparation.md`
- `docs/api/indicators.md`
- `docs/api/drawings.md`
- `docs/api/chart.md`
- `docs/guides/custom-indicators.md`
- `docs/guides/custom-drawing-tools.md`
- `docs/development/benchmarks.md`

The historical Phase 1 report remains a record of the earlier milestone. This
report is the current Phase 2 acceptance record.

## Git and repository policy verification

- Repository-local identity: `Akira Yuzai <yuzai.akira@gmail.com>` for both
  author and committer.
- No `.github/workflows/` directory exists.
- No force push or history rewrite was used.
- Every successful commit in this Phase 2 increment was pushed immediately to
  `origin/work`.

Commits created in this increment:

| Commit | Conventional Commit | Remote verification |
| --- | --- | --- |
| `86b9c34` | `feat(indicators): add technical analysis engine` | Pushed |
| `167f8af` | `feat(panes): add synchronized analysis panes` | Pushed |
| `3f9420a` | `feat(drawings): add extensible analysis objects` | Pushed |
| `0d489d1` | `feat(extensions): define plugin and script boundaries` | Pushed |
| `bf1a404` | `perf(chart): optimize realtime append updates` | Pushed |
| `33d81a7` | `feat(drawings): support anchor editing and z-order` | Pushed |

The final documentation/report commit will be recorded in this table after it
is created and its remote SHA is checked against `HEAD`.

## Phase 2 acceptance matrix

| Acceptance criterion | Evidence | Status |
| --- | --- | --- |
| Built-in indicators are mathematically verified | Reference fixtures and 25 passing tests | Pass |
| Parameters, warm-up, correction, incremental update, and lifecycle work | Indicator tests and documented contracts | Pass |
| Independent oscillator panes work | Pane model, scale/crosshair tests, browser coverage | Pass |
| Required drawings support real interactions | Engine tests, browser creation test, Canvas renderer | Partial — full browser matrix open |
| Drawing serialization and undo/redo work | Drawing round-trip and invalid-state tests | Pass |
| Custom TypeScript indicators register publicly | Registry tests, root declarations, guide | Pass |
| Extension architecture is documented | Extension and KlineScript architecture docs | Pass — trusted in-process scope |
| Vanilla, React, and Next.js compatibility | Browser test, React tests, Next production build | Partial — non-Chromium browser matrix open |
| Unit, integration, browser, package, and benchmark checks pass | Command table above | Pass |
| Performance and memory measurements are recorded | Node/Canvas2D tables above | Pass — 100k follow-up needed |
| Phase 1 regression behavior remains green | Existing suites and package checks | Pass |
| Public API documentation is complete for implemented scope | API/guides and declarations | Pass — band rendering caveat remains |
| All new commits are pushed with required identity | Commit table and remote SHA check | Pass after final push |
| No GitHub Actions were introduced | Workflow directory check | Pass |

Because the partial rows are not yet fully verified, Phase 2 is intentionally
kept open. The implemented foundation is suitable for controlled Phase 3
planning after the browser compatibility matrix, full drawing interaction
coverage, and 100k rendering budget are addressed. The deferred Plugin SDK and
KlineScript runtime should remain separate milestones.

## Phase 2 readiness assessment

**Ready for continued engineering, not yet a fully closed release milestone.**
The architecture is layered, the core calculations are framework-independent,
the public lifecycle is explicit, the local verification suite is green, and
the package can be consumed independently. Before declaring Phase 2 accepted,
close the partial acceptance rows and decide whether filled band rendering and
the 100,000-candle Canvas2D budget belong to the release gate.
