# Testing

The project uses local checks and does not use GitHub Actions.

```bash
npm run typecheck
npm test
npm run test:browser
npm run benchmark
npm run package:check
```

The unit suite runs against the framework-independent data, scale, viewport,
and datafeed modules. The Playwright suite serves the vanilla example with a
small local Node server and launches the installed system Chromium. It asserts
canvas creation, non-empty rendering, crosshair events, zoom, pan, theme
changes, updates, and cleanup. It is intentionally interaction-focused rather
than screenshot-only.

If Chromium is unavailable, set `executablePath` in `playwright.config.ts` to a
maintained browser installation. A browser test that times out is a failed or
blocked test, never a pass.
