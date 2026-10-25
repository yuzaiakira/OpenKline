# Customization Architecture

Customization is deliberately split between declarative chart options and
typed plugin capabilities:

- `ChartTheme` controls canvas colors, grid, candles, volume, crosshair, and
  filled-band appearance.
- `locale`, `timeZone`, and `pricePrecision` control `Intl.DateTimeFormat`
  labels and numeric tooltip/axis formatting.
- `priceScale` configures the primary pane's centralized linear, logarithmic,
  percentage, or indexed display transform. It does not transform stored data,
  indicator input, or drawing anchors; see `price-scale-system.md`.
- `direction: "ltr" | "rtl"` reverses the time-axis coordinate transform and
  is passed to drawings and overlays. It is a layout foundation; applications
  should still set the surrounding document `dir` for non-canvas UI.
- `interaction` controls wheel zoom, pointer/touch pan, crosshair publication,
  and focused-canvas plugin keyboard shortcuts.
- Plugin commands provide an explicit action surface and normalized shortcut
  conflict detection. Commands are scoped to a chart and are removed with
  their plugin.

The renderer never accepts arbitrary plugin canvas callbacks. Custom visuals
use the controlled overlay command set, while custom drawing tools return pure
geometry. This preserves one viewport, one scale model, clipping, cleanup,
and deterministic browser tests across built-in and extension content.

There is no separate UI widget/localization bundle in the core yet. Host
applications remain responsible for toolbar labels, menus, and translated
accessibility text; the core exposes typed events and formatted chart values
for those surfaces.
