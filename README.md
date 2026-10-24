# OpenKline

OpenKline is an open-source, framework-independent financial chart engine. It
is being built incrementally from a tested TypeScript core toward Canvas2D
rendering, datafeed adapters, indicators, drawings, plugins, and framework
integrations.

## Current status

The repository currently contains the first chart MVP foundation:

- strict TypeScript data and viewport model;
- validated OHLCV candles with incremental updates;
- Canvas2D candlestick chart with resize, pan, zoom, crosshair events, and
  light/dark themes;
- vanilla browser example;
- local build, typecheck, and unit-test scripts.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the verified and deferred scope.

## Quick start

```bash
npm install
npm test
```

The public entry point is `createChart(container, options)`. The core model is
framework-independent; React and Next.js adapters are planned work.

## Project rules

- GitHub Actions are not used.
- Do not add proprietary charting code, branding, or market data.
- Do not claim planned features as implemented.
