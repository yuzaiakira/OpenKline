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
- framework-independent historical/realtime `Datafeed` contracts with an
  in-memory provider;
- optional React bindings and a Next.js App Router example;
- vanilla browser example;
- local unit, browser, benchmark, and package verification scripts.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the verified and deferred scope.
See [docs/api/chart.md](docs/api/chart.md) for the public API.

## Quick start

```bash
npm ci
npm test
```

The public entry point is `createChart(container, options)`. The core model is
framework-independent. React and Next.js usage is documented in
[docs/guides/react.md](docs/guides/react.md) and
[docs/guides/nextjs.md](docs/guides/nextjs.md).

## Project rules

- GitHub Actions are not used.
- Do not add proprietary charting code, branding, or market data.
- Do not claim planned features as implemented.
