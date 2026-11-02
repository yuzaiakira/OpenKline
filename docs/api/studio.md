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

## Drawing property editing

The reference Studio Object Tree includes a contextual Drawing properties
region. When a drawing is selected (via the Object Tree, chart hit-testing, or
interactive creation), Studio surfaces color, line width, visibility, and lock
controls that call the existing Chart `setDrawingStyle` / `selectDrawing` APIs.
Selection is published through the chart `drawingSelection` event into the
active panel snapshot. Changes persist through the normal workspace
serialize/restore path. Property controls are disabled while replay is active,
matching other structural Studio mutations.

## Multi-panel drawing ownership

Drawings are **panel-local**. Each Studio chart panel owns an independent
`Chart` instance and drawing document. `ChartSynchronizationController` (and
Studio's host sync preferences) forward UTC crosshair and visible range only;
they do not share drawing objects, selection, or style mutations.

Studio property edits go through `applyScopedDrawingStyle` /
`clearScopedDrawingSelection`, which require:

- the edit's target `panelId` to match the active panel,
- a live chart for that panel,
- a chart-local drawing with the given id,
- and (for style edits) that drawing to be the chart's current selection.

Matching drawing IDs across panels are not global identity. Stale edits from a
previously rendered property control are rejected when the active panel has
changed. Drawing selection itself is transient runtime state and is cleared on
workspace restore; style, visibility, and lock persist inside each panel's
nested `WorkspaceDocument`.

## Workspace import and local storage

The reference Studio Export/Import buttons exchange validated
`StudioWorkspaceDocument` JSON. Import helpers
(`prepareStudioWorkspaceImport`, `finalizeStudioWorkspaceImport`,
`normalizeStudioWorkspaceName`) validate untrusted files before any mutation:

- Invalid JSON, unsupported versions, malformed panels, empty files, and
  oversized payloads are rejected with an accessible status notice.
- The current live workspace and existing localStorage collection are left
  unchanged on rejection or cancel.
- Successful import opens a naming dialog, assigns a **new** workspace id via
  `allocateStudioWorkspaceImportId` (timestamp + sequence, collision-checked
  against existing stored ids), and appends to the local collection so imported
  ids cannot overwrite stored workspaces even when imports share a millisecond.
- Duplicate **names** are allowed (ids remain unique); the dialog warns when a
  similar name already exists.
- Multi-panel restore reports the workspace name, panel count, and panel ids
  through the status region (`data-workspace-restore-*`). Drawing selection
  remains transient after restore.

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
