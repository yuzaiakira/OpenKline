# OpenKline Phase 8.9.0 — Real-World Functional Verification

Status: **FUNCTIONAL VERIFICATION COMPLETE (with one product fix)**  
Not a release-readiness or licensing gate.

Environment: Manjaro Linux, Node.js v24.19.0, Playwright 1.64.1, system Chromium
`/usr/bin/chromium`, local npm cache only (no new external accounts or live market
services required).

## 1. Exact source SHAs

| Role | SHA |
| --- | --- |
| Verified behavioral baseline (start) | `bb3f1cad028b126920fa26a75f7ec158ebc56e3c` |
| Product fix + functional regression tests | `02e92874fa60e176099acb3eb96953858e31e87e` |
| Final verification / report tip | *(this commit; see git log on `qa/phase-8-9-0-functional-verification`)* |

Branch: `qa/phase-8-9-0-functional-verification`  
Author identity used for commits: `Akira Yuzai <yuzai.akira@gmail.com>`

**Compatibility note:** Phase 8.8.16 managed five-browser matrices (standalone
75/75, Studio 125/125) apply to baseline `bb3f1ca` only. The product fix at
`02e9287` changes chart datafeed lifecycle behavior. Chromium-targeted
regression and related suites passed on `02e9287`; the full managed
multi-browser matrices were **not** re-executed in this phase and must not be
claimed for the new SHA without an independent matrix run.

## 2. Real consumer environments tested

Isolated consumers installed from packed archives under
`artifacts/phase-8-9-0/` (local evidence; gitignored):

| Consumer | Install source | Result |
| --- | --- | --- |
| Vanilla ESM | `openkline-0.1.0.tgz` via `npm pack` | **PASS** — public imports, SMA reference, Heikin-Ashi non-mutation, datafeed subscribe/unsubscribe, VWAP session requirement, KlineScript compile/execute, candle validation, REST/WS export presence |
| TypeScript | same tarball + local `typescript` | **PASS** — `tsc --noEmit` / emit against public types only; RSI warm-up; abortable `getBars`; no private path imports |
| React | `openkline-0.1.0.tgz` + `openkline-react-0.1.0.tgz` + locked React 19 | **PASS** — public `@openkline/react` types; StrictMode SSR markup via `renderToString`; declarative indicators/scripts/drawings |
| Next.js App Router | existing `examples/nextjs-app-router` (file: packages) | **PASS** — Playwright against `/lifecycle-verification` (StrictMode, remount, workspace restore) and Studio accessibility |

Public package surface confirmed: single export `"."` → `dist/src/index.js` /
`.d.ts`; `files: ["dist"]` only.

## 3. Core chart results — VERIFIED

Exercised through vanilla example + Chromium browser specs + exploratory
automation:

| Area | Classification | Evidence |
| --- | --- | --- |
| Candlestick / OHLC / Hollow / Heikin-Ashi / Line / Area / Baseline / Volume | VERIFIED | `tests/browser/chart.spec.ts`; exploratory series add/remove; `tests/series.test.ts` |
| Multiple series + panes | VERIFIED | Vanilla example + series/pane Node tests |
| Crosshair / pan / zoom / resize | VERIFIED | `chart.spec.ts`; exploratory resize/pan/zoom |
| Linear / log / percentage / indexed scales | VERIFIED | Exploratory `setPriceScaleOptions` sweep; source OHLCV unchanged |
| Locale / timezone / RTL | VERIFIED | Exploratory `setOptions({ direction: "rtl", locale: "fa-IR", timeZone: "Asia/Tehran" })` — no page errors; data intact |
| Presentation never corrupts OHLCV | VERIFIED | Heikin-Ashi `getData()` remains raw; exploratory `corrupted: false` |
| Extreme / sparse / irregular values | VERIFIED | Independent indicator extreme-value test; CandleStore insert/correction tests |

Screenshots (local): `artifacts/phase-8-9-0/screenshots/01-*.png` …
`03-*.png`. These are automated captures, not human visual approval.

## 4. Real-time Datafeed results — VERIFIED

Deterministic adapters only (InMemory / Rest / WebSocket fakes). No live
exchange required.

| Scenario | Result |
| --- | --- |
| Historical backfill + pagination + dedupe/sort | PASS |
| Live current-candle revisions + new inserts | PASS |
| Historical corrections by timestamp | PASS |
| Temporary disconnect + reconnect | PASS |
| Duplicate WS messages ignored | PASS |
| Out-of-order WS arrival (callback order vs store) | PASS (callbacks preserve arrival; store reorders on query) |
| Wrong symbol/timeframe messages ignored | PASS |
| Request cancellation mid-pagination | PASS |
| Unsubscribe / destroy cleanup | PASS |
| Multiple independent subscribers | PASS |
| Rapid symbol change / stale response discard | PASS (`setDatafeed` requestId) |
| Chart `setDatafeed` indicator cleanup | PASS after fix (was FAIL) |

New coverage: `tests/functional-datafeed-reliability.test.ts`,
`tests/browser/datafeed-lifecycle.spec.ts`.

## 5. Indicator and drawing results

### Indicators — VERIFIED

Independent arithmetic references (not imported from OpenKline indicator
modules) matched OpenKline for SMA, EMA, RSI, ATR, Bollinger (population σ),
VWAP (`session: "none"`), and MACD line/histogram consistency.

Also covered: append vs full recalculation, corrections, warm-up, insufficient
history, disposal. Suite: existing `indicators.test.ts` + new
`functional-indicators-reference.test.ts`.

### Drawings — PARTIALLY VERIFIED

| Check | Classification |
| --- | --- |
| Create / style / visibility / workspace round-trip (API) | VERIFIED (`drawings.test.ts`, workspace tests) |
| CSS layout resize keeps coordinates valid | VERIFIED (`chart.spec.ts`) |
| Pointer/touch placement across multi-pane mobile layouts | PARTIALLY VERIFIED — prior Phase 8.8.x Studio mobile evidence; not re-run as five-browser matrix here |
| Undo/redo through Studio UI | NOT TESTED in this phase (Studio UI path deferred to avoid matrix duplication) |

## 6. React / Next results — VERIFIED

| Check | Result |
| --- | --- |
| `@openkline/react` SSR / StrictMode markup | PASS |
| Declarative props + identity reconciliation | PASS (`lifecycle.spec.ts`) |
| Workspace restore without clearing unmanaged state | PASS |
| Remount / plugin setup-cleanup accounting | PASS |
| Next App Router client boundary (`"use client"` lifecycle page) | PASS |
| Studio a11y keyboard/dialog semantics (Chromium) | PASS |

Duplicated listeners / canvas leaks: destroy paths left **0 canvases** in
release-hardening style flows and browser benchmark cleanup.

## 7. Advanced-feature results

| Subsystem | Classification | Notes |
| --- | --- | --- |
| KlineScript | VERIFIED | Compile/diagnostics, native parity, budgets, cancellation, Worker lifecycle (Node + Chromium) |
| Replay | VERIFIED | Cursor isolation, restore, datafeed suspend/resubscribe (Chromium + Node) |
| Backtesting | VERIFIED | Existing causal/no-lookahead Node suite passed in full `npm test` |
| Paper Trading | VERIFIED | Order lifecycle, idempotency, stale/OOO rejection, persistence, risk limits; no brokerage path |

Independent financial claim limit: comparisons use fixtures and independent
indicator math where stated; backtest/paper accounting relies on existing
fixture-based tests rather than external broker ground truth.

## 8. Performance measurements

Command: `npm run benchmark:browser` on post-fix tree (local Chromium,
1200×520, `--disable-gpu`). Values are observations, not guarantees.

| Candles | Load ms | Update frame ms (100 appends) | Nav p50/p95 ms | Frame-work p95 ms | rAF FPS | Heap after updates |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 14.1 | 1.117 | 1.7 / 2.5 | 2.0 | 65.70 | ~13.6 MB |
| 10,000 | 71.4 | 0.664 | 1.3 / 4.5 | 1.2 | 63.18 | ~58.2 MB |
| 100,000 | 1018.5 | 0.721 | 1.3 / 2.4 | 1.3 | 62.15 | ~349.5 MB |

Cleanup: heap after destroy ≈ 2.8 MB; **remaining canvases = 0**.

Comparison to Phase 7.2 post-fix baseline (~1.033 ms append @100k, ~62 FPS,
frame-work p95 ~2.2 ms): **no append/FPS regression observed** on this run.
100k historical correction batch remains expensive (~4.0 s for five
corrections) — known heavy path, not newly introduced here.

## 9. Actual reproducible defects

### DEFECT-890-1 — Orphaned indicator series after `setDatafeed` (P0)

- **Severity:** High (data/session integrity + series lifecycle)
- **Repro:** Add indicator → `setDatafeed(...)` → prior `id:output` series remain
  on the model while `serializeWorkspace().indicators` is empty; re-adding the
  same indicator id fails / leaves stale plots.
- **Root cause:** `Chart.setDatafeed` called `instance.dispose()` and cleared the
  managed map without `disposeWorkerIndicator` or `model.removeSeries`.
- **Fix:** `clearManagedIndicators()` / `disposeManagedIndicator()` shared with
  `removeIndicator`.
- **Regression:** `tests/browser/datafeed-lifecycle.spec.ts`
- **Fix commit:** `02e92874fa60e176099acb3eb96953858e31e87e`

No other reproducible product defects were confirmed in P0–P2 scope on Manjaro
during this phase.

## 10. Fixes and regression tests

| Change | Location |
| --- | --- |
| Product fix | `src/chart.ts` |
| Browser lifecycle regressions | `tests/browser/datafeed-lifecycle.spec.ts` |
| Independent indicator references | `tests/functional-indicators-reference.test.ts` |
| Datafeed reliability scenarios | `tests/functional-datafeed-reliability.test.ts` |
| Test runner wiring | `package.json` `test` script |

## 11. Remaining functional limitations

1. Full managed five-browser matrices not re-run on `02e9287`.
2. Studio drawing undo/redo and mobile multi-pane pointer placement not
   re-validated in this phase (prior 8.8.x evidence only).
3. Live exchange integration optional and not used; WS/REST verified with
   deterministic fakes.
4. Physical-device verification not performed (emulation/Chromium only).
5. Exploratory screenshots are automated evidence, not human visual sign-off.
6. 100k historical correction latency remains high relative to append path.

## 12. Final verification SHA

Product acceptance tip for this phase: **`02e92874fa60e176099acb3eb96953858e31e87e`**  
Report documentation commit follows on the same branch.

## 13. Exact tests executed and results

| Command / suite | Result |
| --- | --- |
| `npm test` (includes new functional Node tests + evidence validation) | **184/184 PASS** |
| `npx playwright test tests/browser/datafeed-lifecycle.spec.ts --project=chromium` | **3/3 PASS** |
| `npx playwright test tests/browser/chart.spec.ts … --project=chromium` | **PASS** (chart + series presentation + resize drawing) |
| `npx playwright test tests/browser/custom-datafeed.spec.ts tests/browser/replay.spec.ts tests/browser/klinescript.spec.ts --project=chromium` | **5/5 PASS** |
| `npx playwright test --config playwright.react.config.ts …lifecycle…accessibility…` | **5/5 PASS** (Next App Router on :4174) |
| `npm run benchmark:browser` | **PASS** (metrics above; 0 canvases after destroy) |
| Packed consumer vanilla / TS / React exercises | **PASS** |
| Exploratory Chromium automation (scales/RTL/series/cleanup) | **PASS**, 0 page errors, 0 canvases after destroy |
| Official managed five-browser standalone/Studio matrices | **NOT RE-RUN** on `02e9287` |

## 14. Recommended next engineering priorities

1. Re-run managed standalone + Studio five-browser matrices on `02e9287` (or
   successor) before claiming Phase 8.8.16 browser parity for the fixed tip.
2. Add a focused Studio drawing undo/redo + multi-pane pointer harness that
   places anchors inside the primary pane by `getPaneBounds`, not full-canvas
   fractions.
3. Profile and optionally bound the 100k historical-correction path if
   correction-heavy live feeds become a product requirement.
4. Keep packing consumer smoke (`package:smoke` / preview consumer) in CI so
   orphaned-series style packaging regressions are caught outside the monorepo
   source tree.
5. Optional: expose a documented `setDatafeed` indicator-retention policy if
   consumers need indicators to survive symbol changes (current behavior:
   clear + remove series).

## Subsystem scorecard

| Subsystem | Status |
| --- | --- |
| Real package consumption | VERIFIED |
| Candle / OHLCV integrity | VERIFIED |
| Real-time Datafeed sync | VERIFIED |
| Chart interaction reliability | VERIFIED |
| Cleanup / memory safety | VERIFIED |
| Indicators (priority set) | VERIFIED |
| Drawings | PARTIALLY VERIFIED |
| React / Next integration | VERIFIED |
| Workspace persistence | VERIFIED |
| Performance (local benchmark) | VERIFIED |
| KlineScript | VERIFIED |
| Replay | VERIFIED |
| Backtesting | VERIFIED |
| Paper Trading | VERIFIED |
| Extended multi-browser exploratory | NOT TESTED (Chromium-focused this phase) |
| Physical devices | NOT TESTED |
