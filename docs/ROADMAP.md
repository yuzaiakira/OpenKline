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
**Implemented locally; final acceptance open**.

- [Implemented / Verified] 8.4.0 confirms the library-first boundary: core
  OpenKline has no mandatory provider, backend, cloud service, framework, or
  network side effect. The audit and follow-up actions are recorded in
  `docs/reports/phase-8-4-architecture-audit.md`.
- [Implemented / In Verification] 8.4.1 adds a standalone direct-data Vanilla
  example and a network-deny browser scenario covering local data, corrections,
  indicators, drawings, precision, and chart cleanup.
- [Implemented / In Verification] 8.4.2 hardens the provider-neutral Datafeed
  lifecycle by resolving symbols before history, preserving cancellation and
  stale-request guards, and adding a custom-exchange consumer scenario.
- [Implemented / In Verification] 8.4.3 adds standalone offline JSON,
  custom-exchange, generic REST, generic WebSocket, and opt-in Binance example
  pages. Fixture tests verify normalization and cleanup without external
  connectivity; real Binance connectivity remains separately unverified.
- [Implemented / In Verification] 8.4.4 adds a local package portability gate
  for ESM/type exports, worker artifacts, tree-shaking metadata, runtime
  dependency boundaries, and provider-neutral core output. Independent
  consumer and Next.js checks remain part of final verification.
- [Implemented / In Verification] 8.4.5 adds an executable Studio separation
  audit. Core source remains framework/example independent, the Next.js app is
  private, and public-package consumption remains the Studio boundary.
- [Implemented / In Verification] 8.4.6 records the local Node, type, package,
  Chromium, Mobile Chrome emulation, React/Next.js, and Canvas2D evidence in
  `docs/reports/phase-8-4-verification.md`. Managed Firefox/WebKit/Mobile
  Safari, physical-device, formal accessibility, visual-regression, and real
  external-provider gates remain open; Phase 8.4 is not formally closed.

Phase 8.5 quality assurance and public API/release-readiness hardening —
**Engineering implemented; final release gate open**.

- [Implemented / Verified] 8.5.0 records a release baseline audit covering
  repository state, package manifests, exports, workers, runtime dependencies,
  documentation, effective-license status, and browser evidence.
- [Implemented / Verified] 8.5.1 inventories the public runtime/type surface
  and adds declaration-signature compatibility checks. The current inventory
  contains 205 runtime exports and 418 type exports; removed or changed
  exports fail the compatibility gate while additive exports are reported.
- [Implemented / In Verification] 8.5.2 records the browser matrix. System
  Chromium and Mobile Chrome emulation pass the local diagnostic; official
  Playwright-managed Firefox, WebKit, and Mobile Safari remain blocked by
  unavailable browser artifacts. Physical-device evidence is not tested.
- [Implemented / Verified] 8.5.3 adds deterministic release hardening for
  corrections, invalid data, concurrent subscriptions, disposal, chart
  destruction, and React/browser lifecycle cleanup. The Node suite passes 156
  tests and the targeted browser lifecycle test passes.
- [Implemented / Verified locally] 8.5.4 records Canvas2D benchmark and
  profiler observations for 1k/10k/100k candles, update/correction work,
  frame-work p95, rAF rate, heap cleanup, and renderer/update timings. These
  are environment-specific observations, not universal guarantees.
- [Implemented / In Review] 8.5.5 adds automated accessibility smoke checks
  and deterministic visual-review capture candidates. Formal assistive-
  technology/conformance review and owner-approved visual baselines remain
  open.
- [Implemented / Verified] 8.5.6 verifies package portability, packed
  contents, independent Vanilla/TypeScript/React consumers, Next.js build,
  license inventory, and root/example npm audits. Effective license and
  third-party notice adoption remain unchanged and pending approval.
- [Implemented / In Verification] 8.5.7 adds `npm run release:readiness`, an
  explicit local command that records all automated and manual/approval gates
  without publishing or authorizing a release. The latest run reports
  `NOT READY` only because the documented browser, legal, accessibility,
  visual, physical-device, and owner-authorization gates remain open. Phase
  8.5 must not be marked closed until those mandatory gates are independently
  satisfied or the owner documents an authorized exception.

Phase 8.6 accessibility, visual regression, and release evidence consolidation
— **Engineering implemented; verification and approval gates open**.

- [Implemented / Verified locally] 8.6.0 adds the Canvas chart text
  alternative and empty-state label, Studio dialog descriptions, Escape
  handling, focus restoration, and automated Chromium accessibility coverage.
  Formal assistive-technology, WCAG, contrast, reduced-motion, and physical
  device review remains open.
- [Implemented / Review Required] 8.6.1 adds deterministic visual-review
  captures and strict byte-difference JSON reports for desktop, light-theme,
  and narrow layouts. The tests never approve a baseline automatically; no
  owner-approved baselines are currently present.
- [Reported / Not Independently Validated] 8.6.2 records the trusted
  Manjaro/pinned Playwright report of 65/65 tests across Chromium, Firefox,
  WebKit, Mobile Chrome emulation, and Mobile Safari emulation at source
  commit `4d689c8`. The named archive is absent from this checkout, so its
  supplied SHA-256 remains unverified here; request the archive and all JSON
  and test-result files before upgrading this to independent verification.
- [Verified locally] 8.6.3 passes typecheck, 156 Node tests, API compatibility,
  package portability/smoke/distribution, 14 Vanilla Chromium browser tests,
  and 20 React/Studio Chromium browser tests. The managed five-project runner
  is accurately recorded as blocked when official binaries are unavailable.
- [Gate Open] 8.6.4 keeps release status `NOT RELEASE READY` pending the
  portable evidence archive, formal accessibility review, approved visual
  baselines, physical-device decision/evidence, effective-license and
  third-party-notice approvals, and owner release authorization.

Phase 8.6.2 GitHub evidence integration and release-quality completion —
**Engineering implemented; release gate open**.

- [Implemented / Verified] The trusted-machine evidence branch
  `qa/phase-8-6-1-browser-evidence` was reviewed and integrated without
  unrelated files. `npm run evidence:browser:check` validates source commit
  `19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa`, official Playwright provenance,
  70 unique records, five 14/14 project totals, SHA-256 formats, and
  sanitization. Full archives remain trusted-machine-only; their hashes are
  not recomputed in cloud.
- [Implemented / Verified locally] Visual review determinism now records and
  fixes locale, UTC, device scale, reduced motion, viewport, fixture metadata,
  resolved browser version, and disabled screenshot animations. Candidates
  remain unapproved until owner review.
- [Verified locally] Typecheck, 156 Node tests, API compatibility, package
  portability/smoke/distribution, Studio separation, 14 Vanilla Chromium
  tests, 20 React/Studio Chromium tests, Next.js production build, and the
  trusted-evidence consistency gate pass.
- [Gate Open] Local managed-browser execution is blocked by unavailable
  Playwright binaries; physical-device, formal accessibility, visual-baseline,
  legal, third-party-notice, and owner release-authorization gates remain
  unresolved. Phase 8.6.2 does not mark the project release-ready.

Phase 8.7 accessibility hardening and visual review readiness — **Engineering
implemented; review and release gates open**.

- [Implemented / Verified locally] Studio dialogs now contain keyboard focus
  with Tab and Shift+Tab, while Escape and trigger-focus restoration remain
  covered. This is a focused accessibility fix; it does not claim formal WCAG
  conformance or screen-reader support.
- [Implemented / Verified locally] Visual review captures freeze the demo
  clock before app startup, eliminating time-dependent quote-label drift. Two
  visual tests pass repeatedly and produce stable dark, light, and narrow
  candidates. No baseline is approved or stored in the repository.
- [Verified locally] Phase 8.7 passes the evidence consistency check, typecheck,
  156 Node tests, API compatibility, 14 standalone Chromium tests, 21 React/
  Studio Chromium tests, and the Canvas2D benchmark. Performance is reported
  as local diagnostic data, not a universal device claim.
- [Gate Open] The trusted 70/70 matrix belongs to the pre-Phase-8.7 source
  commit and cannot certify the new revision. Managed current-revision
  Firefox/WebKit/mobile execution, screen-reader review, formal conformance,
  measured contrast, physical devices, approved visual baselines, legal and
  third-party approvals, and owner release authorization remain unresolved.

Phase 8.8 accessibility verification, contrast audit, and browser test
reliability — **Engineering implemented; release gates open**.

- [Implemented / Verified locally] Rendered Studio contrast is measured in
  Chromium. Placeholder text and control borders were corrected from measured
  deficiencies; automated coverage records primary, muted, status, disabled,
  border, and focus ratios. Public financial chart colors remain consumer/
  theme-controlled and unchanged.
- [Implemented / Verified locally] Reduced-motion coverage observes no
  decorative Studio animations or transitions while retaining required data,
  replay, and Worker updates. Formal assistive-technology review remains open.
- [Implemented / Verified locally] Two sequential browser diagnostics each
  pass 28/28 after the earlier transient release-readiness timeout. No root
  cause was claimed, no blanket timeout or skipped coverage was introduced.
- [Implemented / Verified locally] Visual capture waits for rendered Canvas
  state and produces stable dark, light, and mobile candidates. Baselines
  remain unapproved and uncommitted.
- [Gate Open] The current-revision five-browser matrix, physical devices,
  screen readers, formal conformance, visual approval, legal review, and owner
  release authorization remain unresolved. The historical 70/70 pack is not
  current-revision evidence.

Phase 8.8.2 browser evidence integration and Studio compatibility —
**Implemented; Studio cross-browser gates open**.

- [Implemented / Verified] Integrated the trusted Phase 8.8.1 standalone
  evidence pack at `f77e124`, preserving its exact source commit
  `2aabccf` and 70/70 five-project result. The multi-pack validator retains
  Phase 8.6.1 validation and rejects missing, duplicate, malformed, or
  provenance-inconsistent records.
- [Implemented / Verified locally] Added an independent optional Studio
  managed-browser workflow with deterministic Next readiness, five projects,
  visual tests excluded, timestamped evidence, and PASS/BLOCKED/FAIL status.
- [Fixed / Verified locally] Added the Next Studio device viewport contract
  and regression assertion after reproducing responsive hit-testing failures
  in the cloud system-browser lane. Standalone and local Chromium Studio
  tests remain separate.
- [Gate Open] The trusted supplemental Studio result remains 75 expected with
  30 failures (WebKit 3, Mobile Chrome 16, Mobile Safari 11). The compact
  pack lacks individual failure details; a trusted machine must rerun the
  final source with the new Studio workflow before Studio support claims are
  changed. Legal, accessibility, physical-device, visual, and owner release
  gates remain open.

Phase 8.8.4 Studio cross-browser defect remediation — **Engineering implemented;
Studio compatibility gates remain open**.

- [Implemented / Verified locally] The 30 Phase 8.8.3 Studio failures are
  preserved in a structured ledger with exact classifications and an explicit
  distinction between observed facts, insufficient diagnostics, and confirmed
  responsive defects. The evidence validator independently validates the
  8.8.3 pack and preserves its 75/30 behavior result.
- [Fixed / Verified locally] Mobile Studio object-tree, watchlist, chart, and
  sidebar blocks use responsive normal flow so controls are not covered by
  desktop overlays. A real hit-test regression covers Add and Run Backtest;
  no forced click is used.
- [Fixed / Verified locally] Canvas pointer/touch coordinates are normalized
  for CSS scaling and touch contexts, with chart-owned touch gestures enabled.
  Unchanged resize notifications no longer trigger redundant chart work.
- [Verified locally] Typecheck, 160 Node tests, 14 standalone Chromium tests,
  24 Studio Chromium tests, and all versioned evidence checks pass.
- [Gate Open] The trusted 8.8.3 records target the pre-remediation source
  `8a62e324`. Managed current-revision Firefox, WebKit, mobile emulation,
  async-state diagnostics, physical devices, formal accessibility, visual
  approval, legal review, and owner release authorization remain unresolved.

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
- [Implemented / Verification Open] Phase 8.8.6 adds a failure-only Studio
  diagnostic fixture, a falsifiable 31-record root-cause matrix, touch-aware
  drawing/replay test input, and a responsive hidden-panel assertion aligned
  with the existing mobile layout contract. Local system-Chromium Studio
  coverage passes 24/24 and versioned evidence validation passes, while the
  current trusted five-project Studio rerun remains required. ResizeObserver,
  pointer-interception, asynchronous panel, physical-device, accessibility,
  legal, and release gates remain open; see
  `docs/reports/phase-8-8-6-verification.md`.
- [Implemented / Verification Open] Phase 8.8.8 integrates the sanitized
  Phase 8.8.7 focused evidence and adds bounded pointer/overflow diagnostics,
  a touch-start drawing fallback with pointer deduplication, and a mobile
  Studio drawing test contract that targets the visible primary pane rather
  than hidden indicator/volume panes. Local Chromium verification remains
  engineering evidence only; trusted WebKit/mobile drawing, ResizeObserver,
  and asynchronous Studio failures remain open pending a current-source
  trusted rerun. See `docs/reports/phase-8-8-8-verification.md`.
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

## Phase 8.8.10 status

- [Implemented / Verification Open] Phase 8.8.10 integrates and validates the
  sanitized Phase 8.8.9 evidence, replaces the WebKit-unsafe synthetic touch
  constructor path with a generic-event fallback, bounds the responsive
  multi-chart action controls, defers observed chart resizes outside the
  ResizeObserver callback, and traces the mobile indicator transition. Local
  engineering checks pass, but current trusted Playwright-managed WebKit,
  Firefox, Mobile Chrome, and Mobile Safari execution remains unverified.
  Physical-device, formal accessibility, visual approval, legal, and release
  authorization gates remain open. See
  `docs/reports/phase-8-8-10-verification.md` and
  `docs/reports/phase-8-8-10-targeted-handoff.md`.

- [Implemented / Verification Open] Phase 8.8.12 preserves the seven-failure
  Studio ledger, adds bounded compatibility diagnostics, repairs the locally
  reproduced CSS/logical resize race affecting drawing anchors, and hardens
  paper-trading session/input and alert-input handling. Local 167/167 Node
  tests, 26/26 Studio Chromium tests, and the focused drawing regression pass.
  The trusted current-source Firefox, WebKit, and Mobile Safari targeted rerun
  remains open; the prior trusted result is still 113/120 Studio. See
  `docs/reports/phase-8-8-12-verification.md` and
  `docs/reports/phase-8-8-12-targeted-handoff.md`.
