# Portable browser verification

This workflow is for a trusted machine that can acquire the official
Playwright-managed browsers for the repository's pinned Playwright version. It
does not use GitHub Actions, a proprietary cloud service, system Firefox, or
system Safari/WebKit substitutes.

The current cloud host also has a separate **local diagnostic** workflow. It
exists to make the provenance of the configured `/usr/bin/chromium` explicit;
it is not a substitute for this managed-browser workflow and cannot clear the
formal cross-browser gate.

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
versions, operating system, requested projects, expected managed executable
locations, managed-browser version and actual user agent when launch succeeds,
launch configuration, command, JSON result, stderr, and Playwright test
artifacts. The final `summary.json` includes SHA-256 and byte size for each
evidence artifact other than itself.

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

## Local Chromium diagnostic evidence

On this cloud host the checked-in `playwright.config.ts` deliberately sets
`/usr/bin/chromium` for the `chromium` and `mobile-chrome` projects. Run the
following only to record that local diagnostic evidence:

```bash
npm run browser:diagnostic
```

It writes the same JSON/stderr/test-artifact structure below
`artifacts/browser-diagnostic/`, plus the configured and resolved executable
paths, `chromium --version`, Playwright browser version, actual desktop and
Pixel 7-emulation user agents, exact launch flags, OS metadata, result totals,
and SHA-256 artifact hashes. Its status is `verified-local-diagnostic`, never
`verified` for the managed-browser policy. It does not run Firefox, WebKit, or
Mobile Safari and must not be used to claim those projects.

## GitHub evidence handoff

The current trusted-machine result for source commit
`19c86987453e2f5ae5572c4028ba9cb2e1f2f4aa` is preserved as a compact,
sanitized GitHub evidence pack at
[`docs/evidence/browser/phase-8-6-1/`](../evidence/browser/phase-8-6-1/),
from evidence branch commit
`ac408424f8c1880615fea6b0994dc3b7abbddb0a`. The cloud validator is
`npm run evidence:browser:check`; it confirms the exact source SHA, Playwright
1.64.1, official image digest, five managed projects, 70 unique passing
records, per-project 14/14 totals, archive hash format, and sanitization.

The complete trusted-machine archive remains outside GitHub. Its recorded
SHA-256 is provenance from the trusted host and is not recomputed in the cloud:

```text
openkline-phase-8-6-1-matrix-20261026T153655Z.tar.gz
73bc6e2b12db91c87a85c1e82bcaf35395ba8291a1d2b39629f7ebf69d77fe3c
```

This evidence confirms automated managed-browser emulation for the tested
source revision. It does not claim that the cloud executed those browsers,
does not verify native pinch or physical devices, and does not close
accessibility, visual-baseline, legal, or release-authorization gates.

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

The historical trusted Manjaro run used the official pinned container
`mcr.microsoft.com/playwright:v1.64.1-noble`
(`sha256:47b510dd9230bf0b9bfc9b20102241e577ea7a99334ab4c3ca19f19770e9b8ea`)
ran the historical matrix for commit
`4d689c86f619f32e4d91f90c4e3b03576ea38d6c` with all five projects passing
(65/65). The current 70/70 result is the Phase 8.6.1 evidence pack described
above. Both are automated emulation only—not native iOS or physical-device
verification. See
[`browser-compatibility-matrix.md`](./browser-compatibility-matrix.md).
