/**
 * Studio Drawing Properties capability helpers.
 *
 * Controls are derived from actual DrawingEngine / CanvasRenderer contracts:
 * stroke fields apply to all drawings; fillColor only affects rectangle
 * geometries; textColor affects text geometries and line labels; zIndex is a
 * document-level ordering field (not a CSS hack).
 */

export type StudioDrawingStyleField = "color" | "fillColor" | "textColor" | "lineWidth" | "visible" | "locked";

export type StudioDrawingLayerAction = "bring-forward" | "send-backward" | "bring-to-front" | "send-to-back";

export interface StudioDrawingPropertyCapabilities {
  readonly type: string;
  readonly color: boolean;
  readonly fillColor: boolean;
  readonly textColor: boolean;
  readonly lineWidth: boolean;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly layerOrder: boolean;
}

export interface StudioDrawingLayerCandidate {
  readonly id: string;
  readonly zIndex: number;
  readonly locked?: boolean;
}

const FILL_TYPES = new Set([
  "rectangle",
  "price-range",
  "date-range",
  "long-position",
  "short-position",
]);

const TEXT_COLOR_TYPES = new Set([
  "text",
  "fibonacci-retracement",
  "fibonacci-extension",
  "price-range",
  "date-range",
  "long-position",
  "short-position",
]);

/** Resolve which Drawing Properties controls are meaningful for a tool type. */
export function resolveStudioDrawingPropertyCapabilities(type: string): StudioDrawingPropertyCapabilities {
  return {
    type,
    color: true,
    fillColor: FILL_TYPES.has(type),
    textColor: TEXT_COLOR_TYPES.has(type),
    lineWidth: true,
    visible: true,
    locked: true,
    layerOrder: true,
  };
}

/** True when the style field is supported for the given drawing type. */
export function studioDrawingSupportsStyleField(type: string, field: StudioDrawingStyleField): boolean {
  const capabilities = resolveStudioDrawingPropertyCapabilities(type);
  return capabilities[field] === true;
}

/**
 * Normalize engine color strings for `<input type="color">`.
 * Accepts `#rgb`, `#rrggbb`, and `#rrggbbaa`; falls back when invalid.
 */
export function toStudioDrawingColorInput(value: string | undefined, fallback = "#60a5fa"): string {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return `#${trimmed.slice(1, 7).toLowerCase()}`;
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

/** Validate a committed Studio color input before calling setDrawingStyle. */
export function isStudioDrawingColorValue(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value.trim());
}

/**
 * Compute the next zIndex for a layer action using engine ordering semantics
 * (higher zIndex renders and hit-tests later). Returns null when the action
 * would not change order or the target is missing/locked.
 */
export function resolveStudioDrawingLayerZIndex(
  drawings: readonly StudioDrawingLayerCandidate[],
  drawingId: string,
  action: StudioDrawingLayerAction,
): number | null {
  const ordered = [...drawings].sort((left, right) => {
    if (left.zIndex !== right.zIndex) return left.zIndex - right.zIndex;
    return left.id.localeCompare(right.id);
  });
  const index = ordered.findIndex((drawing) => drawing.id === drawingId);
  if (index < 0) return null;
  const current = ordered[index]!;
  if (current.locked === true) return null;

  if (action === "bring-to-front") {
    if (index === ordered.length - 1) return null;
    const max = ordered[ordered.length - 1]!.zIndex;
    return max + 1;
  }
  if (action === "send-to-back") {
    if (index === 0) return null;
    const min = ordered[0]!.zIndex;
    return min - 1;
  }
  if (action === "bring-forward") {
    const neighbor = ordered[index + 1];
    if (neighbor === undefined) return null;
    if (neighbor.zIndex > current.zIndex) return neighbor.zIndex;
    return current.zIndex + 1;
  }
  const neighbor = ordered[index - 1];
  if (neighbor === undefined) return null;
  if (neighbor.zIndex < current.zIndex) return neighbor.zIndex;
  return current.zIndex - 1;
}

/** Accessible label for a layer action button. */
export function studioDrawingLayerActionLabel(action: StudioDrawingLayerAction): string {
  switch (action) {
    case "bring-forward":
      return "Bring drawing forward";
    case "send-backward":
      return "Send drawing backward";
    case "bring-to-front":
      return "Bring drawing to front";
    case "send-to-back":
      return "Send drawing to back";
  }
}
