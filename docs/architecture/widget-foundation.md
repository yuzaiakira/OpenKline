# Internal Widget Foundation Architecture

Status: Phase 16.4.2 multi-chart layouts/advanced panels, Phase 16.4.2.1
Datafeed & Composition integrity hardening, and Phase 16.4.3 developer
integration readiness are implemented and verified in supported local Chromium
environments; public Widget API and package publication remain unapproved.

## Boundary

`src/widget/` is a browser-side, framework-independent controller over the
existing public `Chart` handle. It is intentionally absent from
`src/index.ts` and from the package export map. The root library remains the
single financial renderer and calculation owner:

```text
Host DOM container
  -> InternalWidgetController (controls, layout, sync, panels)
  -> ChartSlot[] (one Chart each: series, identity, replay, datafeed)
  -> Chart (series, panes, scales, crosshair, indicators, drawings, workspace)
  -> Canvas2D renderer and financial engines
```

The Widget does not import React, Next.js, Studio application code, provider
credentials, or a backend. It never reaches into `ChartModel`, renderer
internals, stores, or indicator/drawing engines.

## Module organization

| Module | Role |
| --- | --- |
| `controller.ts` | Lifecycle orchestration, toolbar, modal panels, composition |
| `chart-slot.ts` | Per-chart ownership and identity-safe data transitions |
| `composition.ts` | Internal versioned multi-chart composition schema |
| `styles.ts` | Scoped CSS + reference-counted stylesheet ownership |
| `focus.ts` | Modal focus trap / Escape / restoration |
| `defaults.ts` / `helpers.ts` / `dom.ts` / `errors.ts` / `types.ts` | Shared contracts |

Drawing cancellation uses `src/internal/drawing-cancellation.ts` rather than a
public Chart method or TypeScript cast into private members.

## Lifecycle ownership

Construction creates one responsive DOM shell, a content region with a chart
grid, and one or more Chart slots. `destroy()` is idempotent and:

1. closes open modals and aborts pending datafeed/storage requests;
2. unregisters synchronization and quote subscriptions;
3. destroys every Chart slot;
4. destroys the sync controller and comparison engine;
5. releases the reference-counted stylesheet and removes the Widget root.

## Multi-chart layouts

Layouts: `single`, `two-horizontal`, `two-vertical`, `four-grid`. Each slot
keeps independent series, identity, indicators, drawings, replay, viewport
(when unsynchronized), and resource lifecycle. Active-chart selection directs
toolbar and panel actions. Layout changes archive/restore per-chart workspace
state without silently dropping drawings or indicators when charts return.

## Synchronization

Opt-in reuse of `ChartSynchronizationController` for crosshair and visible
UTC range only. Disabled by default. Price scales stay independent. Replay
cutoffs remain Chart-owned.

## Advanced panels

In addition to the Phase 16.4.1 surfaces (Indicator Explorer, Drawing Toolbar,
Object Tree, Drawing Properties, Chart Settings), Phase 16.4.2 adds:

- Synchronization controls
- Watchlist (host quotes / WatchlistModel)
- Comparison (ComparisonEngine + Chart line series)
- Replay (Chart ReplayApi)

Panels are accessible dialogs. The modal layer is scoped to content so the
toolbar remains hit-testable. Drawing and Replay keep the chart interactive.

## Data identity ownership

Direct/offline candles are not implicitly relabeled. Confirmed vs requested
identity remains explicit. Watchlist selection never relabels candles before a
confirmed Datafeed/`setData` replacement.

Each `ChartSlot` reuses `Chart.setDatafeed()` for provider-neutral
`resolveSymbol` / `getBars` / `subscribeBars` lifecycle, AbortSignal
propagation, generation-aware pending diagnostics, and unsubscribe on
replacement, workspace import, and destroy. Archived layout slots restore
Workspace state only; hosts must re-inject Datafeed connectivity explicitly.

## Persistence

`exportWorkspace` / `importWorkspace` target the active chart through the
existing public workspace contracts. `exportComposition` / `importComposition`
serialize the internal multi-chart document (schema version 1) with canonical
`chart-1`…`chart-N` IDs, finite comparison numerics, allowlisted keys, and
prevalidated import with best-effort rollback on apply failure. Persistence
remains optional and host-injected. No mandatory localStorage/IndexedDB.
Comparison restores configuration only; asset candles remain host-owned.

## Developer integration surface (Phase 16.4.3)

Internal hosts may:

- Construct/destroy Widgets with validated options
- Subscribe to `ready` / `state` / `error` / `layout` / `activeChart` / `chart` / `destroyed`
- Choose `styles.mode = "external"` and load `WIDGET_CSS` under CSP `style-src 'self'`
- Use Vanilla (`examples/vanilla/widget-integration.html`) and Next.js
  (`/widget-integration`) fixtures that import the internal module path

Guide: `docs/guides/widget-developer-integration.md`.

## Public API decision boundary

The internal entry point remains `src/widget/index.ts`. No root export,
package subpath, npm metadata, or protected API baseline was changed.

## Verification boundary

Focused Chromium and Mobile Chrome tests cover multi-chart layouts, sync,
watchlist/comparison/replay panels, Datafeed resolve/subscribe/realtime
integrity, composition validation, modal focus, real touch hit-testing, and
cleanup. Firefox, WebKit, Mobile Safari, physical-device, formal
assistive-technology, CSP, public API, legal, and release gates remain open.
