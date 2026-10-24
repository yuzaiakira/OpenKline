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
- `registerDrawingTool(definition)` and `unregisterDrawingTool(type)` manage
  custom tools.
- `undoDrawing()` and `redoDrawing()` return whether a state changed.
- `serializeDrawings()` and `restoreDrawings(document)` implement versioned
  persistence.

## Built-in types and options

The built-in types are `horizontal-line`, `vertical-line`, `trend-line`,
`rectangle`, `fibonacci-retracement`, and `text`. A drawing point is
`{ time: number, price: number }`. Text drawings also require a non-empty
`text` option.

`DrawingStyle` supports `color`, `fillColor`, `textColor`, `lineWidth`,
`visible`, and `locked`. Hidden objects are not rendered or hit-tested. Locked
objects can still be selected and serialized, but pointer movement and point
updates are ignored. Higher `zIndex` objects are rendered and hit-tested later.

`DrawingApi` exposes `getSnapshot`, `setPoints`, `setStyle`, `setVisible`,
`setLocked`, and `remove`. Snapshots are copied at the API boundary.

## Custom tools

Implement `DrawingToolDefinition` and register it before creating drawings. The
definition must validate its required anchors, return pure geometry, and return
either `-1` or an anchor index from `hitTest`. See
`docs/guides/custom-drawing-tools.md` for a complete example. Custom tools must
not call browser globals or mutate the snapshot.
