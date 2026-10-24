# Roadmap

## Current milestone

Phase 1 — Chart MVP foundation: **In Progress**

## Completed

- [Implemented] Created a strict TypeScript project with local-only scripts.
- [Implemented] Added validated OHLCV storage with incremental updates.
- [Implemented] Added time/price scales and a pan/zoom viewport model.
- [Implemented] Added a Canvas2D candlestick renderer and vanilla example.
- [Implemented] Added unit tests for data validation, scales, and viewport behavior.
- [Verified] Type checking and unit tests pass locally.

## In progress

- [In Progress] Expand the chart MVP with a formal datafeed contract and richer
  interaction/accessibility tests.

## Pending

- [Not Started] Volume and line/area series.
- [Not Started] Historical/streaming datafeed adapters.
- [Not Started] React and Next.js adapters.
- [Not Started] Drawing tools and workspace serialization.
- [Not Started] Indicator engine.
- [Not Started] Plugin SDK.
- [Not Started] ChartScript parser/runtime.
- [Not Started] Browser, visual, and performance test suites.

## Known blockers

- The configured GitHub repository currently has no visible refs and the
  checkout is unborn, so remote synchronization cannot yet be verified.

## Architectural follow-up

- Finalize the public package name and license before the first public release.
- Add a formal datafeed contract before connecting any external provider.
- Establish browser reference hardware before setting FPS targets.
