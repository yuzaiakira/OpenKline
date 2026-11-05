# Drawings API

Drawings are optional analysis objects attached to a `Chart`. They use the
same time and price coordinates as the main chart pane.

```ts
const trend = chart.addDrawing("trend-line", {
  id: "support-trend",
  points: [
    { time: candles[10].time, price: candles[10].low },
    { time: candles[40].time, price: candles[40].high },
  ],
  style: { color: "#f59e0b", lineWidth: 2 },
});

chart.startDrawing("horizontal-line", {
  style: { color: "#38bdf8" },
});

const document = chart.serializeDrawings();
chart.restoreDrawings(document);
```

## Chart methods

- `addDrawing(type, options)` creates and selects a drawing.
- `startDrawing(type, options)` creates a drawing from the next required
  pointer clicks.
- `getDrawings()` returns defensive snapshots sorted by `zIndex`.
- `selectDrawing(id)` selects an object or clears selection with `null`.
- `getSelectedDrawingId()` returns the selected ID.
- `removeDrawing(id)` removes one object.
- `setDrawingVisibility(id, visible)` and `setDrawingLocked(id, locked)`
  update object-tree presentation state without changing anchors.
- `setDrawingStyle(id, style)` merges a validated style patch into the object.
- `setDrawingZIndex(id, zIndex)` updates render and hit-test order. Locked
  drawings ignore the change.
- `registerDrawingTool(definition)` and `unregisterDrawingTool(type)` manage
  custom tools.
- `undoDrawing()` and `redoDrawing()` return whether a state changed.
- `serializeDrawings()` and `restoreDrawings(document)` implement versioned
  persistence.

## Built-in types and options

The built-in types are `horizontal-line`, `vertical-line`, `trend-line`,
`ray`, `extended-line`, `parallel-channel`, `rectangle`,
`fibonacci-retracement`, `fibonacci-extension`, `price-range`, `date-range`,
`long-position`, `short-position`, and `text`. A drawing point is
`{ time: number, price: number }`. Text drawings also require a non-empty
`text` option.

The ray extends from its first anchor through its second anchor to the visible
pane edge. An extended line clips the infinite line in both directions. A
parallel channel uses two baseline anchors and a third point to define the
offset. Fibonacci extension uses a start, impulse end, and retracement anchor
with levels 0%, 61.8%, 100%, 127.2%, 161.8%, and 261.8%. Price range reports
absolute and percentage change; date range reports elapsed wall-clock time in
UTC milliseconds converted to a compact duration. Date range intentionally does
not infer trading sessions or bar counts from timestamps.

Long/short position drawings use three anchors in the order entry, stop,
target. They validate the required trading order and render risk/reward zones,
price labels, and a calculated R:R ratio. Position sizing and broker orders are
outside this drawing contract; these objects are analysis annotations only.

`DrawingStyle` supports `color`, `fillColor`, `textColor`, `lineWidth`,
`visible`, and `locked`. Hidden objects are not rendered or hit-tested. Locked
objects can still be selected and serialized, but pointer movement and point
updates are ignored. Higher `zIndex` objects are rendered and hit-tested later.

`DrawingApi` exposes `getSnapshot`, `setPoints`, `setStyle`, `setVisible`,
`setLocked`, `setText`, `setZIndex`, and `remove`. Pointer selection near an
anchor moves that anchor (resize/edit); selection on the geometry moves the
whole object. Snapshots are copied at the API boundary.

Interactive `Chart.startDrawing` accepts `snap: "none" | "visible-ohlc"`.
The latter maps each pointer anchor to the nearest visible candle timestamp
and nearest raw open/high/low/close value. Snapping is opt-in, uses raw data
coordinates, and does not modify stored candles or indicator values.

## Custom tools

Implement `DrawingToolDefinition` and register it before creating drawings. The
definition must validate its required anchors, return pure geometry, and return
either `-1` or an anchor index from `hitTest`. See
`docs/guides/custom-drawing-tools.md` for a complete example. Custom tools must
not call browser globals or mutate the snapshot.
