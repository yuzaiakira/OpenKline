# Roadmap

## Current milestone

Phase 7 professional charting foundation — **In progress**. Phase 7.0.1
centralizes primary price scaling with linear, logarithmic, percentage, and
indexed display modes, raw-anchor preservation, invalid-domain diagnostics,
and workspace persistence. Phase 7.0.2 adds adaptive elapsed-UTC ticks,
timezone/DST-safe `Intl` labels, and measured overlap prevention. New chart
types now include OHLC, hollow candles, display-only Heikin–Ashi, and baseline.
Phase 7.0.4 connects all supported primary presentations and primary price-scale
controls to the private Studio through public APIs, with workspace round-trip
coverage. Phase 6 formal accessibility, managed-browser/mobile,
consumer, and performance acceptance remain open and are not reclassified.
Phase 4 KlineScript language and secure indicator runtime — **In verification**.
Phase 2 acceptance remains open for Firefox, WebKit, and Mobile Safari; this
roadmap does not treat those blocked runs as verified or change their gate.
Phase 5 production preparation — **In progress; stable release not approved**.
Phase 5.1 licensing, supply-chain, and developer-preview preparation is
**verified locally with mandatory legal and browser gates open**.

Phase 8.0 strategy engine and historical backtesting — **In progress**. The
first increment defines the trusted TypeScript strategy boundary and
anti-lookahead signal evaluation. Order simulation, accounting, metrics,
replay/Studio integration, and final verification remain open.

- [Implemented / Verified] Phase 8.0.0 adds the framework-neutral
  `StrategyRegistry`, versioned strategy metadata, validated trusted-TypeScript
  definitions, completed-bar prefix contexts, deterministic signal IDs,
  progress/cancellation handling, and independent anti-lookahead fixtures.
- [Implemented / Verified] Phase 8.0.1 adds EMA crossover, RSI threshold
  reversal, Donchian breakout, and EMA trend-following definitions backed by
  the existing Indicator Engine. Signals remain separate from orders and
  fills; execution, accounting, metrics, and Studio integration remain open.
- [Implemented / Verified] Phase 8.0.2 adds deterministic single-symbol market
  order simulation with next-bar-open fills, required commission/slippage,
  fixed/notional/equity sizing, explicit short limits, reversal policy, cash/
  equity accounting, trade ledger, open-position mark-to-market, and
  cancellation/lifecycle handling. Protective orders, metrics, replay, and UI
  remain open.
- [Implemented / Verified] Phase 8.0.3 adds independently tested performance
  metrics, deterministic candle fingerprints, JSON result export, and CSV
  completed-trade export. Annualized Sharpe/Sortino/Calmar assumptions,
  replay overlays, Worker execution, and Studio were open at this milestone;
  they are addressed by the later Phase 8.0.4–8.0.7 increments.
- [Implemented / Verified] Phase 8.0.4 adds result-to-marker conversion and
  Chart-scoped strategy marker APIs using the existing overlay renderer.
  Markers remain non-persistent, replay-aware, price-scale-aware, and separate
  from alerts/drawings; Chromium replay verification passes.
- [Implemented / Verified] Phase 8.0.5 adds a chart-scoped Studio Strategy
  Tester with public strategy/backtest APIs, editable parameters and costs,
  running/cancel controls, generated metrics, equity/drawdown SVGs, trade
  history, JSON/CSV exports, marker visibility, and responsive Chromium E2E
  coverage. The synchronous engine remains the financial reference; the later
  Phase 8.0.7.2 increment adds the built-in Worker execution path. Accessibility
  audit and broader browser/device verification remain open.
- [Implemented / In Verification] Phase 8.0.6 adds a deterministic Node
  strategy benchmark for 1k/10k/100k candles, two built-in strategies,
  repeated runs, deterministic exports, cancellation, and post-disposal heap
  observations. Final acceptance remains open while inherited browser and
  accessibility gates are unresolved.
- [Implemented / Verified] Phase 8.0.7.1 profiles the strategy bottleneck and
  adds the additive `requiresHistory` optimization. Built-in strategies avoid
  unused per-bar history construction; custom strategies retain an
  array-compatible bounded causal view by default. Legacy array consumers,
  retained references, anti-lookahead, deterministic outputs, and 1k/10k/100k
  benchmark parity pass.
- [Implemented / Verified] Phase 8.0.7.2 adds the versioned built-in Strategy
  Worker and typed public API. It reuses `createBacktest()` for financial
  execution, keeps initialization data reusable, throttles progress, and
  terminates the Worker for hard cancellation. Protocol, parity, timeout,
  recovery, supersession, disposal, and invalid-input tests pass. Studio
  applies only current mounted run results and includes deterministic 100k/
  500k fixtures for Chromium responsiveness checks. Firefox, WebKit, Mobile
  Safari, physical-device, and formal accessibility gates remain open.

Phase 8.1 paper trading — **In progress**. Phase 8.1.0 establishes the
framework-independent virtual single-symbol spot-account contract,
deterministic market-event source, market-order lifecycle, causal event
filtering, and versioned persistence. UI, transport adapters, risk, recovery,
benchmark, and broader browser acceptance remain open.

- [Implemented / Verified] Phase 8.1.0 adds `src/paper-trading/` account,
  order, event, deterministic stream, and persistence contracts. Local Node
  tests cover causal fills, idempotency, stale/duplicate/out-of-order/replay
  isolation, state round trips, disconnect/reconnect, and invalid events.
- [Implemented / Verified] Phase 8.1.1 adds injected REST and WebSocket paper
  market adapters with timestamp normalization, bounded pagination, safe
  origin checks, cancellation/stale-response protection, duplicate handling,
  bounded reconnect backoff, and subscription cleanup. Deterministic fake
  fetch/socket tests pass locally; no vendor integration or credentials are
  claimed.
- [Implemented / Verified] Phase 8.1.2 adds bounded order quantity/notional,
  position exposure, session-loss, high-water drawdown, and pending-order
  controls plus a journaled/restorable operator risk halt. Long-only,
  non-leveraged behavior remains enforced; local risk rejection and drawdown
  tests pass.
- [Implemented / Verified] Phase 8.1.3 adds the Next.js Studio simulated
  paper-trading panel with prominent no-real-money labeling, ticket,
  dashboard, order/position history, risk halt, active-chart marker overlay,
  responsive layout, and accessible controls. A focused Chromium E2E flow
  passes. Firefox, WebKit, Mobile Safari, physical-device, and formal
  accessibility gates remain open.
- [Implemented / Verified] Phase 8.1.4 hardens versioned recovery with JSON
  deserialization, accounting/reserve integrity checks, restored source
  sequence and risk-halt state, corruption rejection, and no-auto-fill
  recovery tests. Persistence is still caller-controlled and not silently
  added to workspace export.
- [Implemented / Observed] Phase 8.1.5 adds the local deterministic paper
  account benchmark for 1k/10k/100k events, append median/p95/max latency,
  order-submit latency, fill counts, and post-dispose heap observations. The
  recorded Node run is documented in `docs/reports/phase-8-1-performance.md`;
  it makes no browser FPS or production-capacity claim.
- [Verified / Gate Open] Phase 8.1.6 records the final local acceptance
  matrix in `docs/reports/phase-8-1-final-verification.md`. Node, package,
  Next.js, and Chromium gates pass; Firefox, WebKit, Mobile Safari,
  physical-device, and formal accessibility gates remain open.

Phase 8.2 strategy optimization and walk-forward analysis — **In progress**.

- [Implemented / Verified] Phase 8.2.0 adds explicit Studio local Save and
  Restore actions for the simulated Paper Trading account. The implementation
  uses the versioned persistence API, scopes state by chart panel and symbol,
  and keeps account state separate from chart workspace state. Baseline Node,
  TypeScript, and Mobile Chrome emulation evidence is recorded in the Phase
  8.2 verification report; inherited managed-browser, accessibility, and
  physical-device gates remain open.
- [Not Started] Phase 8.2.1–8.2.6 Strategy Optimization, bounded Worker
  orchestration, leakage-safe Walk-Forward Analysis, robustness reporting,
  Studio optimizer integration, and final verification.
- [Implemented / Verified] Phase 8.2.1 adds the bounded deterministic Grid
  Optimization Core under `src/optimization/`. It supports integer/numeric
  ranges, explicit values, fixed parameters, Strategy Registry constraints,
  null-safe objectives, deterministic ranking, resource limits, compact result
  summaries, cancellation, and financial parity with `createBacktest()`.
  Worker scheduling, Walk-Forward isolation, robustness, and Studio controls
  remain open.
- [Implemented / Verified] Phase 8.2.2 adds typed bounded optimization Worker
  orchestration over `createBacktestWorker()`. It supports configurable
  concurrency, progress/status aggregation, candidate timeout, overall
  timeout, crash/startup retry, cancellation, supersession, generation-safe
  result ownership, and disposal cleanup. Walk-Forward, robustness, and Studio
  integration remain open.
- [Implemented / Verified] Phase 8.2.3 adds anchored and rolling chronological
  Walk-Forward folds with optional validation/gap, explicit warm-up context,
  strict training-only selection, isolated flat OOS execution through the
  additive Backtest `tradingStartIndex` boundary, fold provenance, and
  reset-per-fold aggregation with overlap warnings. Robustness and Studio
  integration remain open.
- [Implemented / Verified] Phase 8.2.4 adds deterministic neighboring-parameter
  sensitivity, training/OOS degradation and parameter-stability diagnostics,
  profitable-fold consistency, overfitting warnings, and reproducible data-only
  JSON/CSV optimization and fold exports. Studio integration and benchmarks
  remain open.
- [Implemented / Verified] Phase 8.2.5 adds the private Studio Strategy
  Optimizer and Walk-Forward tabs: bounded chart-scoped controls, Worker
  progress/cancel, ranked candidate tables, safe Strategy Tester application,
  fold metrics/timeline, warnings, and local JSON/CSV export. Local Chromium
  and mobile cancellation paths pass; Phase 8.2.6 benchmarks and inherited
  Firefox/WebKit/Mobile Safari, accessibility, and physical-device gates remain
  open.

Phase 8.3 market screener and multi-symbol analytics — **In progress; final
acceptance open**.

- [Implemented / Verified] Phase 8.3.0 adds the framework-independent
  versioned instrument identity, bounded Universe validation, Watchlist
  conversion, explicit-finality market-data boundary, and deterministic
  paginated demo provider.
- [Implemented / Verified] Phase 8.3.1 adds the declarative bounded rule AST,
  nested tri-state logic, causal price/volume predicates, strict crossings,
  previous-channel breakout, and Indicator Registry reuse without duplicate
  formulas.
- [Implemented / Verified] Phase 8.3.2 adds bounded concurrent snapshot
  scans, confirmed-bar filtering, revision/correction handling, provider
  error isolation, cancellation, progress, stable result identity, and
  diagnostics.
- [Implemented / Verified] Phase 8.3.3 adds incremental Watch sessions with
  append-only indicator updates, affected-symbol correction recalculation,
  duplicate/developing suppression, lifecycle cleanup, and provider error
  reporting.
- [Implemented / Verified] Phase 8.3.4 adds a separate versioned Screener
  Worker protocol and runtime with serializable tasks, reference evaluation,
  generation guards, timeout, cancellation, supersession, and disposal.
- [Implemented / Verified locally] Phase 8.3.5 adds the private Studio Market
  Screener panel with Watchlist universe selection, rule controls, snapshot/
  watch operations, table search/filter/sort, chart navigation, favorites,
  versioned JSON presets, and deterministic demo stepping. Local Chromium and
  Next.js production build pass; inherited compatibility,
  accessibility, and physical-device gates remain open.
- [Implemented / In Verification] Phase 8.3.6 adds the deterministic Node
  screener benchmark and final acceptance matrix. Local Node/Next/Chromium
  evidence passes, while managed Firefox/WebKit/mobile, accessibility,
  physical-device, visual, and external-provider gates remain open.

Phase 8.4 universal data integration and library architecture hardening —
**In progress; final acceptance open**.

- [Implemented / Verified] 8.4.0 confirms the library-first boundary: core
  OpenKline has no mandatory provider, backend, cloud service, framework, or
  network side effect. The audit and follow-up actions are recorded in
  `docs/reports/phase-8-4-architecture-audit.md`.
- [Not Started] 8.4.1 direct-data consumer verification.
- [Not Started] 8.4.2 custom Datafeed SDK hardening.
- [Not Started] 8.4.3 standalone offline, custom-exchange, generic adapter,
  and optional provider examples.
- [Not Started] 8.4.4 package portability verification.
- [Not Started] 8.4.5 Studio/reference-application separation audit.
- [Not Started] 8.4.6 full verification and final report.

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
- [Implemented] Phase 4.2 restricted interpreter with deterministic series
  semantics, validated technical/math intrinsics, budgets, cancellation,
  invalid-input diagnostics, and native parity fixtures.
- [Implemented] Phase 4.3 integration through the existing Indicator Engine,
  Chart panes/styles/lifecycle, correction recomputation, and serializable
  workspace source references.
- [Implemented] Phase 4.4 public compiler/execute APIs, React and Next.js
  consumption, a dependency-free Vanilla playground, examples, and local
  KlineScript benchmarks.
- [In Verification] Phase 4.5 security hardening and handover. The independent
  audit fixed parser stack exhaustion, under-counted window/per-bar work, the
  series/scalar checker mismatch, and an internal AST metadata leak. Chromium
  and Mobile Chrome are verified; inherited Firefox/WebKit/Mobile Safari
  Playwright criteria remain environment-blocked and therefore Phase 4 is not
  closed. See `docs/audits/klinescript-security-audit.md` and
  `docs/reports/phase-4-security-verification.md`.
- [Implemented / Gate Open] Phase 5.1 added generated license/asset inventory,
  lockfile integrity validation, dependency audits, independent Vanilla and
  TypeScript/React tarball consumers, Next.js 16.4.3 security remediation,
  developer-preview and local-release procedures. The effective project
  license and third-party notice review remain owner/legal blockers; Firefox,
  WebKit, and Mobile Safari remain official-artifact blockers. See
  `docs/reports/phase-5-release-readiness.md`.
- [Implemented / Gate Open] Phase 5.2 added a portable managed-Playwright
  configuration/report collector, local `0.1.0-alpha.1` review-tarball
  generator, archive audit, and clean installed-package Vanilla/TypeScript/
  React/Next/browser verification. Legal approval, attribution review, and
  managed Firefox/WebKit/Mobile Safari evidence remain open; no public release
  action is authorized. See `docs/reports/phase-5-2-verification.md`.
- [Implemented / Owner Decision Required] Phase 5.3 distinguishes the local
  system-Chromium diagnostic from Playwright-managed evidence, records browser
  provenance/hashes, and adds an owner approval package, alpha support matrix,
  proposed release notes, and publication checklist. No package, tag, release,
  visibility, license, or onboarding setting is published by this work. See
  `docs/reports/phase-5-3-verification.md`.
- [Implemented / Counsel Review Required] The owner-confirmed licensing policy
  is now drafted as a custom source-available proposal for free, public-source,
  no-advertising/no-paid-feature Consumer Applications. It is not OSI-approved,
  has no effective SPDX/manifest metadata, and has an explicit compatibility
  analysis and ownership checklist. See `docs/legal/README.md`.
- [Implemented / Counsel Review Required] Phase 5.4 packages the proposed text,
  source-availability scenarios, compatibility questions, repository ownership
  evidence, third-party notice limits, and a strictly post-approval adoption
  procedure. It does not adopt a license or authorize an alpha publication; see
  `docs/reports/phase-5-4-license-adoption-readiness.md`.
- [Implemented / In Verification] Phase 6.0 reconciles React resources by
  stable identity, preserves omitted workspace data, validates same-origin REST
  pagination/redirects/header forwarding, and preserves viewport zoom through
  resize and historical correction. Local React Strict Mode browser evidence is
  available; Studio and Phase 6 acceptance remain open. See
  `docs/reports/phase-6-core-reliability.md`.
- [Implemented / In Verification] The private Next.js Studio composes public
  chart APIs for deterministic market fixtures, object management, drawings,
  indicators, workspaces, and restricted KlineScript. Local Chromium workflows
  pass; managed-browser, accessibility, consumer, and final performance gates
  remain open. See `docs/reports/phase-6-studio-verification.md`.
- [Implemented / In Verification] Phase 7.0.1 provides one primary
  `PriceScale` conversion path for Canvas rendering, crosshair/tooltip values,
  drawings, and plugin contexts. It supports linear, logarithmic, percentage,
  and indexed display modes, stable positive references, asymmetric margins,
  manual raw ranges, deterministic fallback diagnostics, and optional
  backward-compatible workspace configuration. See
  `docs/architecture/price-scale-system.md`.
- [Implemented / In Verification] Phase 7.0.2 replaces fixed three-label time
  output with adaptive UTC tick candidates from milliseconds through years,
  responsive measured-label overlap suppression, and locale/named-timezone
  formatting that follows DST. Session calendars remain out of scope; see
  `docs/architecture/time-axis.md`.
- [Implemented / In Verification] Phase 7.0.3 adds OHLC bars, hollow
  candlesticks, display-only Heikin–Ashi, and baseline series to the shared
  Canvas/viewport/workspace lifecycle. Raw OHLCV remains the public and
  indicator source for Heikin–Ashi; see `docs/architecture/chart-types.md`.
- [Implemented / In Verification] Phase 7.0.4 makes the private Studio a
  public-API consumer of Candles, OHLC, Hollow Candles, Heikin–Ashi, Line,
  Area, Baseline, and primary price-scale controls. A Chromium browser
  workflow verifies a saved workspace restores chart presentation, scale mode,
  theme, an EMA indicator, and trend-line anchors. Broader browser and
  inherited Phase 6 acceptance remain open; see `docs/guides/studio.md`.
- [Implemented / Gate Open] Phase 7.0.5 local verification passes Node,
  Chromium, Pixel 7 Chromium emulation, Next.js production build, packed
  consumer, and Canvas2D benchmark checks. Firefox, WebKit, and Mobile Safari
  remain blocked by missing official Playwright binaries, so Phase 7.0 is not
  closed; see `docs/reports/phase-7-0-verification.md`.
- [Implemented] Phase 7.1.1 adds the framework-independent `ReplayEngine`
  state machine with protected source cloning, inclusive bar cursors,
  irregular-timestamp seeking, deterministic stepping/playback, injectable
  scheduling, bounded speed, and disposal tests. Chart future-data isolation,
  indicators, datafeeds, Studio, and final replay verification remain open;
  see `docs/architecture/replay-engine.md`.
- [Implemented / In Verification] Phase 7.1.2 integrates replay with the
  existing ChartModel and Canvas chart lifecycle. Inclusive cursor masking now
  covers all supported series, indicators/KlineScript input, Heikin–Ashi
  derivation, crosshair/tooltip/autoscale inputs, drawings, plugin contexts,
  workspace exports, and datafeed callbacks. Source and structural mutations
  are blocked during replay, while exit restores the complete workspace and
  resubscribes the datafeed. Node and Chromium integration tests pass; Studio
  controls, broader browser evidence, and final Phase 7.1 acceptance remain
  open. See `docs/architecture/replay-data-integrity.md` and
  `docs/api/replay.md`.
- [Implemented / In Verification] Phase 7.1.3 verifies native indicator and
  KlineScript prefix isolation during replay and reuses append-incremental
  indicator calculations for sequential steps. The replay benchmark measures
  one indicator, multiple indicators, KlineScript, arbitrary seek, playback,
  exit, and destruction at 1k/10k/100k histories; see
  `docs/development/benchmarks.md`.
- [Implemented / In Verification] Phase 7.1.4 adds public-API-only replay
  controls to the private Next.js Studio: enter/exit, start selection,
  Beginning/Latest, inclusive timeline seeking, step, play/pause, bounded speed
  selection, status/date feedback, keyboard shortcuts, and a touch-sized
  workflow. Existing Studio workspace and React lifecycle tests remain green;
  final replay verification and broader browser evidence remain open. See
  `docs/guides/studio-replay.md`.
- [Implemented / Gate Open] Phase 7.1.5 completes the local package, Next.js,
  Chromium, mobile-Chromium, performance, and replay evidence matrix. The
  handover report is `docs/reports/phase-7-1-verification.md`. The inherited
  managed Firefox, WebKit, Mobile Safari, accessibility, and physical-device
  gates remain open and are not reclassified, so Phase 7.1 is not formally
  closed.
- [Implemented] Phase 7.2.0 reproduces and fixes the inactive-replay append
  regression caused by copying the full candle snapshot in
  `getLatestCandleTime()`. The corrected Canvas2D and replay measurements are
  recorded in `docs/reports/phase-7-2-performance-baseline.md`.
- [Implemented / In Verification] Phase 7.2.1 adds the framework-neutral
  Alert Engine with strict threshold/crossing semantics, frequency/cooldown/
  finality controls, diagnostics, serializable definitions, bounded history,
  and separate live/replay state. Chart integration covers indicator,
  KlineScript, drawing, datafeed metadata, workspace, replay, and lifecycle
  boundaries; see `docs/architecture/alert-engine.md` and
  `docs/api/alerts.md`.
- [Implemented / In Verification] Phase 7.2.2 adds the public-API-only Studio
  Alerts panel, simulated replay history, Chromium browser workflows, and the
  Node alert benchmark. The final Phase 7.2 report remains open until all
  available evidence is recorded; inherited Firefox, WebKit, Mobile Safari,
  accessibility, and physical-device gates remain open.
- [Implemented / In Verification] Phase 7.3.1 adds the optional public
  `KlineScriptWorkerRuntime`, versioned structured-clone protocol, serializable
  compile metadata, Worker-side candle sessions, generation/stale-result
  protection, diagnostics, timeout, cancellation, restart, and disposal. The
  deterministic Worker harness passes locally. Chart/Replay/Alert async
  integration, differential incremental execution, and the Studio IDE remain
  open; see `docs/architecture/klinescript-worker-runtime.md` and
  `docs/reports/phase-7-3-verification.md`.
- [Implemented / In Verification] Phase 7.3.2 adds opt-in
  `Chart.addScriptIndicatorAsync(source)`. Worker results use the normal
  indicator/series lifecycle with generation guards, synchronous correctness
  fallback, current-only script alert snapshots, replay-prefix session reset,
  and disposal on remove/destroy. A real Chromium ESM-Worker workflow passes;
  incremental execution and the professional Studio editor remain open.
- [Implemented / In Verification] Phase 7.3.3 adds a conservative
  `pointwise-append` Worker candidate for direct candle-field/literal
  expressions, with exact output differential tests and full-interpreter
  fallback for parameters, history, assignments, technical functions, and all
  corrections. Stateful TA incremental execution remains open; see
  `docs/architecture/klinescript-incremental-execution.md`.
- [Implemented / In Verification] Phase 7.3.4 upgrades the private Studio
  KlineScript surface with syntax highlighting, line numbers, precise
  diagnostics, implemented-language autocomplete, starter templates, local
  browser script management, Worker runtime status/cancellation, and a
  responsive client-only layout. Monaco/CodeMirror was evaluated but not
  added because neither dependency is available in the repository; see
  `docs/guides/klinescript-editor.md`. Final accessibility and broader browser
  gates remain open.
- [Implemented / Gate Open] Phase 7.3.5 records local final verification for
  Worker lifecycle, asynchronous Chart/Replay/Alert integration, differential
  pointwise append execution, the Studio editor, package consumers, and
  Chromium/Mobile Chrome behavior. It also fixes an alert-output full-result
  clone and linear lookup that regressed large append workloads; the corrected
  100,000-candle Canvas2D run measured approximately 63 FPS and 0.94 ms per
  append in the recorded environment. Corrections remain a separate measured
  full-recalculation path. Firefox, WebKit, Mobile Safari, accessibility, and
  physical-device gates remain open; see
  `docs/reports/phase-7-3-verification.md`.
- [Implemented / In Progress] Phase 7.4.0 adds framework-neutral, versioned
  Studio workspace and watchlist contracts with stable panel/symbol IDs,
  nested existing chart-workspace validation, legacy single-chart migration,
  CRUD/reorder/favorite operations, and deterministic quote-provider boundaries.
  The multi-chart UI, synchronization, named workspace manager, and final
  acceptance remain open; see the Phase 7.4 architecture documents.
- [Implemented / In Progress] Phase 7.4.0 also adds timestamp-based Chart
  primitives for optional crosshair and visible-range synchronization. These
  methods do not couple charts or synchronize Replay implicitly; host-level
  source tagging and nearest-bar mapping remain required.
- [Implemented / In Verification] Phase 7.4.1 connects the domain contracts to
  the private Next.js Studio with single, two-horizontal, two-vertical, and
  four-grid layouts; stable panel selection; isolated chart/replay/alert/
  drawing/indicator/script state; opt-in timestamp and symbol/timeframe sync;
  deterministic watchlist favorite/reorder controls; named local workspaces;
  import/export validation; and responsive mobile panel switching. Local
  Chromium coverage is in `tests/react-browser/multi-chart-studio.spec.ts`;
  the acceptance matrix is in `docs/reports/phase-7-4-verification.md`.
- [Implemented / In Verification] Phase 7.4.1 adds the reproducible
  `benchmark:studio` lifecycle workload. Its numbers are local observations;
  it is not an FPS, memory-limit, accessibility, or cross-browser claim.
- [Implemented / In Progress] Phase 7.5.0 adds the framework-independent
  primary indicator definitions ROC, CCI, Williams %R, OBV, MFI, ADX (+DI/-DI),
  Donchian Channels, and Keltner Channels. Metadata categories, explicit
  parameter validation, aligned warm-up values, missing-volume behavior, and
  append/correction equivalence are covered by the indicator tests and public
  API documentation. The advanced definitions reuse the existing registry,
  chart series, pane, scale, and filled-band architecture.
- [In Progress] Phase 7.5.1 still requires contextual drawing property editing,
  broader end-to-end drawing/synchronization coverage, workspace
  import/storage and multi-chart performance/memory evidence. The accessible
  Indicator Explorer, professional drawing toolbar, object tree,
  visible-OHLC snapping, source-tagged sync controller, and in-page dialogs
  are implemented and locally verified in Chromium. No Phase 7.5 acceptance
  claim is made until the remaining checks and inherited Firefox/WebKit/Mobile
  Safari/accessibility/device gates are verified.
- [Implemented / In Verification] Phase 7.5.1 adds framework-neutral drawing
  definitions for rays, extended lines, parallel channels, Fibonacci
  extensions, price/date ranges, and long/short risk-reward annotations. They
  reuse the existing coordinate converter, Canvas primitives, hit testing,
  locked editing, undo/redo, and workspace serialization. Node geometry and
  validation coverage passes; representative Chromium interaction and Studio
  toolbar exposure are verified, while broader tool/device coverage remains
  open.
- [In Progress] Accessible Studio controls are implemented, but formal
  keyboard/assistive-technology audits and visual regression baselines remain
  open.
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
- Add the owner-approved `LICENSE` and matching package metadata; do not infer
  a license from the phrase “open source”.
- Keep the formal datafeed contract vendor-neutral as adapters evolve.
- Establish reference hardware before setting Phase 2 rendering targets.
- Complete the independent third-party dependency/license inventory before a
  stable package release.
- Do not treat the custom source-available proposal or the superseded
  `LICENSE-APACHE-2.0.PROPOSED` as an effective license; after owner/counsel
  approval, add only the approved final license, metadata, and verified notices.
