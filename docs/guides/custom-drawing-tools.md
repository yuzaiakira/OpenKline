# Custom Drawing Tools

Custom tools extend the drawing engine without coupling the core to a vendor,
framework, or browser API.

```ts
import type {
  DrawingBounds,
  DrawingCoordinateConverter,
  DrawingSnapshot,
  DrawingToolDefinition,
} from "openkline";

function rayGeometry(snapshot: DrawingSnapshot, converter: DrawingCoordinateConverter, bounds: DrawingBounds) {
  const first = snapshot.points[0]!;
  const second = snapshot.points[1]!;
  const x1 = converter.xForTime(first.time);
  const y1 = converter.yForPrice(first.price);
  const x2 = converter.xForTime(second.time);
  const y2 = converter.yForPrice(second.price);
  const slope = (y2 - y1) / Math.max(x2 - x1, 1);
  return [{
    kind: "line" as const,
    from: { x: x1, y: y1 },
    to: { x: bounds.right, y: y1 + slope * (bounds.right - x1) },
  }];
}

const rayTool: DrawingToolDefinition = {
  type: "ray",
  minPoints: 2,
  maxPoints: 2,
  validate(snapshot: DrawingSnapshot) {
    if (snapshot.points.length !== 2) {
      throw new Error("ray requires two anchors");
    }
  },
  getGeometry: rayGeometry,
  hitTest(snapshot, x, y, converter, bounds, tolerance) {
    const geometry = rayGeometry(snapshot, converter, bounds)[0];
    if (geometry?.kind !== "line") return -1;
    const dx = geometry.to.x - geometry.from.x;
    const dy = geometry.to.y - geometry.from.y;
    const ratio = Math.max(0, Math.min(1, ((x - geometry.from.x) * dx + (y - geometry.from.y) * dy) / Math.max(dx * dx + dy * dy, 1)));
    const distance = Math.hypot(x - (geometry.from.x + ratio * dx), y - (geometry.from.y + ratio * dy));
    return distance <= tolerance ? 0 : -1;
  },
};

chart.registerDrawingTool(rayTool);
chart.addDrawing("ray", {
  points: [
    { time: candles[5].time, price: candles[5].close },
    { time: candles[20].time, price: candles[20].close },
  ],
});
```

New application integrations can scope the registration to a plugin:

```ts
chart.installPlugin({
  metadata: { id: "example.ray", name: "Ray Tool", version: "1.0.0", apiVersion: 1 },
  setup(context) {
    context.drawings.register(rayTool);
  },
});
chart.addDrawing("ray", { points: [
  { time: candles[5]!.time, price: candles[5]!.close },
  { time: candles[20]!.time, price: candles[20]!.close },
] });
```

`getGeometry` must only return the versioned `line`, `rectangle`, or `text`
primitives. `hitTest` receives CSS-pixel coordinates and should use the
provided tolerance. Tool definitions should validate finite, non-negative
timestamps and finite prices when those are part of their contract.

The engine rejects duplicate tool names, unknown drawing types, invalid point
counts, and invalid serialized documents. Keep custom definitions deterministic
so the same document renders identically after restore. The plugin SDK does
not expose raw Canvas2D; use the controlled overlay contract for lightweight
custom visuals.
