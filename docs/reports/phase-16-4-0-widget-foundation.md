# OpenKline Phase 16.4.0 — Widget Foundation Verification

## Disposition

The owner-authorized Phase 16.4.0 internal engineering scope is implemented and
locally verified. Public Widget API adoption and release readiness remain open.
This report does not claim completion of the broader Phase 16.4 roadmap.

| Item | Value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Starting SHA | `88b5bdb004d84678243a1a60fa042da39a9dd8a4` |
| Implementation commit | `91db2f977b77eca525098dac8f3f4b7e75a268df` |
| Architecture documentation commit | `ff836e6fbacbb88e3a819a127da9fad89232849b` |
| Report finalization | Recorded in the follow-up documentation commit |
| Branch | `main` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Package/release state | No npm publication, tag, release, or license change |

Both completed commits were pushed directly to `origin/main` immediately after
commit. No history was rewritten and no GitHub Actions workflow was added.

## Authorized boundary

The implementation follows the explicit owner authorization for Phase 16.4.0:
a browser-side, framework-independent, internal Widget controller over the
existing OpenKline Core. It does not implement a backend, hosted service,
accounts, authentication, billing, broker execution, mandatory data provider,
public Widget exports, protected API-baseline changes, or later Phase 16.4
increments.

The reviewed design is preserved at
`docs/reviews/phase-16-4-architecture-design.md`. The implementation
reconciliation and layer boundary are also recorded in
`docs/architecture/widget-foundation.md`.

## Implemented components

### Internal Widget controller

`src/widget/controller.ts` and `src/widget/types.ts` provide an internal
`createOpenKlineWidget()` controller with:

- deterministic widget-owned Chart construction and idempotent destruction;
- a responsive DOM shell with one core Chart canvas;
- header toolbar controls for symbol, timeframe, chart presentation,
  indicators, drawings, theme, direction, and workspace actions;
- candlestick, OHLC, hollow-candlestick, Heikin-Ashi, line, area, and baseline
  presentation selection;
- feature visibility configuration and host-provided labels;
- native keyboard-operable buttons, inputs, and selects, focus-visible styles,
  toolbar semantics, `aria-label`, `aria-pressed`, status live region, empty
  state, and error alert state;
- host-supplied local candle data without network activity;
- provider-neutral Datafeed injection with request generations, AbortSignals,
  stale-result isolation, loading/error/empty state, and symbol/timeframe
  changes;
- optional asynchronous injected workspace storage with cancellation and no
  implicit browser persistence;
- existing workspace validation and restoration, including symbol/timeframe
  metadata when present;
- trusted host plugin installation and typed Widget/chart event forwarding;
- diagnostics for destruction, DOM/chart subscriptions, pending requests, and
  Widget-owned canvas count.

### Core reuse

The Widget does not duplicate financial calculations, scales, viewport logic,
crosshair handling, tooltip values, indicators, drawings, or Canvas2D
rendering. It creates the existing `Chart`, uses public series APIs for
alternative presentations, delegates workspace parsing/restoration to the
existing workspace contract, and passes provider work through the existing
`Datafeed` contract. The raw `widget-price` series remains the canonical source;
the optional `widget-presentation` series is only a view selection.

### Package boundary

`src/widget/index.ts` is deliberately not re-exported from `src/index.ts`.
`package.json` still exposes only the existing root `"."` export. The build
includes the internal implementation for local verification, but no Widget
package subpath or public API adoption was added.

## Proposed API contract — not public

The current internal shape is the basis for a separate owner review, not a
public compatibility promise:

```ts
createOpenKlineWidget(options: WidgetOptions): InternalWidget

interface WidgetOptions {
  container: HTMLElement;
  chartOptions?: ChartOptions;
  chartType?: WidgetChartType;
  data?: readonly Candle[];
  datafeed?: Datafeed;
  datafeedQuery?: Omit<GetBarsQuery, "signal">;
  storage?: WidgetStorage;
  storageKey?: string;
  features?: Partial<WidgetFeatureVisibility>;
  labels?: Partial<WidgetLabels>;
  plugins?: readonly OpenKlinePlugin[];
}
```

The internal controller exposes chart access, defensive state/diagnostics,
local data and datafeed replacement, symbol/timeframe/chart-type/theme/RTL
controls, indicator/drawing entry points, workspace import/export and storage,
trusted plugin installation, event subscription, and `destroy()`.

Compared with the larger design sketch, host-owned Chart mode, initial-workspace
construction, locale catalogs, explicit signal options on all imperative
methods, object-tree/pane/layout/watchlist/comparison/replay panels, and public
package exports are intentionally deferred. No separate public API approval is
implied by the internal TypeScript declarations.

## Verification results

All results below are from this cloud environment and are not claims about
physical devices or unsupported browser engines.

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 387 Node tests |
| `npx playwright test tests/browser/widget.spec.ts --project=chromium` | PASS — 2/2 |
| `npx playwright test tests/browser/widget.spec.ts --project=mobile-chrome` | PASS — 2/2 emulated |
| `npm run test:browser` | PASS — 37/37 Chromium tests |
| `npm run test:react:browser` | PASS — 38/38 Chromium React/Studio tests |
| `npm run test:react:production` | PASS — 1/1 Next.js production test |
| `npm run package:smoke` | PASS |
| `npm run package:check` | PASS — local dry-run only |
| `npm run distribution:check` | PASS — 562 files, no problems |
| `npm run studio:check` | PASS — core has no React/Next runtime dependency |
| `npm run api:inventory` | PASS — 319 runtime and 736 type exports inventoried |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED |
| `npm run stress:ci` | PASS — zero orphan failures, zero Worker orphans, zero remaining canvases |
| `npm run api:check` | FAIL — inherited open baseline gate; no removals, three changed hashes |

The two focused Widget browser tests cover offline construction, responsive
layout, controls, keyboard focus paths, theme, RTL, presentation switching,
indicator/drawing entry points, storage round-trip, stale Datafeed cancellation,
multiple independent instances, and cleanup. The Node test also checks that the
Widget source has no React or Next.js runtime import.

## API gate status

`api:check` remains intentionally open. The checker reports no removals, but
the historical baseline still differs for:

- `openkline:runtime:Chart`
- `openkline:type:WorkspaceDocument`
- `openkline:type:WorkspaceRestoreOptions`

These are inherited additive changes and were not caused by adding a Widget
root export. The Phase 16.4.0 work does not approve or rewrite that protected
baseline.

## Browser and accessibility boundary

The verified browser runs used the configured system Chromium
(`/usr/bin/chromium`), reporting HeadlessChrome `154.0.0.0`. Mobile Chrome
means Playwright viewport/device emulation on that Chromium binary; it is not a
physical Android device result.

One compatibility attempt confirmed that Playwright-managed Firefox and WebKit
are unavailable in this environment:

```text
Firefox: /home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox missing
WebKit:  /home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh missing
```

Consequently Firefox, WebKit, Mobile Safari, physical-device behavior, and
universal cross-browser compatibility remain untested/blocked. The Widget has
semantic controls, visible focus, labels, live status/error regions, RTL DOM
direction, and touch-sized responsive controls, but no formal WCAG, screen
reader, assistive-technology, or contrast acceptance claim is made for this
new Widget.

## Performance and memory evidence

The existing Canvas2D benchmark was rerun to ensure the new controller did not
alter the optimized core path. It used system HeadlessChrome 154 and the
existing 1k/10k/100k workload:

| Candles | RAF FPS | Frame median / p95 | Load |
| ---: | ---: | ---: | ---: |
| 1,000 | 63.87 | 16.7 / 16.8 ms | 23.6 ms |
| 10,000 | 62.05 | 16.7 / 16.9 ms | 110.7 ms |
| 100,000 | 61.86 | 16.6 / 16.9 ms | 1,682.7 ms |

The same run observed 572,523,211 bytes before destroying the 100k chart and
4,041,008 bytes after destruction, with zero remaining canvases. These are
environment/workload measurements, not universal performance guarantees.

The existing multi-chart benchmark also remained healthy: dual 10k visible
range 16.7 ms median / 18.3 ms p95, pan 16.4 / 18.7 ms, and dual 100k visible
range 34.4 / 85.4 ms, pan 35.6 / 75.9 ms, and realtime-during-navigation
38.6 / 162.9 ms. Its owned-canvas count was zero after cleanup. No Widget-
specific 100k budget is claimed; a dedicated Widget budget belongs to a later
approved increment.

`stress:ci` additionally reported Node realtime median/p95 latency of
0.1727/13.7225 ms and browser interaction median/p95 of 29.5/69.6 ms. These
stress metrics include existing core workloads and are not presented as Widget
latency targets.

## Resource and lifecycle evidence

The Widget owns one Chart and one canvas per instance. The focused Chromium
tests observed one Widget canvas before destruction and zero Widget canvases
after destruction. Diagnostics reached zero DOM listeners and zero Chart
subscriptions, with no pending data request. Datafeed and storage abort
controllers are invalidated on replacement and destruction. The Widget creates
no Worker, timer, broker connection, or mandatory network service.

The existing stress suite independently reported `workerOrphans: 0`,
`orphanFailures: 0`, and `remainingCanvasCount: 0`. Multiple Widget instances
were created and destroyed independently; one instance's cancellation and
storage state did not affect the other.

## Remaining work and open gates

- Separate owner review is required before any root export, package subpath,
  `@openkline/widget` package, or public API compatibility promise.
- Host-owned Chart lifecycle mode and a richer workspace initialization contract
  are not implemented in this bounded increment.
- Professional multi-panel UI (object tree, panes/layouts, watchlists,
  comparison, replay, settings dialogs, locale catalogs, and richer command
  routing) remains later work.
- React/Next.js Widget adapters are not implemented; existing React/Next
  consumer checks only verify that the core remains compatible.
- Firefox, WebKit, Mobile Safari, physical-device, formal accessibility, legal,
  release, and protected API-baseline gates remain open.

## Final status

**Internal Phase 16.4.0 engineering:** complete within the authorized
foundation boundary and verified by the commands above.

**Public Widget release readiness:** not ready and not authorized. No public
Widget exports, npm publication, tag, release, license adoption, or later
Phase 16.4 work was performed.
