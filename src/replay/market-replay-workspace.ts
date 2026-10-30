import type { MarketReplayClockPolicy, MarketReplayKnowledgePolicy, MarketReplaySource } from "./market-event-tape.js";

/** Version of the small, runtime-free market replay workspace reference. */
export const OPENKLINE_MARKET_REPLAY_WORKSPACE_VERSION = 1 as const;

export interface MarketReplayPanelConfiguration {
  readonly id: string;
  readonly instrumentId: string;
  readonly timeframe?: string;
  readonly visible: boolean;
}

export interface MarketReplayDisplaySettings {
  readonly theme?: "light" | "dark";
  readonly candles: boolean;
  readonly footprint: boolean;
  readonly cvd: boolean;
  readonly timeAndSales: boolean;
  readonly depth: boolean;
}

export interface MarketReplayWorkspaceCursor {
  readonly eventId: string | null;
  readonly timestamp: number | null;
}

/**
 * Canonical replay configuration only. Event records, checkpoints, books,
 * callbacks, credentials, workers, and subscriptions are intentionally absent.
 */
export interface MarketReplayWorkspaceDocument {
  readonly version: typeof OPENKLINE_MARKET_REPLAY_WORKSPACE_VERSION;
  readonly tapeId: string;
  readonly source: MarketReplaySource;
  readonly instrumentId: string;
  readonly clockPolicy: MarketReplayClockPolicy;
  readonly knowledgePolicy: MarketReplayKnowledgePolicy;
  readonly speed: number;
  readonly display: MarketReplayDisplaySettings;
  readonly panels: readonly MarketReplayPanelConfiguration[];
  readonly cursor?: MarketReplayWorkspaceCursor;
}

export interface CreateMarketReplayWorkspaceOptions {
  readonly tapeId: string;
  readonly source: MarketReplaySource;
  readonly instrumentId: string;
  readonly clockPolicy?: MarketReplayClockPolicy;
  readonly knowledgePolicy?: MarketReplayKnowledgePolicy;
  readonly speed?: number;
  readonly display?: Partial<MarketReplayDisplaySettings>;
  readonly panels?: readonly (Omit<MarketReplayPanelConfiguration, "visible"> & { readonly visible?: boolean })[];
  readonly cursor?: MarketReplayWorkspaceCursor;
}

export class MarketReplayWorkspaceValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MarketReplayWorkspaceValidationError";
  }
}

const DEFAULT_DISPLAY: MarketReplayDisplaySettings = {
  candles: true,
  footprint: true,
  cvd: true,
  timeAndSales: true,
  depth: true,
};

export function createMarketReplayWorkspace(options: CreateMarketReplayWorkspaceOptions): MarketReplayWorkspaceDocument {
  const panels = (options.panels ?? [{ id: "main", instrumentId: options.instrumentId }]).map((panel) => ({ ...panel, visible: panel.visible ?? true }));
  return parseMarketReplayWorkspace({
    version: OPENKLINE_MARKET_REPLAY_WORKSPACE_VERSION,
    tapeId: options.tapeId,
    source: options.source,
    instrumentId: options.instrumentId,
    clockPolicy: options.clockPolicy ?? "event-time",
    knowledgePolicy: options.knowledgePolicy ?? "strict-causal",
    speed: options.speed ?? 1,
    display: { ...DEFAULT_DISPLAY, ...(options.display ?? {}) },
    panels,
    ...(options.cursor === undefined ? {} : { cursor: options.cursor }),
  });
}

export function parseMarketReplayWorkspace(value: string | unknown): MarketReplayWorkspaceDocument {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch (error) {
      throw new MarketReplayWorkspaceValidationError(`Invalid market replay workspace JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!isRecord(parsed) || parsed.version !== OPENKLINE_MARKET_REPLAY_WORKSPACE_VERSION) {
    throw new MarketReplayWorkspaceValidationError("Unsupported market replay workspace version");
  }
  assertKeys(parsed, ["version", "tapeId", "source", "instrumentId", "clockPolicy", "knowledgePolicy", "speed", "display", "panels", "cursor"]);
  const tapeId = nonEmpty(parsed.tapeId, "tapeId");
  const source = parseSource(parsed.source);
  const instrumentId = nonEmpty(parsed.instrumentId, "instrumentId");
  const clockPolicy = parseClockPolicy(parsed.clockPolicy);
  const knowledgePolicy = parseKnowledgePolicy(parsed.knowledgePolicy);
  const speed = parseSpeed(parsed.speed);
  const display = parseDisplay(parsed.display);
  const panels = parsePanels(parsed.panels, instrumentId);
  const cursor = parsed.cursor === undefined ? undefined : parseCursor(parsed.cursor);
  return {
    version: OPENKLINE_MARKET_REPLAY_WORKSPACE_VERSION,
    tapeId,
    source,
    instrumentId,
    clockPolicy,
    knowledgePolicy,
    speed,
    display,
    panels,
    ...(cursor === undefined ? {} : { cursor }),
  };
}

/** Serialize a validated workspace reference without runtime state. */
export function serializeMarketReplayWorkspace(value: MarketReplayWorkspaceDocument): string {
  return canonicalStringify(parseMarketReplayWorkspace(value));
}

function parseSource(value: unknown): MarketReplaySource {
  if (!isRecord(value)) throw new MarketReplayWorkspaceValidationError("Invalid replay workspace source");
  assertKeys(value, ["id", "version", "kind"]);
  const id = nonEmpty(value.id, "source.id");
  const version = nonEmpty(value.version, "source.version");
  const kind = value.kind === undefined ? undefined : nonEmpty(value.kind, "source.kind");
  return { id, version, ...(kind === undefined ? {} : { kind }) };
}

function parseDisplay(value: unknown): MarketReplayDisplaySettings {
  if (!isRecord(value)) throw new MarketReplayWorkspaceValidationError("Invalid replay workspace display settings");
  assertKeys(value, ["theme", "candles", "footprint", "cvd", "timeAndSales", "depth"]);
  const theme = value.theme === undefined ? undefined : value.theme;
  if (theme !== undefined && theme !== "light" && theme !== "dark") throw new MarketReplayWorkspaceValidationError("Invalid replay workspace theme");
  const booleans = ["candles", "footprint", "cvd", "timeAndSales", "depth"] as const;
  for (const key of booleans) if (typeof value[key] !== "boolean") throw new MarketReplayWorkspaceValidationError(`Replay workspace display.${key} must be boolean`);
  const candles = value.candles as boolean;
  const footprint = value.footprint as boolean;
  const cvd = value.cvd as boolean;
  const timeAndSales = value.timeAndSales as boolean;
  const depth = value.depth as boolean;
  return {
    ...(theme === undefined ? {} : { theme }),
    candles,
    footprint,
    cvd,
    timeAndSales,
    depth,
  };
}

function parsePanels(value: unknown, primaryInstrumentId: string): readonly MarketReplayPanelConfiguration[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) throw new MarketReplayWorkspaceValidationError("Replay workspace panels must contain between 1 and 16 panels");
  const ids = new Set<string>();
  return value.map((item, index) => {
    if (!isRecord(item)) throw new MarketReplayWorkspaceValidationError(`Invalid replay workspace panel ${index}`);
    assertKeys(item, ["id", "instrumentId", "timeframe", "visible"]);
    const id = nonEmpty(item.id, `panels[${index}].id`);
    if (ids.has(id)) throw new MarketReplayWorkspaceValidationError(`Duplicate replay workspace panel ${id}`);
    ids.add(id);
    const instrumentId = nonEmpty(item.instrumentId, `panels[${index}].instrumentId`);
    const timeframe = item.timeframe === undefined ? undefined : nonEmpty(item.timeframe, `panels[${index}].timeframe`);
    if (typeof item.visible !== "boolean") throw new MarketReplayWorkspaceValidationError(`panels[${index}].visible must be boolean`);
    return { id, instrumentId, ...(timeframe === undefined ? {} : { timeframe }), visible: item.visible };
  }).map((panel, index) => {
    if (index === 0 && panel.instrumentId !== primaryInstrumentId) throw new MarketReplayWorkspaceValidationError("The first replay workspace panel must use instrumentId");
    return panel;
  });
}

function parseCursor(value: unknown): MarketReplayWorkspaceCursor {
  if (!isRecord(value)) throw new MarketReplayWorkspaceValidationError("Invalid replay workspace cursor");
  assertKeys(value, ["eventId", "timestamp"]);
  const eventId = value.eventId;
  const timestamp = value.timestamp;
  if (eventId === undefined || timestamp === undefined) throw new MarketReplayWorkspaceValidationError("cursor.eventId and cursor.timestamp are required");
  if (eventId !== null && (typeof eventId !== "string" || eventId.trim().length === 0)) throw new MarketReplayWorkspaceValidationError("cursor.eventId must be null or non-empty");
  if (timestamp !== null && (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp) || timestamp < 0)) throw new MarketReplayWorkspaceValidationError("cursor.timestamp must be null or a non-negative safe integer");
  return { eventId: eventId === null ? null : eventId.trim(), timestamp: timestamp as number | null };
}

function parseClockPolicy(value: unknown): MarketReplayClockPolicy {
  if (value !== "event-time" && value !== "receive-time") throw new MarketReplayWorkspaceValidationError("Invalid replay workspace clock policy");
  return value;
}

function parseKnowledgePolicy(value: unknown): MarketReplayKnowledgePolicy {
  if (value !== "strict-causal" && value !== "retrospective") throw new MarketReplayWorkspaceValidationError("Invalid replay workspace knowledge policy");
  return value;
}

function parseSpeed(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0.01 || value > 100) throw new MarketReplayWorkspaceValidationError("Replay workspace speed must be between 0.01 and 100");
  return value;
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new MarketReplayWorkspaceValidationError(`${label} must be non-empty`);
  return value.trim();
}

function assertKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected !== undefined) throw new MarketReplayWorkspaceValidationError(`Unsupported replay workspace field: ${unexpected}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  throw new MarketReplayWorkspaceValidationError("Replay workspace contains a non-serializable value");
}
