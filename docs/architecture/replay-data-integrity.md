# Replay data-integrity boundary

Chart replay is an integration layer around the framework-independent
`ReplayEngine`. The engine owns the protected, validated candle source and its
cursor. `Chart` owns the visible projection and restores the pre-replay chart
workspace when replay exits.

## Inclusive visibility

The cursor is inclusive. At source index `N`, the chart exposes source bars
`0..N` and no later bar through any public or renderer-facing path:

- the shared time axis and viewport are clamped to the visible prefix;
- candle, OHLC, hollow, Heikin–Ashi, line, area, baseline, volume, and
  histogram series are masked by the cutoff timestamp;
- Heikin–Ashi is derived from the raw prefix, so a future raw candle cannot
  influence an earlier derived open value;
- indicators and KlineScript are recalculated from the visible primary raw
  candles;
- autoscale, price-scale conversions, crosshair values, tooltip values, and
  plugin render contexts receive only visible data;
- drawings are rendered, hit-tested, returned, and serialized only when all
  of their anchors are at or before the cursor.

The original chart workspace and source objects are not returned through the
replay API. Series and status results are defensive copies. A caller cannot
mutate the protected source by changing a result returned from `getData`, a
series API, a workspace, or a replay status object.

## Lifecycle isolation

While replay is active, source mutations and structural mutations are rejected.
This includes `setData`, `update`, series data changes, adding/removing series,
indicators, panes, or drawings. Appearance, scale, viewport, and chart options
remain host-controlled operations. `exit()` restores the captured workspace,
including the complete original data, indicators, drawings, viewport, and
layout.

`serializeWorkspace()` and `serializeDrawings()` intentionally describe the
visible replay projection. A workspace exported during replay contains a
`replay` marker and is a partial snapshot; restoring it without the complete
replay source is rejected with `WorkspaceCompatibilityError` rather than
silently creating a chart with missing history.

## Datafeed isolation

Entering replay increments the datafeed request generation and removes the
active subscription. Pending historical responses from the previous request
are ignored by the existing stale-request guard. A callback retained by a
provider cannot update chart data while replay is active. On exit, the saved
datafeed query is loaded again and a fresh subscription is created. A datafeed
error during that restoration is reported through the existing `datafeedError`
event and does not corrupt the replay engine state.

This boundary is vendor-neutral and does not require a datafeed to know about
replay. Providers remain responsible for making their own unsubscribe
callbacks safe and idempotent.

## Rendering and cleanup

The existing ChartModel remains the single owner of series, shared time
viewport, pane layout, and cutoff masking. Canvas rendering, crosshair
calculation, drawing hit testing, and plugin contexts consume its visible
snapshot. Replay uses the same resize, pan, zoom, scale, and destruction paths
as ordinary chart operation. Destroying a chart disposes the replay scheduler,
datafeed subscription, indicators, drawing engine, model, and canvas.
