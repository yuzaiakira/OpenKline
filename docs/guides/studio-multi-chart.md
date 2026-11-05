# Multi-chart Studio

The private Next.js Studio exposes four layouts from the `Chart layout`
selector: single chart, two side by side, two vertical, and four chart grid.

Each panel has a stable ID, independent symbol/timeframe, Chart instance,
indicators, drawings, alerts, replay session, and script lifecycle. Select a
panel from its header, the accessible `Active chart panel` selector, or the
compact **Mobile chart panels** navigator before using the toolbar and
settings. On compact screens (`max-width: 720px`) only the active panel is
shown; switching panels reveals the selected chart without destroying hidden
panels or recreating their Chart state. The mobile navigator states which
panel is viewing and how many panels remain in the workspace.

Reducing a layout archives removed panels in the current browser session so
they can be restored when the layout is expanded again. Save a named workspace
to persist the complete panel set and nested chart workspaces.

The synchronization switches are independent. The Studio registers each live
Chart with the public `ChartSynchronizationController`; crosshair and
visible-range sync use UTC timestamps and target-side clamping. Symbol and
timeframe sync update the selected panel set. Replay remains private to each
panel, and a replay cutoff prevents synchronized targets from seeing future
bars.

The Indicator Explorer is keyboard-accessible and exposes registry-backed
metadata (name, description, category), text search across id/name/description,
favorites, and definition parameter overrides. It can add indicators to the
active chart panel, list applied instances for that panel, apply parameter
overrides to a selected instance, and remove instances. Search and catalog
inspection do not dirty the workspace; add/remove/parameter mutations do and
participate in the Save / Discard / Cancel navigation guard. The chart still
owns parameter validation, pane assignment, output styles, and lifecycle
cleanup. KlineScript programs remain a separate Worker path and are not listed
as built-in catalog entries. The Explorer **My Scripts** section searches
templates and browser-local saved scripts, opens the KlineScript editor, and
can apply a listed script to the active panel through
`addScriptIndicatorAsync`. Applied script rows are tagged separately from
built-ins; selecting one opens the Applied Script Inspector for parameters
(int/float/bool), Open in Editor, Reapply, and Remove. Compile-only does not
dirty the desk, while Worker apply/reapply/remove do. Imported workspaces
quarantine embedded KlineScript into a pending-activation list until the user
explicitly Activates a script. The toolbar exposes the built-in analysis
drawings, including channels, Fibonacci extension, ranges, and long/short
risk-reward annotations.

The Professional Drawing Toolbar groups those built-in tools, shows the active
tool through `aria-pressed` (synced from Chart `toolActivation`), provides
Cursor and Cancel modes, and supports Escape cancellation of an in-progress
drawing through the internal cancellation bridge. Selecting a tool does not
dirty the workspace; completing, styling, undoing, or redoing a drawing does.
Replay disables drawing-tool mutations.

The Object Tree **Drawing properties** region edits stroke color, width,
visibility, and lock for any selected drawing. Fill color appears for shapes
and zones that render fills (rectangle, ranges, positions). Text color appears
for text notes and labeled tools (Fibonacci, ranges, positions). Layer Forward /
Backward / Front / Back buttons change DrawingEngine `zIndex` so stacking and
hit-testing follow the chart, not HTML order. Styles and order persist with the
workspace and stay panel-local.

Workspace, watchlist, and panel destructive actions use an in-page ARIA dialog
with explicit Cancel and Confirm/Apply controls. They do not call blocking
browser `prompt()` or `confirm()` dialogs.
