# OpenKline Phase 16.4.2 — Multi-Chart Layouts & Advanced Panels

## Disposition

The owner-authorized Phase 16.4.2 internal Widget increment is implemented and
verified in the available local Chromium environment. The result is an
internal engineering delivery only. A public Widget API, package export,
publication, and release readiness are not approved by this work.

| Item | Value |
| --- | --- |
| Repository | `yuzaiakira/OpenKline` |
| Starting SHA | `fbdf29219d58594fe5892df8314e0974bbbe27b6` |
| Branch | `main` |
| Required identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Scope | Phase 16.4.2 multi-chart layouts and advanced Widget panels only |
| Implementation commit | `8cdc806aed8779c78ae757799eee6fb09081ff0e` |
| Report commit | The documentation commit containing this report |
| Publication state | No npm publication, Git tag, GitHub release, or license change |

## Authorization and boundary

The owner authorization covers implementation, focused tests, internal
benchmarks, documentation, Conventional Commits, and direct pushes for Phase
16.4.2 only. It does not authorize public Widget exports, protected
API-baseline changes, React/Next.js Widget adapters, licensing, backend or
hosted infrastructure, accounts, billing, broker connectivity, npm
publication, releases, tags, or Phase 16.4.3+.

## UI architecture changes

### Module decomposition

The former monolithic `src/widget/controller.ts` (~1,960 lines) was split into
maintainable internal modules:

| Module | Responsibility |
| --- | --- |
| `controller.ts` | Widget orchestration, toolbar, modal panel wiring, composition I/O |
| `chart-slot.ts` | Per-chart Chart ownership, data identity, presentation, replay |
| `composition.ts` | Versioned internal multi-chart workspace schema and validation |
| `styles.ts` | Scoped CSS and reference-counted stylesheet lifecycle |
| `focus.ts` | Modal focus trap, Escape, restoration, selective inert |
| `defaults.ts` | Labels/features defaults |
| `helpers.ts` | Indicator/drawing metadata helpers |
| `dom.ts` | Shared control helpers |
| `errors.ts` | Widget lifecycle/composition errors |
| `types.ts` | Internal Widget contracts |

Observable single-chart behavior from Phase 16.4.0–16.4.1 is preserved.

### Drawing cancellation boundary

The Widget no longer casts into Chart's private `cancelDrawing()`. Chart
registers a private cancellation callback through
`src/internal/drawing-cancellation.ts`. The Widget calls
`cancelInteractiveDrawing(chart)`. This helper is not re-exported from
`src/index.ts` and does not modify the protected public API baseline.

### Dialog focus and touch hit-testing

Professional and advanced panels use `role="dialog"` with `aria-modal="true"`.
They are hosted in a content-scoped modal layer that does not cover the
toolbar, so panel switching remains hit-tested. Drawing Toolbar and Replay keep
the chart interactive (no blocking backdrop). Escape restores trigger focus.
The previous Mobile Chrome `force: true` close click was removed; close now
uses genuine hit-tested interaction.

## Multi-chart layout ownership

Supported layouts: `single`, `two-horizontal`, `two-vertical`, `four-grid`.

Each chart slot owns independent series/data, symbol/timeframe identity,
indicators, drawings, replay, viewport (when unsynchronized), datafeed
requests, errors/loading, and disposal. Stable IDs are `chart-1`…`chart-N`.
Layout switches archive removed charts' workspaces and restore them when the
layout expands again. UI actions target the active chart. One slot failing a
datafeed transition does not destroy sibling charts.

## Synchronization semantics

The existing `ChartSynchronizationController` is reused. Opt-in options:

- `enabled` (default false)
- `crosshair`
- `visibleRange`

UTC timestamps are forwarded; price scales remain independent. Sync is off by
default. Disabling restores independent interaction. Symbol/timeframe/replay
execution are not implicitly synchronized.

## Watchlist integration

Bounded Watchlist UI uses `WatchlistModel` / `WatchlistDocument` and optional
host `QuoteProvider`. Supports add/remove/reorder/favorite, empty states, and
honest missing/stale quote reporting. Selecting a symbol preserves the
confirmed/requested identity model and refuses to relabel direct candles
without a Datafeed or `setData` replacement.

## Comparison integration

Uses `ComparisonEngine` only (no duplicated math). Host supplies candles for
assets. Normalized series are rendered through Chart line series with a
`widget-comparison-` prefix. Raw OHLCV remains on the Chart price series.
Replay cutoff masks future normalized points. Subscriptions/series are cleared
on `clearComparison()` / destroy.

## Replay integration

Chart-scoped Replay UI calls existing `Chart.createReplay` / `ReplayApi`.
Supports enter, step, play/pause, speed, seek, exit. Replay remains local to
the active chart. No lookahead UI path is exposed.

## Workspace compatibility

- `exportWorkspace` / `importWorkspace` continue to target the active chart's
  public `WorkspaceDocument`.
- `exportComposition` / `importComposition` use internal schema version 1 with
  layout, active chart, per-chart workspaces, sync prefs, watchlist, and
  comparison configuration. Public workspace schemas are unchanged.

## Accessibility and responsive behavior

- Modal focus containment with toolbar still reachable for panel switching.
- Drawing/replay panels keep chart pointer interaction.
- RTL/LTR and dark/light themes preserved.
- Narrow containers stack multi-column grids.
- Touch-sized controls retained.

Formal assistive-technology certification remains OPEN.

## Performance and lifecycle benchmarks

Local HeadlessChrome widget benchmark (environment-specific, not a universal
guarantee):

| Workload | Observation |
| --- | --- |
| 1k create / pan median | 8.5 ms create; pan median 16.7 ms (~59.9 FPS frame pacing) |
| 10k create / pan median | 13.0 ms create; pan median 16.7 ms |
| 100k create / pan median | 95.6 ms create; pan median 16.7 ms |
| Layout switch (6 samples) | median 16.7 ms / p95 16.7 ms |
| Sync pan (enabled) | median 16.7 ms / p95 16.8 ms |
| Watchlist / comparison / replay transitions | 0.2 / 16.6 / 17.7 ms |
| Multi-chart destroy | 0.2 ms; 0 canvases / 0 listeners remaining |
| Repeated mount/unmount (10) | median 2.7 ms / p95 3.2 ms |

Browser Canvas2D and multi-chart benchmarks also completed with zero remaining
owned canvases after destroy. Historical 60–63 FPS figures are not universal
guarantees.

## Verification matrix

| Command | Result |
| --- | --- |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 388/388 Node tests |
| `npm run test:browser -- --reporter=line` | PASS — 43 passed, 2 skipped |
| `npx playwright test …widget*.spec.ts --project=chromium` | PASS — 8 passed, 2 skipped |
| `npx playwright test …widget*.spec.ts --project=mobile-chrome` | PASS — 3 passed, 3 skipped |
| `npm run test:react:browser` | PASS — 38/38 after env distDir workaround; one accessibility dialog flake retried PASS |
| `npm run test:react:production` | PASS — 1/1 |
| `npm run package:smoke` | PASS |
| `npm run package:check` | PASS |
| `npm run distribution:check` | PASS |
| `npm run studio:check` | PASS |
| `npm run api:inventory` | PASS — 319 runtime / 736 type exports |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED |
| `npm run api:check` | OPEN/FAIL — inherited Chart / WorkspaceDocument / WorkspaceRestoreOptions hashes |
| `npm run stress:ci` | PASS — zero remaining canvases |
| `npm run benchmark:widget` | PASS |
| `npm run benchmark:browser` | PASS |
| `npm run benchmark:multi-chart` | PASS |

## Defects discovered and corrected

1. Fragile private `cancelDrawing` cast → internal cancellation registry.
2. Misleading modal overlays covering the toolbar → content-scoped modal layer.
3. Backdrop blocking drawing hit-tests → chart-interactive panel mode.
4. Mobile close used `force: true` → genuine click after overlay fix.
5. Direct-data symbol/timeframe error messaging restored for identity safety.

## Deferred or unsupported features

- Public Widget package / root exports / React Widget adapter.
- Automatic multi-chart replay coordination.
- FX conversion / financial comparability claims in Comparison UI.
- Host comparison asset candle persistence inside composition restore (config
  only; candles remain host-owned).
- Restrictive CSP nonce/stylesheet distribution.
- Phase 16.4.3+.

## Open public API and release gates

`api:check` remains OPEN/FAIL for the inherited declaration-hash differences:

- `Chart`
- `WorkspaceDocument`
- `WorkspaceRestoreOptions`

Firefox, WebKit, Mobile Safari, physical devices, formal accessibility, CSP,
legal, and publication gates remain OPEN.

## Final Git delivery record

Recorded after the documentation commit and push:

| Check | Expected |
| --- | --- |
| Implementation SHA | `8cdc806aed8779c78ae757799eee6fb09081ff0e` |
| Author / committer | `Akira Yuzai <yuzai.akira@gmail.com>` |
| `HEAD == origin/main` | Required after push |
| Working tree | Clean after delivery |
| Force push / history rewrite | Not used |

## Final status

`PHASE 16.4.2 — MULTI-CHART & ADVANCED WIDGET PANELS IMPLEMENTED / VERIFIED INTERNALLY — PUBLIC WIDGET API NOT AUTHORIZED`
