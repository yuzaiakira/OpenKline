import { builtInIndicatorDefinitions } from "../indicators/index.js";
import type { IndicatorMetadata, IndicatorParameterDefinition } from "../indicators/types.js";
import type { Candle } from "../types.js";
import { DEFAULT_DRAWINGS } from "./defaults.js";
import { WidgetLifecycleError } from "./errors.js";
import type { WidgetChartType, WidgetDataIdentity, WidgetDatafeedQuery, WidgetOptions } from "./types.js";
import { isWidgetLayout } from "./composition.js";

export interface WidgetDrawingChoice {
  readonly type: string;
  readonly label: string;
}

export function resolveWidgetIndicatorMetadata(choices?: readonly string[]): readonly IndicatorMetadata[] {
  const definitions = new Map(builtInIndicatorDefinitions.map((definition) => [definition.metadata.id, definition.metadata]));
  const ids = choices === undefined ? [...definitions.keys()] : [...choices];
  const seen = new Set<string>();
  const resolved: IndicatorMetadata[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const metadata = definitions.get(id);
    if (metadata !== undefined) resolved.push(metadata);
  }
  return resolved;
}

export function resolveWidgetDrawingChoices(choices?: readonly string[]): readonly WidgetDrawingChoice[] {
  const types = choices ?? DEFAULT_DRAWINGS;
  const seen = new Set<string>();
  return types.filter((type) => {
    if (seen.has(type)) return false;
    seen.add(type);
    return true;
  }).map((type) => ({ type, label: formatWidgetName(type) }));
}

export function formatWidgetName(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function defaultIndicatorParameter(parameter: IndicatorParameterDefinition, candles: readonly Candle[]): unknown {
  switch (parameter.name) {
    case "fastPeriod": return 12;
    case "slowPeriod": return 26;
    case "signalPeriod": return 9;
    case "kPeriod": return 14;
    case "dPeriod": return 3;
    case "standardDeviations": return 2;
    case "multiplier": return 2;
    case "constant": return 0.015;
    case "anchorTime": return candles[candles.length - 1]?.time ?? 0;
    case "priceSource": return "typical";
    case "session": return "none";
    case "period": return 14;
    default:
      if (parameter.defaultValue !== undefined) return parameter.defaultValue;
      if (parameter.type === "boolean") return false;
      if (parameter.type === "enum") return parameter.values?.[0] ?? "";
      if (parameter.type === "integer" || parameter.type === "number") return parameter.min ?? 0;
      return "";
  }
}

export function toColorInputValue(value: string | undefined): string {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value) ? value : "#38bdf8";
}

export function isWidgetChartType(type: string): type is WidgetChartType {
  return ["candlestick", "ohlc", "hollow-candlestick", "heikin-ashi", "line", "area", "baseline"].includes(type);
}

export function normalizeWidgetIdentity(identity?: WidgetDataIdentity): WidgetDataIdentity | undefined {
  if (identity === undefined) return undefined;
  const symbol = normalizeIdentityValue(identity.symbol, "symbol");
  const timeframe = normalizeIdentityValue(identity.timeframe, "timeframe");
  if (symbol === undefined && timeframe === undefined) return {};
  return {
    ...(symbol === undefined ? {} : { symbol }),
    ...(timeframe === undefined ? {} : { timeframe }),
  };
}

export function normalizeIdentityValue(value: string | undefined, field: "symbol" | "timeframe"): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) throw new WidgetLifecycleError(`Widget ${field} must not be empty`);
  return normalized;
}

export function hasWidgetIdentity(identity: WidgetDataIdentity | undefined | null): boolean {
  return identity !== undefined && identity !== null && (identity.symbol !== undefined || identity.timeframe !== undefined);
}

export function normalizeWidgetDatafeedQuery(query: WidgetDatafeedQuery): WidgetDatafeedQuery {
  const symbol = normalizeIdentityValue(query.symbol, "symbol");
  const timeframe = normalizeIdentityValue(query.timeframe, "timeframe");
  if (symbol === undefined || timeframe === undefined) throw new WidgetLifecycleError("A datafeed query requires symbol and timeframe");
  return { ...query, symbol, timeframe };
}

/** Validate construction options without mutating host objects. */
export function validateWidgetOptions(options: WidgetOptions): void {
  if (options === null || typeof options !== "object") {
    throw new WidgetLifecycleError("Widget options must be an object");
  }
  if (!(options.container instanceof HTMLElement)) {
    throw new WidgetLifecycleError("Widget container must be an HTMLElement");
  }
  if (options.layout !== undefined && !isWidgetLayout(options.layout)) {
    throw new WidgetLifecycleError("Invalid Widget layout");
  }
  if (options.chartType !== undefined && !isWidgetChartType(options.chartType)) {
    throw new WidgetLifecycleError("Invalid Widget chart type");
  }
  if (options.data !== undefined && !Array.isArray(options.data)) {
    throw new WidgetLifecycleError("Widget data must be an array of candles when provided");
  }
  if (options.datafeed !== undefined && options.datafeedQuery === undefined) {
    throw new WidgetLifecycleError("datafeedQuery is required when datafeed is provided");
  }
  if (options.datafeedQuery !== undefined) normalizeWidgetDatafeedQuery(options.datafeedQuery);
  if (options.dataIdentity !== undefined) normalizeWidgetIdentity(options.dataIdentity);
  if (options.storageKey !== undefined && (typeof options.storageKey !== "string" || options.storageKey.trim().length === 0)) {
    throw new WidgetLifecycleError("storageKey must be a non-empty string when provided");
  }
  if (options.storage !== undefined) {
    if (typeof options.storage.load !== "function" || typeof options.storage.save !== "function") {
      throw new WidgetLifecycleError("Widget storage must implement load and save");
    }
  }
  if (options.synchronization !== undefined) {
    const sync = options.synchronization;
    for (const key of ["enabled", "crosshair", "visibleRange"] as const) {
      if (sync[key] !== undefined && typeof sync[key] !== "boolean") {
        throw new WidgetLifecycleError(`synchronization.${key} must be a boolean when provided`);
      }
    }
  }
}

export function stableChartIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `chart-${index + 1}`);
}
