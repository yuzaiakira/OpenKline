import { parseWorkspace, type WorkspaceDocument } from "../workspace.js";
import { parseWatchlistDocument, type WatchlistDocument } from "../studio/watchlist.js";
import type { ComparisonNormalizationMode } from "../comparison.js";
import { WidgetCompositionValidationError } from "./errors.js";
import { stableChartIds } from "./helpers.js";
import type { WidgetLayout } from "./types.js";

export const OPENKLINE_WIDGET_COMPOSITION_VERSION = 1 as const;
export const MAX_WIDGET_COMPOSITION_ASSET_IDS = 8;
export const MAX_WIDGET_COMPOSITION_STRING = 256;
const MAX_COMPOSITION_DEPTH = 24;

export interface WidgetSyncComposition {
  readonly enabled: boolean;
  readonly crosshair: boolean;
  readonly visibleRange: boolean;
}

export interface WidgetChartComposition {
  readonly id: string;
  readonly symbol: string | null;
  readonly timeframe: string | null;
  readonly workspace: WorkspaceDocument;
}

export interface WidgetComparisonComposition {
  readonly active: boolean;
  readonly mode: ComparisonNormalizationMode;
  readonly baselineTime: number | null;
  readonly baselineMaxAgeMs: number;
  readonly assetIds: readonly string[];
}

export interface WidgetCompositionDocument {
  readonly version: typeof OPENKLINE_WIDGET_COMPOSITION_VERSION;
  readonly layout: WidgetLayout;
  readonly activeChartId: string;
  readonly charts: readonly WidgetChartComposition[];
  readonly synchronization: WidgetSyncComposition;
  readonly watchlist: WatchlistDocument;
  readonly comparison?: WidgetComparisonComposition;
}

const ROOT_KEYS = new Set([
  "version",
  "layout",
  "activeChartId",
  "charts",
  "synchronization",
  "watchlist",
  "comparison",
]);

const CHART_KEYS = new Set(["id", "symbol", "timeframe", "workspace"]);
const SYNC_KEYS = new Set(["enabled", "crosshair", "visibleRange"]);
const COMPARISON_KEYS = new Set(["active", "mode", "baselineTime", "baselineMaxAgeMs", "assetIds"]);

export function chartCountForLayout(layout: WidgetLayout): number {
  return layout === "single" ? 1 : layout === "four-grid" ? 4 : 2;
}

export function canonicalChartIdsForLayout(layout: WidgetLayout): readonly string[] {
  return stableChartIds(chartCountForLayout(layout));
}

export function isWidgetLayout(value: unknown): value is WidgetLayout {
  return value === "single" || value === "two-horizontal" || value === "two-vertical" || value === "four-grid";
}

export function parseWidgetComposition(value: unknown): WidgetCompositionDocument {
  assertAcyclicBounded(value, 0, new WeakSet<object>());
  if (!isPlainObject(value) || value.version !== OPENKLINE_WIDGET_COMPOSITION_VERSION) {
    throw new WidgetCompositionValidationError(`Unsupported Widget composition version; expected ${OPENKLINE_WIDGET_COMPOSITION_VERSION}`);
  }
  assertAllowlistedKeys(value, ROOT_KEYS, "Widget composition");
  if (!isWidgetLayout(value.layout)) throw new WidgetCompositionValidationError("Invalid Widget layout");
  const expectedIds = canonicalChartIdsForLayout(value.layout);
  if (!Array.isArray(value.charts) || value.charts.length !== expectedIds.length) {
    throw new WidgetCompositionValidationError(`Layout ${value.layout} requires ${expectedIds.length} chart(s)`);
  }
  if (typeof value.activeChartId !== "string" || !isBoundedString(value.activeChartId)) {
    throw new WidgetCompositionValidationError("Widget composition requires an activeChartId");
  }
  const ids = new Set<string>();
  const charts = value.charts.map((item, index) => {
    if (!isPlainObject(item)) throw new WidgetCompositionValidationError(`Invalid chart composition at index ${index}`);
    assertAllowlistedKeys(item, CHART_KEYS, `chart at index ${index}`);
    if (typeof item.id !== "string" || !isBoundedString(item.id)) {
      throw new WidgetCompositionValidationError(`Invalid chart composition at index ${index}`);
    }
    if (item.id !== expectedIds[index]) {
      throw new WidgetCompositionValidationError(
        `Layout ${value.layout} requires canonical chart ids ${expectedIds.join(", ")}; received ${item.id} at index ${index}`,
      );
    }
    if (ids.has(item.id)) throw new WidgetCompositionValidationError(`Duplicate chart id: ${item.id}`);
    ids.add(item.id);
    if (item.symbol !== null && (typeof item.symbol !== "string" || !isBoundedString(item.symbol))) {
      throw new WidgetCompositionValidationError(`Invalid symbol for chart ${item.id}`);
    }
    if (item.timeframe !== null && (typeof item.timeframe !== "string" || !isBoundedString(item.timeframe))) {
      throw new WidgetCompositionValidationError(`Invalid timeframe for chart ${item.id}`);
    }
    let workspace: WorkspaceDocument;
    try {
      workspace = parseWorkspace(item.workspace);
    } catch (error) {
      throw new WidgetCompositionValidationError(`Invalid workspace for chart ${item.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return {
      id: item.id,
      symbol: item.symbol,
      timeframe: item.timeframe,
      workspace,
    };
  });
  if (!ids.has(value.activeChartId)) throw new WidgetCompositionValidationError("activeChartId does not match a chart");
  const synchronization = parseSync(value.synchronization);
  let watchlist: WatchlistDocument;
  try {
    watchlist = parseWatchlistDocument(value.watchlist ?? { version: 1, selectedWatchlistId: null, lists: [] });
  } catch (error) {
    throw new WidgetCompositionValidationError(`Invalid watchlist: ${error instanceof Error ? error.message : String(error)}`);
  }
  const comparison = value.comparison === undefined ? undefined : parseComparison(value.comparison);
  return {
    version: 1,
    layout: value.layout,
    activeChartId: value.activeChartId,
    charts,
    synchronization,
    watchlist,
    ...(comparison === undefined ? {} : { comparison }),
  };
}

function parseSync(value: unknown): WidgetSyncComposition {
  if (!isPlainObject(value)) throw new WidgetCompositionValidationError("Invalid Widget synchronization preferences");
  assertAllowlistedKeys(value, SYNC_KEYS, "synchronization");
  if (typeof value.enabled !== "boolean"
    || typeof value.crosshair !== "boolean"
    || typeof value.visibleRange !== "boolean") {
    throw new WidgetCompositionValidationError("Invalid Widget synchronization preferences");
  }
  return { enabled: value.enabled, crosshair: value.crosshair, visibleRange: value.visibleRange };
}

function parseComparison(value: unknown): WidgetComparisonComposition {
  if (!isPlainObject(value)) throw new WidgetCompositionValidationError("Invalid Widget comparison composition");
  assertAllowlistedKeys(value, COMPARISON_KEYS, "comparison");
  if (typeof value.active !== "boolean"
    || (value.mode !== "percentage" && value.mode !== "indexed")
    || !isFiniteTimestampOrNull(value.baselineTime)
    || typeof value.baselineMaxAgeMs !== "number"
    || !Number.isFinite(value.baselineMaxAgeMs)
    || value.baselineMaxAgeMs < 0
    || !Array.isArray(value.assetIds)
    || value.assetIds.length > MAX_WIDGET_COMPOSITION_ASSET_IDS
    || value.assetIds.some((id) => typeof id !== "string" || !isBoundedString(id))) {
    throw new WidgetCompositionValidationError("Invalid Widget comparison composition");
  }
  const assetIds = value.assetIds.map((id) => id.trim());
  if (new Set(assetIds).size !== assetIds.length) {
    throw new WidgetCompositionValidationError("Invalid Widget comparison composition");
  }
  return {
    active: value.active,
    mode: value.mode,
    baselineTime: value.baselineTime,
    baselineMaxAgeMs: value.baselineMaxAgeMs,
    assetIds,
  };
}

function isFiniteTimestampOrNull(value: unknown): value is number | null {
  if (value === null) return true;
  return typeof value === "number" && Number.isFinite(value);
}

function isBoundedString(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_WIDGET_COMPOSITION_STRING && trimmed === value;
}

function assertAllowlistedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new WidgetCompositionValidationError(`Unexpected ${label} key: ${key}`);
  }
}

function assertAcyclicBounded(value: unknown, depth: number, ancestry: WeakSet<object>): void {
  if (depth > MAX_COMPOSITION_DEPTH) throw new WidgetCompositionValidationError("Widget composition nesting exceeds the supported limit");
  if (typeof value !== "object" || value === null) return;
  // Path-based cycle detection: shared DAG references are allowed, true cycles are not.
  if (ancestry.has(value)) throw new WidgetCompositionValidationError("Widget composition must not contain cyclic references");
  ancestry.add(value);
  try {
    if (Array.isArray(value)) {
      for (const item of value) assertAcyclicBounded(item, depth + 1, ancestry);
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new WidgetCompositionValidationError("Widget composition must use plain objects");
    }
    for (const nested of Object.values(value as Record<string, unknown>)) {
      assertAcyclicBounded(nested, depth + 1, ancestry);
    }
  } finally {
    ancestry.delete(value);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
