# Multi-chart Studio

The private Next.js Studio exposes four layouts from the `Chart layout`
selector: single chart, two side by side, two vertical, and four chart grid.

Each panel has a stable ID, independent symbol/timeframe, Chart instance,
indicators, drawings, alerts, replay session, and script lifecycle. Select a
panel from its header or the accessible `Active chart panel` selector before
using the toolbar and settings. On compact screens only the active panel is
shown; the selector switches panels without recreating their state.

Reducing a layout archives removed panels in the current browser session so
they can be restored when the layout is expanded again. Save a named workspace
to persist the complete panel set and nested chart workspaces.

The synchronization switches are independent. The Studio registers each live
Chart with the public `ChartSynchronizationController`; crosshair and
visible-range sync use UTC timestamps and target-side clamping. Symbol and
timeframe sync update the selected panel set. Replay remains private to each
panel, and a replay cutoff prevents synchronized targets from seeing future
bars.

The Indicator Explorer is keyboard-accessible and exposes metadata categories,
text search, favorites, and definition parameters. Selecting a definition
feeds the existing Add control; the chart still owns parameter validation,
pane assignment, output styles, and lifecycle cleanup. The toolbar exposes
the built-in analysis drawings, including channels, Fibonacci extension,
ranges, and long/short risk-reward annotations.

Workspace, watchlist, and panel destructive actions use an in-page ARIA dialog
with explicit Cancel and Confirm/Apply controls. They do not call blocking
browser `prompt()` or `confirm()` dialogs.
