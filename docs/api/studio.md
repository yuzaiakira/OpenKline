# Studio workspace API

The framework-neutral Studio contracts are exported from `openkline`:

- `StudioWorkspaceDocument` and `parseStudioWorkspace` validate a versioned
  multi-chart document.
- `createStudioWorkspace` creates a single-panel document around an existing
  `WorkspaceDocument`.
- `migrateLegacyWorkspace` converts the previous single-chart document without
  changing the source value.
- `WatchlistModel`, `parseWatchlistDocument`, and `WatchlistDocument` provide
  ordered lists, stable symbol IDs, favorites, and validated persistence.
- `QuoteProvider` is the vendor-neutral quote subscription boundary.
- `ChartSynchronizationController` is the framework-independent public
  controller for linking Chart instances by UTC crosshair and visible range.

`StudioWorkspaceDocument.charts` contains one nested existing chart workspace
per stable `panelId`. The `layout` determines the required panel count. A host
must parse the document before mutating live charts and must dispose each chart
when its panel is removed.

The core package does not persist browser state or create a React UI. The
private Next.js Studio is a reference host for layout, synchronization,
watchlists, named local workspaces, and responsive panel selection. Its demo
quote provider is deterministic and is not exchange data.

## Multi-timeframe workflows

The reference Studio uses each panel's own public `Chart` instance. Its
Multi-timeframe analysis section selects a fixed target larger than the active
panel timeframe, a registry indicator (SMA, EMA, or RSI), period, and finality
policy. It can also add previous target-period OHLC levels. The configuration
is stored inside that panel's existing version-1 `WorkspaceDocument`, so
layouts, symbol changes, and named workspace save/restore keep panels isolated.

Replay recalculates the same managed analysis from the replay-visible source
prefix. Controls are disabled while replay or normalized comparison is active;
the saved configuration remains intact. Comparison temporarily hides raw-price
multi-timeframe series and reference levels so normalized scales are not mixed
with price values, then restores their prior visibility on exit. This is a
presentation policy of the private Studio, not a restriction on the core Chart
API.

## Corporate actions and total return

The reference Studio also exposes a Corporate Actions & Total Return panel.
It demonstrates raw, split-adjusted, and analytical total-return views,
event-marker visibility, source/revision details, replay masking, and a small
portfolio accounting summary. Its default source is a clearly labeled,
deterministic offline illustration. It is not authoritative market data.

The panel respects unresolved corporate-action workspace references. A missing
source is warned about and is not replaced automatically; loading the offline
illustration is an explicit action. Workspace persistence follows the core
boundary and stores source/policy references only, not action datasets,
derived values, runtime clients, results, or credentials.
