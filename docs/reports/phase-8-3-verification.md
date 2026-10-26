# Phase 8.3 Verification

## Status

Phase 8.3 is open. This report records only the verified 8.3.0 baseline; it does not claim rule evaluation, live watching, Worker orchestration, or Studio completion.

## 8.3.0 baseline

- Implemented: versioned screener types, stable provider/venue-scoped instrument identity, bounded universe validation, Watchlist-to-universe conversion, and a deterministic paginated market-data provider.
- Verified: identity normalization and collision resistance across provider, exchange, and instrument ID; duplicate universe rejection; Watchlist conversion; repeatable confirmed OHLCV pages and cursor pagination.
- Not tested: external providers, credentials, live sockets, browser UI, mobile devices, accessibility, Firefox, WebKit, and visual compatibility.
- Security boundary: no dynamic code execution, no external network access, no broker or trading integration.

## Evidence

The baseline test is `tests/screener-baseline.test.ts` and is included in the local Node test command. Build/typecheck and the complete test command must be rerun after each subsequent milestone.

## 8.3.1 rule AST and reference evaluator

- Implemented: versioned typed rule AST, bounded validation, price/volume predicates, nested AND/OR/NOT, registered-indicator references, strict crossings, prior-channel breakout, causal cutoff evaluation, and tri-state unavailable diagnostics.
- Verified: `tests/screener-rules.test.ts` covers invalid ASTs, thresholds, percentages, volume, prior ranges, crossings, SMA reuse, compound unknown propagation, missing volume, invalid candles, developing-bar rejection, and future-bar isolation.
- Not tested: worker scheduling, snapshot aggregation, incremental subscriptions, browser Studio workflows, external providers, Firefox, WebKit, mobile Safari, physical devices, accessibility, and visual compatibility.


