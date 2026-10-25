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

The synchronization switches are independent. Crosshair and visible-range
sync use timestamps and target-side clamping. Symbol and timeframe sync update
the selected panel set. Replay remains private to each panel.
