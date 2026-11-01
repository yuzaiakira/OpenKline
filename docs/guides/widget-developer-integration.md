# Internal Widget Developer Integration Guide

Status: Phase 16.4.3 internal readiness. **Not a published Widget package.**

Executable imports use the local internal module path
`dist/src/widget/index.js` (or the Next.js fixture alias
`openkline/widget-internal`). Do not treat these as npm public API.

## Ownership model

| Object | Ownership |
| --- | --- |
| `InternalWidget` | Host creates and must `destroy()` |
| `Chart` from `getChart()` / `getCharts()` | Borrowed; Widget-owned lifecycle |
| `PluginHandle` | Host-owned after `installPlugin`; dispose or destroy with Widget |
| `ReplayApi` | Chart-owned; invalid after `exitReplay` / destroy |
| Workspace / Composition documents | Plain serializable snapshots (host-owned copies) |
| Event unsubscribe | Idempotent; destroy clears remaining listeners |

## Construction and configuration

Required:

- `container: HTMLElement`

Optional (validated): theme/direction via `chartOptions`, `layout`,
`data` + `dataIdentity`, `datafeed` + required `datafeedQuery`, `storage`,
`features`, `labels`, `synchronization`, `watchlist`, `quoteProvider`,
`plugins`, `styles.mode` (`inject` | `external`), `styles.nonce`.

Disabled `features` hide the corresponding toolbar/panel UI. They do not strip
imperative APIs already exposed on `InternalWidget`.

## Events

`subscribe(listener)` receives:

- `ready` — deferred microtask after construction
- `state` — snapshot after meaningful UI/data changes
- `error` — normalized `Error`
- `layout` / `activeChart`
- `chart` — forwarded Chart events with `chartId`
- `destroyed` — emitted once before listeners are cleared

## Workspace vs Composition

- Active-chart **Workspace** uses public `WorkspaceDocument`.
- Multi-chart **Composition** is internal schema version 1 with canonical
  `chart-1`…`chart-N` IDs.
- Host Storage is optional; credentials and callbacks must not be serialized.
- Restoring archived charts restores Workspace data only — reattach Datafeed
  explicitly.

## Styles / CSP

Default: Widget injects reference-counted `<style data-openkline-widget-style>`.

CSP-friendly hosts:

1. Set `styles: { mode: "external" }`.
2. Load `WIDGET_CSS` via a same-origin stylesheet (see
   `examples/vanilla/widget-csp.html` and `examples/vanilla/widget-openkline.css`).
3. Keep the host CSS fixture synchronized after Widget style edits:
   `node scripts/sync-widget-host-css.mjs`.
4. Optional nonce: `styles: { mode: "inject", nonce }`.
5. Prefer verifying under an **enforced** CSP (`style-src 'self'`) rather than
   only checking for absence of Widget `<style>` tags.

Shadow DOM packaging remains a future proposal. Universal CSP certification is
not claimed; Chromium/Firefox enforcement fixtures are the current evidence.

## Accessibility notes (internal)

The Widget root is a labelled region with live status/error descriptions. Panel
dialogs use native-ish semantics (`h2` + `aria-labelledby`). Drawing Toolbar and
Replay are non-modal so chart pointer input remains available. Formal
screen-reader certification remains open.

## Fixtures

- Vanilla: `examples/vanilla/widget-integration.html`
- CSP: `examples/vanilla/widget-csp.html`
- Next.js client: `/widget-integration`
- Browser tests: `tests/browser/widget-developer-integration.spec.ts`,
  `tests/browser/widget-quality-gates.spec.ts`,
  `tests/react-browser/widget-integration.spec.ts`

## PROPOSAL — NOT A PUBLISHED API

```ts
// Future public sketch only — do not ship integrations against this today.
import { createOpenKlineWidget } from "@openkline/widget";
```

Public names, package subpaths, CSS asset exports, and React adapters require a
separate owner-authorized API review.
