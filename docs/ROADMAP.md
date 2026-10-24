# Roadmap

## Current milestone

Phase 1 — Chart MVP foundation: **In Progress**

## Completed

- [Implemented] Created a strict TypeScript project with local-only scripts.
- [Implemented] Added validated OHLCV storage with incremental updates.
- [Implemented] Added time/price scales and a pan/zoom viewport model.
- [Implemented] Added a Canvas2D candlestick renderer and vanilla example.
- [Implemented] Added historical/realtime datafeed contracts and an in-memory provider.
- [Implemented] Added a thin React adapter and a Next.js App Router example.
- [Implemented] Added unit, Playwright browser, benchmark, and package checks.
- [Verified] Type checking, 8 unit tests, browser interaction, Next.js production build,
  and package dry-run pass locally.

## In progress

- [In Progress] Expand the chart MVP with additional series, volume panes, and
  accessibility coverage.

## Pending

- [Not Started] Volume and line/area series.
- [Not Started] REST/WebSocket datafeed adapters and session normalization.
- [Not Started] Drawing tools and workspace serialization.
- [Not Started] Indicator engine.
- [Not Started] Plugin SDK.
- [Not Started] ChartScript parser/runtime.
- [Not Started] Canvas frame-time, memory, visual regression, and accessibility
  performance suites.

## Known blockers

- Browser interaction verification passes with Playwright, but there is not yet
  a deterministic Canvas2D FPS/memory benchmark.
- The environment draft must be published separately from the saved setup.

## Architectural follow-up

- Finalize the public package name and license before the first public release.
- Add a formal datafeed contract before connecting any external provider.
- Establish browser reference hardware before setting FPS targets.
