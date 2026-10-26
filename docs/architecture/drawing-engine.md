# Drawing Engine

The drawing engine is a framework-independent state and interaction boundary
for analysis objects. `DrawingEngine` owns registered tool definitions, drawing
snapshots, hit testing, selection-ready IDs, edit locking, z-order, undo/redo,
and versioned serialization. It does not access the DOM or Canvas2D.

```text
Chart pointer events -> coordinate converter -> DrawingEngine
                                             |        |
                                  snapshots/undo   tool geometry
                                             |        |
                                      CanvasRenderer
```

## Built-in tools

The built-in set provides horizontal and vertical lines, trend lines, rays,
extended lines, parallel channels, rectangles, Fibonacci retracements and
extensions, price/date ranges, long/short risk-reward positions, and anchored
text. Tools declare a point count, validate snapshots, produce pure screen
geometry, and implement pixel hit testing. Fibonacci retracement levels are
deterministic at 0%, 23.6%, 38.2%, 50%, 61.8%, 78.6%, and 100%; extension levels
are 0%, 61.8%, 100%, 127.2%, 161.8%, and 261.8%.

Ranges and position tools are annotations only. A date range reports elapsed
timestamp duration rather than assuming exchange sessions. A position tool
requires entry/stop/target ordering and calculates a displayed R:R ratio; it
does not place orders or imply broker integration.

Drawings are anchored to UTC millisecond timestamps and prices. The chart maps
them through the main pane's time and price scales, so zoom and pan preserve
their data coordinates. Selected drawings show anchor handles; dragging an
anchor resizes/edits that point, while dragging geometry moves the whole object.
Locked drawings remain selectable but cannot be moved or edited.

## Lifecycle and persistence

`Chart.addDrawing` creates an object immediately. `Chart.startDrawing` collects
the required number of pointer anchors. `selectDrawing`, `removeDrawing`, and
the `DrawingApi` methods cover normal editing. `undoDrawing` and `redoDrawing`
operate on a bounded history of state snapshots. `serializeDrawings()` returns
document version `1`; `restoreDrawings()` validates tool names, IDs, anchors,
and point counts before replacing the current document.

The engine keeps custom tools vendor-neutral. A custom definition is registered
with `registerDrawingTool`; it receives a defensive `DrawingSnapshot`, a
coordinate converter, pane bounds, and a hit-test tolerance. Custom geometry
uses the same line, rectangle, and text primitives as built-ins. A future
renderer may add primitives by versioning this contract rather than exposing
Canvas internals to tools.

Current scope intentionally does not include freehand drawing, persistence to a
server, collaboration, or a full workspace document containing chart settings.
