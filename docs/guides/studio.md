# OpenKline Studio guide

Run the private Studio consumer locally from the repository root:

```sh
npm run build
npm run dev --prefix examples/nextjs-app-router
```

Open the local Next.js root route. Studio intentionally uses deterministic
BTC-USD, ETH-USD, and AAPL fixtures rather than pretending to connect to a
market-data vendor. Symbol and timeframe controls replace fixture data through
the public workspace contract.

## Workflow

1. Choose a symbol and timeframe, then choose Candles, OHLC, Hollow,
   Heikin–Ashi, Line, Area, or Baseline presentation. Studio keeps these
   series in the existing chart and changes their real visibility; it does not
   recreate a chart or replace raw market data.
2. Add built-in indicators from the Objects panel; removable overlays and all
   live series appear in the same tree.
3. Activate a drawing tool and place its anchors on the canvas. The drawing
   list can select, hide, color, lock, and remove it; Undo/Redo use the chart's
   drawing history.
4. Save or Load the browser-local workspace, or Export a portable JSON
   workspace. Local storage is browser/profile-specific.
5. Open KlineScript, compile the source, and add it only after the restricted
   compiler accepts it. Errors are reported in the editor.
6. Use Bar replay to enter an inclusive historical view of the deterministic
   source. Select a starting point, use Previous/Next, Beginning/Latest,
   Play/Pause, speed, and the timeline through the public
   `Chart.createReplay()` API. While the chart canvas is focused, Left/Right
   step one bar, Space toggles playback, and Escape exits replay. Exit replay
   restores the complete workspace; source and structural object changes are
   intentionally disabled until then.

The Settings panel changes theme, locale, timezone, price precision, scale
mode (Linear, Log, Percentage, or Index 100), autoscale, axis labels, scale
margins, and interaction policy at runtime without rebuilding the chart. Scale
settings call the public price-scale API and retain raw financial anchors.
Fit and Reset use the shared viewport; pointer/wheel interactions remain owned
by the chart.

Save captures the chart workspace, including visible chart type, price-scale
configuration, indicators, drawings, and display configuration. Load restores
through the public workspace contract and synchronizes the active Studio
controls. Heikin–Ashi remains a display-only projection: workspace data and
indicators use raw OHLCV. A workspace exported through the chart API during
replay is marked as a partial replay snapshot and is not a resumable Studio
workspace without the complete source.

## Boundaries

Studio is a private application example, not an npm package or hosted service.
It has no credentials, analytics, remote storage, or third-party data adapter.
For real vendor integration, implement a public `Datafeed` adapter in the host
application and retain its authentication outside the core. See
[the datafeed API](../api/datafeed.md) and
[Studio architecture](../architecture/studio-architecture.md).
