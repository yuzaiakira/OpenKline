# Portable browser verification

This workflow is for a trusted machine that can acquire the official
Playwright-managed browsers for the repository's pinned Playwright version. It
does not use GitHub Actions, a proprietary cloud service, system Firefox, or
system Safari/WebKit substitutes.

## Requirements

- Node.js 20 or newer; record `node --version` and `npm --version`.
- `@playwright/test` 1.64.1 from the tracked lockfile.
- A clean checkout with `npm ci --ignore-scripts --no-audit --no-fund`.
- Operating-system dependencies supported by Playwright. On a trusted supported
  Linux host, use the official command below; it may require administrator
  privileges to install OS packages.

```bash
npx playwright install --with-deps chromium firefox webkit
```

Do not disable TLS verification, copy an arbitrary executable into the
Playwright cache, or pass a system Firefox/Safari path. The separate portable
config deliberately contains no host-specific executable path.

## Execute and collect evidence

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run browser:verify
```

For a focused retry, preserving a new report directory:

```bash
npm run build
node scripts/browser-verification.mjs \
  --projects=firefox,webkit,mobile-safari \
  --output=artifacts/browser-verification/trusted-machine-YYYYMMDD
```

The runner uses `playwright.portable.config.ts`, runs Chromium, Firefox,
WebKit, Pixel 7 Mobile Chrome emulation, and iPhone 13 Mobile Safari emulation
against the same behavioral suite. It records the commit, Node/npm/Playwright
versions, platform, requested projects, expected managed executable locations,
command, JSON result, stderr, and Playwright test artifacts.

Copy the generated report directory (not browser executables) back to the
development environment. Preserve these files together:

- `environment.json`
- `summary.json`
- `playwright-results.json`
- `playwright-stderr.log`
- `test-results/`

Mark a missing managed executable as **Blocked**, a failing test with a
launched managed browser as **Failed**, and a passing project as **Verified**.
Mobile projects are browser emulation; they are not physical-device testing.

## Behavior covered

The existing browser suite asserts chart initialization, candlestick/line/area/
volume rendering, multi-pane indicators and oscillators, filled Bollinger
Bands, pan/zoom, crosshair values, drawings and hit interaction, resize,
plugins/custom indicators/custom drawing/controlled overlay lifecycle,
KlineScript execution, workspace restore, touch drawing in mobile projects,
and canvas/resource cleanup.

The current cloud machine has no official managed browser executables. Its
report is intentionally blocked; use it only as reproducible diagnostics, not
as a passing compatibility claim.
