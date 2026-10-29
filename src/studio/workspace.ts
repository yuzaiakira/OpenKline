import { parseWorkspace, type WorkspaceDocument } from "../workspace.js";
import type { ComparisonNormalizationMode } from "../comparison.js";
import type { WatchlistDocument } from "./watchlist.js";

export const OPENKLINE_STUDIO_WORKSPACE_VERSION = 1 as const;

export type StudioLayout = "single" | "two-horizontal" | "two-vertical" | "four-grid";

export interface StudioSynchronizationPreferences {
  readonly crosshair: boolean;
  readonly visibleRange: boolean;
  readonly symbol: boolean;
  readonly timeframe: boolean;
}

export interface StudioChartPanelDocument {
  readonly panelId: string;
  readonly symbol: string;
  readonly timeframe: string;
  readonly workspace: WorkspaceDocument;
}

export interface StudioComparisonDocument {
  readonly active: boolean;
  readonly mode: ComparisonNormalizationMode;
  readonly baselineTime: number | null;
  readonly baselineMaxAgeMs: number;
  readonly assetIds: readonly string[];
}

export interface StudioWorkspaceDocument {
  readonly version: typeof OPENKLINE_STUDIO_WORKSPACE_VERSION;
  readonly id: string;
  readonly name: string;
  readonly layout: StudioLayout;
  readonly charts: readonly StudioChartPanelDocument[];
  readonly synchronization: StudioSynchronizationPreferences;
  readonly watchlists: WatchlistDocument;
  /** Optional Phase 8.13 comparison state; omitted by older documents. */
  readonly comparison?: StudioComparisonDocument;
}

export interface LegacyWorkspaceMigrationOptions {
  readonly id?: string;
  readonly name?: string;
  readonly fallbackSymbol?: string;
  readonly fallbackTimeframe?: string;
}

export class StudioWorkspaceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StudioWorkspaceValidationError";
  }
}

const DEFAULT_SYNC: StudioSynchronizationPreferences = {
  crosshair: false,
  visibleRange: false,
  symbol: false,
  timeframe: false,
};

export function parseStudioWorkspace(value: unknown): StudioWorkspaceDocument {
  if (!isPlainObject(value) || value.version !== OPENKLINE_STUDIO_WORKSPACE_VERSION) {
    throw new StudioWorkspaceValidationError(`Unsupported Studio workspace version; expected ${OPENKLINE_STUDIO_WORKSPACE_VERSION}`);
  }
  const id = parseNonEmptyString(value.id, "Studio workspace id");
  const name = parseNonEmptyString(value.name, "Studio workspace name");
  const layout = parseLayout(value.layout);
  if (!Array.isArray(value.charts) || value.charts.length !== chartCount(layout)) {
    throw new StudioWorkspaceValidationError(`Layout ${layout} requires ${chartCount(layout)} chart panel(s)`);
  }
  const panelIds = new Set<string>();
  const charts = value.charts.map((item) => {
    if (!isPlainObject(item)) throw new StudioWorkspaceValidationError("Invalid Studio chart panel");
    const panelId = parseNonEmptyString(item.panelId, "Studio chart panel id");
    if (panelIds.has(panelId)) throw new StudioWorkspaceValidationError(`Duplicate Studio chart panel: ${panelId}`);
    panelIds.add(panelId);
    const symbol = parseNonEmptyString(item.symbol, `Symbol for panel ${panelId}`);
    const timeframe = parseNonEmptyString(item.timeframe, `Timeframe for panel ${panelId}`);
    let workspace: WorkspaceDocument;
    try {
      workspace = parseWorkspace(item.workspace);
    } catch (error) {
      throw new StudioWorkspaceValidationError(`Invalid workspace for panel ${panelId}: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { panelId, symbol, timeframe, workspace };
  });
  const synchronization = parseSynchronization(value.synchronization);
  const watchlists = parseWatchlists(value.watchlists);
  const comparison = value.comparison === undefined ? undefined : parseComparison(value.comparison);
  return {
    version: 1,
    id,
    name,
    layout,
    charts,
    synchronization,
    watchlists,
    ...(comparison === undefined ? {} : { comparison }),
  };
}

export function migrateLegacyWorkspace(value: unknown, options: LegacyWorkspaceMigrationOptions = {}): StudioWorkspaceDocument {
  let workspace: WorkspaceDocument;
  try {
    workspace = parseWorkspace(value);
  } catch (error) {
    throw new StudioWorkspaceValidationError(`Cannot migrate legacy workspace: ${error instanceof Error ? error.message : String(error)}`);
  }
  const symbol = workspace.metadata?.symbol ?? options.fallbackSymbol ?? "BTC-USD";
  const timeframe = workspace.metadata?.timeframe ?? options.fallbackTimeframe ?? "1h";
  return {
    version: 1,
    id: options.id ?? "studio-default",
    name: options.name ?? "Default workspace",
    layout: "single",
    charts: [{ panelId: "chart-1", symbol, timeframe, workspace }],
    synchronization: { ...DEFAULT_SYNC },
    watchlists: { version: 1, selectedWatchlistId: null, lists: [] },
  };
}

export function createStudioWorkspace(
  chart: StudioChartPanelDocument,
  options: { readonly id?: string; readonly name?: string; readonly watchlists?: WatchlistDocument } = {},
): StudioWorkspaceDocument {
  return parseStudioWorkspace({
    version: 1,
    id: options.id ?? "studio-default",
    name: options.name ?? "Default workspace",
    layout: "single",
    charts: [chart],
    synchronization: { ...DEFAULT_SYNC },
    watchlists: options.watchlists ?? { version: 1, selectedWatchlistId: null, lists: [] },
  });
}

export function chartCount(layout: StudioLayout): number {
  return layout === "single" ? 1 : layout === "four-grid" ? 4 : 2;
}

function parseLayout(value: unknown): StudioLayout {
  if (value === "single" || value === "two-horizontal" || value === "two-vertical" || value === "four-grid") return value;
  throw new StudioWorkspaceValidationError("Invalid Studio workspace layout");
}

function parseSynchronization(value: unknown): StudioSynchronizationPreferences {
  if (!isPlainObject(value)
    || typeof value.crosshair !== "boolean"
    || typeof value.visibleRange !== "boolean"
    || typeof value.symbol !== "boolean"
    || typeof value.timeframe !== "boolean") {
    throw new StudioWorkspaceValidationError("Invalid Studio synchronization preferences");
  }
  return {
    crosshair: value.crosshair,
    visibleRange: value.visibleRange,
    symbol: value.symbol,
    timeframe: value.timeframe,
  };
}

function parseWatchlists(value: unknown): WatchlistDocument {
  if (!isPlainObject(value) || value.version !== 1 || (value.selectedWatchlistId !== null && typeof value.selectedWatchlistId !== "string") || !Array.isArray(value.lists)) {
    throw new StudioWorkspaceValidationError("Invalid Studio watchlists document");
  }
  const listIds = new Set<string>();
  const lists = value.lists.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || listIds.has(item.id) || typeof item.name !== "string" || item.name.trim().length === 0 || !Array.isArray(item.symbols)) {
      throw new StudioWorkspaceValidationError("Invalid Studio watchlist");
    }
    listIds.add(item.id);
    const symbolIds = new Set<string>();
    const symbols = item.symbols.map((symbol) => {
      if (!isPlainObject(symbol) || typeof symbol.id !== "string" || symbol.id.length === 0 || symbolIds.has(symbol.id) || typeof symbol.displaySymbol !== "string" || symbol.displaySymbol.trim().length === 0 || typeof symbol.name !== "string" || symbol.name.trim().length === 0 || (symbol.exchange !== undefined && typeof symbol.exchange !== "string") || (symbol.assetCategory !== undefined && typeof symbol.assetCategory !== "string") || (symbol.quoteCurrency !== undefined && typeof symbol.quoteCurrency !== "string") || typeof symbol.favorite !== "boolean") {
        throw new StudioWorkspaceValidationError(`Invalid symbol in watchlist ${item.id}`);
      }
      symbolIds.add(symbol.id);
      return {
        id: symbol.id,
        displaySymbol: symbol.displaySymbol,
        name: symbol.name,
        ...(symbol.exchange === undefined ? {} : { exchange: symbol.exchange }),
        ...(symbol.assetCategory === undefined ? {} : { assetCategory: symbol.assetCategory }),
        ...(symbol.quoteCurrency === undefined ? {} : { quoteCurrency: symbol.quoteCurrency }),
        favorite: symbol.favorite,
      };
    });
    return { id: item.id, name: item.name, symbols };
  });
  if (value.selectedWatchlistId !== null && !listIds.has(value.selectedWatchlistId)) throw new StudioWorkspaceValidationError("Selected watchlist does not exist");
  return { version: 1, selectedWatchlistId: value.selectedWatchlistId, lists };
}

function parseComparison(value: unknown): StudioComparisonDocument {
  if (!isPlainObject(value)
    || typeof value.active !== "boolean"
    || (value.mode !== "percentage" && value.mode !== "indexed")
    || (value.baselineTime !== null && (typeof value.baselineTime !== "number" || !Number.isSafeInteger(value.baselineTime) || value.baselineTime < 0))
    || typeof value.baselineMaxAgeMs !== "number"
    || !Number.isSafeInteger(value.baselineMaxAgeMs)
    || value.baselineMaxAgeMs < 0
    || !Array.isArray(value.assetIds)
    || value.assetIds.length === 0) {
    throw new StudioWorkspaceValidationError("Invalid Studio comparison state");
  }
  const baselineTime: number | null = value.baselineTime;
  const baselineMaxAgeMs = value.baselineMaxAgeMs;
  const ids = new Set<string>();
  const assetIds = value.assetIds.map((id) => {
    if (typeof id !== "string" || id.trim().length === 0 || ids.has(id.trim())) throw new StudioWorkspaceValidationError("Invalid or duplicate Studio comparison asset");
    ids.add(id.trim());
    return id.trim();
  });
  return {
    active: value.active,
    mode: value.mode,
    baselineTime,
    baselineMaxAgeMs,
    assetIds,
  };
}

function parseNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new StudioWorkspaceValidationError(`${label} must be a non-empty string`);
  return value;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
