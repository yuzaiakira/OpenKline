# Testing

The project uses local checks and does not use GitHub Actions.

For a manual browser preview, run `npm run dev` and open the vanilla example at
`http://127.0.0.1:4173/examples/vanilla/index.html`.

```bash
npm run typecheck
npm test
npm run test:browser
npm run test:browser:compat
npm run benchmark
npm run benchmark:browser
npm run profile:browser
npm run package:check
npm run package:smoke
```

The default `npm run test:browser` runs the Chromium project. The compatibility
matrix is exposed as `npm run test:browser:compat` and runs Firefox, WebKit,
mobile Chrome emulation, and mobile Safari emulation. Missing Playwright
binaries are an explicit blocked result, not a skipped or passing test.

The unit suite runs against the framework-independent data, scale, viewport,
series, and datafeed modules, including pagination, cancellation, reconnect,
invalid data, correction, and disposal. The React test verifies server-safe
import and SSR output. The Playwright suite serves the vanilla example with a
small local Node server and asserts
all four series types, multi-series crosshair values, dynamic add/remove,
canvas creation, non-empty rendering, zoom, pan, theme changes, updates, and
cleanup. Mobile projects additionally exercise a touch tap that creates a
drawing. It is intentionally interaction-focused rather than screenshot-only.

`npm run benchmark:browser` measures synchronous Canvas2D rendering work and
requestAnimationFrame update loops for 1,000, 10,000, and 100,000 candles. It
also records median/p95 navigation, crosshair event-path, frame interval and
frame-work samples, engine-specific heap observations, and confirms that chart
destruction removes the canvas. `npm run profile:browser` instruments the
100,000-candle append path to identify renderer, series, indicator, and shared
time-cache costs. `npm run package:smoke` installs the packed
core tarball into a clean temporary consumer and imports its public ESM entry.

If Chromium is unavailable, set `executablePath` in `playwright.config.ts` to a
maintained browser installation. A browser test that times out is a failed or
blocked test, never a pass.
