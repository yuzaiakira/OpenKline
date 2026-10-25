# Price-scale system

Phase 7 gives the main price pane one canonical `PriceScale` transformation.
Canvas rendering, crosshair events, tooltips, drawing geometry, and plugin pane
contexts use that same transformation; integrations must not calculate a second
price-to-pixel mapping.

## Modes and raw-value invariant

`linear` is the default. `logarithmic` maps positive raw prices through the
natural logarithm. `percentage` displays change from a positive reference as
`((price / reference) - 1) * 100`; `indexed` displays `price / reference *
100`. Percentage labels include `%`; indexed labels use the selected numeric
precision.

Stored candles, indicator inputs, `CrosshairMoveEvent.price`, drawing anchors,
and `priceForY()` are always raw financial prices. Only axis/tooltip formatting
and pixel geometry are transformed. This lets a trend line retain exactly the
same anchors when a user changes scale mode.

For percentage and indexed views the implicit reference is the first positive
close in the complete primary candle dataset, not the first currently visible
bar. It therefore stays stable while panning and zooming. Applications can set
an explicit positive `referencePrice` instead.

## Domain safety and diagnostics

Logarithmic scale is active only when the selected raw range is strictly
positive. Percentage/indexed scale requires a positive reference. If either
condition is not met, the engine renders a linear scale and exposes a
deterministic `PriceScaleDiagnostic` through `getPriceScaleState()`:

- `LOGARITHMIC_REQUIRES_POSITIVE_VALUES`
- `REFERENCE_REQUIRES_POSITIVE_VALUE`

This is a display fallback, never a data mutation. Auxiliary panes, including
RSI and MACD, retain their own linear value scales; main-pane overlays share
the main price transformation.

## Autoscale and workspace persistence

Autoscale derives the raw range from the visible main pane. `setPriceScaleRange`
freezes a raw range and disables autoscale; `resetPriceScale()` returns to
visible-data autoscaling. Margins are fractions of the transformed range and
are independently configurable above and below the data. Axis labels can be
hidden without disabling grid rendering.

The version-1 workspace schema optionally persists scale configuration. Older
version-1 documents without `chart.priceScale` remain valid and restore the
linear autoscale default. No left/right axis assignment, exchange-session
calendar, or secondary-axis system is implied by this increment.
