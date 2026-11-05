import type { DrawingStyle } from "../drawings/types.js";

/**
 * Minimal chart surface required to apply a panel-scoped drawing style mutation.
 * Drawings remain chart-local; matching IDs across panels are not shared identity.
 */
export interface ScopedDrawingChart {
  getDrawings(): ReadonlyArray<{ readonly id: string; readonly zIndex?: number; readonly style?: { readonly locked?: boolean } }>;
  getSelectedDrawingId(): string | null;
  setDrawingStyle(id: string, style: DrawingStyle): void;
  setDrawingZIndex?(id: string, zIndex: number): void;
  selectDrawing(id: string | null): void;
}

export type ScopedDrawingMutationFailure =
  | "stale-panel"
  | "missing-chart"
  | "missing-drawing"
  | "selection-mismatch";

export type ScopedDrawingMutationResult =
  | { readonly ok: true; readonly panelId: string; readonly drawingId: string }
  | { readonly ok: false; readonly reason: ScopedDrawingMutationFailure };

export interface ApplyScopedDrawingStyleArgs {
  readonly activePanelId: string;
  readonly targetPanelId: string;
  readonly drawingId: string;
  readonly patch: DrawingStyle;
  readonly getChart: (panelId: string) => ScopedDrawingChart | null;
  /**
   * When true (default), require the target chart's current selection to match
   * `drawingId` so property editors cannot mutate an unselected sibling that
   * happens to share an ID string with another panel's selection.
   */
  readonly requireSelected?: boolean;
}

/**
 * Apply a drawing style patch only when the edit targets the active Studio panel
 * and a live chart-local drawing. Rejects cross-panel stale edits without
 * inventing shared drawing synchronization.
 */
export function applyScopedDrawingStyle(args: ApplyScopedDrawingStyleArgs): ScopedDrawingMutationResult {
  if (args.targetPanelId !== args.activePanelId) {
    return { ok: false, reason: "stale-panel" };
  }
  const chart = args.getChart(args.targetPanelId);
  if (chart === null) {
    return { ok: false, reason: "missing-chart" };
  }
  if (!chart.getDrawings().some((drawing) => drawing.id === args.drawingId)) {
    return { ok: false, reason: "missing-drawing" };
  }
  if ((args.requireSelected ?? true) && chart.getSelectedDrawingId() !== args.drawingId) {
    return { ok: false, reason: "selection-mismatch" };
  }
  chart.setDrawingStyle(args.drawingId, args.patch);
  return { ok: true, panelId: args.targetPanelId, drawingId: args.drawingId };
}

export interface ClearScopedDrawingSelectionArgs {
  readonly activePanelId: string;
  readonly targetPanelId: string;
  readonly getChart: (panelId: string) => ScopedDrawingChart | null;
}

/**
 * Clear drawing selection on the active panel only.
 */
export function clearScopedDrawingSelection(args: ClearScopedDrawingSelectionArgs): ScopedDrawingMutationResult {
  if (args.targetPanelId !== args.activePanelId) {
    return { ok: false, reason: "stale-panel" };
  }
  const chart = args.getChart(args.targetPanelId);
  if (chart === null) {
    return { ok: false, reason: "missing-chart" };
  }
  chart.selectDrawing(null);
  return { ok: true, panelId: args.targetPanelId, drawingId: "" };
}

export interface ApplyScopedDrawingZIndexArgs {
  readonly activePanelId: string;
  readonly targetPanelId: string;
  readonly drawingId: string;
  readonly zIndex: number;
  readonly getChart: (panelId: string) => ScopedDrawingChart | null;
  readonly requireSelected?: boolean;
}

/**
 * Apply a drawing zIndex change only on the active Studio panel.
 * Uses Chart.setDrawingZIndex when available; rejects stale cross-panel edits.
 */
export function applyScopedDrawingZIndex(args: ApplyScopedDrawingZIndexArgs): ScopedDrawingMutationResult {
  if (args.targetPanelId !== args.activePanelId) {
    return { ok: false, reason: "stale-panel" };
  }
  if (!Number.isFinite(args.zIndex)) {
    return { ok: false, reason: "missing-drawing" };
  }
  const chart = args.getChart(args.targetPanelId);
  if (chart === null) {
    return { ok: false, reason: "missing-chart" };
  }
  if (!chart.getDrawings().some((drawing) => drawing.id === args.drawingId)) {
    return { ok: false, reason: "missing-drawing" };
  }
  if ((args.requireSelected ?? true) && chart.getSelectedDrawingId() !== args.drawingId) {
    return { ok: false, reason: "selection-mismatch" };
  }
  if (typeof chart.setDrawingZIndex !== "function") {
    return { ok: false, reason: "missing-chart" };
  }
  chart.setDrawingZIndex(args.drawingId, args.zIndex);
  return { ok: true, panelId: args.targetPanelId, drawingId: args.drawingId };
}
