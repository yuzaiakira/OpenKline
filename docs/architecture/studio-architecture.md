# OpenKline Studio architecture

OpenKline Studio is the private App Router application in
`examples/nextjs-app-router`. The repository had no separate `apps/`
convention, and this example already installs only the public `openkline` and
`@openkline/react` packages. Expanding it keeps a real consumer boundary while
keeping Studio outside the framework-independent Canvas2D core.

## Ownership boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| Studio React client | Controls, local workspace persistence, object list, deterministic fixture selection, and presentation | Scales, drawing geometry, indicator math, Canvas rendering, datafeed transport |
| `FinancialChart` | React mount/unmount and public chart handle | Studio domain state or custom rendering |
| `Chart` public API | Series, viewport, indicator, drawing, workspace, rendering, and lifecycle | React layout and UI widgets |
| Core modules | Series stores, viewport, Canvas2D renderer, drawing/indicator engines | Next.js, storage, or browser application controls |

The Studio never imports `ChartModel`, renderer, stores, or engine internals.
It uses the public chart handle plus `getSeriesInfo()` and
`setSeriesStyle()` for its object tree. This makes workspace restore safe: the
tree is rebuilt from public snapshots rather than stale `SeriesApi` handles.

## Data and workspace flow

The Studio starts with a deterministic 240-bar fixture for the selected symbol
and timeframe. It creates price, line, area, and volume series through public
APIs, then attaches built-in indicators. Switching symbol or timeframe creates
a versioned workspace from the current chart, replaces only market-series data
with deterministic data of the matching shape, and restores that workspace.
Indicator recomputation, pane assignment, drawings, plugins, and the viewport
remain the chart's responsibility.

Save/Load uses a single browser-local workspace key. Export creates a JSON
download. These actions use `serializeWorkspace` and `restoreWorkspace`; they
are not a cloud sync feature and do not transmit data. KlineScript text is
compiled with the existing restricted public compiler before it is attached as
a script indicator. Diagnostics remain visible in the editor.

## Responsive and accessible behavior

The chart itself remains `autoSize`. CSS moves the chart above side panels at
narrow widths, keeps touch-sized native controls, and avoids a desktop-only
fixed toolbar. Buttons have text labels, pressed state for chart presentation,
labels for selectors/color controls, visible keyboard focus, an `aria-live`
status region, and the existing chart canvas label. The Studio workflow is
tested at a 390×844 viewport with Chromium; this is diagnostic mobile-layout
evidence, not a Mobile Safari compatibility claim.
