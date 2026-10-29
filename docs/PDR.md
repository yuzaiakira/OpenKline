# Product Requirements Baseline

This repository implements the verified Phase 1 foundation of the supplied Open
Financial Chart Engine PDR. The broader product draft remains a reference; this
file records only the scope that is committed and verified.

## Product boundary

OpenKline is a framework-independent TypeScript financial chart engine. It does
not provide brokerage execution, market data, credentials, telemetry, or a
TradingView-compatible scripting runtime.

## Current milestone: Phase 1 foundation — complete

The first milestone includes:

- validated, ordered OHLCV candle data;
- incremental candle replacement and insertion;
- time and price coordinate scales;
- a viewport model with pan and zoom;
- a shared Canvas2D renderer for candlestick, line, area, and volume series;
- multiple series with shared time viewport, price scale, crosshair, tooltip,
  appearance styles, and dynamic add/remove lifecycle;
- a browser-neutral `createChart` API with resize, update, and lifecycle cleanup;
- a typed historical/realtime datafeed contract with deterministic in-memory,
  paginated REST, and reconnecting WebSocket reference adapters;
- an optional React adapter and a verified Next.js App Router example;
- a vanilla browser example and executable unit, integration, and Playwright
  tests;
- deterministic Node and headless Chromium benchmarks for 1,000, 10,000, and
  100,000 candles, including update work and destruction cleanup checks.

Browser interaction tests and model benchmarks are also part of the current
verification surface; their scope and limitations are documented in
`docs/development/testing.md` and `docs/development/benchmarks.md`.
The Phase 2.9 performance report records the corrected append benchmark,
profiler evidence, memory cleanup observation, and the Firefox/WebKit
environment blocker.

The core calculation and data model do not depend on React, Next.js, or a
browser. The Canvas2D adapter is the only browser-facing layer in this slice.

## Phase 1 acceptance criteria

1. Invalid timestamps, OHLC relationships, volume, and ordering are rejected.
2. A candle update replaces an existing timestamp and inserts a historical bar
   while preserving chronological order.
3. Coordinate transforms round-trip between data and pixel space.
4. Pan and zoom change the visible data range without changing the source data.
5. Line, area, volume, and candlestick series share one viewport and support
   styles, crosshair values, dynamic addition, removal, and cleanup.
6. REST pagination, timestamp normalization, validation, cancellation, stale
   request handling, duplicate correction, and WebSocket reconnect/unsubscribe
   behavior are covered by deterministic tests.
7. The chart owns and releases its canvas, event handlers, resize observer,
   datafeed subscription, and stored series data.
8. `npm run typecheck`, `npm test`, `npm run test:browser`, the Next.js
   production build, and package installation smoke test pass locally.
9. Benchmark output records Canvas2D work and memory observations without
   turning one environment into a universal performance claim.

## Phase 2 status and deferred scope

The Phase 2.1 calculation engine is now implemented with SMA, EMA, RSI, MACD,
Bollinger Bands, ATR, Stochastic, VWAP, independent instances, aligned
multi-output results, correction-safe updates, and custom TypeScript
registration. Phase 2.2 now includes synchronized multi-pane layout,
independent pane scales, RSI/MACD/Stochastic chart mappings, pane lifecycle,
and React/Next indicator props. Phase 2.3 now includes the browser-neutral
drawing engine, built-in analysis objects, Canvas rendering, pointer selection
and movement, lock/visibility/style controls, undo/redo, serialization, custom
tool registration, and React/Next drawing props. The plugin SDK, ChartScript,
accessibility UI, visual regression, vendor-specific adapters, and WebGL/WebGPU
rendering remain future work. They are not represented as completed
functionality here. The consolidated Phase 2 verification report records the
remaining acceptance gaps; this PDR does not treat untested browser engines or
future plugin/runtime work as complete. Filled Bollinger Band rendering is now
implemented; the current Phase 2 final verification report records the
remaining Firefox/WebKit/mobile browser blockers. The current performance and
compatibility evidence is in
`docs/reports/phase-2-performance-and-compatibility.md`.

## Phase 4 KlineScript status

Phase 4 implementation and the independent security hardening pass are in
verification. The current increment contains a real v0.1 lexer/parser/type
checker and a restricted interpreter with deterministic OHLCV series
semantics, parser/compiler complexity limits, actual window-work and aggregate
per-bar budgets, cancellation, safe technical/math intrinsics, and the
existing Indicator Engine integration boundary. It does not claim full
Python/Pine compatibility, OS-level sandboxing, synchronous wall-clock
preemption, or closure of the older Firefox/WebKit/Mobile Safari browser gate.
The security and Phase 5 reports record verified fixes and remaining release
blockers.

## Phase 3 platform scope

Phase 3 adds the implemented foundation for a professional plugin and
workspace platform without beginning KlineScript. The public scope includes:

- a chart-scoped, API-versioned `OpenKlinePlugin` SDK with metadata,
  dependencies, activation rollback, deterministic lifecycle cleanup, JSON
  state, typed events, commands/shortcuts, custom indicators, custom drawings,
  and controlled overlay primitives;
- public theme, locale/timezone/precision, interaction, and RTL time-axis
  customization options;
- versioned, persistence-neutral workspace serialization/restoration for
  public chart state, with explicit missing-plugin/indicator policies;
- React plugin/workspace integration and documentation/examples for trusted
  application modules.

Plugins remain trusted in-process code. The Phase 3 scope does not include a
remote package loader, sandbox, marketplace, brokerage integration, or
KlineScript runtime. Phase 2's unverified Firefox, WebKit, and Mobile Safari
criteria remain open and are not reclassified by this work.

## Phase 5 production preparation

Phase 5.1 preparation is verified locally but remains open for stable release.
The repository now has generated dependency/license inventory evidence,
lockfile provenance validation, dependency audits, independent package
consumer checks, a Next.js 16.4.3 security update, and a documented local
developer-preview process. `LICENSE-APACHE-2.0.PROPOSED` is unadopted legacy
proposal material, not an effective grant; the owner-confirmed custom
source-available terms are in `docs/legal/README.md`. The project-selected
final license, package metadata, compatibility disclosure, and third-party
notice review still require owner/legal/counsel approval. Official
Firefox/WebKit/Mobile Safari Playwright runs remain environment-blocked. No
package, preview tag, or public release is published by this milestone. The
acceptance matrix and measured evidence are in
`docs/reports/phase-5-release-readiness.md`.

## Phase 5.2 release-gate resolution

Phase 5.2 adds portable Playwright-managed browser verification and a local
`0.1.0-alpha.1` candidate generator that installs only staged tarballs into
fresh Vanilla, TypeScript, React, Next.js, and browser consumers. These are
engineering readiness tools, not publication authorization. The candidate
remains pending owner/legal approval because there is no effective project
license or completed third-party notice review; formal Firefox, WebKit, and
Mobile Safari verification remains blocked until a trusted machine obtains the
official artifacts. The exact acceptance matrix is in
`docs/reports/phase-5-2-verification.md`.

## Phase 5.3 owner-review decision package

Phase 5.3 records the provenance of local Chromium evidence separately from
the required Playwright-managed workflow and prepares a limited-alpha
owner-review package: license/ownership decisions, exact browser support
matrix, proposed developer-preview notes, candidate integrity evidence, and a
publication checklist. It does not approve any effective license, change
package metadata, publish a package, create a tag/release, change visibility,
or relax Firefox/WebKit/Mobile Safari requirements. The owner has subsequently
confirmed a custom source-available policy, which remains pending qualified
counsel review and is not OSI-approved or effective. The owner decision and
remaining evidence are recorded in `docs/reports/phase-5-3-verification.md`.

## Phase 5.4 license-adoption readiness

Phase 5.4 prepares the existing custom source-available proposal for
owner/counsel review. Its counsel package records the remaining chain-of-title,
compatibility, notice, and drafting questions; its adoption procedure lists
only the steps after written clearance. Neither document activates a license,
updates package metadata, authorizes a tag/publication, or closes the browser
or legal gates. See
`docs/reports/phase-5-4-license-adoption-readiness.md`.

## Phase 6 core reliability — in progress

Phase 6.0 hardens the public React, REST datafeed, and viewport boundaries
before Studio work. The React adapter now reconciles stable declarative
identities and preserves workspace state when data props are omitted; REST
pagination defaults to same-origin, validated redirects and protected headers;
and resize preserves a user-selected viewport. The feature remains in progress
until Studio, mobile/accessibility, broader browser, consumer, and performance
verification are complete. See `docs/reports/phase-6-core-reliability.md`.

OpenKline Studio is now implemented in the private Next.js consumer example.
It composes public APIs for deterministic symbol/timeframe fixtures, object
management, drawings, indicators, workspaces, and restricted KlineScript. Its
local verification and remaining acceptance work are recorded in
`docs/reports/phase-6-studio-verification.md` and
`docs/reports/phase-6-final-verification.md`; Phase 6 remains open.

## Phase 7 professional charting foundation — in progress

Phase 7 begins without closing any inherited Phase 6 browser or accessibility
gate. The first implemented increment centralizes the primary price-scale
transform for Canvas rendering, interaction, drawings, and plugin contexts.
It adds linear, logarithmic, percentage, and indexed display modes; raw-price
autoscale/manual range controls; deterministic invalid-domain diagnostics; and
backward-compatible optional workspace persistence. Scale mode never changes
stored market data, indicator inputs, or drawing anchors. Additional chart
extensions remain subsequent Phase 7 work.

Phase 7.0.2 adds adaptive elapsed-UTC time ticks from sub-second through
multi-year ranges. Labels are localized with `Intl` named timezones and
renderer-side overlap measurement, while source timestamps remain UTC. Exchange
session/calendar behavior remains intentionally unimplemented.

Phase 7.0.3 adds OHLC, hollow candlestick, display-only Heikin–Ashi, and
baseline series through the existing series/pane/interaction architecture.
Heikin–Ashi retains raw OHLCV for persistence and indicator input; historical
corrections recompute only its deterministic display projection.

Phase 7.0.4 makes the private Studio a verified consumer of the completed
public chart APIs. It switches one chart between Candles, OHLC, Hollow Candles,
Heikin–Ashi, Line, Area, and Baseline presentations without duplicating chart
state, and exposes linear, logarithmic, percentage, indexed, auto-scale,
axis-visibility, margin, and reset controls. Save/load reconstructs the UI
from the public serialized workspace, including presentation, price scale,
theme, indicators, and drawings. Chromium workflow evidence is recorded with
the Phase 7 verification; broader Phase 6 browser and accessibility gates are
not closed by this increment.

Phase 7.0 local verification records passing Node, Chromium, mobile Chromium
emulation, production Next.js, package-consumer, and Canvas2D benchmark checks.
The phase remains open because the project cannot currently launch the required
Playwright-managed Firefox or WebKit binaries, and inherited Phase 6
accessibility and physical-device gates remain unresolved. The acceptance
matrix and exact evidence are in `docs/reports/phase-7-0-verification.md`.

## Phase 7.1 professional bar replay — in progress

Phase 7.1.1 adds a framework-independent `ReplayEngine` with a protected,
validated historical source, an inclusive cursor, explicit idle/ready/playing/
paused/completed/error/disposed states, deterministic stepping/seeking, bounded
playback speed, injectable scheduling, and timer/resource cleanup. The engine
does not expose future source bars through its status and does not depend on
React, Next.js, or Canvas2D.

Phase 7.1.2 integrates the engine with the existing ChartModel and Canvas
pipeline. The chart masks all supported series and shared time navigation at
an inclusive cursor, recalculates indicators from the visible raw prefix,
protects Heikin–Ashi derivation, filters drawings and interaction values,
blocks source/structure mutations, and suspends/resubscribes datafeeds. Replay
workspace exports are explicitly partial and are not restorable without the
complete source. Deterministic Node and Chromium tests cover these boundaries.
Phase 7.1.3 verifies native indicator and KlineScript prefix correctness and
uses the existing append-incremental indicator contracts for sequential replay
steps. Arbitrary seek and KlineScript recalculation costs are measured rather
than described as constant-time. Phase 7.1.4 adds deterministic replay
controls to the private Studio through the public React handle and `ReplayApi`,
including start selection, timeline seeking, stepping, beginning/latest,
keyboard shortcuts, playback speed, mobile-sized controls, and exit
restoration. Local replay acceptance evidence is complete for the available
Chromium environments, while formal acceptance remains open for the missing
managed Firefox/WebKit/Mobile Safari, accessibility, and physical-device
gates. See the final evidence report at
`docs/reports/phase-7-1-verification.md`, plus
`docs/architecture/replay-engine.md`,
`docs/architecture/replay-data-integrity.md`, and `docs/api/replay.md`.

## Phase 7.2 performance and alert foundation — in progress

Phase 7.2.0 reproduced and fixed a verified inactive-replay append regression:
the latest-candle lookup had copied the full defensive history on every
`Chart.update()`. A cutoff-aware ordered-store lookup restores the measured
100,000-candle append path to approximately 1 ms in the recorded environment
without weakening replay isolation or correction semantics. Evidence is in
`docs/reports/phase-7-2-performance-baseline.md`.

Phase 7.2.1 adds the framework-neutral deterministic Alert Engine. It supports
strict price, indicator, script, and horizontal-drawing conditions, stable
crossing semantics, frequencies, cooldowns, explicit finality, diagnostics,
bounded history, serializable definitions, and independent live/replay state.
The Chart adapter evaluates aligned indicator/KlineScript snapshots and
replay-visible drawings, emits `alertTriggered`/`alertError`, persists only
definitions in workspaces, and clears simulated state on replay exit.

Phase 7.2.2 adds the local Studio alert panel and deterministic Node/Chromium
coverage, including replay simulation, seek rebuilding, public API lifecycle,
and cleanup. The alert benchmark is Node-only and does not make Canvas2D/FPS
or external-delivery claims. Phase 7.2 remains open pending the final report,
broader browser/accessibility/physical gates inherited from Phase 7.1, and any
remaining acceptance items; those gates are not silently closed by alerts.

## Phase 7.3 KlineScript IDE and Worker runtime — in progress

Phase 7.3.1 adds an optional public `KlineScriptWorkerRuntime` and a versioned
structured-clone protocol. The Worker compiles and executes the existing
validated interpreter, keeps incremental input sessions in a Worker-side
`CandleStore`, reports diagnostics and structured failures, rejects stale
generations, and terminates/restarts on cancellation or timeout. Compiled
program closures are never transferred to the host. This increment is covered
by deterministic Node tests and architecture/security documentation; it does
not close the inherited browser, accessibility, or physical-device gates.
Worker-backed Chart/Replay/Alert integration, differential incremental
execution, and the professional Studio editor remain subsequent milestones.

Phase 7.3.2 adds `Chart.addScriptIndicatorAsync(source)`. It uses the
versioned Worker runtime for compile and result publication while keeping the
existing synchronous indicator instance as a correctness-first fallback. It
guards result ownership by indicator generation, routes current Worker
snapshots into chart series and script alerts, resets Worker sessions at replay
seek boundaries, and disposes pending work with indicator/chart lifecycle.
Chromium verifies the real static ESM Worker, alert triggering, replay prefix
length, removal, and canvas cleanup. This does not claim all script CPU work
is off the main thread or close the inherited browser/accessibility/physical
device gates. Incremental execution and the professional editor remain open.

Phase 7.3.3 adds a verified `pointwise-append` subset for Worker sessions.
Direct candle-field/literal arithmetic and conditionals can append one output
point; scripts using inputs, historical indexing, assignments, or technical
functions conservatively use the full interpreter. Corrections and all
non-append events invalidate the candidate. Deterministic randomized
differential tests compare supported output values with full execution, while
`operations` remains a work measurement. Retained-state optimizations for
SMA/EMA/RSI/MACD/ATR/windows are not claimed complete.

Phase 7.3.4 replaces the private Studio's basic KlineScript textarea with an
SSR-safe client editor surface. It provides syntax highlighting, line numbers,
implemented-language autocomplete, source-span diagnostics, starter templates,
browser-local save/delete, Worker runtime status, cancellation, and responsive
layout. No Monaco/CodeMirror dependency was added because neither was already
available and the dependency-free surface keeps bundle/SSR risk bounded; this
is a Studio example feature, not a new core editor dependency.

Phase 7.3.5 completes the local engineering verification for the Worker,
Chart/Replay/Alert integration, conservative incremental candidate, and Studio
editor. The verification also caught and fixed an O(n) alert-output lookup that
cloned every indicator result during each live update; current Canvas2D evidence
records approximately 63 FPS for the 100,000-candle append workload in the
recorded Chromium environment. Historical corrections remain intentionally
expensive and are reported separately. The formal phase gate remains open for
managed Firefox, WebKit, Mobile Safari, accessibility, and physical-device
evidence; see `docs/reports/phase-7-3-verification.md`.

## Phase 7.4 multi-chart Studio workspace — in progress

Phase 7.4.0 adds the framework-neutral Studio workspace and watchlist
contracts. A versioned Studio document contains stable chart panel identities,
layout cardinality, nested existing chart workspaces, opt-in synchronization
flags, and validated watchlists. Legacy single-chart documents can be migrated
without overwriting the original value. The core remains independent of React,
Next.js, and storage. Multi-chart UI, synchronization, named workspace
management, and final verification are subsequent increments. See
`docs/architecture/multi-chart-workspace.md`,
`docs/architecture/watchlist-system.md`, and
`docs/architecture/studio-workspace-persistence.md`.

The synchronization primitive increment adds timestamp-based visible-range and
crosshair methods to the existing Chart API. They do not create global links:
the host must opt in, tag propagation by source panel, resolve nearest target
bars, and dispose subscriptions. Replay remains independent by default. See
`docs/architecture/chart-synchronization.md`.

Phase 7.4.1 connects these contracts to the private Next.js Studio. The host
now renders all four layouts with stable panel identities, preserves isolated
chart/replay/alert/drawing/indicator/script state, offers opt-in crosshair,
range, symbol, and timeframe synchronization, and provides responsive active
panel selection. It also adds deterministic watchlist controls and named local
workspace Save/Load/Save As/Duplicate/Import/Export flows. Local Chromium
browser coverage is recorded in `tests/react-browser/multi-chart-studio.spec.ts`.
The inherited managed Firefox, WebKit, Mobile Safari, accessibility, and
physical-device gates remain open.
See `docs/reports/phase-7-4-verification.md` for the acceptance matrix and
local evidence.

## Phase 7.5 advanced analysis and drawing foundation — in progress

Phase 7.5 extends the existing framework-independent indicator registry with
ROC, CCI, Williams %R, OBV, MFI, ADX (+DI/-DI), Donchian Channels, and Keltner
Channels. These definitions use aligned timestamps, explicit warm-up `null`
values, validated parameters, deterministic OHLCV formulas, and the existing
correction-safe lifecycle. Channel definitions reuse the existing overlay and
filled-band renderer. Their metadata categories are intended for the Studio
explorer and future plugin-defined indicators; no vendor or browser dependency
is added. The API reference and indicator-engine architecture document the
implemented formula and missing-volume policies.

The Phase 7.5 increment now includes the full professional drawing set,
accessible Studio explorer/object-tree UI, source-tagged synchronization, and
workspace hardening coverage. Visible-OHLC snapping is available as an explicit
drawing option. Remaining work includes contextual drawing property editing,
broader end-to-end workflow coverage, performance/memory evidence, and the
inherited Firefox, WebKit, Mobile Safari, accessibility, and physical-device
gates. This section does not mark those items complete.

The current drawing increment completes the framework-neutral geometry and
validation foundation for rays, extended lines, parallel channels, Fibonacci
extensions, price/date ranges, and long/short risk-reward annotations. These
objects reuse the existing DrawingEngine, Canvas primitives, coordinate
converter, hit testing, edit lock, undo/redo, and version-1 workspace
serialization. Position objects remain visual analysis annotations and do not
place broker orders. The Studio toolbar and representative Chromium drawing
interactions are now integrated; broader tool-by-tool and device verification
remain open.

The Studio hardening increment now uses the public
`StudioSynchronizationController` for source-tagged crosshair and visible
range propagation, with target charts responsible for nearest-bar selection
and clamping. Its accessible Indicator Explorer supports category, search,
favorite filtering, and parameter overrides while continuing to call the
existing chart indicator API. The professional drawing toolbar exposes the
new built-in tools, and destructive watchlist/workspace/panel actions use an
in-page ARIA dialog rather than blocking browser prompts. Local Chromium
coverage verifies these paths; other browser and physical accessibility gates
remain open.

## Phase 8.0 strategy engine and historical backtesting — in progress

Phase 8 starts with a framework-independent, trusted-TypeScript strategy
boundary. The initial StrategyRegistry validates versioned definitions and
creates isolated evaluators whose contexts contain only the completed-bar
historical prefix. Signals are timestamped separately from future execution;
the initial built-ins are EMA crossover, RSI reversal, Donchian breakout, and
EMA trend following. The deterministic single-symbol market simulator now
implements next-bar-open fills, required costs, validated sizing, explicit
short limits, reversal policy, cash/equity accounting, and trade ledgers.
Performance metrics, replay overlays, and a functional chart-scoped Studio
Strategy Tester are now implemented. The result model includes deterministic
metrics, input fingerprint metadata, JSON result export, and CSV completed
trade export. `createBacktest()` remains the synchronous reference while the
tester uses the versioned built-in Strategy Worker for background execution,
hard cancellation, progress, generation checks, and lifecycle cleanup. No live
trading, brokerage connectivity,
arbitrary user JavaScript, or milestone closure is
claimed. Strategy results can now produce replay-aware, non-persistent Chart
markers through the existing overlay renderer. See
`docs/architecture/strategy-engine.md`,
`docs/architecture/strategy-replay-integration.md`, and
`docs/api/strategies.md`. Local Chromium verifies the tester controls,
generated result dashboard, export actions, marker visibility, chart scope
isolation, and real Worker cancellation on a deterministic 500k fixture. The
100k strategy benchmark records measurable latency and memory observations; it
does not establish universal performance targets. The first Phase 8.0.7
increment removes the unused per-bar historical-prefix copy
for built-in strategies through an additive `requiresHistory` hint while
retaining an array-compatible causal view for custom strategies. The measured
100k built-in strategy workload is now approximately 0.3–0.4 seconds in the
recorded Node environment; parity tests cover signals, fingerprints, and
exports.

## Phase 8.1 paper trading foundation — in progress

The first paper-trading increment adds a framework-independent virtual
single-symbol spot account. It supports long-only market orders, deterministic
market events, next-event fills, shared commission/slippage mathematics,
cash reservation, P&L/equity/drawdown snapshots, order/trade/journal audit,
idempotency, stale and ordering protection, replay isolation, and versioned
JSON persistence. It is explicitly simulated and has no broker or live-order
side effect. The deterministic market stream is a test/demo source only.

Phase 8.1.1 adds reusable injected REST and WebSocket market adapters. REST
history has bounded, origin-checked pagination, UTC timestamp normalization,
cancellation, and stale-response protection. WebSocket subscriptions validate
events, handle identical duplicates, reconnect with bounded backoff, and clean
up timers and handlers. These adapters remain vendor-neutral and do not
authorize live execution.

Phase 8.1.2 adds simulation risk gates for order quantity/notional, position
exposure, session loss, high-water drawdown, and pending-order count. A
journaled `setRiskHalt()` switch blocks new orders while allowing data and
mark-to-market processing. These controls do not claim to be broker or
regulatory safeguards.

The account, stream, and persistence contracts are documented in
`docs/architecture/paper-trading-engine.md`,
`docs/architecture/paper-market-data.md`,
`docs/architecture/paper-trading-persistence.md`, and
`docs/api/paper-trading.md`. The Studio ticket/dashboard, REST/WebSocket
transport adapters, risk policy expansion, recovery hardening, performance
benchmarks, and inherited browser/accessibility gates remain open.

Phase 8.1.3 connects the public account and deterministic stream to the
private Next.js Studio. The active chart has a prominent simulated/no-real-
money banner, order ticket, account dashboard, order/position audit, risk
halt, and chart-scoped non-persistent paper markers. Chromium verifies the
causal fill flow, marker scope, responsive control path, and no page errors.
Paper state remains in memory in this example and is not silently included in
workspace export.

Phase 8.1.4 hardens recovery with validated JSON deserialization, pending
reserve/accounting consistency checks, restored source-sequence ordering, and
preserved risk-halt state. Corrupted documents are rejected before account
construction and restored history/stale events cannot fill an order. Durable
storage remains an explicit host responsibility.

Phase 8.1.5 adds a local deterministic benchmark for 1k/10k/100k paper market
events, order submission, latency percentiles, fills, and post-dispose heap
observations. The measured Node results are recorded in
`docs/reports/phase-8-1-performance.md`; they are observations rather than
universal performance targets. Browser rendering and inherited compatibility
gates remain open.

Phase 8.1.6 records the final local verification matrix in
`docs/reports/phase-8-1-final-verification.md`. The implementation is ready
for owner review, but Phase 8.1 remains open while the inherited browser,
physical-device, and formal accessibility gates are unverified.

## Phase 8.2 strategy optimization and walk-forward analysis — in progress

Phase 8.2 begins with a focused Paper Trading recovery hardening increment.
The private Studio now exposes explicit, chart-and-symbol-scoped local Save
and Restore controls backed by the validated public persistence API. This is
account persistence only; chart workspace serialization and concurrent-tab
coordination are separate concerns. The controls do not connect optimization
or historical signals to Paper Trading orders.

Phase 8.2.1 adds the framework-independent Strategy Optimization Core. It
generates bounded deterministic grids from integer/numeric ranges, explicit
lists, and fixed parameters; validates every combination through the actual
Strategy Registry; evaluates only through `createBacktest()`; and ranks
null-safe financial objectives with stable tie-breaking. Candidate summaries
carry strategy/version, parameters, status, metrics, assumptions, and candle
fingerprints. Full backtest retention is opt-in and bounded. Worker
orchestration, strict Walk-Forward isolation, robustness analysis, and Studio
controls remain subsequent milestones.

Phase 8.2.2 adds typed bounded Worker orchestration over the existing
`createBacktestWorker()` API. The pool limits concurrent candidate sessions,
preserves original candidate identity for deterministic ranking, reports
aggregate progress, retries recoverable Worker startup/crash failures once,
and rejects cancellation, timeout, supersession, and disposal without
publishing stale or partial completed results. Worker execution remains
restricted to the trusted built-in strategy boundary; Paper Trading remains
isolated.

Phase 8.2.3 adds anchored and rolling Walk-Forward Analysis. Fold selection
uses training data only, with optional validation, gap, and explicit warm-up
context. The additive Backtest `tradingStartIndex` suppresses warm-up trades
and starts an isolated flat out-of-sample account at the test boundary. Fold
results retain separate training/OOS metrics and provenance. Aggregation is
reset-per-fold and never fabricates a continuous curve; overlapping windows
are warned about. Robustness diagnostics and Studio presentation remain open.

Phase 8.2.4 adds deterministic parameter sensitivity, fold-level training vs
OOS degradation, adjacent parameter stability, profitable-fold consistency,
and data-only JSON/CSV exports with separate local analysis timestamps. The
diagnostics are descriptive and explicitly warn about multiple testing and
overfitting; no predictive probability or profitability guarantee is claimed.

Phase 8.2.5 connects these contracts to the private Studio. The chart-scoped
Strategy Optimizer supports bounded built-in strategy grids, Worker
progress/cancel, ranking/filtering, and data-only exports. Its Walk-Forward
tab exposes anchored/rolling split controls, fold metrics, OOS return
visualization, warnings, and exports. Applying a selection only updates
Strategy Tester inputs; it does not create Paper Trading orders or change the
virtual account. Local Chromium and compact mobile workflows are verified,
while non-Chromium, physical-device, accessibility, and dedicated optimization
benchmark gates remain open.

## Phase 8.3 market screener and multi-symbol analytics — in progress

Phase 8.3 establishes a framework-independent Market Screener. Instrument
identity is provider/venue/asset/currency/instrument-ID scoped; symbols alone
are never combined. Versioned Universes can be explicit, Watchlist-derived,
or deterministic demo data, and market-data bars carry provider-declared
confirmed/developing finality.

The implemented baseline includes bounded declarative rule validation and
evaluation for price, volume, crossings, nested AND/OR/NOT, and registered
Indicator outputs. Snapshot scans paginate historical data with cancellation,
duplicate/revision handling, per-symbol error isolation, tri-state results,
stable provenance, and no lookahead. Incremental Watch sessions reuse the
existing Indicator Engine append path and recalculate only affected symbols
for corrections. A separate structured-clone-safe Screener Worker protocol
provides cancellable reference evaluation without provider credentials or
browser dependencies.

The private Studio now exposes real Watchlist scans, progress/results,
diagnostics, table filtering/sorting, open-in-chart/favorite actions, watch
lifecycle controls, deterministic demo stepping, and JSON presets. Browser
Chromium and Next.js production evidence is local only. The deterministic Node
snapshot/Watch benchmark and acceptance matrix are now recorded, but Phase 8.3
remains open until the remaining browser/accessibility/device gates and
external-provider verification are completed.

## Phase 8.4 universal data integration and library-first architecture — verification open

OpenKline's permanent product boundary is a universal, framework-independent
JavaScript/TypeScript charting and analysis library. The consuming application
owns and supplies its market data. No provider, backend, cloud service, API
key, account, database, internet connection, React, or Next.js runtime is
mandatory.

Direct `Chart.setData`/`Chart.update` and series data APIs are the primary local
integration path. The provider-neutral `Datafeed` contract is optional;
generic REST/WebSocket adapters and any Binance example live outside the core
architecture. Indicators, drawings, Replay, Screener, Backtesting,
Optimization, Paper Trading, KlineScript, Workspaces, and Studio remain data
source agnostic. Phase 8.4 audit findings and remaining verification are
recorded in `docs/reports/phase-8-4-architecture-audit.md`.

Phase 8.4.3 provides local JSON, custom exchange, generic REST, generic
WebSocket, and optional Binance examples under `examples/vanilla`. Only the
explicit Binance button opts into external public endpoints; the root package
and offline examples remain network-independent.

Phase 8.4.4 verifies the ESM/type package boundary, optional React package,
Worker artifacts, zero runtime dependencies, and independent Vanilla,
TypeScript/React, and Next.js consumption. It does not claim every bundler,
browser engine, accessibility mode, or physical device.

Phase 8.4.5 keeps the Next.js Studio as a private reference application. An
executable audit rejects core imports from Studio/example paths or framework
runtime dependencies and rejects direct private-source imports from the Studio
consumer.

The 8.4.5 Studio audit passes: the private Next.js application consumes public
package entry points, while core source remains free of framework/example
imports and runtime Studio dependencies. A unique screener control label also
keeps existing Studio browser locators unambiguous.

The 8.4.1 direct-data scenario verifies that a local consumer can render,
correct, analyze, and destroy a chart without creating a Datafeed or making a
network request. This is the primary offline integration path.

Phase 8.4.6 local verification passes the Node, type, package-portability,
package-install, Chromium, Mobile Chrome emulation, React/Next.js, and
Canvas2D benchmark gates listed in `docs/reports/phase-8-4-verification.md`.
The report intentionally leaves managed Firefox, WebKit, Mobile Safari,
physical-device, formal accessibility, visual-regression, and real external
provider gates open. Phase 8.4 is therefore not marked fully accepted.

## Phase 8.5 quality assurance and release readiness — engineering complete; release gate open

Phase 8.5 adds a repeatable local release-readiness workflow without changing
the effective license, publishing packages, creating releases, or using
GitHub Actions. The baseline audit records the current branch/upstream,
package/export/worker surfaces, runtime dependency boundary, documentation,
and known legal/browser evidence. The public API inventory records 205 runtime
exports and 418 type exports, with a declaration-signature baseline and an
additive/removal compatibility check.

The implemented QA layer includes deterministic lifecycle/correction tests,
React browser accessibility smoke checks, visual review capture candidates,
Canvas2D benchmark and profiler evidence, package portability/distribution
checks, independent consumer smoke tests, license inventory validation, and
root/Next.js dependency audits. The local readiness command is
`npm run release:readiness`; it writes timestamped ignored evidence and
classifies every gate as PASS, FAIL, BLOCKED, NOT TESTED, or REQUIRES OWNER
APPROVAL. The latest run passed all executable engineering gates, including
typecheck, 156 Node tests, Chromium/mobile emulation, React browser tests,
Next.js production build, package checks, consumer checks, and zero npm audit
advisories.

Phase 8.5 is not release-accepted. Official Playwright-managed browser
artifacts for Firefox, WebKit, and Mobile Safari remain unavailable in this
environment; legal effective-license and third-party-notice approvals,
formal accessibility review, approved visual baselines, physical-device
evidence, and owner release authorization are also open. The latest measured
performance and gate matrix are recorded in
`docs/reports/phase-8-5-verification.md` and the supporting release documents.

## Phase 8.6 accessibility, visual review, and release evidence consolidation — verification open

Phase 8.6 adds safe accessibility improvements to the public Canvas and the
private Studio reference application. A rendered chart now exposes a concise
dynamic text alternative containing its visible time range, latest close,
series count, and pane count; an empty chart exposes an explicit empty state.
Studio dialogs expose descriptions, close on Escape, and restore focus to the
invoking control. Automated Chromium coverage verifies these semantics and
the existing interactive controls, but this is not a manual screen-reader,
WCAG conformance, contrast, reduced-motion, or physical-device assessment.

The visual review tests capture deterministic desktop, light-theme, and narrow
layout screenshots and write strict byte-comparison reports. A baseline is
never approved automatically. The current run generated three candidate
screenshots and three `*.image-difference.json` reports with status
`SCREENSHOT GENERATED`; no owner-approved baseline exists, so the visual gate
remains open.

The trusted-machine report recorded 65/65 passes across the pinned official
Playwright projects at source commit `4d689c8`, with Mobile Safari zoom clearly
identified as public API zoom rather than native pinch. The named archive is
not present in this environment, so its supplied SHA-256 has not been
independently recomputed. The matrix is consequently documented as reported
trusted-machine evidence, not locally validated evidence. Physical Android/iOS
testing remains not tested.

Phase 8.6 local engineering checks pass for typecheck, 156 Node tests,
API compatibility, package portability/smoke/distribution, 14 Vanilla
Chromium browser tests, and 20 React/Studio Chromium browser tests. The
managed five-project runner remains blocked locally because the official
Playwright executables are absent. Phase 8.6 is not release-ready and cannot
be closed until archive validation, formal accessibility review, visual
baseline approval, physical-device decisions, effective-license and notice
approvals, and owner release authorization are resolved.

## Phase 8.6.2 GitHub evidence integration and release-quality completion — engineering complete; release gate open

The trusted Manjaro Phase 8.6.1 result is now integrated through the compact
GitHub evidence branch `qa/phase-8-6-1-browser-evidence`. The reviewed pack is
limited to four sanitized QA records and targets source commit
`19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`. The reusable
`npm run evidence:browser:check` command validates the exact source revision,
official Playwright 1.64.1/image provenance, all five managed projects, 70
unique passing records, totals, recorded SHA formats, and sanitization. It
does not recompute trusted-machine tarballs or claim cloud execution of those
browsers.

The deterministic visual review now fixes locale, UTC timezone, device scale,
reduced motion, viewport, fixture metadata, resolved browser version, and
disabled screenshot animations. It still generates review candidates only;
owner-approved baselines are not present. Local type, Node, API, package,
Studio, Chromium, React, Next.js, and release-readiness engineering gates
pass, while the local managed-browser runner remains blocked and formal
accessibility, physical-device, visual approval, legal, and owner release
gates remain open. See
`docs/reports/phase-8-6-2-verification.md` for the acceptance matrix.

## Phase 8.7 accessibility hardening and visual review readiness — engineering complete; approval gates open

Phase 8.7 audits the standalone Canvas library and the private Next.js Studio
without adding charting, trading, backend, or provider scope. It fixes the
reproducible Studio dialog focus-containment defect: dialogs now keep Tab and
Shift+Tab within their enabled controls while retaining Escape dismissal and
focus restoration. Chromium coverage verifies the cycle. The visual review
harness also freezes the demo clock before application startup because the
demo quote provider otherwise used `Date.now()` in screenshot-visible labels.

The local Phase 8.7 review passes the evidence consistency validator, typecheck,
156 Node tests, API compatibility, 14 standalone Chromium tests, 21 React/
Studio Chromium tests, the 28/28 system-Chromium diagnostic, and the Canvas2D
benchmark. The readiness aggregate remains `NOT READY`: it retained one
transient 2/28 Chromium diagnostic timeout even though the independent rerun
passed 28/28. Repeated captures are byte-stable but remain unapproved
candidates. The trusted 70/70 evidence pack
targets the earlier source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`
and is not evidence for the current Phase 8.7 revision. Screen-reader review,
formal WCAG conformance, measured contrast, physical-device testing, managed
cross-browser execution for the current revision, legal approval, and owner
release authorization remain open.

## Phase 8.8 accessibility verification, contrast audit, and browser reliability — engineering complete; release gates open

Phase 8.8 measures rendered Studio contrast and fixes only reproducible
presentation issues. Placeholder text now uses the existing readable muted
token, and Studio control borders use a measured 3.56:1 token; public chart
financial colors and API contracts remain unchanged. Automated Chromium
coverage records the measured text, placeholder, disabled-state, border, and
focus ratios. Public Canvas theme measurements are recorded as text/graphic or
decorative-chart observations, not as an owner-approved WCAG claim.

Reduced-motion coverage observes no decorative Studio animations or transitions
under `prefers-reduced-motion: reduce`; required market updates, replay, and
Worker behavior remain enabled. Keyboard coverage preserves the Phase 8.7
dialog trap and restoration. The previous diagnostic timeout was not
reproducible: two sequential current-revision local diagnostics each passed
28/28, so no root cause is invented and no blanket timeout was added.

Visual capture readiness now waits for actual Canvas repaint/data signals and
two frames. Two consecutive runs produced identical dark, light, and mobile
candidate hashes; no baseline is approved. Current local engineering and
package checks pass, but the historical trusted 70/70 evidence still targets
source commit `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa` and cannot certify
Phase 8.8. Current-revision managed Firefox/WebKit/mobile execution, manual
screen-reader and physical-device review, formal conformance, visual approval,
legal approval, and release authorization remain open.

## Phase 8.8.2 browser evidence integration and Studio compatibility — engineering complete; Studio gates open

The trusted Phase 8.8.1 compact evidence pack is integrated under
`docs/evidence/browser/phase-8-8-1/` and validated alongside the historical
Phase 8.6.1 pack. The validator now checks each versioned pack independently:
source SHA, five managed projects, all individual records, durations,
duplicates, totals reconciliation, container provenance, archive checksum
formats, and sanitization. It does not recompute trusted-host archives.

The supplemental Studio probe remains a separate, unresolved matrix: 21/21
Chromium and Firefox, 18/21 WebKit, 5/21 Mobile Chrome, and 10/21 Mobile
Safari. Its aggregate evidence does not identify individual failures, so no
unverified cause is claimed. Investigation reproduced a responsive-layout
environment limitation in cloud system Chromium and fixed the Studio
viewport metadata contract. A separate optional Studio workflow now uses only
Playwright-managed projects and emits explicit PASS/BLOCKED/FAIL artifacts;
it does not alter standalone library acceptance.

The latest cloud Chromium suite passes 23/23 and Next production build passes.
Current-revision trusted standalone and Studio five-browser runs, formal
accessibility, physical devices, legal review, and owner release approval
remain open.

## Phase 8.8.4 Studio cross-browser defect remediation — engineering complete; compatibility gates open

The Phase 8.8.3 trusted Studio evidence was audited as a structured 30-failure
ledger rather than treated as an undifferentiated browser failure. The evidence
validator now checks the complete Phase 8.8.3 pack, including 70 standalone
records, 105 Studio records, the 75/30 reconciliation, failure classifications,
required diagnostic fields, provenance, and sanitization. Evidence-integrity
validation remains independent from the Studio behavior result, which remains
open.

Phase 8.8.4 fixes the reproducible responsive overlay and pointer-interception
defects, normalizes Canvas pointer/touch coordinates through the element
bounding box, adds `touch-action: none`, and makes unchanged chart resize
notifications idempotent. The responsive Studio tests now assert the intended
inactive-panel behavior and perform hit-test checks without forced clicks.
Local typecheck, 160 Node tests, 14 standalone Chromium tests, 24 Studio
Chromium tests, and the versioned evidence validator pass.

The trusted Phase 8.8.3 records target source `8a62e324` and do not certify the
remediated source. Current-revision managed Firefox, WebKit, Mobile Chrome,
and Mobile Safari execution is still required. Async state failures and bare
timeouts remain open where the evidence did not identify a causal runtime
defect. Physical-device, formal accessibility, visual approval, legal, and
owner release gates also remain open; Phase 8.8.4 is not a release-approval
claim.

## Phase 8.8.6 Studio root-cause isolation and targeted repair — verification open

Phase 8.8.6 integrates and validates the Phase 8.8.5 evidence pack, preserving
the distinction between evidence-integrity PASS and the recorded Studio
behavior result of 79 passed / 31 failed. A complete 31-record root-cause
matrix is maintained in `docs/reports/phase-8-8-6-root-cause-matrix.md`.

The Studio browser fixture now records bounded failure-only viewport,
hit-testing, active-panel, page-error, console, and ResizeObserver diagnostics.
Mobile drawing/replay test input follows the active touch contract, and the
narrow-layout synchronized-panel assertion follows the existing intentional
inactive-panel visibility rule. These are targeted test/harness repairs; no
unverified production fix is claimed for ResizeObserver, optimizer overlays,
paper trading, alerts, screener, or other asynchronous failures.

The current local system-Chromium suite passes 24/24 and the evidence validator
passes all four versioned packs. The current managed-browser collector is
correctly BLOCKED in the cloud because the Playwright-managed executables are
absent. Trusted focused and full five-project reruns against the current source
remain mandatory. Physical devices, formal accessibility, visual approval,
legal review, owner authorization, and release readiness remain open; Phase
8.8.6 is not closed and is not release-ready.

## Phase 8.8.8 evidence-driven Studio compatibility repair — verification open

Phase 8.8.8 preserves the trusted Phase 8.8.7 focused result as evidence-
integrity data and adds bounded failure-only pointer, overflow, and resize
diagnostics. The chart now accepts drawing anchors from `touchstart` when a
browser does not deliver the corresponding pointer compatibility event, while
deduplicating a subsequent pointerdown and cleaning up all listeners on
destroy. Mobile drawing and replay tests target the visible primary price pane;
they no longer use coordinates that can land in intentionally separate
indicator or volume panes on a narrow layout.

Local type, Node, evidence-validator, Studio, and system-Chromium checks are
engineering evidence only. The 8.8.7 trusted records still contain unresolved
WebKit/mobile drawing, ResizeObserver, and asynchronous failures, so current
source trusted reruns, physical-device review, accessibility/visual approval,
legal approval, and release authorization remain open. This phase does not
authorize npm publication, tags, GitHub releases, or license changes.

## Phase 8.8.10 targeted WebKit, touch harness, and responsive layout remediation — verification open

Phase 8.8.10 integrates the sanitized Phase 8.8.9 evidence and keeps its
behavior result explicit: six focused records, one expected pass, and five
unexpected failures. The evidence validator now validates that pack's
provenance, record totals, failure groups, and absence of fabricated
resolution claims.

The WebKit-unsafe synthetic `Touch`/`TouchEvent` construction in the focused
test harness was replaced with a clearly labelled generic-event fallback that
provides touch-list-shaped properties. The native Playwright touchscreen path
remains available for real browser input. The multi-chart top action group now
uses bounded responsive wrapping/grid rules rather than relying on page-wide
overflow suppression. The chart ResizeObserver path defers observed resizes to
the next animation frame, coalesces them, and cancels pending work on destroy;
the strict page-error assertions remain in place. A local mobile indicator
transition trace confirms the expected state after the responsive layout fix,
but does not independently certify the trusted Mobile Chrome result.

Local engineering checks pass, including 165 Node tests, type checking, the
focused React/Studio suite, and the local system-Chromium diagnostic. The
current trusted Playwright-managed WebKit, Firefox, Mobile Chrome, and Mobile
Safari runs have not been executed in this cloud environment. Therefore the
Phase 8.8.10 compatibility, physical-device, accessibility, visual approval,
legal, and release gates remain open and the phase is not release-ready. See
`docs/reports/phase-8-8-10-verification.md` and
`docs/reports/phase-8-8-10-targeted-handoff.md`.

## Phase 8.8.12 final seven Studio defect investigation — verification open

Phase 8.8.11 trusted evidence recorded 70/70 standalone passes and 113/120
Studio passes, with seven remaining failures: three Firefox drawing identities,
two WebKit/Mobile Safari paper-trading identities, and two WebKit/Mobile Safari
alert identities. Phase 8.8.12 preserves that ledger and adds bounded
failure-oriented diagnostics in `tests/react-browser/studio-test.ts`.

The current source synchronizes chart interaction dimensions from the canvas
DOM box at pointer/touch interaction boundaries. A local system-Chromium
regression confirms the identified stale CSS-versus-logical resize mechanism
for the Firefox drawing symptom. Paper-trading session ownership and current
quantity handling, plus alert-name input handling, were hardened defensively;
no official WebKit/Safari root cause is claimed.

Local tests and package checks pass, but the current source has not yet been
rerun in the pinned official Firefox, WebKit, and Mobile Safari environments.
The full Studio gate, formal accessibility, visual approval, physical-device,
legal, owner authorization, and release gates remain open. Phase 8.8.12 is not
release-ready; see `docs/reports/phase-8-8-12-verification.md` and
`docs/reports/phase-8-8-12-targeted-handoff.md`.

## Phase 8.8.14 Firefox drawing and WebKit form-state remediation — verification open

Phase 8.8.13's trusted evidence is integrated and validated as one positive
WebKit paper control plus six failures: three Firefox drawing identities,
Mobile Safari paper trading, and WebKit/Mobile Safari alert creation. Phase
8.8.14 preserves that negative evidence and does not run or claim a full
matrix.

The drawing test harness now reacquires visible Canvas coordinates after
scroll, verifies the hit target, records bounded geometry diagnostics, and
uses the active mouse/touch input path. This is a local harness correction,
not official Firefox compatibility evidence. Alert and paper forms now use
local DOM refs with native input/change synchronization and bounded submission
diagnostics. The existing alert and paper risk semantics remain unchanged; no
risk limit or browser-specific result is bypassed.

Local 169/169 Node tests, typecheck, package/API/distribution checks, 27/27
React/Studio Chromium tests, 6/6 focused regressions, and a 30/30
system-Chromium/mobile-Chrome diagnostic pass on source `8f845f6`. The trusted
managed Firefox, WebKit, and Mobile Safari targeted rerun remains mandatory.
The full Studio matrix, physical-device, formal accessibility, visual, legal,
owner, and release gates remain open. See
`docs/reports/phase-8-8-14-verification.md` and
`docs/reports/phase-8-8-14-targeted-handoff.md`.

## Phase 8.8.16 mobile drawing geometry and Safari dialog remediation — verification open

Phase 8.8.15 trusted evidence is integrated and validated: targeted seven
passed, standalone 75/75 passed, and Studio remained 118/125 with seven
mobile failures. Phase 8.8.16 preserves that ledger and treats the six mobile
drawing failures as a harness geometry regression: Phase 8.8.14 full-canvas
Y fractions land outside the primary pane once Volume and RSI consume most of
a ~350px mobile canvas. The helper now places points inside
`getPrimaryDrawingPaneBounds()` fractions published on the canvas and selects
touch from Playwright `hasTouch`. Mobile Safari dialog focus now captures the
Rename trigger from the click target and focuses the prompt input in
`useLayoutEffect`.

Trusted managed Mobile Chrome / Mobile Safari confirmation is Phase 8.8.17.
Physical-device, formal accessibility certification, visual, legal, owner, and
release gates remain open. See `docs/reports/phase-8-8-16-verification.md` and
`docs/reports/phase-8-8-16-targeted-handoff.md`.

## Phase 8.8.18 release-readiness audit — NOT RELEASE READY

Phase 8.8.17 trusted evidence is integrated: automated managed-browser
compatibility is **PASS** for exact source `bb3f1ca` (standalone 75/75, Studio
125/125, targeted fourteen 14/14). Phase 8.8.18 audited remaining release
gates without changing product behavior. Physical Android and native iOS
Safari are blocked (no devices). Screen-reader review is not tested. Visual
baselines require owner approval. The custom source-available license remains
a proposal without effective LICENSE/NOTICE activation. See
`docs/reports/phase-8-8-18-release-audit.md`,
`docs/reports/phase-8-8-18-acceptance-matrix.md`, and
`docs/reports/phase-8-8-18-next-actions.md`.

## Phase 8.8.19 owner decision packet — NOT RELEASE READY

Phase 8.8.19 prepares licensing, attribution, visual, accessibility, Android/iOS,
and release-scope decisions for product baseline `bb3f1ca` without activating a
license or publishing. Physical Android remains device-unavailable; native iOS
Safari remains blocked. See `docs/reports/phase-8-8-19-owner-decision-packet.md`
and companion Phase 8.8.19 reports.
