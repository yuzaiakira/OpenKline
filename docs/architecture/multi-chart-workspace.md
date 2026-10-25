# Multi-chart workspace architecture

Phase 7.4 keeps chart rendering and financial state in the existing public
`Chart` API. Multi-chart composition is an application-layer concern owned by
the Next.js Studio. Each panel has a stable `panelId`, its own
`FinancialChart` ref, and its own symbol, timeframe, Chart instance, replay,
alerts, drawings, indicators, and Worker-backed scripts. Panel array position
is never used as identity.

The initial Studio-level document is framework-neutral and versioned as
`OPENKLINE_STUDIO_WORKSPACE_VERSION = 1`. It contains a layout, panel records,
per-panel existing `WorkspaceDocument` values, synchronization preferences,
and a watchlist document. The chart-level schema remains version 1 and is not
replaced by a second chart serialization format.

Supported layout identifiers are `single`, `two-horizontal`, `two-vertical`,
and `four-grid`. Layout changes preserve existing panel records where possible;
new panels are created from an explicit deterministic fixture and removed
panels are preserved in the named workspace until the user confirms deletion.
The host owns the lifecycle of each `FinancialChart`; unmounting a panel
destroys only that Chart and its resources.

The framework-neutral parser validates layout cardinality, stable unique panel
IDs, symbol/timeframe metadata, every nested chart workspace through
`parseWorkspace`, synchronization flags, and the watchlist document before a
host mutates a live chart. Legacy single-chart documents are migrated into one
panel without overwriting the original storage value.

This layer deliberately does not import React, Next.js, Canvas internals, or
datafeed vendors. It can therefore be tested in Node and reused by another
host application without creating a second renderer or chart engine.
