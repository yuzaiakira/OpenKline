import assert from "node:assert/strict";
import test from "node:test";
import {
  DrawingEngine,
  applyScopedDrawingStyle,
  applyScopedDrawingZIndex,
  isStudioDrawingColorValue,
  resolveStudioDrawingLayerZIndex,
  resolveStudioDrawingPropertyCapabilities,
  studioDrawingSupportsStyleField,
  toStudioDrawingColorInput,
  type ScopedDrawingChart,
} from "../src/index.js";

test("drawing property capabilities expose fill and text only where the engine uses them", () => {
  assert.equal(resolveStudioDrawingPropertyCapabilities("trend-line").fillColor, false);
  assert.equal(resolveStudioDrawingPropertyCapabilities("trend-line").textColor, false);
  assert.equal(resolveStudioDrawingPropertyCapabilities("rectangle").fillColor, true);
  assert.equal(resolveStudioDrawingPropertyCapabilities("rectangle").textColor, false);
  assert.equal(resolveStudioDrawingPropertyCapabilities("text").textColor, true);
  assert.equal(resolveStudioDrawingPropertyCapabilities("text").fillColor, false);
  assert.equal(resolveStudioDrawingPropertyCapabilities("long-position").fillColor, true);
  assert.equal(resolveStudioDrawingPropertyCapabilities("long-position").textColor, true);
  assert.equal(resolveStudioDrawingPropertyCapabilities("fibonacci-retracement").textColor, true);
  assert.equal(studioDrawingSupportsStyleField("price-range", "fillColor"), true);
  assert.equal(studioDrawingSupportsStyleField("horizontal-line", "fillColor"), false);
});

test("studio color helpers normalize hex inputs for color controls", () => {
  assert.equal(toStudioDrawingColorInput("#Ef4444"), "#ef4444");
  assert.equal(toStudioDrawingColorInput("#22c55e33"), "#22c55e");
  assert.equal(toStudioDrawingColorInput("#abc"), "#aabbcc");
  assert.equal(toStudioDrawingColorInput("not-a-color"), "#60a5fa");
  assert.equal(isStudioDrawingColorValue("#112233"), true);
  assert.equal(isStudioDrawingColorValue("#11223344"), false);
  assert.equal(isStudioDrawingColorValue("red"), false);
});

test("layer actions compute real zIndex values and refuse locked or no-op moves", () => {
  const drawings = [
    { id: "a", zIndex: 0 },
    { id: "b", zIndex: 1 },
    { id: "c", zIndex: 2, locked: true },
  ];
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "a", "bring-forward"), 1);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "a", "bring-to-front"), 3);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "b", "send-backward"), 0);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "b", "send-to-back"), -1);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "b", "bring-to-front"), 3);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "a", "send-backward"), null);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "c", "bring-forward"), null);
  assert.equal(resolveStudioDrawingLayerZIndex(drawings, "missing", "bring-forward"), null);
});

test("fill and text style patches merge without clearing unrelated fields", () => {
  const engine = new DrawingEngine();
  const rectangle = engine.create("rectangle", {
    points: [{ time: 10, price: 20 }, { time: 40, price: 60 }],
    style: { color: "#fbbf24", fillColor: "#fbbf2433", lineWidth: 2 },
  });
  engine.setStyle(rectangle.id, { fillColor: "#ef4444" });
  assert.equal(engine.get(rectangle.id).style.fillColor, "#ef4444");
  assert.equal(engine.get(rectangle.id).style.color, "#fbbf24");
  assert.equal(engine.get(rectangle.id).style.lineWidth, 2);

  const note = engine.create("text", {
    points: [{ time: 20, price: 50 }],
    text: "note",
    style: { color: "#38bdf8", textColor: "#e2e8f0" },
  });
  engine.setStyle(note.id, { textColor: "#22c55e" });
  assert.equal(engine.get(note.id).style.textColor, "#22c55e");
  assert.equal(engine.get(note.id).style.color, "#38bdf8");
});

test("layer reordering updates engine order and survives serialize/restore", () => {
  const engine = new DrawingEngine();
  const back = engine.create("trend-line", {
    id: "back",
    points: [{ time: 10, price: 20 }, { time: 40, price: 40 }],
    zIndex: 0,
  });
  const front = engine.create("rectangle", {
    id: "front",
    points: [{ time: 15, price: 25 }, { time: 45, price: 55 }],
    style: { fillColor: "#123456" },
    zIndex: 1,
  });
  assert.deepEqual(engine.getAll().map((drawing) => drawing.id), ["back", "front"]);
  const next = resolveStudioDrawingLayerZIndex(
    engine.getAll().map((drawing) => ({
      id: drawing.id,
      zIndex: drawing.zIndex,
      ...(drawing.style.locked === true ? { locked: true as const } : {}),
    })),
    back.id,
    "bring-to-front",
  );
  assert.equal(next, 2);
  engine.setZIndex(back.id, next!);
  assert.deepEqual(engine.getAll().map((drawing) => drawing.id), ["front", "back"]);
  const document = engine.serialize();
  engine.restore({ version: 1, drawings: [] });
  engine.restore(document);
  assert.deepEqual(engine.getAll().map((drawing) => ({ id: drawing.id, zIndex: drawing.zIndex })), [
    { id: "front", zIndex: 1 },
    { id: "back", zIndex: 2 },
  ]);
  assert.equal(engine.get(front.id).style.fillColor, "#123456");
});

test("scoped zIndex mutations stay panel-local and reject stale panels", () => {
  function mockChart(initial: { id: string; zIndex: number; selected?: boolean }): ScopedDrawingChart & {
    readonly state: { drawings: Array<{ id: string; zIndex: number }>; selectedDrawingId: string | null; lastZIndex: number | null };
  } {
    const state = {
      drawings: [{ id: initial.id, zIndex: initial.zIndex }],
      selectedDrawingId: initial.selected === false ? null : initial.id,
      lastZIndex: null as number | null,
    };
    return {
      state,
      getDrawings: () => state.drawings.map((drawing) => ({ id: drawing.id, zIndex: drawing.zIndex })),
      getSelectedDrawingId: () => state.selectedDrawingId,
      setDrawingStyle: () => undefined,
      setDrawingZIndex: (id, zIndex) => {
        const drawing = state.drawings.find((item) => item.id === id);
        if (drawing === undefined) throw new Error(`missing ${id}`);
        drawing.zIndex = zIndex;
        state.lastZIndex = zIndex;
      },
      selectDrawing: (id) => {
        state.selectedDrawingId = id;
      },
    };
  }

  const panelA = mockChart({ id: "drawing-1", zIndex: 0 });
  const panelB = mockChart({ id: "drawing-1", zIndex: 5 });
  const charts = new Map<string, ScopedDrawingChart>([
    ["chart-1", panelA],
    ["chart-2", panelB],
  ]);

  const applied = applyScopedDrawingZIndex({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    drawingId: "drawing-1",
    zIndex: 9,
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.equal(applied.ok, true);
  assert.equal(panelA.state.drawings[0]?.zIndex, 9);
  assert.equal(panelB.state.drawings[0]?.zIndex, 5);

  const stale = applyScopedDrawingZIndex({
    activePanelId: "chart-2",
    targetPanelId: "chart-1",
    drawingId: "drawing-1",
    zIndex: 11,
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.deepEqual(stale, { ok: false, reason: "stale-panel" });
  assert.equal(panelA.state.drawings[0]?.zIndex, 9);

  const fill = applyScopedDrawingStyle({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    drawingId: "drawing-1",
    patch: { fillColor: "#ef4444" },
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.equal(fill.ok, true);
});
