import { parseWorkspace, type WorkspaceDocument } from "../workspace.js";
import { parseWatchlistDocument, type WatchlistDocument } from "../studio/watchlist.js";
import type { ComparisonNormalizationMode } from "../comparison.js";
import { WidgetCompositionValidationError } from "./errors.js";
import type { WidgetLayout } from "./types.js";

export const OPENKLINE_WIDGET_COMPOSITION_VERSION = 1 as const;

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

export function chartCountForLayout(layout: WidgetLayout): number {
  return layout === "single" ? 1 : layout === "four-grid" ? 4 : 2;
}

export function isWidgetLayout(value: unknown): value is WidgetLayout {
  return value === "single" || value === "two-horizontal" || value === "two-vertical" || value === "four-grid";
}

export function parseWidgetComposition(value: unknown): WidgetCompositionDocument {
  if (!isPlainObject(value) || value.version !== OPENKLINE_WIDGET_COMPOSITION_VERSION) {
    throw new WidgetCompositionValidationError(`Unsupported Widget composition version; expected ${OPENKLINE_WIDGET_COMPOSITION_VERSION}`);
  }
  if (!isWidgetLayout(value.layout)) throw new WidgetCompositionValidationError("Invalid Widget layout");
  const expected = chartCountForLayout(value.layout);
  if (!Array.isArray(value.charts) || value.charts.length !== expected) {
    throw new WidgetCompositionValidationError(`Layout ${value.layout} requires ${expected} chart(s)`);
  }
  if (typeof value.activeChartId !== "string" || value.activeChartId.trim().length === 0) {
    throw new WidgetCompositionValidationError("Widget composition requires an activeChartId");
  }
  const ids = new Set<string>();
  const charts = value.charts.map((item, index) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.trim().length === 0) {
      throw new WidgetCompositionValidationError(`Invalid chart composition at index ${index}`);
    }
    if (ids.has(item.id)) throw new WidgetCompositionValidationError(`Duplicate chart id: ${item.id}`);
    ids.add(item.id);
    if (item.symbol !== null && (typeof item.symbol !== "string" || item.symbol.trim().length === 0)) {
      throw new WidgetCompositionValidationError(`Invalid symbol for chart ${item.id}`);
    }
    if (item.timeframe !== null && (typeof item.timeframe !== "string" || item.timeframe.trim().length === 0)) {
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
  if (!isPlainObject(value)
    || typeof value.enabled !== "boolean"
    || typeof value.crosshair !== "boolean"
    || typeof value.visibleRange !== "boolean") {
    throw new WidgetCompositionValidationError("Invalid Widget synchronization preferences");
  }
  return { enabled: value.enabled, crosshair: value.crosshair, visibleRange: value.visibleRange };
}

function parseComparison(value: unknown): WidgetComparisonComposition {
  if (!isPlainObject(value)
    || typeof value.active !== "boolean"
    || (value.mode !== "percentage" && value.mode !== "indexed")
    || (value.baselineTime !== null && typeof value.baselineTime !== "number")
    || typeof value.baselineMaxAgeMs !== "number"
    || !Number.isFinite(value.baselineMaxAgeMs)
    || value.baselineMaxAgeMs < 0
    || !Array.isArray(value.assetIds)
    || value.assetIds.length > 8
    || value.assetIds.some((id) => typeof id !== "string" || id.trim().length === 0)) {
    throw new WidgetCompositionValidationError("Invalid Widget comparison composition");
  }
  return {
    active: value.active,
    mode: value.mode,
    baselineTime: value.baselineTime,
    baselineMaxAgeMs: value.baselineMaxAgeMs,
    assetIds: [...value.assetIds],
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
