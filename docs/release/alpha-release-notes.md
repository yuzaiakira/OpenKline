# OpenKline `0.1.0-alpha.1` — proposed developer-preview notes

Status: **Prepared for owner review only. Not published, not production
certified, and not yet an open-source distribution.** Publication requires the
separate written approvals in [`owner-approval.md`](./owner-approval.md).

## Who this preview is for

This proposed alpha is for maintainers and integrators evaluating the public
ESM APIs for a Canvas2D financial-chart engine. It is not financial advice,
brokerage software, a market-data service, or a production compatibility
commitment. The `0.x` API may change before a stable release.

## Installation

Before an authorized publication, install only a reviewed local candidate
archive and retain its manifest/checksums:

```bash
npm install ./openkline-0.1.0-alpha.1.tgz \
  ./openkline-react-0.1.0-alpha.1.tgz react react-dom
```

The candidate has **not** been published to npm. A registry installation
command must not be advertised or run until the owner approves the exact
registry, package names, version, access level, license, notices, and release
action.

## Quick start

```ts
import { createChart } from "openkline";

const chart = createChart(document.querySelector("#chart")!, {
  autoSize: true,
  theme: "dark",
  timeZone: "UTC",
  pricePrecision: 2,
});

chart.setData([
  { time: 1_700_000_000_000, open: 100, high: 103, low: 99, close: 102, volume: 10 },
]);
chart.addLineSeries({ id: "trend", style: { color: "#f59e0b" } });
chart.destroy();
```

The root public entry is `openkline`; it exports `createChart`, `Chart`, typed
datafeed contracts/reference adapters, indicator and drawing APIs, trusted
plugin types/registry, workspace APIs, and the public KlineScript compiler.
`@openkline/react` exports `FinancialChart` and its typed props. Exact APIs and
lifecycle requirements are documented in [`../api/chart.md`](../api/chart.md),
[`../api/datafeed.md`](../api/datafeed.md), and the linked API guides.

## Available features

- Candlestick, line, area, and volume/histogram series sharing a viewport,
  crosshair, tooltip data, price scales, styles, lifecycle, pan, zoom, resize,
  and Canvas2D cleanup.
- Vendor-neutral historical/realtime contracts; deterministic in-memory,
  paginated REST, and reconnecting WebSocket reference adapters. No vendor
  credentials or hosted feed are supplied.
- Built-in SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic, and VWAP,
  custom TypeScript indicator registration, independent panes, and filled
  Bollinger bands.
- Drawing lifecycle and serialization for horizontal/vertical lines, trend
  lines, rectangles, Fibonacci retracements, anchored text, selection, undo,
  redo, and custom drawing tools.
- Trusted in-process Plugin SDK for typed lifecycle, commands, state,
  indicators, drawings, controlled overlays, and workspace persistence.
- KlineScript v0.1 compiler, diagnostics, typed/restricted indicator runtime,
  resource budgets, cancellation, chart integration, and workspace source
  references.
- React binding and an independently built Next.js App Router consumer.

## Supported environments and known browser limits

See the evidence-qualified
[alpha support matrix](./alpha-support-matrix.md). In short, archive consumers
for Vanilla ESM, TypeScript, React SSR, and an independent Next.js build passed
locally. Desktop Chromium and Pixel 7 Mobile Chrome emulation passed only with
the explicitly configured system Chromium on this host. Firefox, WebKit, and
Mobile Safari remain blocked because the required Playwright-managed binaries
are absent. Browser emulation is not a physical-device claim.

## Security and extension boundaries

KlineScript does not use `eval` or `new Function`. It is nevertheless a
synchronous in-process interpreter, not an OS-level sandbox with independent
wall-clock or heap enforcement. Hosts executing untrusted input need an
appropriate Worker/process isolation and termination strategy. Plugins are
trusted in-process JavaScript/TypeScript modules; there is no remote plugin
loader, signature system, or marketplace. Read [SECURITY.md](../../SECURITY.md)
before reporting a security issue.

## Compatibility and migration

There is no previous public OpenKline release to migrate from. Pin the exact
alpha version, retain a copy of the candidate manifest, and test upgrades in
your application's supported browsers. Public APIs may evolve before `1.0`; a
future incompatible published change must be documented in release notes.

## Troubleshooting and feedback

- Confirm that your runtime consumes the ESM `import` export and TypeScript
  declaration path; CommonJS is not supported.
- Destroy each chart on application teardown and dispose plugin/indicator
  handles when managed outside the chart.
- Validate OHLCV inputs as UTC integer milliseconds with finite values and
  valid high/low relationships; see the chart/datafeed API docs.
- For browser failures, include the browser executable path, browser version,
  Playwright version, OS, launch configuration, minimal data, and the relevant
  artifact hashes. Do not describe local system Chromium evidence as managed
  Firefox/WebKit coverage.
- Report ordinary reproducible defects through the project's configured issue
  channel. Follow `SECURITY.md` rather than public disclosure for potential
  vulnerabilities; do not include credentials or private market data.
