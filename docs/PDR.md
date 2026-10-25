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
types and Studio controls remain subsequent Phase 7 work.

Phase 7.0.2 adds adaptive elapsed-UTC time ticks from sub-second through
multi-year ranges. Labels are localized with `Intl` named timezones and
renderer-side overlap measurement, while source timestamps remain UTC. Exchange
session/calendar behavior remains intentionally unimplemented.
