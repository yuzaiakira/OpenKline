import type { DrawingDocument, DrawingSnapshot, DrawingStyle } from "./drawings/types.js";
import type { JsonValue } from "./extensions/types.js";
import type { Candle, ChartDirection, ChartTheme, SeriesPoint, SeriesStyle, SeriesType } from "./types.js";

export const OPENKLINE_WORKSPACE_VERSION = 1 as const;

export interface WorkspaceMetadata {
  readonly symbol?: string;
  readonly timeframe?: string;
}

export interface WorkspaceChartConfiguration {
  readonly theme: ChartTheme;
  readonly locale: string;
  readonly timeZone: string;
  readonly pricePrecision: number;
  readonly direction: ChartDirection;
}

export interface WorkspacePane {
  readonly id: string;
  readonly height: number | null;
  readonly minHeight: number;
}

export interface WorkspaceSeries {
  readonly id: string;
  readonly type: SeriesType;
  readonly paneId: string;
  readonly title?: string;
  readonly style: SeriesStyle;
  readonly band?: { readonly group: string; readonly role: "upper" | "lower" };
  readonly data: readonly SeriesPoint[];
}

export interface WorkspaceIndicator {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly outputStyles: Readonly<Record<string, SeriesStyle>>;
  readonly script?: { readonly programId: string; readonly source: string };
}

export interface WorkspacePluginState {
  readonly id: string;
  readonly version: string;
  readonly state: Readonly<Record<string, JsonValue>>;
}

export interface WorkspaceDocument {
  readonly version: typeof OPENKLINE_WORKSPACE_VERSION;
  readonly metadata?: WorkspaceMetadata;
  readonly chart: WorkspaceChartConfiguration;
  readonly panes: readonly WorkspacePane[];
  readonly series: readonly WorkspaceSeries[];
  readonly indicators: readonly WorkspaceIndicator[];
  readonly drawings: DrawingDocument;
  readonly viewport: { readonly rangeStart: number; readonly visibleCount: number };
  readonly plugins: readonly WorkspacePluginState[];
}

export interface WorkspaceRestoreOptions {
  readonly missingPlugins?: "skip" | "error";
  readonly missingIndicators?: "skip" | "error";
}

export interface WorkspaceRestoreResult {
  readonly skippedPlugins: readonly string[];
  readonly skippedIndicators: readonly string[];
}

export class WorkspaceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkspaceValidationError";
  }
}

export class WorkspaceCompatibilityError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WorkspaceCompatibilityError";
  }
}

export function parseWorkspace(value: unknown): WorkspaceDocument {
  if (!isPlainObject(value) || value.version !== OPENKLINE_WORKSPACE_VERSION) {
    throw new WorkspaceValidationError(`Unsupported workspace version; expected ${OPENKLINE_WORKSPACE_VERSION}`);
  }
  if (!isChartConfiguration(value.chart)) throw new WorkspaceValidationError("Invalid workspace chart configuration");
  const panes = parsePanes(value.panes);
  const series = parseSeries(value.series);
  const indicators = parseIndicators(value.indicators);
  const drawings = parseDrawings(value.drawings);
  const viewport = parseViewport(value.viewport);
  const plugins = parsePlugins(value.plugins);
  const metadata = value.metadata === undefined ? undefined : parseMetadata(value.metadata);
  const paneIds = new Set(panes.map((pane) => pane.id));
  if (!paneIds.has("main")) throw new WorkspaceValidationError("Workspace must contain a main pane");
  for (const item of series) {
    if (!paneIds.has(item.paneId)) throw new WorkspaceValidationError(`Series ${item.id} references missing pane ${item.paneId}`);
  }
  for (const indicator of indicators) {
    if (!paneIds.has(indicator.paneId)) throw new WorkspaceValidationError(`Indicator ${indicator.id} references missing pane ${indicator.paneId}`);
  }
  return {
    version: OPENKLINE_WORKSPACE_VERSION,
    ...(metadata === undefined ? {} : { metadata }),
    chart: cloneChartConfiguration(value.chart),
    panes,
    series,
    indicators,
    drawings,
    viewport,
    plugins,
  };
}

function parseMetadata(value: unknown): WorkspaceMetadata {
  if (!isPlainObject(value)
    || (value.symbol !== undefined && typeof value.symbol !== "string")
    || (value.timeframe !== undefined && typeof value.timeframe !== "string")) {
    throw new WorkspaceValidationError("Invalid workspace metadata");
  }
  return {
    ...(value.symbol === undefined ? {} : { symbol: value.symbol }),
    ...(value.timeframe === undefined ? {} : { timeframe: value.timeframe }),
  };
}

function parsePanes(value: unknown): WorkspacePane[] {
  if (!Array.isArray(value)) throw new WorkspaceValidationError("Workspace panes must be an array");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || ids.has(item.id)) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace pane");
    }
    if (item.height !== null && (typeof item.height !== "number" || !Number.isFinite(item.height) || item.height < 1)) {
      throw new WorkspaceValidationError(`Invalid pane height: ${item.id}`);
    }
    if (typeof item.minHeight !== "number" || !Number.isFinite(item.minHeight) || item.minHeight < 1) {
      throw new WorkspaceValidationError(`Invalid pane minimum height: ${item.id}`);
    }
    ids.add(item.id);
    return { id: item.id, height: item.height, minHeight: item.minHeight };
  });
}

function parseSeries(value: unknown): WorkspaceSeries[] {
  if (!Array.isArray(value)) throw new WorkspaceValidationError("Workspace series must be an array");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || ids.has(item.id)) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace series");
    }
    if (!isSeriesType(item.type) || typeof item.paneId !== "string" || !Array.isArray(item.data)) {
      throw new WorkspaceValidationError(`Invalid workspace series: ${item.id}`);
    }
    const data = item.data.map((point) => parseSeriesPoint(point, item.type));
    validateOrderedTimes(data, item.id);
    if (item.title !== undefined && typeof item.title !== "string") throw new WorkspaceValidationError(`Invalid series title: ${item.id}`);
    const style = parseSeriesStyle(item.style);
    const band = item.band === undefined ? undefined : parseBand(item.band);
    ids.add(item.id);
    return {
      id: item.id,
      type: item.type,
      paneId: item.paneId,
      ...(item.title === undefined ? {} : { title: item.title }),
      style,
      ...(band === undefined ? {} : { band }),
      data,
    };
  });
}

function parseIndicators(value: unknown): WorkspaceIndicator[] {
  if (!Array.isArray(value)) throw new WorkspaceValidationError("Workspace indicators must be an array");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || ids.has(item.id)) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace indicator");
    }
    if (typeof item.indicatorId !== "string" || typeof item.paneId !== "string" || !isJsonObject(item.parameters) || !isPlainObject(item.outputStyles)) {
      throw new WorkspaceValidationError(`Invalid workspace indicator: ${item.id}`);
    }
    const outputStyles: Record<string, SeriesStyle> = {};
    for (const [outputId, style] of Object.entries(item.outputStyles)) outputStyles[outputId] = parseSeriesStyle(style);
    ids.add(item.id);
    const script = item.script === undefined ? undefined : parseScriptReference(item.script, item.id);
    return {
      id: item.id,
      indicatorId: item.indicatorId,
      paneId: item.paneId,
      parameters: cloneJsonObject(item.parameters),
      outputStyles,
      ...(script === undefined ? {} : { script }),
    };
  });
}

function parseScriptReference(value: unknown, indicatorId: string): { programId: string; source: string } {
  if (!isPlainObject(value) || typeof value.programId !== "string" || typeof value.source !== "string" || value.source.length === 0 || value.source.length > 64 * 1024) {
    throw new WorkspaceValidationError(`Invalid KlineScript reference: ${indicatorId}`);
  }
  return { programId: value.programId, source: value.source };
}

function parseDrawings(value: unknown): DrawingDocument {
  if (!isPlainObject(value) || value.version !== 1 || !Array.isArray(value.drawings)) {
    throw new WorkspaceValidationError("Invalid workspace drawings document");
  }
  const ids = new Set<string>();
  const drawings: DrawingSnapshot[] = value.drawings.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || typeof item.type !== "string" || !Array.isArray(item.points) || !isDrawingStyle(item.style) || typeof item.zIndex !== "number" || !Number.isFinite(item.zIndex)) {
      throw new WorkspaceValidationError("Invalid workspace drawing");
    }
    if (ids.has(item.id)) throw new WorkspaceValidationError(`Duplicate workspace drawing: ${item.id}`);
    const points = item.points.map(parseDrawingPoint);
    ids.add(item.id);
    return {
      id: item.id,
      type: item.type,
      points,
      style: { ...item.style },
      ...(item.text === undefined ? {} : { text: item.text }),
      zIndex: item.zIndex,
    };
  });
  return { version: 1, drawings };
}

function parsePlugins(value: unknown): WorkspacePluginState[] {
  if (!Array.isArray(value)) throw new WorkspaceValidationError("Workspace plugins must be an array");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || typeof item.version !== "string" || !isJsonObject(item.state) || ids.has(item.id)) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace plugin state");
    }
    ids.add(item.id);
    return { id: item.id, version: item.version, state: cloneJsonObject(item.state) };
  });
}

function parseViewport(value: unknown): { rangeStart: number; visibleCount: number } {
  if (!isPlainObject(value) || !Number.isInteger(value.rangeStart) || value.rangeStart < 0 || !Number.isInteger(value.visibleCount) || value.visibleCount < 1) {
    throw new WorkspaceValidationError("Invalid workspace viewport");
  }
  return { rangeStart: value.rangeStart, visibleCount: value.visibleCount };
}

function parseSeriesPoint(value: unknown, type: SeriesType): SeriesPoint {
  if (type === "candlestick") {
    if (!isPlainObject(value) || !isFiniteInteger(value.time) || !isFiniteNumber(value.open) || !isFiniteNumber(value.high) || !isFiniteNumber(value.low) || !isFiniteNumber(value.close) || (value.volume !== undefined && !isFiniteNumber(value.volume))) {
      throw new WorkspaceValidationError("Invalid workspace candle");
    }
    const candle: Candle = { time: value.time, open: value.open, high: value.high, low: value.low, close: value.close, ...(value.volume === undefined ? {} : { volume: value.volume }) };
    if (candle.high < Math.max(candle.open, candle.close) || candle.low > Math.min(candle.open, candle.close) || (candle.volume !== undefined && candle.volume < 0)) throw new WorkspaceValidationError("Invalid workspace candle relationships");
    return candle;
  }
  if (!isPlainObject(value) || !isFiniteInteger(value.time) || !isFiniteNumber(value.value) || (value.color !== undefined && typeof value.color !== "string")) {
    throw new WorkspaceValidationError("Invalid workspace series point");
  }
  return { time: value.time, value: value.value, ...(value.color === undefined ? {} : { color: value.color }) };
}

function parseDrawingPoint(value: unknown): { time: number; price: number } {
  if (!isPlainObject(value) || !isFiniteInteger(value.time) || !isFiniteNumber(value.price)) throw new WorkspaceValidationError("Invalid workspace drawing point");
  return { time: value.time, price: value.price };
}

function parseSeriesStyle(value: unknown): SeriesStyle {
  if (!isPlainObject(value)) throw new WorkspaceValidationError("Invalid workspace series style");
  const allowed = ["color", "lineWidth", "fillColor", "fillOpacity", "upColor", "downColor", "visible"] as const;
  for (const key of Object.keys(value)) if (!allowed.includes(key as typeof allowed[number])) throw new WorkspaceValidationError(`Unknown series style property: ${key}`);
  if (Object.values(value).some((item) => !(typeof item === "string" || typeof item === "boolean" || isFiniteNumber(item)))) throw new WorkspaceValidationError("Invalid workspace series style value");
  if (value.lineWidth !== undefined && (value.lineWidth < 0 || value.lineWidth > 8)) throw new WorkspaceValidationError("Invalid workspace line width");
  if (value.fillOpacity !== undefined && (value.fillOpacity < 0 || value.fillOpacity > 1)) throw new WorkspaceValidationError("Invalid workspace fill opacity");
  return { ...value } as SeriesStyle;
}

function parseBand(value: unknown): { group: string; role: "upper" | "lower" } {
  if (!isPlainObject(value) || typeof value.group !== "string" || (value.role !== "upper" && value.role !== "lower")) throw new WorkspaceValidationError("Invalid workspace series band");
  return { group: value.group, role: value.role };
}

function validateOrderedTimes(points: readonly SeriesPoint[], id: string): void {
  let previous: number | undefined;
  for (const point of points) {
    if (previous !== undefined && point.time <= previous) throw new WorkspaceValidationError(`Workspace series timestamps are not ascending: ${id}`);
    previous = point.time;
  }
}

function isChartConfiguration(value: unknown): value is WorkspaceChartConfiguration {
  if (!isPlainObject(value) || typeof value.locale !== "string" || typeof value.timeZone !== "string" || !Number.isInteger(value.pricePrecision) || value.pricePrecision < 0 || value.pricePrecision > 100 || !isPlainObject(value.theme)) return false;
  const themeKeys = ["background", "text", "grid", "border", "upCandle", "downCandle", "crosshair", "volumeUp", "volumeDown"];
  return themeKeys.every((key) => typeof value.theme[key] === "string") && (value.theme.bandFill === undefined || typeof value.theme.bandFill === "string") && (value.theme.bandFillOpacity === undefined || isFiniteNumber(value.theme.bandFillOpacity)) && (value.direction === undefined || value.direction === "ltr" || value.direction === "rtl");
}

function cloneChartConfiguration(value: WorkspaceChartConfiguration): WorkspaceChartConfiguration {
  return { theme: { ...value.theme }, locale: value.locale, timeZone: value.timeZone, pricePrecision: value.pricePrecision, direction: value.direction ?? "ltr" };
}

function isSeriesType(value: unknown): value is SeriesType {
  return value === "candlestick" || value === "line" || value === "area" || value === "volume" || value === "histogram";
}

function isDrawingStyle(value: unknown): value is DrawingStyle {
  return isPlainObject(value) && (value.color === undefined || typeof value.color === "string") && (value.fillColor === undefined || typeof value.fillColor === "string") && (value.textColor === undefined || typeof value.textColor === "string") && (value.lineWidth === undefined || isFiniteNumber(value.lineWidth)) && (value.visible === undefined || typeof value.visible === "boolean") && (value.locked === undefined || typeof value.locked === "boolean");
}

function isPlainObject(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0;
}

function isJsonObject(value: unknown, seen = new WeakSet<object>()): value is Record<string, JsonValue> {
  return isPlainObject(value) && isJsonValue(value, seen);
}

function isJsonValue(value: unknown, seen = new WeakSet<object>()): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (isFiniteNumber(value)) return true;
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((item) => isJsonValue(item, seen));
}

function cloneJsonObject(value: Record<string, JsonValue>): Record<string, JsonValue> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
}

function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson) as unknown as T;
  return cloneJsonObject(value as Record<string, JsonValue>) as T;
}
