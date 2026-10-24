# OpenKline

OpenKline is an open-source, framework-independent financial chart engine. It
is being built incrementally from a tested TypeScript core toward Canvas2D
rendering, datafeed adapters, indicators, drawings, plugins, and framework
integrations.

## Current status

The repository currently contains the finalized Phase 1 chart foundation:

- strict TypeScript data and viewport model;
- validated OHLCV candles with incremental updates;
- shared Canvas2D candlestick, line, area, and volume series with resize, pan,
  zoom, crosshair/tooltip events, configurable styles, and dynamic lifecycle;
- framework-independent historical/realtime `Datafeed` contracts with
  deterministic in-memory, paginated REST, and reconnecting WebSocket
  reference adapters;
- optional React bindings and a Next.js App Router example;
- vanilla browser example with all supported series;
- local unit, browser, Canvas2D benchmark, package-install, and integration
  verification scripts.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the verified and deferred scope.
See [docs/api/chart.md](docs/api/chart.md) and
[docs/api/datafeed.md](docs/api/datafeed.md) for the public APIs.

## Quick start

```bash
npm ci
npm test
npm run test:browser
npm run benchmark:browser
npm run package:smoke
```

The public entry point is `createChart(container, options)`. The core model is
framework-independent. React, Next.js, and datafeed usage is documented in
[docs/guides/react.md](docs/guides/react.md) and
[docs/guides/nextjs.md](docs/guides/nextjs.md), and
[docs/api/datafeed.md](docs/api/datafeed.md).

## Project rules

- GitHub Actions are not used.
- Do not add proprietary charting code, branding, or market data.
- Do not claim planned features as implemented.
