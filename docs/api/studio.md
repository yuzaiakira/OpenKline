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
