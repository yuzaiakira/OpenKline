import { builtInDrawingTools } from "./geometry.js";
import {
  DrawingLifecycleError,
  DrawingValidationError,
  type DrawingApi,
  type DrawingCoordinateConverter,
  type DrawingDocument,
  type DrawingHit,
  type DrawingOptions,
  type DrawingPoint,
  type DrawingRenderItem,
  type DrawingSnapshot,
  type DrawingStyle,
  type DrawingToolDefinition,
} from "./types.js";

export class DrawingEngine {
  private readonly tools = new Map<string, DrawingToolDefinition>();
  private readonly drawings = new Map<string, DrawingSnapshot>();
  private readonly undoStack: DrawingSnapshot[][] = [];
  private readonly redoStack: DrawingSnapshot[][] = [];
  private nextId = 1;
  private disposed = false;

  public constructor() {
    for (const tool of builtInDrawingTools) this.registerTool(tool);
  }

  public registerTool(tool: DrawingToolDefinition): void {
    this.assertAlive();
    if (this.tools.has(tool.type)) throw new Error(`Drawing tool already registered: ${tool.type}`);
    if (!Number.isInteger(tool.minPoints) || !Number.isInteger(tool.maxPoints) || tool.minPoints < 1 || tool.maxPoints < tool.minPoints) throw new DrawingValidationError(`Invalid point bounds for drawing tool: ${tool.type}`);
    this.tools.set(tool.type, tool);
  }

  public unregisterTool(type: string): boolean {
    this.assertAlive();
    return this.tools.delete(type);
  }

  public getTool(type: string): DrawingToolDefinition {
    this.assertAlive();
    return this.requireTool(type);
  }

  public create(type: string, options: DrawingOptions): DrawingApi {
    this.assertAlive();
    const tool = this.requireTool(type);
    let id = options.id ?? `drawing-${this.nextId++}`;
    while (this.drawings.has(id)) id = `drawing-${this.nextId++}`;
    if (this.drawings.has(id)) throw new Error(`Drawing id already exists: ${id}`);
    const snapshot: DrawingSnapshot = {
      id,
      type,
      points: options.points.map((point) => ({ ...point })),
      style: { ...options.style },
      ...(options.text === undefined ? {} : { text: options.text }),
      zIndex: options.zIndex ?? 0,
    };
    tool.validate(snapshot);
    this.mutate(() => this.drawings.set(id, snapshot));
    return this.api(id);
  }

  public remove(id: string): void {
    this.assertAlive();
    if (!this.drawings.has(id)) throw new Error(`Unknown drawing: ${id}`);
    this.mutate(() => this.drawings.delete(id));
  }

  public get(id: string): DrawingSnapshot {
    this.assertAlive();
    const snapshot = this.drawings.get(id);
    if (snapshot === undefined) throw new Error(`Unknown drawing: ${id}`);
    return cloneSnapshot(snapshot);
  }

  public getAll(): DrawingSnapshot[] {
    this.assertAlive();
    return [...this.drawings.values()].sort((left, right) => left.zIndex - right.zIndex).map(cloneSnapshot);
  }

  public hitTest(x: number, y: number, converter: DrawingCoordinateConverter, bounds: { left: number; right: number; top: number; bottom: number }, tolerance = 6): DrawingHit | null {
    this.assertAlive();
    const candidates = this.getAll().reverse();
    for (const drawing of candidates) {
      if (drawing.style.visible === false) continue;
      const tool = this.requireTool(drawing.type);
      const pointIndex = drawing.points.findIndex((point) => Math.hypot(x - converter.xForTime(point.time), y - converter.yForPrice(point.price)) <= tolerance);
      if (pointIndex >= 0) return { id: drawing.id, pointIndex };
      const geometryHit = tool.hitTest(drawing, x, y, converter, bounds, tolerance);
      if (geometryHit >= 0) return { id: drawing.id, pointIndex: null };
    }
    return null;
  }

  public getRenderItems(converter: DrawingCoordinateConverter, bounds: { left: number; right: number; top: number; bottom: number }): DrawingRenderItem[] {
    this.assertAlive();
    return this.getAll()
      .filter((drawing) => drawing.style.visible !== false)
      .map((snapshot) => ({
        snapshot,
        geometries: this.requireTool(snapshot.type).getGeometry(snapshot, converter, bounds),
      }));
  }

  public setPoints(id: string, points: readonly DrawingPoint[]): void {
    this.assertAlive();
    const current = this.require(id);
    if (current.style.locked === true) return;
    const next = { ...current, points: points.map((point) => ({ ...point })) };
    this.requireTool(current.type).validate(next);
    this.mutate(() => this.drawings.set(id, next));
  }

  public setStyle(id: string, style: DrawingStyle): void {
    this.assertAlive();
    const current = this.require(id);
    this.mutate(() => this.drawings.set(id, { ...current, style: { ...current.style, ...style } }));
  }

  public setVisible(id: string, visible: boolean): void { this.setStyle(id, { visible }); }
  public setLocked(id: string, locked: boolean): void { this.setStyle(id, { locked }); }

  public setText(id: string, text: string): void {
    this.assertAlive();
    const current = this.require(id);
    if (current.style.locked === true) return;
    const next = { ...current, text };
    this.requireTool(current.type).validate(next);
    this.mutate(() => this.drawings.set(id, next));
  }

  public setZIndex(id: string, zIndex: number): void {
    this.assertAlive();
    if (!Number.isFinite(zIndex)) throw new DrawingValidationError("Drawing zIndex must be finite");
    const current = this.require(id);
    if (current.style.locked === true) return;
    this.mutate(() => this.drawings.set(id, { ...current, zIndex }));
  }

  public move(id: string, deltaTime: number, deltaPrice: number): void {
    this.assertAlive();
    const current = this.require(id);
    if (current.style.locked === true) return;
    this.mutate(() => this.drawings.set(id, { ...current, points: current.points.map((point) => ({ time: Math.max(0, Math.round(point.time + deltaTime)), price: point.price + deltaPrice })) }));
  }

  public movePoint(id: string, pointIndex: number, point: { time: number; price: number }): void {
    this.assertAlive();
    const current = this.require(id);
    if (current.style.locked === true) return;
    if (pointIndex < 0 || pointIndex >= current.points.length) throw new RangeError(`Invalid drawing point index: ${pointIndex}`);
    const points = current.points.map((candidate, index) => index === pointIndex ? { time: Math.max(0, Math.round(point.time)), price: point.price } : { ...candidate });
    const next = { ...current, points };
    this.requireTool(current.type).validate(next);
    this.mutate(() => this.drawings.set(id, next));
  }

  public serialize(): DrawingDocument {
    this.assertAlive();
    return { version: 1, drawings: this.getAll() };
  }

  public restore(document: unknown): void {
    this.assertAlive();
    if (!isDocument(document)) throw new DrawingValidationError("Unsupported drawing document version");
    const next = new Map<string, DrawingSnapshot>();
    for (const drawing of document.drawings) {
      if (next.has(drawing.id)) throw new DrawingValidationError(`Duplicate drawing id: ${drawing.id}`);
      this.requireTool(drawing.type).validate(drawing);
      next.set(drawing.id, cloneSnapshot(drawing));
    }
    this.recordHistory();
    this.drawings.clear();
    for (const [id, drawing] of next) this.drawings.set(id, drawing);
    this.redoStack.length = 0;
  }

  public undo(): boolean { return this.restoreHistory(this.undoStack, this.redoStack); }
  public redo(): boolean { return this.restoreHistory(this.redoStack, this.undoStack); }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.drawings.clear();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private api(id: string): DrawingApi {
    return {
      id,
      type: this.get(id).type,
      getSnapshot: () => this.get(id),
      setPoints: (points) => this.setPoints(id, points),
      setStyle: (style) => this.setStyle(id, style),
      setVisible: (visible) => this.setVisible(id, visible),
      setLocked: (locked) => this.setLocked(id, locked),
      setText: (text) => this.setText(id, text),
      setZIndex: (zIndex) => this.setZIndex(id, zIndex),
      remove: () => this.remove(id),
    };
  }

  private mutate(action: () => void): void {
    this.recordHistory();
    action();
    this.redoStack.length = 0;
  }

  private recordHistory(): void {
    this.undoStack.push(this.getAll());
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  private restoreHistory(from: DrawingSnapshot[][], to: DrawingSnapshot[][]): boolean {
    this.assertAlive();
    const previous = from.pop();
    if (previous === undefined) return false;
    to.push(this.getAll());
    this.drawings.clear();
    for (const drawing of previous) this.drawings.set(drawing.id, cloneSnapshot(drawing));
    return true;
  }

  private require(id: string): DrawingSnapshot {
    const drawing = this.drawings.get(id);
    if (drawing === undefined) throw new Error(`Unknown drawing: ${id}`);
    return drawing;
  }

  private requireTool(type: string): DrawingToolDefinition {
    const tool = this.tools.get(type);
    if (tool === undefined) throw new Error(`Unknown drawing tool: ${type}`);
    return tool;
  }

  private assertAlive(): void {
    if (this.disposed) throw new DrawingLifecycleError("Drawing engine has been disposed");
  }
}

function cloneSnapshot(snapshot: DrawingSnapshot): DrawingSnapshot {
  return { ...snapshot, points: snapshot.points.map((point) => ({ ...point })), style: { ...snapshot.style } };
}

function isDocument(value: unknown): value is DrawingDocument {
  if (typeof value !== "object" || value === null || !("version" in value) || !("drawings" in value)) return false;
  return value.version === 1 && Array.isArray(value.drawings) && value.drawings.every(isSnapshot);
}

function isSnapshot(value: unknown): value is DrawingSnapshot {
  if (typeof value !== "object" || value === null) return false;
  if (!("id" in value) || !("type" in value) || !("points" in value) || !("style" in value) || !("zIndex" in value)) return false;
  return typeof value.id === "string"
    && value.id.length > 0
    && typeof value.type === "string"
    && value.type.length > 0
    && typeof value.zIndex === "number"
    && Number.isFinite(value.zIndex)
    && isStyle(value.style)
    && Array.isArray(value.points)
    && value.points.every(isPoint);
}

function isPoint(value: unknown): value is DrawingPoint {
  if (typeof value !== "object" || value === null || !("time" in value) || !("price" in value)) return false;
  const point = value as Record<string, unknown>;
  return typeof point.time === "number"
    && Number.isInteger(point.time)
    && point.time >= 0
    && typeof point.price === "number"
    && Number.isFinite(point.price);
}

function isStyle(value: unknown): value is DrawingStyle {
  if (typeof value !== "object" || value === null) return false;
  const style = value as Record<string, unknown>;
  return (style.color === undefined || typeof style.color === "string")
    && (style.fillColor === undefined || typeof style.fillColor === "string")
    && (style.textColor === undefined || typeof style.textColor === "string")
    && (style.lineWidth === undefined || (typeof style.lineWidth === "number" && Number.isFinite(style.lineWidth)))
    && (style.visible === undefined || typeof style.visible === "boolean")
    && (style.locked === undefined || typeof style.locked === "boolean");
}
