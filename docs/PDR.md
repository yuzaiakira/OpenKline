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
