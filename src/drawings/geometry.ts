import { DrawingValidationError, type DrawingCoordinateConverter, type DrawingSnapshot, type DrawingToolDefinition } from "./types.js";

export const horizontalLineTool: DrawingToolDefinition = {
  type: "horizontal-line",
  minPoints: 1,
  maxPoints: 1,
  validate: requirePoints(1),
  getGeometry: (snapshot, converter, bounds) => [{ kind: "line", from: { x: bounds.left, y: converter.yForPrice(snapshot.points[0]!.price) }, to: { x: bounds.right, y: converter.yForPrice(snapshot.points[0]!.price) } }],
  hitTest: (snapshot, _x, y, converter, _bounds, tolerance) => Math.abs(y - converter.yForPrice(snapshot.points[0]!.price)) <= tolerance ? 0 : -1,
};

export const verticalLineTool: DrawingToolDefinition = {
  type: "vertical-line",
  minPoints: 1,
  maxPoints: 1,
  validate: requirePoints(1),
  getGeometry: (snapshot, converter, bounds) => [{ kind: "line", from: { x: converter.xForTime(snapshot.points[0]!.time), y: bounds.top }, to: { x: converter.xForTime(snapshot.points[0]!.time), y: bounds.bottom } }],
  hitTest: (snapshot, x, _y, converter, _bounds, tolerance) => Math.abs(x - converter.xForTime(snapshot.points[0]!.time)) <= tolerance ? 0 : -1,
};

export const trendLineTool: DrawingToolDefinition = {
  type: "trend-line",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter) => [{ kind: "line", from: screenPoint(snapshot.points[0]!, converter), to: screenPoint(snapshot.points[1]!, converter) }],
  hitTest: (snapshot, x, y, converter, _bounds, tolerance) => segmentDistance(x, y, screenPoint(snapshot.points[0]!, converter), screenPoint(snapshot.points[1]!, converter)) <= tolerance ? nearestPointIndex(snapshot, x, y, converter) : -1,
};

export const rectangleTool: DrawingToolDefinition = {
  type: "rectangle",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter) => {
    const first = screenPoint(snapshot.points[0]!, converter);
    const second = screenPoint(snapshot.points[1]!, converter);
    return [{ kind: "rectangle", left: Math.min(first.x, second.x), top: Math.min(first.y, second.y), width: Math.abs(second.x - first.x), height: Math.abs(second.y - first.y) }];
  },
  hitTest: (snapshot, x, y, converter, _bounds, tolerance) => {
    const geometry = rectangleTool.getGeometry(snapshot, converter, { left: 0, right: 0, top: 0, bottom: 0 })[0];
    if (geometry?.kind !== "rectangle") return -1;
    const nearHorizontal = (Math.abs(y - geometry.top) <= tolerance || Math.abs(y - (geometry.top + geometry.height)) <= tolerance) && x >= geometry.left - tolerance && x <= geometry.left + geometry.width + tolerance;
    const nearVertical = (Math.abs(x - geometry.left) <= tolerance || Math.abs(x - (geometry.left + geometry.width)) <= tolerance) && y >= geometry.top - tolerance && y <= geometry.top + geometry.height + tolerance;
    return nearHorizontal || nearVertical ? nearestPointIndex(snapshot, x, y, converter) : -1;
  },
};

export const fibonacciRetracementTool: DrawingToolDefinition = {
  type: "fibonacci-retracement",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter, bounds) => {
    const first = snapshot.points[0]!;
    const second = snapshot.points[1]!;
    const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    return levels.map((level) => {
      const price = first.price + (second.price - first.price) * level;
      return { kind: "line", from: { x: converter.xForTime(first.time), y: converter.yForPrice(price) }, to: { x: bounds.right, y: converter.yForPrice(price) }, label: `${(level * 100).toFixed(1)}%` };
    });
  },
  hitTest: (snapshot, x, y, converter, bounds, tolerance) => fibonacciRetracementTool.getGeometry(snapshot, converter, bounds).some((geometry) => geometry.kind === "line" && segmentDistance(x, y, geometry.from, geometry.to) <= tolerance) ? 0 : -1,
};

export const textTool: DrawingToolDefinition = {
  type: "text",
  minPoints: 1,
  maxPoints: 1,
  validate: (snapshot) => {
    requirePoints(1)(snapshot);
    if (snapshot.text === undefined || snapshot.text.trim() === "") throw new DrawingValidationError("Text drawing requires non-empty text");
  },
  getGeometry: (snapshot, converter) => [{ kind: "text", x: converter.xForTime(snapshot.points[0]!.time), y: converter.yForPrice(snapshot.points[0]!.price), text: snapshot.text ?? "" }],
  hitTest: (snapshot, x, y, converter, _bounds, tolerance) => {
    const point = snapshot.points[0]!;
    return Math.hypot(x - converter.xForTime(point.time), y - converter.yForPrice(point.price)) <= 32 + tolerance ? 0 : -1;
  },
};

export const builtInDrawingTools: readonly DrawingToolDefinition[] = [horizontalLineTool, verticalLineTool, trendLineTool, rectangleTool, fibonacciRetracementTool, textTool];

function requirePoints(count: number): (snapshot: DrawingSnapshot) => void {
  return (snapshot) => {
    if (snapshot.points.length !== count) throw new DrawingValidationError(`${snapshot.type} requires exactly ${count} point(s)`);
    for (const point of snapshot.points) {
      if (!Number.isInteger(point.time) || point.time < 0 || !Number.isFinite(point.price)) throw new DrawingValidationError("Drawing anchors require a valid time and finite price");
    }
  };
}

function screenPoint(point: { time: number; price: number }, converter: DrawingCoordinateConverter): { x: number; y: number } {
  return { x: converter.xForTime(point.time), y: converter.yForPrice(point.price) };
}

function nearestPointIndex(snapshot: DrawingSnapshot, x: number, y: number, converter: DrawingCoordinateConverter): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  snapshot.points.forEach((point, index) => {
    const next = Math.hypot(x - converter.xForTime(point.time), y - converter.yForPrice(point.price));
    if (next < distance) { distance = next; best = index; }
  });
  return best;
}

function segmentDistance(x: number, y: number, from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return Math.hypot(x - from.x, y - from.y);
  const ratio = Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - (from.x + ratio * dx), y - (from.y + ratio * dy));
}
