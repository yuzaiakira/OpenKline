import { cancelInteractiveDrawing } from "../internal/drawing-cancellation.js";
import type { DrawingToolDefinition } from "../drawings/types.js";

/** Studio toolbar grouping for supported built-in drawing tools. */
export type StudioDrawingToolGroup = "lines" | "shapes" | "fibonacci" | "measure" | "trade" | "annotate";

/** Catalog entry for the Studio Professional Drawing Toolbar. */
export interface StudioDrawingToolEntry {
  readonly type: string;
  readonly label: string;
  readonly group: StudioDrawingToolGroup;
  readonly minPoints: number;
  readonly maxPoints: number;
  readonly description: string;
}

export interface StudioDrawingToolbarFilter {
  readonly group?: StudioDrawingToolGroup | "all";
  readonly query?: string;
}

const STUDIO_DRAWING_TOOL_META: Readonly<Record<string, { readonly label: string; readonly group: StudioDrawingToolGroup; readonly description: string }>> = {
  "trend-line": { label: "Trend", group: "lines", description: "Two-point trend line." },
  ray: { label: "Ray", group: "lines", description: "Two-point ray extending forward." },
  "extended-line": { label: "Extended", group: "lines", description: "Two-point line extended in both directions." },
  "horizontal-line": { label: "Horizontal", group: "lines", description: "Single-point horizontal price line." },
  "vertical-line": { label: "Vertical", group: "lines", description: "Single-point vertical time line." },
  "parallel-channel": { label: "Channel", group: "shapes", description: "Three-point parallel channel." },
  rectangle: { label: "Rectangle", group: "shapes", description: "Two-point rectangle." },
  "fibonacci-retracement": { label: "Fib retrace", group: "fibonacci", description: "Two-point Fibonacci retracement." },
  "fibonacci-extension": { label: "Fib extend", group: "fibonacci", description: "Three-point Fibonacci extension." },
  "price-range": { label: "Price range", group: "measure", description: "Two-point price range measure." },
  "date-range": { label: "Date range", group: "measure", description: "Two-point date range measure." },
  "long-position": { label: "Long R:R", group: "trade", description: "Long risk/reward annotation." },
  "short-position": { label: "Short R:R", group: "trade", description: "Short risk/reward annotation." },
  text: { label: "Text", group: "annotate", description: "Single-point text note." },
};

const GROUP_ORDER: readonly StudioDrawingToolGroup[] = ["lines", "shapes", "fibonacci", "measure", "trade", "annotate"];

/**
 * Build a Studio toolbar catalog from engine tool definitions for supported ids.
 * Unknown or unregistered ids are skipped; order follows `supportedTypes`.
 */
export function buildStudioDrawingToolbarCatalog(
  definitions: readonly Pick<DrawingToolDefinition, "type" | "minPoints" | "maxPoints">[],
  supportedTypes: readonly string[],
): readonly StudioDrawingToolEntry[] {
  const byType = new Map(definitions.map((definition) => [definition.type, definition]));
  const entries: StudioDrawingToolEntry[] = [];
  const seen = new Set<string>();
  for (const type of supportedTypes) {
    if (seen.has(type) || !byType.has(type)) continue;
    const meta = STUDIO_DRAWING_TOOL_META[type];
    const definition = byType.get(type)!;
    if (meta === undefined) continue;
    seen.add(type);
    entries.push({
      type,
      label: meta.label,
      group: meta.group,
      minPoints: definition.minPoints,
      maxPoints: definition.maxPoints,
      description: meta.description,
    });
  }
  return entries;
}

/** Case-insensitive filter across type, label, group, and description. */
export function filterStudioDrawingToolbarCatalog(
  catalog: readonly StudioDrawingToolEntry[],
  filter: StudioDrawingToolbarFilter = {},
): readonly StudioDrawingToolEntry[] {
  const group = filter.group ?? "all";
  const query = normalizeQuery(filter.query ?? "");
  return catalog.filter((entry) => {
    if (group !== "all" && entry.group !== group) return false;
    if (query.length === 0) return true;
    return normalizeQuery([entry.type, entry.label, entry.group, entry.description].join(" ")).includes(query);
  });
}

export function listStudioDrawingToolGroups(
  catalog: readonly StudioDrawingToolEntry[],
): readonly StudioDrawingToolGroup[] {
  const present = new Set(catalog.map((entry) => entry.group));
  return GROUP_ORDER.filter((group) => present.has(group));
}

export function studioDrawingToolGroupLabel(group: StudioDrawingToolGroup): string {
  switch (group) {
    case "lines":
      return "Lines";
    case "shapes":
      return "Shapes";
    case "fibonacci":
      return "Fibonacci";
    case "measure":
      return "Measure";
    case "trade":
      return "Trade";
    case "annotate":
      return "Annotate";
    default:
      return group;
  }
}

/**
 * Cancel a pending interactive drawing on a Chart instance through the
 * internal cancellation bridge (not a public Chart method).
 */
export function cancelStudioInteractiveDrawing(chart: object): void {
  cancelInteractiveDrawing(chart);
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
