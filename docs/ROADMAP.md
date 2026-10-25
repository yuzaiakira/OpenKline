# Roadmap

## Current milestone

Phase 4 KlineScript language and secure indicator runtime — **In progress**.
Phase 2 acceptance remains open for Firefox, WebKit, and Mobile Safari; this
roadmap does not treat those blocked runs as verified or change their gate.

## Completed

- [Implemented] Created a strict TypeScript project with local-only scripts.
- [Implemented] Added validated OHLCV storage with incremental updates.
- [Implemented] Added time/price scales and a pan/zoom viewport model.
- [Implemented] Added a Canvas2D candlestick renderer and vanilla example.
- [Implemented] Added historical/realtime datafeed contracts and an in-memory provider.
- [Implemented] Added shared candlestick, line, area, and volume series with
  dynamic lifecycle and crosshair/tooltip values.
- [Implemented] Added reusable paginated REST and reconnecting WebSocket
  datafeed reference adapters with normalization, validation, deduplication,
  cancellation, and cleanup.
- [Implemented] Added a thin React adapter and a Next.js App Router example.
- [Implemented] Added unit, adapter, React, Playwright browser, Canvas2D
  benchmark, package-install, and Next.js production checks.
- [Verified] Type checking, 26 unit tests, browser interaction, Next.js
  production build, package installation, and 1k/10k/100k benchmarks pass
  locally; measured values are recorded in the final verification report.

## Phase 2 candidates

- [Implemented] Added a framework-independent indicator registry and lifecycle
  contract with deterministic custom TypeScript definitions.
- [Implemented] Added SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic,
  and explicit-session VWAP with aligned warm-up values and edge-case handling.
- [Implemented] Added correction-safe updates, append optimization for SMA/EMA,
  disposal, independent instances, and mathematical reference fixtures.
- [Implemented] Added synchronized multi-pane layout with independent scales,
  pane height/removal lifecycle, indicator output mapping, and React/Next
  indicator props; browser and Next production checks pass.
- [Implemented] Added a browser-neutral drawing engine with horizontal/vertical
  lines, trend lines, rectangles, Fibonacci retracements, anchored text,
  selection, pointer movement, styles, visibility, locking, z-order, hit
  testing, undo/redo, versioned serialization, and custom tool registration.
- [Implemented] Added Canvas2D rendering and React/Next drawing props with
  deterministic browser coverage; final acceptance evidence is in
  `docs/reports/phase-2-verification.md`.
- [Hardened] Fixed indicator ID allocation after non-tail removal, disposed
  managed indicators during chart destruction, and applied pane `minHeight`
  constraints in renderer layout.
- [Implemented] Added filled Bollinger Band rendering with configurable output
  styles, clipping, warm-up handling, and browser pixel verification.
- [Verified] Added explicit Playwright projects for Chromium, Firefox, WebKit,
  Pixel 7 mobile Chrome, and iPhone 13 mobile Safari. Chromium and Mobile
  Chrome passed, including a touch drawing assertion.
- [Blocked] Firefox and WebKit Playwright installation returned `403 Domain
  forbidden`; Mobile Safari cannot launch without WebKit. See
  `docs/reports/phase-2-performance-and-compatibility.md` and
  `docs/reports/phase-2-final-verification.md`.
- [Hardened] Corrected the Canvas2D benchmark fixture, added median/p95
  navigation/crosshair/frame measurements, profiled the 100,000-candle append
  path, and optimized strictly newer candle/point updates. The append run
  reached approximately 62–64 FPS in the recorded environment; historical
  corrections remain a documented full-recalculation cost.
- [Implemented] Phase 3 chart-scoped Plugin SDK with API-versioned metadata,
  semver/dependency validation, activation rollback, deterministic disposal,
  JSON state, typed events, commands/shortcuts, custom indicators/drawings,
  controlled overlays, and public Chart integration.
- [Implemented] Versioned workspace serialization/restoration for chart
  configuration, panes, series, indicators, drawings, viewport, plugin state,
  missing-extension policies, exact plugin-version checks, and persistence-
  neutral JSON validation.
- [Implemented] Theme, locale/timezone/precision, RTL time-axis foundation,
  interaction configuration, and React plugin/workspace props.
- [In Verification] Plugin SDK browser behavior, workspace round trips,
  package/API checks, documentation, and Phase 3 acceptance report.
- [Implemented] Phase 4.0/4.1 KlineScript v0.1 grammar, lexer, parser,
  source-span diagnostics, semantic/type checks, immutable compiled programs,
  and the first compiler/runtime regression suite. Phase 4 verification remains
  open until integration, browser, performance, and handover evidence is
  complete.
- [Not Started] Accessibility UI and visual regression baselines.
- [Not Started] Vendor-specific datafeed packages and authentication helpers.
- [Authorized Exception] Phase 3 work may proceed under the project owner's
  narrow exception recorded in `docs/reports/phase-3-verification.md`. It does
  not close Phase 2 or authorize Phase 4.

## Known limitations

- Browser heap readings are engine-specific and are observations, not leak-proof
  release thresholds. The benchmark also verifies that chart destruction removes
  the canvas and clears stored series state.
- The corrected benchmark's append and correction paths are measured
  separately; no universal 60 FPS or memory guarantee is claimed.
- The environment draft must be published separately from the saved setup.
- Phase 2 acceptance remains gated on real Firefox, WebKit, and Mobile Safari
  runs. The proposed next action is to rerun the existing projects from an
  environment with access to the official Playwright CDN or pinned official
  Docker image; the gate has not been relaxed.
- Phase 3 plugins are trusted in-process modules. No remote loader, sandbox,
  signature verifier, or marketplace is included.

## Architectural follow-up

- Finalize the public package name and license before the first public release.
- Keep the formal datafeed contract vendor-neutral as adapters evolve.
- Establish reference hardware before setting Phase 2 rendering targets.
