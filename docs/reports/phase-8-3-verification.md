# Phase 8.3 Verification

## Status

Phase 8.3 is open. This report records verified milestones through 8.3.5;
the final benchmark, acceptance matrix, and inherited browser/accessibility/
physical-device gates remain open.

## 8.3.0 baseline

- Implemented: versioned screener types, stable provider/venue-scoped instrument identity, bounded universe validation, Watchlist-to-universe conversion, and a deterministic paginated market-data provider.
- Verified: identity normalization and collision resistance across provider, exchange, and instrument ID; duplicate universe rejection; Watchlist conversion; repeatable confirmed OHLCV pages and cursor pagination.
- Not tested: external providers, credentials, live sockets, browser UI, mobile devices, accessibility, Firefox, WebKit, and visual compatibility.

## 8.3.2 deterministic snapshot scanning

- Implemented: bounded concurrent snapshot runner, provider resolution, cursor pagination, confirmed-bar filtering, duplicate/revision handling, out-of-order sorting, per-symbol error isolation, strict mode, cancellation, deterministic result identity, counts, progress, and diagnostics.
- Verified: `tests/screener-snapshot.test.ts` covers deterministic pagination, reproducible output, bounded progress, correction revisions, provider failure isolation, developing-only data, pre-acquisition validation, and cancellation.
- Not tested: live incremental watching, Worker protocol, Studio integration, external providers, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.
- Security boundary: no dynamic code execution, no external network access, no broker or trading integration.

## Evidence

The baseline test is `tests/screener-baseline.test.ts` and is included in the local Node test command. Build/typecheck and the complete test command must be rerun after each subsequent milestone.

## 8.3.1 rule AST and reference evaluator

- Implemented: versioned typed rule AST, bounded validation, price/volume predicates, nested AND/OR/NOT, registered-indicator references, strict crossings, prior-channel breakout, causal cutoff evaluation, and tri-state unavailable diagnostics.
- Verified: `tests/screener-rules.test.ts` covers invalid ASTs, thresholds, percentages, volume, prior ranges, crossings, SMA reuse, compound unknown propagation, missing volume, invalid candles, developing-bar rejection, and future-bar isolation.
- Not tested: worker scheduling, snapshot aggregation, incremental subscriptions, browser Studio workflows, external providers, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.

## 8.3.3 incremental watch session

- Implemented: `ScreenerWatchSession` lifecycle, confirmed append path through existing indicator incremental instances, correction/out-of-order recalculation for one instrument, duplicate suppression, developing-event filtering, subscription cleanup, rule/universe refresh hooks, and provider error callbacks.
- Verified: `tests/screener-watch.test.ts` covers initial snapshot, append, duplicate, correction, pause/resume, disposal, invalid event handling, and absence of fabricated events.
- Not tested: dedicated Worker, Studio panel, external realtime providers, reconnection policy, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.

## 8.3.4 Screener Worker hardening

- Implemented: dedicated versioned Screener Worker protocol/handler/runtime, serializable calculation boundary, synchronous reference evaluator, progress, stale generation filtering, cancellation, timeout, supersession, crash/disposal cleanup, and structured errors.
- Verified: `tests/screener-worker.test.ts` covers protocol guards, handler evaluation, completion, cancellation, timeout, supersession, and disposal.
- Not tested: Studio integration, external Worker hosts, browser Worker performance, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.

## 8.3.5 Studio integration

- Implemented: the private Next.js Studio now exposes a Market Screener panel
  backed by the public screener contracts. It supports Watchlist-derived
  universes, timeframe and price/indicator rules, nested AND/OR selection,
  bounded snapshot scans, Watch pause/resume/cancel controls, deterministic
  demo stepping, progress/status, result search/filter/sort, source-bar and
  diagnostic display, Open chart/Favorite actions, and versioned JSON preset
  save/load/import/export.
- Implemented: the deterministic demo provider accepts provider-scoped
  Watchlist identities outside its generated demo universe and emits only
  subscribed, confirmed bars for the local Watch workflow. This is a local
  fixture; it is not a vendor adapter, alert service, trading signal, or
  financial advice.
- Verified: `npm test` passed with 151 tests; root typecheck passed; the Next
  example typecheck passed; `npm run build` in
  `examples/nextjs-app-router` passed on Next.js 16.4.3; and the real local
  Chromium test `tests/react-browser/screener.spec.ts` passed (1 test).
- Not tested: Firefox, WebKit, Mobile Chrome, Mobile Safari, physical mobile
  devices, formal accessibility, visual-regression baselines, and external
  market-data providers. These gates remain open.


