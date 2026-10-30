import type { DrawingDocument, DrawingSnapshot, DrawingStyle } from "./drawings/types.js";
import { parseAlertDefinitions } from "./alerts/engine.js";
import type { AlertDefinitionDocument } from "./alerts/types.js";
import { isCandleSeriesType } from "./core/candle-series.js";
import type { JsonValue } from "./extensions/types.js";
import type { Candle, ChartDirection, ChartTheme, PriceScaleConfiguration, SeriesPoint, SeriesStyle, SeriesType } from "./types.js";
import { resolveVolumeProfileOptions, type ResolvedVolumeProfileOptions, type VolumeProfileOptions } from "./volume-analytics.js";
import { parseFixedTimeframe, validateTimeframePair, type MultiTimeframeFinalityPolicy, type MultiTimeframeMissingVolumePolicy, type MultiTimeframeReferenceStyle, type PreviousTimeframeLevel } from "./multi-timeframe.js";
import type { TradingCalendarEngine } from "./trading-calendar.js";
import { resolveTradingCalendarDisplayOptions, type WorkspaceTradingCalendar } from "./session-visualization.js";

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
  /** Optional so version-1 workspaces saved before Phase 7 retain their linear default. */
  readonly priceScale?: PriceScaleConfiguration;
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

/** Serializable chart-owned estimated Volume Profile configuration. */
export type WorkspaceVolumeProfile = ResolvedVolumeProfileOptions;

/** Optional Phase 9 analytics state. Derived bins and canvas geometry are never persisted. */
export interface WorkspaceVolumeAnalytics {
  readonly volumeProfiles: readonly WorkspaceVolumeProfile[];
}

export interface WorkspaceMultiTimeframeIndicator {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  readonly sourceTimeframe: string;
  readonly targetTimeframe: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly coveragePolicy: "unknown" | "fixed-duration";
  readonly missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly outputStyles: Readonly<Record<string, SeriesStyle>>;
  readonly visible: boolean;
}

export interface WorkspaceMultiTimeframeReference {
  readonly id: string;
  readonly sourceTimeframe: string;
  readonly targetTimeframe: string;
  readonly levels: readonly PreviousTimeframeLevel[];
  readonly coveragePolicy: "unknown" | "fixed-duration";
  readonly missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly visible: boolean;
  readonly labels: boolean;
  readonly labelPrefix: string;
  readonly style: MultiTimeframeReferenceStyle;
}

export interface WorkspaceMultiTimeframeAnalysis {
  readonly indicators: readonly WorkspaceMultiTimeframeIndicator[];
  readonly references: readonly WorkspaceMultiTimeframeReference[];
}

export interface WorkspaceSessionIndicator {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  readonly sourceTimeframe: string;
  readonly targetPeriod: "session" | "week" | "month";
  readonly calendarId: string;
  readonly calendarVersion: string;
  readonly parameters: Readonly<Record<string, JsonValue>>;
  readonly coveragePolicy: "unknown" | "fixed-duration";
  readonly missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly outputStyles: Readonly<Record<string, SeriesStyle>>;
  readonly visible: boolean;
}

export interface WorkspaceSessionReference {
  readonly id: string;
  readonly sourceTimeframe: string;
  readonly targetPeriod: "session" | "week" | "month";
  readonly calendarId: string;
  readonly calendarVersion: string;
  readonly levels: readonly PreviousTimeframeLevel[];
  readonly visible: boolean;
  readonly labels: boolean;
  readonly labelPrefix: string;
  readonly style: MultiTimeframeReferenceStyle;
}

export interface WorkspaceSessionAnalysis {
  readonly indicators: readonly WorkspaceSessionIndicator[];
  readonly references: readonly WorkspaceSessionReference[];
}

/** A replay export marker; it is descriptive and is not a replay source. */
export interface WorkspaceReplayState {
  readonly active: true;
  readonly currentIndex: number | null;
  readonly currentTimestamp: number | null;
  readonly totalBars: number;
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
  /** Optional serializable alert definitions. Runtime state and history are never persisted. */
  readonly alerts?: AlertDefinitionDocument;
  /** Optional chart-owned volume analytics configuration; legacy version-1 documents omit it. */
  readonly volumeAnalytics?: WorkspaceVolumeAnalytics;
  /** Optional additive Phase 10 multi-timeframe configuration. Derived data is never persisted. */
  readonly multiTimeframe?: WorkspaceMultiTimeframeAnalysis;
  /** Optional Phase 11 session-aware indicator/reference configuration. */
  readonly sessionAnalysis?: WorkspaceSessionAnalysis;
  /** Optional Phase 11 calendar identity and display settings; runtime schedule is resolved by the host. */
  readonly tradingCalendar?: WorkspaceTradingCalendar;
  /** Present when this document was exported from a partial replay-visible chart. */
  readonly replay?: WorkspaceReplayState;
}

export interface WorkspaceRestoreOptions {
  readonly missingPlugins?: "skip" | "error";
  readonly missingIndicators?: "skip" | "error";
  /** Resolve a persisted calendar ID/version without serializing executable schedule state. */
  readonly tradingCalendarResolver?: (calendarId: string, version: string) => TradingCalendarEngine | undefined;
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
  const replay = value.replay === undefined ? undefined : parseReplay(value.replay);
  const alerts = value.alerts === undefined ? undefined : parseWorkspaceAlerts(value.alerts);
  const volumeAnalytics = value.volumeAnalytics === undefined ? undefined : parseVolumeAnalytics(value.volumeAnalytics);
  const multiTimeframe = value.multiTimeframe === undefined ? undefined : parseMultiTimeframe(value.multiTimeframe, panes.map((pane) => pane.id));
  const sessionAnalysis = value.sessionAnalysis === undefined ? undefined : parseSessionAnalysis(value.sessionAnalysis, panes.map((pane) => pane.id));
  const tradingCalendar = value.tradingCalendar === undefined ? undefined : parseTradingCalendar(value.tradingCalendar);
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
    ...(alerts === undefined ? {} : { alerts }),
    ...(volumeAnalytics === undefined ? {} : { volumeAnalytics }),
    ...(multiTimeframe === undefined ? {} : { multiTimeframe }),
    ...(sessionAnalysis === undefined ? {} : { sessionAnalysis }),
    ...(tradingCalendar === undefined ? {} : { tradingCalendar }),
    ...(replay === undefined ? {} : { replay }),
  };
}

function parseTradingCalendar(value: unknown): WorkspaceTradingCalendar {
  if (!isPlainObject(value)
    || typeof value.calendarId !== "string" || value.calendarId.trim().length === 0
    || typeof value.version !== "string" || value.version.trim().length === 0
    || !isPlainObject(value.display)) {
    throw new WorkspaceValidationError("Invalid workspace trading calendar");
  }
  try {
    return {
      calendarId: value.calendarId,
      version: value.version,
      display: resolveTradingCalendarDisplayOptions(value.display),
    };
  } catch (error) {
    throw new WorkspaceValidationError(error instanceof Error ? error.message : "Invalid workspace trading calendar display");
  }
}

function parseVolumeAnalytics(value: unknown): WorkspaceVolumeAnalytics {
  if (!isPlainObject(value) || !Array.isArray(value.volumeProfiles)) {
    throw new WorkspaceValidationError("Invalid workspace volume analytics");
  }
  const ids = new Set<string>();
  const volumeProfiles = value.volumeProfiles.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || ids.has(item.id)) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace Volume Profile");
    }
    ids.add(item.id);
    try {
      const resolved = resolveVolumeProfileOptions(item as unknown as VolumeProfileOptions, item.id);
      return {
        ...resolved,
        ...(resolved.range === undefined ? {} : { range: { ...resolved.range } }),
      };
    } catch (error) {
      throw new WorkspaceValidationError(error instanceof Error ? error.message : `Invalid workspace Volume Profile: ${item.id}`);
    }
  });
  return { volumeProfiles };
}

function parseMultiTimeframe(value: unknown, paneIds: readonly string[]): WorkspaceMultiTimeframeAnalysis {
  if (!isPlainObject(value) || !Array.isArray(value.indicators) || !Array.isArray(value.references)) {
    throw new WorkspaceValidationError("Invalid workspace multi-timeframe analysis");
  }
  const indicatorIds = new Set<string>();
  const indicators = value.indicators.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || indicatorIds.has(item.id)
      || typeof item.indicatorId !== "string" || typeof item.paneId !== "string" || !paneIds.includes(item.paneId)
      || typeof item.sourceTimeframe !== "string" || typeof item.targetTimeframe !== "string"
      || !isJsonObject(item.parameters) || !isPlainObject(item.outputStyles) || typeof item.visible !== "boolean") {
      throw new WorkspaceValidationError("Invalid or duplicate workspace multi-timeframe indicator");
    }
    validateWorkspaceTimeframePair(item.sourceTimeframe, item.targetTimeframe, item.id);
    const outputStyles: Record<string, SeriesStyle> = {};
    for (const [outputId, style] of Object.entries(item.outputStyles)) outputStyles[outputId] = parseSeriesStyle(style);
    const coveragePolicy = parseCoveragePolicy(item.coveragePolicy, item.id);
    const missingVolumePolicy = parseMissingVolumePolicy(item.missingVolumePolicy, item.id);
    const finalityPolicy = parseFinalityPolicy(item.finalityPolicy, item.id);
    indicatorIds.add(item.id);
    return {
      id: item.id,
      indicatorId: item.indicatorId,
      paneId: item.paneId,
      sourceTimeframe: item.sourceTimeframe,
      targetTimeframe: item.targetTimeframe,
      parameters: cloneJsonObject(item.parameters),
      coveragePolicy,
      missingVolumePolicy,
      finalityPolicy,
      outputStyles,
      visible: item.visible,
    };
  });
  const referenceIds = new Set<string>();
  const references = value.references.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || referenceIds.has(item.id)
      || typeof item.sourceTimeframe !== "string" || typeof item.targetTimeframe !== "string" || !Array.isArray(item.levels)
      || typeof item.visible !== "boolean" || typeof item.labels !== "boolean" || typeof item.labelPrefix !== "string"
      || !isPlainObject(item.style)) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace multi-timeframe reference");
    }
    validateWorkspaceTimeframePair(item.sourceTimeframe, item.targetTimeframe, item.id);
    const levels = item.levels.map((level) => {
      if (level !== "open" && level !== "high" && level !== "low" && level !== "close") throw new WorkspaceValidationError(`Invalid multi-timeframe reference level: ${item.id}`);
      return level;
    });
    if (levels.length === 0 || new Set(levels).size !== levels.length) throw new WorkspaceValidationError(`Invalid multi-timeframe reference levels: ${item.id}`);
    const style = parseMultiTimeframeReferenceStyle(item.style, item.id);
    const coveragePolicy = parseCoveragePolicy(item.coveragePolicy, item.id);
    const missingVolumePolicy = parseMissingVolumePolicy(item.missingVolumePolicy, item.id);
    const finalityPolicy = parseFinalityPolicy(item.finalityPolicy, item.id);
    referenceIds.add(item.id);
    return {
      id: item.id,
      sourceTimeframe: item.sourceTimeframe,
      targetTimeframe: item.targetTimeframe,
      levels,
      coveragePolicy,
      missingVolumePolicy,
      finalityPolicy,
      visible: item.visible,
      labels: item.labels,
      labelPrefix: item.labelPrefix,
      style,
    };
  });
  return { indicators, references };
}

function parseSessionAnalysis(value: unknown, paneIds: readonly string[]): WorkspaceSessionAnalysis {
  if (!isPlainObject(value) || !Array.isArray(value.indicators) || !Array.isArray(value.references)) {
    throw new WorkspaceValidationError("Invalid workspace session analysis");
  }
  const ids = new Set<string>();
  const indicators = value.indicators.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || ids.has(item.id)
      || typeof item.indicatorId !== "string" || typeof item.paneId !== "string" || !paneIds.includes(item.paneId)
      || typeof item.sourceTimeframe !== "string" || typeof item.targetPeriod !== "string"
      || !isJsonObject(item.parameters) || !isPlainObject(item.outputStyles) || typeof item.visible !== "boolean"
      || typeof item.calendarId !== "string" || item.calendarId.length === 0
      || typeof item.calendarVersion !== "string" || item.calendarVersion.length === 0) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace session indicator");
    }
    validateSessionSourceTimeframe(item.sourceTimeframe, item.id);
    validateSessionPeriod(item.targetPeriod, item.id);
    const outputStyles: Record<string, SeriesStyle> = {};
    for (const [outputId, style] of Object.entries(item.outputStyles)) outputStyles[outputId] = parseSeriesStyle(style);
    const coveragePolicy = parseCoveragePolicy(item.coveragePolicy, item.id);
    const missingVolumePolicy = parseMissingVolumePolicy(item.missingVolumePolicy, item.id);
    const finalityPolicy = parseFinalityPolicy(item.finalityPolicy, item.id);
    ids.add(item.id);
    return {
      id: item.id,
      indicatorId: item.indicatorId,
      paneId: item.paneId,
      sourceTimeframe: item.sourceTimeframe,
      targetPeriod: item.targetPeriod,
      calendarId: item.calendarId,
      calendarVersion: item.calendarVersion,
      parameters: cloneJsonObject(item.parameters),
      coveragePolicy,
      missingVolumePolicy,
      finalityPolicy,
      outputStyles,
      visible: item.visible,
    };
  });
  const references = value.references.map((item) => {
    if (!isPlainObject(item) || typeof item.id !== "string" || item.id.length === 0 || ids.has(item.id)
      || typeof item.sourceTimeframe !== "string" || typeof item.targetPeriod !== "string"
      || !Array.isArray(item.levels) || typeof item.visible !== "boolean"
      || typeof item.labels !== "boolean" || typeof item.labelPrefix !== "string" || !isPlainObject(item.style)
      || typeof item.calendarId !== "string" || item.calendarId.length === 0
      || typeof item.calendarVersion !== "string" || item.calendarVersion.length === 0) {
      throw new WorkspaceValidationError("Invalid or duplicate workspace session reference");
    }
    validateSessionSourceTimeframe(item.sourceTimeframe, item.id);
    validateSessionPeriod(item.targetPeriod, item.id);
    const levels = item.levels.map((level) => {
      if (level !== "open" && level !== "high" && level !== "low" && level !== "close") throw new WorkspaceValidationError(`Invalid session reference level: ${item.id}`);
      return level;
    });
    if (levels.length === 0 || new Set(levels).size !== levels.length) throw new WorkspaceValidationError(`Invalid session reference levels: ${item.id}`);
    ids.add(item.id);
    return {
      id: item.id,
      sourceTimeframe: item.sourceTimeframe,
      targetPeriod: item.targetPeriod,
      calendarId: item.calendarId,
      calendarVersion: item.calendarVersion,
      levels,
      visible: item.visible,
      labels: item.labels,
      labelPrefix: item.labelPrefix,
      style: parseMultiTimeframeReferenceStyle(item.style, item.id),
    };
  });
  return { indicators, references };
}

function validateSessionSourceTimeframe(source: string, id: string): void {
  try {
    parseFixedTimeframe(source);
  } catch (error) {
    throw new WorkspaceValidationError(`Invalid session source timeframe for ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateSessionPeriod(period: unknown, id: string): asserts period is "session" | "week" | "month" {
  if (period !== "session" && period !== "week" && period !== "month") throw new WorkspaceValidationError(`Invalid session period: ${id}`);
}

function validateWorkspaceTimeframePair(source: string, target: string, id: string): void {
  try {
    validateTimeframePair(source, target);
  } catch (error) {
    throw new WorkspaceValidationError(`Invalid multi-timeframe interval for ${id}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseCoveragePolicy(value: unknown, id: string): "unknown" | "fixed-duration" {
  if (value !== "unknown" && value !== "fixed-duration") throw new WorkspaceValidationError(`Invalid multi-timeframe coverage policy: ${id}`);
  return value;
}

function parseMissingVolumePolicy(value: unknown, id: string): MultiTimeframeMissingVolumePolicy {
  if (value !== "ignore" && value !== "zero" && value !== "unknown") throw new WorkspaceValidationError(`Invalid multi-timeframe volume policy: ${id}`);
  return value;
}

function parseFinalityPolicy(value: unknown, id: string): MultiTimeframeFinalityPolicy {
  if (value !== "time-closed" && value !== "complete-only") throw new WorkspaceValidationError(`Invalid multi-timeframe finality policy: ${id}`);
  return value;
}

function parseMultiTimeframeReferenceStyle(value: unknown, id: string): MultiTimeframeReferenceStyle {
  if (!isPlainObject(value)
    || (value.color !== undefined && typeof value.color !== "string")
    || (value.lineWidth !== undefined && (!isFiniteNumber(value.lineWidth) || value.lineWidth < 0 || value.lineWidth > 8))
    || (value.lineStyle !== undefined && value.lineStyle !== "solid" && value.lineStyle !== "dashed" && value.lineStyle !== "dotted")
    || (value.alpha !== undefined && (!isFiniteNumber(value.alpha) || value.alpha < 0 || value.alpha > 1))) {
    throw new WorkspaceValidationError(`Invalid multi-timeframe reference style: ${id}`);
  }
  return {
    ...(value.color === undefined ? {} : { color: value.color }),
    ...(value.lineWidth === undefined ? {} : { lineWidth: value.lineWidth }),
    ...(value.lineStyle === undefined ? {} : { lineStyle: value.lineStyle }),
    ...(value.alpha === undefined ? {} : { alpha: value.alpha }),
  };
}

function parseWorkspaceAlerts(value: unknown): AlertDefinitionDocument {
  try {
    return parseAlertDefinitions(value);
  } catch (error) {
    throw new WorkspaceValidationError(error instanceof Error ? error.message : "Invalid workspace alerts document");
  }
}

function parseReplay(value: unknown): WorkspaceReplayState {
  if (!isPlainObject(value)
    || value.active !== true
    || (value.currentIndex !== null && (!Number.isInteger(value.currentIndex) || value.currentIndex < 0))
    || (value.currentTimestamp !== null && (!isFiniteInteger(value.currentTimestamp) || value.currentTimestamp < 0))
    || !Number.isInteger(value.totalBars)
    || value.totalBars < 0
    || (value.currentIndex === null) !== (value.currentTimestamp === null)
    || (value.currentIndex !== null && value.currentIndex >= value.totalBars)) {
    throw new WorkspaceValidationError("Invalid workspace replay state");
  }
  return {
    active: true,
    currentIndex: value.currentIndex,
    currentTimestamp: value.currentTimestamp,
    totalBars: value.totalBars,
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
  if (isCandleSeriesType(type)) {
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
  const allowed = [
    "color", "lineWidth", "fillColor", "fillOpacity", "upColor", "downColor", "hollowUpColor",
    "baseline", "aboveColor", "belowColor", "aboveFillColor", "belowFillColor", "aboveFillOpacity",
    "belowFillOpacity", "visible",
  ] as const;
  for (const key of Object.keys(value)) if (!allowed.includes(key as typeof allowed[number])) throw new WorkspaceValidationError(`Unknown series style property: ${key}`);
  const stringKeys = ["color", "fillColor", "upColor", "downColor", "hollowUpColor", "aboveColor", "belowColor", "aboveFillColor", "belowFillColor"] as const;
  const numberKeys = ["lineWidth", "fillOpacity", "baseline", "aboveFillOpacity", "belowFillOpacity"] as const;
  for (const key of stringKeys) if (value[key] !== undefined && typeof value[key] !== "string") throw new WorkspaceValidationError(`Invalid workspace ${key}`);
  for (const key of numberKeys) if (value[key] !== undefined && !isFiniteNumber(value[key])) throw new WorkspaceValidationError(`Invalid workspace ${key}`);
  if (value.visible !== undefined && typeof value.visible !== "boolean") throw new WorkspaceValidationError("Invalid workspace visible");
  if (value.lineWidth !== undefined && (value.lineWidth < 0 || value.lineWidth > 8)) throw new WorkspaceValidationError("Invalid workspace line width");
  if (value.fillOpacity !== undefined && (value.fillOpacity < 0 || value.fillOpacity > 1)) throw new WorkspaceValidationError("Invalid workspace fill opacity");
  if (value.aboveFillOpacity !== undefined && (value.aboveFillOpacity < 0 || value.aboveFillOpacity > 1)) throw new WorkspaceValidationError("Invalid workspace above fill opacity");
  if (value.belowFillOpacity !== undefined && (value.belowFillOpacity < 0 || value.belowFillOpacity > 1)) throw new WorkspaceValidationError("Invalid workspace below fill opacity");
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
  return themeKeys.every((key) => typeof value.theme[key] === "string")
    && (value.theme.bandFill === undefined || typeof value.theme.bandFill === "string")
    && (value.theme.bandFillOpacity === undefined || isFiniteNumber(value.theme.bandFillOpacity))
    && (value.direction === undefined || value.direction === "ltr" || value.direction === "rtl")
    && (value.priceScale === undefined || isPriceScaleConfiguration(value.priceScale));
}

function cloneChartConfiguration(value: WorkspaceChartConfiguration): WorkspaceChartConfiguration {
  return {
    theme: { ...value.theme },
    locale: value.locale,
    timeZone: value.timeZone,
    pricePrecision: value.pricePrecision,
    direction: value.direction ?? "ltr",
    ...(value.priceScale === undefined ? {} : {
      priceScale: {
        ...value.priceScale,
        ...(value.priceScale.range === undefined ? {} : { range: { ...value.priceScale.range } }),
      },
    }),
  };
}

function isPriceScaleConfiguration(value: unknown): value is PriceScaleConfiguration {
  if (!isPlainObject(value)
    || (value.mode !== "linear" && value.mode !== "logarithmic" && value.mode !== "percentage" && value.mode !== "indexed")
    || typeof value.autoScale !== "boolean"
    || !isFiniteNumber(value.marginTop) || value.marginTop < 0 || value.marginTop >= 1
    || !isFiniteNumber(value.marginBottom) || value.marginBottom < 0 || value.marginBottom >= 1
    || typeof value.axisVisible !== "boolean"
    || (value.referencePrice !== undefined && (!isFiniteNumber(value.referencePrice) || value.referencePrice <= 0))) {
    return false;
  }
  return value.range === undefined
    || (isPlainObject(value.range) && isFiniteNumber(value.range.min) && isFiniteNumber(value.range.max) && value.range.max >= value.range.min);
}

function isSeriesType(value: unknown): value is SeriesType {
  return value === "candlestick" || value === "ohlc" || value === "hollow-candlestick" || value === "heikin-ashi" || value === "line" || value === "area" || value === "baseline" || value === "volume" || value === "histogram";
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
