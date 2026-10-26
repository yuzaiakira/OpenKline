import assert from "node:assert/strict";
import test from "node:test";
import {
  builtInDrawingTools,
  DrawingEngine,
  DrawingLifecycleError,
  DrawingValidationError,
} from "../src/index.js";
import type { DrawingToolDefinition } from "../src/index.js";

const converter = {
  xForTime: (time: number) => time,
  yForPrice: (price: number) => 100 - price,
  timeForX: (x: number) => x,
  priceForY: (y: number) => 100 - y,
};
const bounds = { left: 0, right: 100, top: 0, bottom: 100 };

test("built-in drawings validate anchors and expose geometry/hit testing", () => {
  const engine = new DrawingEngine();
  const horizontal = engine.create("horizontal-line", { points: [{ time: 10, price: 50 }] });
  const trend = engine.create("trend-line", { points: [{ time: 10, price: 20 }, { time: 90, price: 80 }] });
  const rectangle = engine.create("rectangle", { points: [{ time: 20, price: 20 }, { time: 80, price: 80 }], style: { fillColor: "#123456" } });
  const fibonacci = engine.create("fibonacci-retracement", { points: [{ time: 10, price: 20 }, { time: 90, price: 80 }] });
  const text = engine.create("text", { points: [{ time: 40, price: 50 }], text: "support" });

  assert.equal(engine.getAll().length, 5);
  assert.equal(engine.hitTest(0, 50, converter, bounds)?.id, horizontal.id);
  assert.equal(engine.get(trend.id).points.length, 2);
  assert.equal(engine.get(rectangle.id).style.fillColor, "#123456");
  assert.equal(builtInDrawingTools.find((tool) => tool.type === "fibonacci-retracement")?.getGeometry(engine.get(fibonacci.id), converter, bounds).length, 7);
  assert.equal(engine.get(text.id).text, "support");
});

test("professional drawing tools reuse geometry, hit testing, and validation contracts", () => {
  const engine = new DrawingEngine();
  const ray = engine.create("ray", { points: [{ time: 10, price: 20 }, { time: 20, price: 30 }] });
  const extended = engine.create("extended-line", { points: [{ time: 10, price: 20 }, { time: 20, price: 30 }] });
  const channel = engine.create("parallel-channel", { points: [{ time: 10, price: 20 }, { time: 40, price: 40 }, { time: 10, price: 30 }] });
  const extension = engine.create("fibonacci-extension", { points: [{ time: 10, price: 20 }, { time: 40, price: 40 }, { time: 60, price: 30 }] });
  const priceRange = engine.create("price-range", { points: [{ time: 20, price: 20 }, { time: 60, price: 40 }] });
  const dateRange = engine.create("date-range", { points: [{ time: 20, price: 20 }, { time: 60, price: 40 }] });
  const long = engine.create("long-position", { points: [{ time: 30, price: 50 }, { time: 35, price: 45 }, { time: 70, price: 65 }], style: { fillColor: "#22c55e33" } });
  const short = engine.create("short-position", { points: [{ time: 30, price: 50 }, { time: 35, price: 55 }, { time: 70, price: 35 }] });

  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === ray.id)?.geometries.length, 1);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === extended.id)?.geometries.length, 1);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === channel.id)?.geometries.length, 2);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === extension.id)?.geometries.length, 6);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === priceRange.id)?.geometries.length, 2);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === dateRange.id)?.geometries.length, 2);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === long.id)?.geometries.length, 5);
  assert.equal(engine.getRenderItems(converter, bounds).find((item) => item.snapshot.id === short.id)?.geometries.length, 5);
  assert.ok(engine.getTool("ray").hitTest(engine.get(ray.id), 50, 40, converter, bounds, 1) >= 0);
  assert.throws(() => engine.create("long-position", { points: [{ time: 30, price: 50 }, { time: 35, price: 55 }, { time: 70, price: 65 }] }), DrawingValidationError);
  assert.throws(() => engine.create("parallel-channel", { points: [{ time: 10, price: 20 }, { time: 10, price: 20 }, { time: 10, price: 30 }] }), DrawingValidationError);
});

test("drawings support locked editing, undo/redo, and versioned round trips", () => {
  const engine = new DrawingEngine();
  const line = engine.create("horizontal-line", { points: [{ time: 10, price: 50 }] });
  line.setLocked(true);
  line.setPoints([{ time: 20, price: 70 }]);
  assert.deepEqual(line.getSnapshot().points, [{ time: 10, price: 50 }]);
  engine.remove(line.id);
  assert.equal(engine.getAll().length, 0);
  assert.equal(engine.undo(), true);
  assert.equal(engine.getAll().length, 1);
  assert.equal(engine.redo(), true);
  assert.equal(engine.getAll().length, 0);

  const second = engine.create("vertical-line", { points: [{ time: 33, price: 10 }] });
  const editable = engine.create("trend-line", { points: [{ time: 20, price: 20 }, { time: 80, price: 80 }] });
  engine.movePoint(editable.id, 1, { time: 90, price: 90 });
  assert.equal(engine.get(editable.id).points[1]?.time, 90);
  const note = engine.create("text", { points: [{ time: 40, price: 50 }], text: "old" });
  note.setText("new");
  note.setZIndex(10);
  assert.equal(engine.get(note.id).text, "new");
  assert.equal(engine.getAll().at(-1)?.id, note.id);
  const serialized = engine.serialize();
  engine.restore({ version: 1, drawings: [] });
  assert.equal(engine.getAll().length, 0);
  engine.restore(serialized);
  assert.equal(engine.get(second.id).points[0]?.time, 33);
  assert.throws(() => engine.restore({ version: 2, drawings: [] }), DrawingValidationError);
  engine.dispose();
  assert.throws(() => engine.getAll(), DrawingLifecycleError);
});

test("custom drawing tools use the same registration contract", () => {
  const custom: DrawingToolDefinition = {
    type: "custom-ray",
    minPoints: 2,
    maxPoints: 2,
    validate: (snapshot) => {
      if (snapshot.points.length !== 2) throw new DrawingValidationError("ray requires two points");
    },
    getGeometry: (snapshot, converter) => [{
      kind: "line",
      from: { x: converter.xForTime(snapshot.points[0]!.time), y: converter.yForPrice(snapshot.points[0]!.price) },
      to: { x: 200, y: converter.yForPrice(snapshot.points[1]!.price) },
    }],
    hitTest: () => 0,
  };
  const engine = new DrawingEngine();
  engine.registerTool(custom);
  const drawing = engine.create("custom-ray", { points: [{ time: 1, price: 10 }, { time: 2, price: 20 }] });
  assert.equal(drawing.type, "custom-ray");
  assert.equal(engine.unregisterTool("custom-ray"), true);
  assert.throws(() => engine.create("custom-ray", { points: [{ time: 1, price: 10 }, { time: 2, price: 20 }] }), /Unknown drawing tool/);
});
