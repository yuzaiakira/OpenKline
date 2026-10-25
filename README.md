# OpenKline

OpenKline is a framework-independent TypeScript financial chart engine. It is
being built incrementally from a tested TypeScript core toward Canvas2D
rendering, datafeed adapters, indicators, drawings, plugins, and framework
integrations. The repository is not yet a stable release and currently has no
declared software license; do not redistribute it as a licensed package until
the project owner adds the appropriate `LICENSE` and package metadata.

## Current status

The repository currently contains the Phase 1 chart foundation and the
implemented Phase 2 analysis foundation:

- strict TypeScript data and viewport model;
- validated OHLCV candles with incremental updates;
- shared Canvas2D candlestick, line, area, and volume series with resize, pan,
  zoom, crosshair/tooltip events, configurable styles, and dynamic lifecycle;
- framework-independent historical/realtime `Datafeed` contracts with
  deterministic in-memory, paginated REST, and reconnecting WebSocket
  reference adapters;
- optional React bindings and a private Next.js App Router Studio example;
- typed technical indicators, synchronized analysis panes, and browser-neutral
  drawing tools with serialization and undo/redo;
- trusted in-process extension contracts for custom indicators and drawing
  tools;
- a v0.1 KlineScript compiler, semantic checker, restricted synchronous
  interpreter, technical/math intrinsics, resource budgets, cancellation,
  Indicator Engine integration, workspace source references, and examples;
- vanilla browser example with all supported series;
- local unit, browser, Canvas2D benchmark, package-install, and integration
  verification scripts.

See [docs/ROADMAP.md](docs/ROADMAP.md) for the verified and deferred scope,
[docs/reports/phase-5-readiness.md](docs/reports/phase-5-readiness.md) for the
production-readiness audit, and
[docs/reports/phase-5-release-readiness.md](docs/reports/phase-5-release-readiness.md)
for the Phase 5.1 release gate, license, package, and browser evidence. The
[Phase 5.2 verification](docs/reports/phase-5-2-verification.md) records the
portable browser workflow and local preview-candidate evidence. The
[Phase 5.3 verification](docs/reports/phase-5-3-verification.md) and
[owner approval package](docs/release/owner-approval.md) record the proposed
developer-preview decision without authorizing publication. The
[license inventory](docs/audits/license-inventory.md) and
[developer-preview plan](docs/release/developer-preview-plan.md) describe the
current distribution boundary; the proposed license is not effective. The
[docs/reports/phase-2-verification.md](docs/reports/phase-2-verification.md)
for the baseline acceptance record. The current hardening gate is recorded in
[docs/reports/phase-2-final-verification.md](docs/reports/phase-2-final-verification.md).
The performance and browser compatibility evidence is recorded in
[docs/reports/phase-2-performance-and-compatibility.md](docs/reports/phase-2-performance-and-compatibility.md).
Phase 6 local implementation and open acceptance gates are recorded in
[docs/reports/phase-6-final-verification.md](docs/reports/phase-6-final-verification.md).
See [docs/api/chart.md](docs/api/chart.md) and
[docs/api/datafeed.md](docs/api/datafeed.md) for the public APIs.

## Quick start

```bash
npm ci
npm test
npm run test:browser
npm run benchmark:browser
npm run package:smoke
# Run the full local release gate, including available compatibility projects.
npm run release:check
```

The public entry point is `createChart(container, options)`. The core model is
framework-independent. React, Next.js, and datafeed usage is documented in
[docs/guides/react.md](docs/guides/react.md) and
[docs/guides/nextjs.md](docs/guides/nextjs.md), and
[docs/api/datafeed.md](docs/api/datafeed.md). The private local Studio is
documented in [docs/guides/studio.md](docs/guides/studio.md).

KlineScript usage, diagnostics, limits, and examples are documented in
[docs/api/klinescript.md](docs/api/klinescript.md),
[docs/klinescript/language-spec.md](docs/klinescript/language-spec.md), and
[docs/klinescript/examples.md](docs/klinescript/examples.md). The compiler
does not use `eval` or `new Function`; its runtime is restricted but
synchronous, so it is not an OS-level sandbox. Hosts handling untrusted users
must provide an appropriate process or Worker termination boundary.

## Development and release readiness

- [CONTRIBUTING.md](CONTRIBUTING.md) describes the local contribution flow.
- [SECURITY.md](SECURITY.md) describes the security boundary and reporting
  expectations.
- [CHANGELOG.md](CHANGELOG.md) records unreleased changes.
- `npm run release:check` is the reproducible local release verification
  command. It does not publish packages or use GitHub Actions.
- `node scripts/validate-license-inventory.mjs` validates lockfile provenance
  against the reviewed inventory, and
  `node scripts/consumer-preview-smoke.mjs` verifies installed Vanilla ESM and
  TypeScript React consumers.
- `npm run preview:prepare` produces ignored local review tarballs, and
  `npm run browser:verify` produces a portable official-Playwright browser
  report. `npm run browser:diagnostic` records the local system-Chromium test
  provenance separately. None of these commands publishes a package.
- Firefox, WebKit, and Mobile Safari remain open compatibility gates when the
  official Playwright-managed binaries are unavailable; see the Phase 2 and
  Phase 4 reports.

## Project rules

- GitHub Actions are not used.
- Do not add proprietary charting code, branding, or market data.
- Do not claim planned features as implemented.
