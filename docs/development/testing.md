# Testing

The project uses local checks and does not use GitHub Actions.

```bash
npm run typecheck
npm test
npm run test:browser
npm run benchmark
npm run benchmark:browser
npm run package:check
npm run package:smoke
```

The unit suite runs against the framework-independent data, scale, viewport,
series, and datafeed modules, including pagination, cancellation, reconnect,
invalid data, correction, and disposal. The React test verifies server-safe
import and SSR output. The Playwright suite serves the vanilla example with a
small local Node server and launches the installed system Chromium. It asserts
all four series types, multi-series crosshair values, dynamic add/remove,
canvas creation, non-empty rendering, zoom, pan, theme changes, updates, and
cleanup. It is intentionally interaction-focused rather than screenshot-only.

`npm run benchmark:browser` measures synchronous Canvas2D rendering work and
requestAnimationFrame update loops for 1,000, 10,000, and 100,000 candles. It
also records engine-specific heap observations and confirms that chart
destruction removes the canvas. `npm run package:smoke` installs the packed
core tarball into a clean temporary consumer and imports its public ESM entry.

If Chromium is unavailable, set `executablePath` in `playwright.config.ts` to a
maintained browser installation. A browser test that times out is a failed or
blocked test, never a pass.
