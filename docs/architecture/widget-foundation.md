# Internal Widget Foundation Architecture

Status: Phase 16.4.0 internal implementation complete; public Widget API and
package publication remain unapproved.

## Boundary

`src/widget/` is a browser-side, framework-independent controller over the
existing public `Chart` handle. It is intentionally absent from
`src/index.ts` and from the package export map. The root library remains the
single financial renderer and calculation owner:

```text
Host DOM container
  -> InternalWidgetController (controls, state, storage/datafeed orchestration)
  -> Chart (series, panes, scales, crosshair, indicators, drawings, workspace)
  -> Canvas2D renderer and financial engines
```

The Widget does not import React, Next.js, Studio application code, provider
credentials, or a backend. It never reaches into `ChartModel`, renderer
internals, stores, or indicator/drawing engines.

## Lifecycle ownership

Phase 16.4.0 implements widget-owned Chart construction. Construction creates
one responsive DOM shell and one Chart canvas, then attaches only public chart
subscriptions. `destroy()` is idempotent and performs the following in order:

1. invalidate and abort pending datafeed and storage requests;
2. remove DOM and Chart subscriptions;
3. dispose trusted plugin handles installed through the Widget;
4. destroy the owned Chart and remove the Widget root; and
5. clear observable listener and data-state references.

Stale datafeed generations are ignored after cancellation, and storage adapters
receive the same abort signal. Host storage is never created implicitly.

## State and controls

`WidgetSnapshot` is the defensive UI state boundary. The shell exposes native
buttons, selects, and inputs for symbol, timeframe, chart presentation,
indicator/drawing entry points, theme, direction, and workspace actions. Feature
visibility is configured at construction time. Status, loading, empty, and error
regions use semantic live-region/alert roles.

Alternative presentations reuse the Chart's existing series APIs. The Widget
keeps the canonical `widget-price` candlestick source and creates one
`widget-presentation` series only for a selected alternative. It does not
duplicate viewport, price scale, crosshair, tooltip, or financial calculations.

Workspace values are validated by the existing `parseWorkspace` contract before
restoration. Symbol/timeframe metadata is restored when present. Plugins remain
trusted host-supplied objects; workspace JSON cannot execute code.

## Data and persistence

The controller accepts local candles without network access. A host may inject
the existing provider-neutral `Datafeed`; symbol/timeframe changes create a new
request generation and pass an `AbortSignal` through the core. A host may also
inject asynchronous `load`/`save` storage. There is no default localStorage,
IndexedDB, authentication, telemetry, market-data service, or mandatory
network request.

## Public API decision boundary

The internal entry point is `src/widget/index.ts` and its current shape is
documented as a proposal in the Phase 16.4 design and verification report.
No root export, package subpath, npm metadata, or protected API baseline was
changed. A separate owner decision is required before promoting the
`createOpenKlineWidget` contract or publishing a Widget package.

## Verification boundary

Focused Chromium and mobile-Chrome tests cover offline construction, controls,
workspace restoration, cancellation, independent instances, RTL/theme state,
responsive layout, and cleanup. Existing Node, React/Studio, package,
distribution, and stress suites remain the source of truth for the core. The
cloud environment has no Playwright-managed Firefox or WebKit binaries, so no
Firefox, WebKit, Mobile Safari, physical-device, or universal accessibility
claim is made.
