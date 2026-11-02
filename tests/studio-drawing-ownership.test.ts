import assert from "node:assert/strict";
import test from "node:test";
import {
  applyScopedDrawingStyle,
  clearScopedDrawingSelection,
  type DrawingStyle,
  type ScopedDrawingChart,
} from "../src/index.js";

function mockChart(initial: { id: string; style: DrawingStyle; selected?: boolean }): ScopedDrawingChart & {
  readonly state: { drawings: Array<{ id: string; style: DrawingStyle }>; selectedDrawingId: string | null };
} {
  const state = {
    drawings: [{ id: initial.id, style: { ...initial.style } }],
    selectedDrawingId: initial.selected === false ? null : initial.id,
  };
  return {
    state,
    getDrawings: () => state.drawings.map((drawing) => ({ id: drawing.id })),
    getSelectedDrawingId: () => state.selectedDrawingId,
    setDrawingStyle: (id, style) => {
      const drawing = state.drawings.find((item) => item.id === id);
      if (drawing === undefined) throw new Error(`missing ${id}`);
      drawing.style = { ...drawing.style, ...style };
    },
    selectDrawing: (id) => {
      state.selectedDrawingId = id;
    },
  };
}

test("scoped drawing style mutations stay on the active panel even when IDs collide", () => {
  const panelA = mockChart({ id: "drawing-1", style: { color: "#fbbf24", lineWidth: 2 } });
  const panelB = mockChart({ id: "drawing-1", style: { color: "#38bdf8", lineWidth: 2 } });
  const charts = new Map<string, ScopedDrawingChart>([
    ["chart-1", panelA],
    ["chart-2", panelB],
  ]);

  const applied = applyScopedDrawingStyle({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    drawingId: "drawing-1",
    patch: { color: "#ef4444", lineWidth: 5, locked: true },
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.equal(applied.ok, true);
  assert.equal(panelA.state.drawings[0]?.style.color, "#ef4444");
  assert.equal(panelA.state.drawings[0]?.style.lineWidth, 5);
  assert.equal(panelA.state.drawings[0]?.style.locked, true);
  assert.equal(panelB.state.drawings[0]?.style.color, "#38bdf8");
  assert.equal(panelB.state.drawings[0]?.style.lineWidth, 2);
});

test("scoped drawing style rejects stale panel edits and missing selection", () => {
  const panelA = mockChart({ id: "drawing-1", style: { color: "#fbbf24" } });
  const panelB = mockChart({ id: "drawing-1", style: { color: "#38bdf8" } });
  const charts = new Map<string, ScopedDrawingChart>([
    ["chart-1", panelA],
    ["chart-2", panelB],
  ]);

  const stale = applyScopedDrawingStyle({
    activePanelId: "chart-2",
    targetPanelId: "chart-1",
    drawingId: "drawing-1",
    patch: { color: "#111111" },
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.deepEqual(stale, { ok: false, reason: "stale-panel" });
  assert.equal(panelA.state.drawings[0]?.style.color, "#fbbf24");

  panelB.state.selectedDrawingId = null;
  const mismatch = applyScopedDrawingStyle({
    activePanelId: "chart-2",
    targetPanelId: "chart-2",
    drawingId: "drawing-1",
    patch: { visible: false },
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.deepEqual(mismatch, { ok: false, reason: "selection-mismatch" });
  assert.notEqual(panelB.state.drawings[0]?.style.visible, false);
});

test("clearing scoped selection only affects the active panel", () => {
  const panelA = mockChart({ id: "drawing-1", style: { color: "#fbbf24" } });
  const panelB = mockChart({ id: "drawing-1", style: { color: "#38bdf8" } });
  const charts = new Map<string, ScopedDrawingChart>([
    ["chart-1", panelA],
    ["chart-2", panelB],
  ]);

  const cleared = clearScopedDrawingSelection({
    activePanelId: "chart-1",
    targetPanelId: "chart-1",
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.equal(cleared.ok, true);
  assert.equal(panelA.state.selectedDrawingId, null);
  assert.equal(panelB.state.selectedDrawingId, "drawing-1");

  const stale = clearScopedDrawingSelection({
    activePanelId: "chart-1",
    targetPanelId: "chart-2",
    getChart: (panelId) => charts.get(panelId) ?? null,
  });
  assert.deepEqual(stale, { ok: false, reason: "stale-panel" });
  assert.equal(panelB.state.selectedDrawingId, "drawing-1");
});
