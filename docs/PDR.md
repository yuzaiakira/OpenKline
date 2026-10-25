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
developer-preview process. `LICENSE-APACHE-2.0.PROPOSED` is a pending proposal,
not an effective grant; the project-selected license, package metadata, and
third-party notice review still require owner/legal approval. Official
Firefox/WebKit/Mobile Safari Playwright runs remain environment-blocked. No
package, preview tag, or public release is published by this milestone. The
acceptance matrix and measured evidence are in
`docs/reports/phase-5-release-readiness.md`.
