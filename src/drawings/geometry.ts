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

export const rayTool: DrawingToolDefinition = {
  type: "ray",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter, bounds) => {
    const first = screenPoint(snapshot.points[0]!, converter);
    const second = screenPoint(snapshot.points[1]!, converter);
    const line = clipLine(first, second, bounds, 0, Number.POSITIVE_INFINITY);
    return line === null ? [] : [{ kind: "line", from: line.from, to: line.to }];
  },
  hitTest: (snapshot, x, y, converter, bounds, tolerance) => lineHit(snapshot, x, y, converter, bounds, tolerance, 0, Number.POSITIVE_INFINITY),
};

export const extendedLineTool: DrawingToolDefinition = {
  type: "extended-line",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter, bounds) => {
    const line = clipLine(screenPoint(snapshot.points[0]!, converter), screenPoint(snapshot.points[1]!, converter), bounds, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    return line === null ? [] : [{ kind: "line", from: line.from, to: line.to }];
  },
  hitTest: (snapshot, x, y, converter, bounds, tolerance) => lineHit(snapshot, x, y, converter, bounds, tolerance, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY),
};

export const parallelChannelTool: DrawingToolDefinition = {
  type: "parallel-channel",
  minPoints: 3,
  maxPoints: 3,
  validate: (snapshot) => {
    requirePoints(3)(snapshot);
    const first = snapshot.points[0]!;
    const second = snapshot.points[1]!;
    const third = snapshot.points[2]!;
    if (first.time === second.time && first.price === second.price) throw new DrawingValidationError("Parallel channel baseline requires two distinct points");
    if (first.time === third.time && first.price === third.price) throw new DrawingValidationError("Parallel channel offset requires a distinct point");
  },
  getGeometry: (snapshot, converter, bounds) => {
    const first = screenPoint(snapshot.points[0]!, converter);
    const second = screenPoint(snapshot.points[1]!, converter);
    const third = screenPoint(snapshot.points[2]!, converter);
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return [];
    const normalX = -dy / length;
    const normalY = dx / length;
    const offset = (third.x - first.x) * normalX + (third.y - first.y) * normalY;
    const parallelStart = { x: first.x + normalX * offset, y: first.y + normalY * offset };
    const baseline = clipLine(first, second, bounds, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    const parallel = clipLine(parallelStart, { x: parallelStart.x + dx, y: parallelStart.y + dy }, bounds, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY);
    return [baseline, parallel].filter((line): line is { kind: "line"; from: { x: number; y: number }; to: { x: number; y: number } } => line !== null).map((line) => ({ kind: "line", from: line.from, to: line.to }));
  },
  hitTest: (snapshot, x, y, converter, bounds, tolerance) => parallelChannelTool.getGeometry(snapshot, converter, bounds).some((geometry) => geometry.kind === "line" && segmentDistance(x, y, geometry.from, geometry.to) <= tolerance) ? 0 : -1,
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

export const fibonacciExtensionTool: DrawingToolDefinition = {
  type: "fibonacci-extension",
  minPoints: 3,
  maxPoints: 3,
  validate: requirePoints(3),
  getGeometry: (snapshot, converter, bounds) => {
    const start = snapshot.points[0]!;
    const end = snapshot.points[1]!;
    const retracement = snapshot.points[2]!;
    const levels = [0, 0.618, 1, 1.272, 1.618, 2.618];
    return levels.map((level) => {
      const price = retracement.price + (end.price - start.price) * level;
      return { kind: "line", from: { x: converter.xForTime(retracement.time), y: converter.yForPrice(price) }, to: { x: bounds.right, y: converter.yForPrice(price) }, label: `${(level * 100).toFixed(1)}%` };
    });
  },
  hitTest: (snapshot, x, y, converter, bounds, tolerance) => fibonacciExtensionTool.getGeometry(snapshot, converter, bounds).some((geometry) => geometry.kind === "line" && segmentDistance(x, y, geometry.from, geometry.to) <= tolerance) ? 0 : -1,
};

export const priceRangeTool: DrawingToolDefinition = {
  type: "price-range",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter) => {
    const first = screenPoint(snapshot.points[0]!, converter);
    const second = screenPoint(snapshot.points[1]!, converter);
    const start = snapshot.points[0]!;
    const end = snapshot.points[1]!;
    const change = end.price - start.price;
    const percent = start.price === 0 ? "n/a" : `${(change / start.price * 100).toFixed(2)}%`;
    return [
      { kind: "rectangle", left: Math.min(first.x, second.x), top: Math.min(first.y, second.y), width: Math.abs(second.x - first.x), height: Math.abs(second.y - first.y) },
      { kind: "text", x: Math.min(first.x, second.x) + 4, y: Math.min(first.y, second.y) + 4, text: `${change >= 0 ? "+" : ""}${change.toFixed(2)} (${percent})` },
    ];
  },
  hitTest: (snapshot, x, y, converter, _bounds, tolerance) => rectangleHit(snapshot, x, y, converter, tolerance),
};

export const dateRangeTool: DrawingToolDefinition = {
  type: "date-range",
  minPoints: 2,
  maxPoints: 2,
  validate: requirePoints(2),
  getGeometry: (snapshot, converter, bounds) => {
    const first = screenPoint(snapshot.points[0]!, converter);
    const second = screenPoint(snapshot.points[1]!, converter);
    const duration = Math.abs(snapshot.points[1]!.time - snapshot.points[0]!.time);
    return [
      { kind: "rectangle", left: Math.min(first.x, second.x), top: bounds.top, width: Math.abs(second.x - first.x), height: bounds.bottom - bounds.top },
      { kind: "text", x: Math.min(first.x, second.x) + 4, y: bounds.top + 4, text: formatDuration(duration) },
    ];
  },
  hitTest: (snapshot, x, y, converter, bounds, tolerance) => {
    const first = converter.xForTime(snapshot.points[0]!.time);
    const second = converter.xForTime(snapshot.points[1]!.time);
    const left = Math.min(first, second);
    const right = Math.max(first, second);
    return (Math.abs(x - left) <= tolerance || Math.abs(x - right) <= tolerance) && y >= bounds.top - tolerance && y <= bounds.bottom + tolerance ? 0 : -1;
  },
};

export const longPositionTool = createPositionTool("long-position");
export const shortPositionTool = createPositionTool("short-position");

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

export const builtInDrawingTools: readonly DrawingToolDefinition[] = [
  horizontalLineTool,
  verticalLineTool,
  trendLineTool,
  rayTool,
  extendedLineTool,
  parallelChannelTool,
  rectangleTool,
  fibonacciRetracementTool,
  fibonacciExtensionTool,
  priceRangeTool,
  dateRangeTool,
  longPositionTool,
  shortPositionTool,
  textTool,
];

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

function lineHit(snapshot: DrawingSnapshot, x: number, y: number, converter: DrawingCoordinateConverter, bounds: { left: number; right: number; top: number; bottom: number }, tolerance: number, minT: number, maxT: number): number {
  const line = clipLine(screenPoint(snapshot.points[0]!, converter), screenPoint(snapshot.points[1]!, converter), bounds, minT, maxT);
  return line !== null && segmentDistance(x, y, line.from, line.to) <= tolerance ? nearestPointIndex(snapshot, x, y, converter) : -1;
}

function rectangleHit(snapshot: DrawingSnapshot, x: number, y: number, converter: DrawingCoordinateConverter, tolerance: number): number {
  const geometry = rectangleTool.getGeometry(snapshot, converter, { left: 0, right: 0, top: 0, bottom: 0 })[0];
  if (geometry?.kind !== "rectangle") return -1;
  const nearHorizontal = (Math.abs(y - geometry.top) <= tolerance || Math.abs(y - (geometry.top + geometry.height)) <= tolerance) && x >= geometry.left - tolerance && x <= geometry.left + geometry.width + tolerance;
  const nearVertical = (Math.abs(x - geometry.left) <= tolerance || Math.abs(x - (geometry.left + geometry.width)) <= tolerance) && y >= geometry.top - tolerance && y <= geometry.top + geometry.height + tolerance;
  return nearHorizontal || nearVertical ? nearestPointIndex(snapshot, x, y, converter) : -1;
}

function clipLine(from: { x: number; y: number }, to: { x: number; y: number }, bounds: { left: number; right: number; top: number; bottom: number }, minT: number, maxT: number): { from: { x: number; y: number }; to: { x: number; y: number } } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  let lower = minT;
  let upper = maxT;
  const constraints: Array<[number, number]> = [
    [-dx, from.x - bounds.left],
    [dx, bounds.right - from.x],
    [-dy, from.y - bounds.top],
    [dy, bounds.bottom - from.y],
  ];
  for (const [coefficient, constant] of constraints) {
    if (coefficient === 0) {
      if (constant < 0) return null;
      continue;
    }
    const value = constant / coefficient;
    if (coefficient < 0) lower = Math.max(lower, value);
    else upper = Math.min(upper, value);
  }
  if (lower > upper || !Number.isFinite(lower) || !Number.isFinite(upper)) return null;
  return { from: { x: from.x + dx * lower, y: from.y + dy * lower }, to: { x: from.x + dx * upper, y: from.y + dy * upper } };
}

function createPositionTool(type: "long-position" | "short-position"): DrawingToolDefinition {
  return {
    type,
    minPoints: 3,
    maxPoints: 3,
    validate: (snapshot) => {
      requirePoints(3)(snapshot);
      const entry = snapshot.points[0]!.price;
      const stop = snapshot.points[1]!.price;
      const target = snapshot.points[2]!.price;
      const valid = type === "long-position" ? stop < entry && entry < target : target < entry && entry < stop;
      if (!valid) throw new DrawingValidationError(`${type} requires entry, stop, and target levels in trading order`);
    },
    getGeometry: (snapshot, converter, bounds) => {
      const entry = snapshot.points[0]!;
      const stop = snapshot.points[1]!;
      const target = snapshot.points[2]!;
      const entryX = converter.xForTime(entry.time);
      const endX = Math.max(entryX, converter.xForTime(target.time));
      const left = Math.min(entryX, endX);
      const width = Math.max(1, endX - left);
      const entryY = converter.yForPrice(entry.price);
      const stopY = converter.yForPrice(stop.price);
      const targetY = converter.yForPrice(target.price);
      const riskTop = Math.min(entryY, stopY);
      const rewardTop = Math.min(entryY, targetY);
      const riskHeight = Math.abs(entryY - stopY);
      const rewardHeight = Math.abs(entryY - targetY);
      const risk = Math.abs(entry.price - stop.price);
      const reward = Math.abs(target.price - entry.price);
      const ratio = risk === 0 ? "n/a" : (reward / risk).toFixed(2);
      return [
        { kind: "rectangle", left, top: riskTop, width, height: Math.max(1, riskHeight) },
        { kind: "rectangle", left, top: rewardTop, width, height: Math.max(1, rewardHeight) },
        { kind: "line", from: { x: left, y: entryY }, to: { x: Math.min(bounds.right, left + width), y: entryY }, label: `Entry ${entry.price.toFixed(2)}` },
        { kind: "line", from: { x: left, y: stopY }, to: { x: Math.min(bounds.right, left + width), y: stopY }, label: `Stop ${stop.price.toFixed(2)}` },
        { kind: "line", from: { x: left, y: targetY }, to: { x: Math.min(bounds.right, left + width), y: targetY }, label: `Target ${target.price.toFixed(2)} · R:R ${ratio}` },
      ];
    },
    hitTest: (snapshot, x, y, converter, bounds, tolerance) => {
      const geometries = createPositionToolGeometry(snapshot, converter, bounds);
      return geometries.some((geometry) => geometry.kind === "line" && segmentDistance(x, y, geometry.from, geometry.to) <= tolerance) || geometries.some((geometry) => geometry.kind === "rectangle" && rectangleBorderDistance(x, y, geometry) <= tolerance) ? 0 : -1;
    },
  };
}

function createPositionToolGeometry(snapshot: DrawingSnapshot, converter: DrawingCoordinateConverter, bounds: { left: number; right: number; top: number; bottom: number }): readonly import("./types.js").DrawingGeometry[] {
  const entry = snapshot.points[0]!;
  const stop = snapshot.points[1]!;
  const target = snapshot.points[2]!;
  const left = Math.min(converter.xForTime(entry.time), converter.xForTime(target.time));
  const right = Math.max(left + 1, converter.xForTime(target.time));
  const entryY = converter.yForPrice(entry.price);
  const stopY = converter.yForPrice(stop.price);
  const targetY = converter.yForPrice(target.price);
  const riskTop = Math.min(entryY, stopY);
  const rewardTop = Math.min(entryY, targetY);
  return [
    { kind: "rectangle", left, top: riskTop, width: right - left, height: Math.max(1, Math.abs(entryY - stopY)) },
    { kind: "rectangle", left, top: rewardTop, width: right - left, height: Math.max(1, Math.abs(entryY - targetY)) },
    { kind: "line", from: { x: left, y: entryY }, to: { x: Math.min(bounds.right, right), y: entryY } },
    { kind: "line", from: { x: left, y: stopY }, to: { x: Math.min(bounds.right, right), y: stopY } },
    { kind: "line", from: { x: left, y: targetY }, to: { x: Math.min(bounds.right, right), y: targetY } },
  ];
}

function rectangleBorderDistance(x: number, y: number, rectangle: { left: number; top: number; width: number; height: number }): number {
  const right = rectangle.left + rectangle.width;
  const bottom = rectangle.top + rectangle.height;
  const horizontal = Math.min(Math.abs(y - rectangle.top), Math.abs(y - bottom)) + Math.max(rectangle.left - x, 0) + Math.max(x - right, 0);
  const vertical = Math.min(Math.abs(x - rectangle.left), Math.abs(x - right)) + Math.max(rectangle.top - y, 0) + Math.max(y - bottom, 0);
  return Math.min(horizontal, vertical);
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
