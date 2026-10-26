# OpenKline Studio architecture

OpenKline Studio is the private App Router application in
`examples/nextjs-app-router`. The repository had no separate `apps/`
convention, and this example already installs only the public `openkline` and
`@openkline/react` packages. Expanding it keeps a real consumer boundary while
keeping Studio outside the framework-independent Canvas2D core.

## Ownership boundaries

| Layer | Owns | Does not own |
| --- | --- | --- |
| Studio React client | Controls, local workspace persistence, object list, deterministic fixture selection, and presentation selection | Scales, drawing geometry, indicator math, Canvas rendering, datafeed transport |
| `FinancialChart` | React mount/unmount and public chart handle | Studio domain state or custom rendering |
| `Chart` public API | Series, viewport, indicator, drawing, workspace, rendering, and lifecycle | React layout and UI widgets |
| Core modules | Series stores, viewport, Canvas2D renderer, drawing/indicator engines | Next.js, storage, or browser application controls |

The Studio never imports `ChartModel`, renderer, stores, or engine internals.
It uses the public chart handle plus `getSeriesInfo()` and
`setSeriesStyle()` for its object tree. This makes workspace restore safe: the
tree is rebuilt from public snapshots rather than stale `SeriesApi` handles.

## Data and workspace flow

The Studio starts with a deterministic 240-bar fixture for the selected symbol
and timeframe. It creates every supported primary presentation (Candles, OHLC,
Hollow Candles, Heikin-Ashi, Line, Area, and Baseline) plus volume through
public APIs, with exactly one primary presentation visible at a time. It then
attaches built-in indicators. Switching symbol or timeframe creates a versioned
workspace from the current chart, replaces only market-series data with
deterministic data of the matching shape, and restores that workspace.
Indicator recomputation, pane assignment, drawings, plugins, and the viewport
remain the chart's responsibility.

Save/Load uses a single browser-local workspace key. Export creates a JSON
download. These actions use `serializeWorkspace` and `restoreWorkspace`; they
are not a cloud sync feature and do not transmit data. KlineScript text is
compiled with the existing restricted public compiler before it is attached as
a script indicator. Diagnostics remain visible in the editor.

Presentation buttons use `setSeriesStyle()` to change visibility; they never
construct a second chart or duplicate scale, crosshair, or viewport state. The
settings panel uses `getPriceScaleOptions()`, `setPriceScaleOptions()`, and
`resetPriceScale()` for the primary price scale. Its state is reconstructed from
the serialized public workspace after load, so chart type, scale mode,
auto-scaling, margins, theme, indicators, and drawings are restored together.

## Responsive and accessible behavior

The chart itself remains `autoSize`. CSS moves the chart above side panels at
narrow widths, keeps touch-sized native controls, and avoids a desktop-only
fixed toolbar. Buttons have text labels, pressed state for chart presentation,
labels for selectors, scale settings, and color controls, visible keyboard focus, an `aria-live`
status region, and the existing chart canvas label. The Studio workflow is
tested at a 390×844 viewport with Chromium; this is diagnostic mobile-layout
evidence, not a Mobile Safari compatibility claim.

## Paper trading panel

The Studio paper-trading panel is a client-only consumer of the public
`createPaperTradingAccount`, deterministic stream, and paper-marker APIs. It
does not import account internals. Each active chart panel receives a distinct
account identity and marker scope; replay and Strategy Tester events are not
forwarded to it. The ticket, dashboard, order history, risk halt, and audit
notice all carry simulated/no-real-money messaging. The panel is responsive
and uses native labels, status regions, a real form, and table captions so it
remains operable at narrow widths. The current example keeps paper state in
memory; durable hosts should use the versioned persistence API explicitly.
