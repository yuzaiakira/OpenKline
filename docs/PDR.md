# Product Requirements Baseline

This repository implements the first vertical slice of the supplied Open Financial
Chart Engine PDR. The full draft remains a product-level reference; this file
records the scope that is actually committed and verified.

## Product boundary

OpenKline is a framework-independent TypeScript financial chart engine. It does
not provide brokerage execution, market data, credentials, telemetry, or a
TradingView-compatible scripting runtime.

## Current milestone: Phase 1 foundation

The first milestone includes:

- validated, ordered OHLCV candle data;
- incremental candle replacement and insertion;
- time and price coordinate scales;
- a viewport model with pan and zoom;
- a Canvas2D candlestick renderer with themes and HiDPI sizing;
- a browser-neutral `createChart` API with resize, update, and lifecycle cleanup;
- a typed historical/realtime datafeed contract with a deterministic in-memory
  provider;
- an optional React adapter and a verified Next.js App Router example;
- a vanilla browser example and executable unit tests.

Browser interaction tests and model benchmarks are also part of the current
verification surface; their scope and limitations are documented in
`docs/development/testing.md` and `docs/development/benchmarks.md`.

The core calculation and data model do not depend on React, Next.js, or a
browser. The Canvas2D adapter is the only browser-facing layer in this slice.

## Acceptance criteria for this slice

1. Invalid timestamps, OHLC relationships, volume, and ordering are rejected.
2. A candle update replaces an existing timestamp and inserts a historical bar
   while preserving chronological order.
3. Coordinate transforms round-trip between data and pixel space.
4. Pan and zoom change the visible data range without changing the source data.
5. The chart owns and releases its canvas, event handlers, and resize observer.
6. `npm run typecheck` and `npm test` pass locally.

## Deferred requirements

Indicators, drawing tools, plugin SDK, datafeed adapters, React/Next.js bindings,
ChartScript, accessibility UI, visual regression, and performance benchmarks are
planned but are not represented as completed functionality.
