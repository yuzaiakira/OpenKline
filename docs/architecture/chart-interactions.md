# Chart navigation and interaction behavior

`ChartModel` owns shared time navigation independently from Canvas2D. Every
series and pane uses one time viewport; the browser `Chart` adapter owns pointer
capture, wheel handling, rendering, and public commands.

## Viewport anchors

- A view at the latest bar remains right-edge anchored when a strictly newer
  candle or point arrives.
- A panned historical view preserves its visible count and start index through
  historical corrections, non-primary series updates, and ordinary container
  resize where the data still permits it.
- Resizing changes canvas backing dimensions and available pixel spacing; it
  does not silently reset a user's zoom to the default density.
- Empty data has a stable one-slot viewport. A single candle stays visible and
  never creates an artificial second timestamp.
- `fitContent()` displays the complete shared time range. `resetView()`
  restores default density and follows the newest data.

Replacing the primary candle dataset with `setData` is an intentional new-data
operation and resets to the latest default view. A host switching symbols should
therefore use `setData` or `setDatafeed`; a host applying an in-place historical
correction should use `update`.

## Interaction ownership

The canvas uses pointer capture for pan and drawing anchor edits. Hit-tested,
unlocked drawings can move a selected anchor or whole geometry; locked drawings
remain selectable but are not changed. Wheel zoom uses the pointer position as
its anchor. The interaction configuration can disable wheel zoom, pointer/touch
pan, crosshair events, or plugin keyboard shortcuts without reconstructing the
chart.

Canvas rendering is scheduled directly from chart mutations and interaction
events. The renderer, scales, and drawing geometry remain shared; hosts and the
Studio must not implement a second viewport or scale system.

The main-pane price conversion is likewise shared by rendering, pointer events,
crosshair publication, drawings, and plugin pane contexts. Changing a display
mode preserves raw crosshair prices and drawing anchors.
