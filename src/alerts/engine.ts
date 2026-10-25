import { validateCandle } from "../core/candle-store.js";
import type {
  AlertApi,
  AlertCondition,
  AlertDefinition,
  AlertDefinitionDocument,
  AlertDefinitionPatch,
  AlertDiagnostic,
  AlertDiagnosticListener,
  AlertEvaluationInput,
  AlertEvaluationMode,
  AlertEngineOptions,
  AlertEvent,
  AlertEventListener,
  AlertFrequency,
  AlertOutputSnapshot,
  AlertStatus,
  AlertValue,
} from "./types.js";
import {
  AlertEvaluationError,
  AlertLifecycleError,
  AlertValidationError,
  OPENKLINE_ALERTS_VERSION,
} from "./types.js";

interface Observation {
  readonly time: number;
  readonly value: AlertValue;
  readonly comparisonValue: AlertValue;
}

interface RuntimeState {
  previous: Observation | null;
  lastTime: number | null;
  triggered: boolean;
  triggeredCount: number;
  lastEventId: string | null;
  lastTriggeredBarTimestamp: number | null;
  lastError: string | null;
  emittedEventIds: Set<string>;
}

interface ConditionMatch {
  readonly matches: boolean;
  readonly observedValue: AlertValue;
  readonly comparisonValue: AlertValue;
  readonly threshold?: number;
}

/** Framework-neutral, deterministic alert definition and evaluation engine. */
export class AlertEngine {
  private readonly definitions = new Map<string, AlertDefinition>();
  private readonly states = new Map<AlertEvaluationMode, Map<string, RuntimeState>>([
    ["live", new Map()],
    ["replay", new Map()],
  ]);
  private readonly history: AlertEvent[] = [];
  private readonly listeners = new Set<AlertEventListener>();
  private readonly diagnosticListeners = new Set<AlertDiagnosticListener>();
  private readonly maxHistory: number;
  private disposed = false;

  public constructor(options: AlertEngineOptions = {}) {
    this.maxHistory = options.maxHistory ?? 1_000;
    if (!Number.isInteger(this.maxHistory) || this.maxHistory < 1) {
      throw new AlertValidationError("Alert history limit must be a positive integer");
    }
  }

  public add(definition: AlertDefinition): AlertApi {
    this.assertAlive();
    const normalized = normalizeDefinition(definition);
    if (this.definitions.has(normalized.id)) throw new AlertValidationError(`Alert already exists: ${normalized.id}`);
    this.definitions.set(normalized.id, normalized);
    this.resetRuntime(normalized.id);
    return this.apiFor(normalized.id);
  }

  public update(id: string, patch: AlertDefinitionPatch): AlertDefinition {
    this.assertAlive();
    const current = this.require(id);
    const normalized = normalizeDefinition({ ...current, ...patch, id: current.id });
    this.definitions.set(id, normalized);
    this.resetRuntime(id);
    return cloneDefinition(normalized);
  }

  public remove(id: string): void {
    this.assertAlive();
    if (!this.definitions.delete(normalizeId(id))) throw new AlertValidationError(`Unknown alert: ${id}`);
    for (const state of this.states.values()) state.delete(normalizeId(id));
  }

  public get(id: string): AlertApi {
    this.assertAlive();
    this.require(id);
    return this.apiFor(normalizeId(id));
  }

  public list(): AlertDefinition[] {
    this.assertAlive();
    return [...this.definitions.values()].map(cloneDefinition);
  }

  public getStatus(id: string, mode: AlertEvaluationMode = "live"): AlertStatus {
    this.assertAlive();
    const definition = this.require(id);
    const runtime = this.runtimeFor(definition.id, mode);
    return {
      definition: cloneDefinition(definition),
      evaluationMode: mode,
      triggeredCount: runtime.triggeredCount,
      lastEventId: runtime.lastEventId,
      lastTriggeredBarTimestamp: runtime.lastTriggeredBarTimestamp,
      lastError: runtime.lastError,
    };
  }

  public subscribe(listener: AlertEventListener): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public subscribeDiagnostics(listener: AlertDiagnosticListener): () => void {
    this.assertAlive();
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  public evaluate(input: AlertEvaluationInput): AlertEvent[] {
    this.assertAlive();
    validateCandle(input.candle);
    const mode = input.mode ?? "live";
    const sourceEvent = input.sourceEvent ?? "append";
    const outputs = outputMap(input.outputs ?? [], input.candle.time);
    const events: AlertEvent[] = [];
    for (const definition of this.definitions.values()) {
      if (definition.enabled === false) continue;
      const runtime = this.runtimeFor(definition.id, mode);
      try {
        const match = evaluateCondition(definition.condition, input, outputs, runtime.previous);
        const current = {
          time: input.candle.time,
          value: match.observedValue,
          comparisonValue: match.comparisonValue,
        };
        const isOutOfOrder = runtime.lastTime !== null && input.candle.time <= runtime.lastTime;
        if (sourceEvent === "seed" || sourceEvent === "correction" || isOutOfOrder) {
          if (runtime.lastTime === null || input.candle.time >= runtime.lastTime) {
            runtime.previous = current;
            runtime.lastTime = input.candle.time;
          }
          runtime.lastError = null;
          continue;
        }
        if (match.matches && canEmit(definition, runtime, input, mode)) {
          const eventId = `${definition.id}:${mode}:${input.candle.time}:${definition.condition.type}`;
          if (!runtime.emittedEventIds.has(eventId)) {
            const event: AlertEvent = {
              eventId,
              alertId: definition.id,
              alertName: definition.name,
              conditionType: definition.condition.type,
              evaluationMode: mode,
              simulated: mode === "replay",
              barTimestamp: input.candle.time,
              observedValue: match.observedValue,
              previousValue: runtime.previous?.value ?? null,
              ...(match.threshold === undefined ? {} : { threshold: match.threshold }),
              ...(match.comparisonValue === null ? {} : { comparisonValue: match.comparisonValue }),
              ...(input.symbol ?? definition.symbol) === undefined ? {} : { symbol: input.symbol ?? definition.symbol },
              ...(input.timeframe ?? definition.timeframe) === undefined ? {} : { timeframe: input.timeframe ?? definition.timeframe },
            };
            runtime.emittedEventIds.add(eventId);
            runtime.triggered = true;
            runtime.triggeredCount += 1;
            runtime.lastEventId = eventId;
            runtime.lastTriggeredBarTimestamp = input.candle.time;
            runtime.lastError = null;
            this.history.push(event);
            while (this.history.length > this.maxHistory) this.history.shift();
            this.notify(event);
            events.push(cloneEvent(event));
          }
        }
        runtime.previous = current;
        runtime.lastTime = input.candle.time;
        runtime.lastError = null;
      } catch (error) {
        const normalized = error instanceof AlertEvaluationError
          ? error
          : new AlertEvaluationError(error instanceof Error ? error.message : String(error));
        runtime.lastError = normalized.message;
        this.notifyDiagnostic({ alertId: definition.id, evaluationMode: mode, message: normalized.message, cause: error });
      }
    }
    return events;
  }

  /** Set an initial observation without triggering historical notifications. */
  public seed(input: AlertEvaluationInput): void {
    this.evaluate({ ...input, sourceEvent: "seed" });
  }

  public reset(mode?: AlertEvaluationMode, clearHistory = false): void {
    this.assertAlive();
    if (mode === undefined) {
      for (const currentMode of ["live", "replay"] as const) this.states.get(currentMode)?.clear();
      if (clearHistory) this.history.length = 0;
      return;
    }
    this.states.get(mode)?.clear();
    if (clearHistory) {
      for (let index = this.history.length - 1; index >= 0; index -= 1) {
        if (this.history[index]?.evaluationMode === mode) this.history.splice(index, 1);
      }
    }
  }

  public historyFor(mode?: AlertEvaluationMode): AlertEvent[] {
    this.assertAlive();
    return this.history.filter((event) => mode === undefined || event.evaluationMode === mode).map(cloneEvent);
  }

  public clearHistory(mode?: AlertEvaluationMode): void {
    this.assertAlive();
    for (let index = this.history.length - 1; index >= 0; index -= 1) {
      if (mode === undefined || this.history[index]?.evaluationMode === mode) this.history.splice(index, 1);
    }
  }

  public exportDefinitions(): AlertDefinitionDocument {
    this.assertAlive();
    return { version: OPENKLINE_ALERTS_VERSION, alerts: this.list() };
  }

  public replaceDefinitions(definitions: readonly AlertDefinition[]): void {
    this.assertAlive();
    const normalized = definitions.map(normalizeDefinition);
    const ids = new Set<string>();
    for (const definition of normalized) {
      if (ids.has(definition.id)) throw new AlertValidationError(`Duplicate alert: ${definition.id}`);
      ids.add(definition.id);
    }
    this.definitions.clear();
    for (const definition of normalized) this.definitions.set(definition.id, definition);
    this.reset();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.definitions.clear();
    for (const state of this.states.values()) state.clear();
    this.history.length = 0;
    this.listeners.clear();
    this.diagnosticListeners.clear();
  }

  private apiFor(id: string): AlertApi {
    return {
      id,
      getDefinition: () => cloneDefinition(this.require(id)),
      getStatus: (mode = "live") => this.getStatus(id, mode),
      update: (patch) => this.update(id, patch),
      setEnabled: (enabled) => this.update(id, { enabled }),
      reset: (mode) => this.resetRule(id, mode),
      remove: () => this.remove(id),
    };
  }

  private resetRuntime(id: string): void {
    this.states.get("live")?.delete(id);
    this.states.get("replay")?.delete(id);
  }

  private resetRule(id: string, mode?: AlertEvaluationMode): void {
    this.assertAlive();
    if (!this.definitions.has(id)) throw new AlertValidationError(`Unknown alert: ${id}`);
    if (mode === undefined) {
      this.states.get("live")?.delete(id);
      this.states.get("replay")?.delete(id);
    } else {
      this.states.get(mode)?.delete(id);
    }
  }

  private runtimeFor(id: string, mode: AlertEvaluationMode): RuntimeState {
    const states = this.states.get(mode);
    if (states === undefined) throw new AlertLifecycleError(`Unknown alert evaluation mode: ${mode}`);
    const existing = states.get(id);
    if (existing !== undefined) return existing;
    const created: RuntimeState = {
      previous: null,
      lastTime: null,
      triggered: false,
      triggeredCount: 0,
      lastEventId: null,
      lastTriggeredBarTimestamp: null,
      lastError: null,
      emittedEventIds: new Set(),
    };
    states.set(id, created);
    return created;
  }

  private require(id: string): AlertDefinition {
    const normalized = normalizeId(id);
    const definition = this.definitions.get(normalized);
    if (definition === undefined) throw new AlertValidationError(`Unknown alert: ${id}`);
    return definition;
  }

  private assertAlive(): void {
    if (this.disposed) throw new AlertLifecycleError("Alert engine has been disposed");
  }

  private notify(event: AlertEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(cloneEvent(event));
      } catch (error) {
        this.notifyDiagnostic({ alertId: event.alertId, evaluationMode: event.evaluationMode, message: error instanceof Error ? error.message : String(error), cause: error });
      }
    }
  }

  private notifyDiagnostic(diagnostic: AlertDiagnostic): void {
    for (const listener of this.diagnosticListeners) listener({ ...diagnostic });
  }
}

export function parseAlertDefinitions(value: unknown): AlertDefinitionDocument {
  if (!isRecord(value) || value.version !== OPENKLINE_ALERTS_VERSION || !Array.isArray(value.alerts)) {
    throw new AlertValidationError(`Unsupported alert definition document; expected version ${OPENKLINE_ALERTS_VERSION}`);
  }
  const alerts = value.alerts.map((item) => normalizeDefinition(item));
  const ids = new Set<string>();
  for (const alert of alerts) {
    if (ids.has(alert.id)) throw new AlertValidationError(`Duplicate alert: ${alert.id}`);
    ids.add(alert.id);
  }
  return { version: OPENKLINE_ALERTS_VERSION, alerts };
}

function evaluateCondition(condition: AlertCondition, input: AlertEvaluationInput, outputs: ReadonlyMap<string, AlertOutputSnapshot>, previous: Observation | null): ConditionMatch {
  switch (condition.type) {
    case "price-above": return thresholdMatch(input.candle[condition.field ?? "close"], previous?.value ?? null, condition.value, "above");
    case "price-below": return thresholdMatch(input.candle[condition.field ?? "close"], previous?.value ?? null, condition.value, "below");
    case "price-cross-above": return thresholdMatch(input.candle[condition.field ?? "close"], previous?.value ?? null, condition.value, "cross-above");
    case "price-cross-below": return thresholdMatch(input.candle[condition.field ?? "close"], previous?.value ?? null, condition.value, "cross-below");
    case "indicator-above": return thresholdMatch(readOutput(outputs, condition.indicatorId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "above");
    case "indicator-below": return thresholdMatch(readOutput(outputs, condition.indicatorId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "below");
    case "indicator-cross-above": return thresholdMatch(readOutput(outputs, condition.indicatorId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "cross-above");
    case "indicator-cross-below": return thresholdMatch(readOutput(outputs, condition.indicatorId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "cross-below");
    case "indicator-output-cross-above": return pairMatch(readOutput(outputs, condition.left.indicatorId, condition.left.outputId, input.candle.time), readOutput(outputs, condition.right.indicatorId, condition.right.outputId, input.candle.time), previous, "cross-above");
    case "indicator-output-cross-below": return pairMatch(readOutput(outputs, condition.left.indicatorId, condition.left.outputId, input.candle.time), readOutput(outputs, condition.right.indicatorId, condition.right.outputId, input.candle.time), previous, "cross-below");
    case "script-above": return thresholdMatch(readOutput(outputs, condition.scriptId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "above");
    case "script-below": return thresholdMatch(readOutput(outputs, condition.scriptId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "below");
    case "script-cross-above": return thresholdMatch(readOutput(outputs, condition.scriptId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "cross-above");
    case "script-cross-below": return thresholdMatch(readOutput(outputs, condition.scriptId, condition.outputId, input.candle.time), previous?.value ?? null, condition.value, "cross-below");
    case "script-true": {
      const value = readOutput(outputs, condition.scriptId, condition.outputId, input.candle.time);
      return { matches: value === true, observedValue: value, comparisonValue: null };
    }
    case "drawing-horizontal-cross-above": return drawingMatch(input, condition.drawingId, condition.field ?? "close", previous?.value ?? null, "cross-above");
    case "drawing-horizontal-cross-below": return drawingMatch(input, condition.drawingId, condition.field ?? "close", previous?.value ?? null, "cross-below");
  }
}

function thresholdMatch(value: AlertValue, previous: AlertValue, threshold: number, operation: "above" | "below" | "cross-above" | "cross-below"): ConditionMatch {
  const current = numeric(value);
  const prior = numeric(previous);
  const matches = operation === "above"
    ? current !== null && current > threshold
    : operation === "below"
      ? current !== null && current < threshold
      : operation === "cross-above"
        ? current !== null && prior !== null && prior <= threshold && current > threshold
        : current !== null && prior !== null && prior >= threshold && current < threshold;
  return { matches, observedValue: value, comparisonValue: null, threshold };
}

function pairMatch(left: AlertValue, right: AlertValue, previous: Observation | null, operation: "cross-above" | "cross-below"): ConditionMatch {
  const currentLeft = numeric(left);
  const currentRight = numeric(right);
  const priorLeft = numeric(previous?.value ?? null);
  const priorRight = numeric(previous?.comparisonValue ?? null);
  const matches = currentLeft !== null && currentRight !== null && priorLeft !== null && priorRight !== null
    && (operation === "cross-above"
      ? priorLeft <= priorRight && currentLeft > currentRight
      : priorLeft >= priorRight && currentLeft < currentRight);
  return { matches, observedValue: left, comparisonValue: right };
}

function drawingMatch(input: AlertEvaluationInput, drawingId: string, field: "open" | "high" | "low" | "close", previous: AlertValue, operation: "cross-above" | "cross-below"): ConditionMatch {
  const drawing = input.drawings?.find((candidate) => candidate.id === drawingId && candidate.type === "horizontal-line");
  if (drawing === undefined || drawing.points[0] === undefined) throw new AlertEvaluationError(`Horizontal drawing is unavailable: ${drawingId}`);
  return thresholdMatch(input.candle[field], previous, drawing.points[0].price, operation);
}

function readOutput(outputs: ReadonlyMap<string, AlertOutputSnapshot>, sourceId: string, outputId: string, time: number): AlertValue {
  const output = outputs.get(outputKey(sourceId, outputId));
  if (output === undefined) throw new AlertEvaluationError(`Alert output is unavailable: ${sourceId}:${outputId}`);
  if (output.time !== undefined && output.time !== time) throw new AlertEvaluationError(`Alert output is not aligned to candle time: ${sourceId}:${outputId}`);
  if (output.value !== null && typeof output.value === "number" && !Number.isFinite(output.value)) {
    throw new AlertEvaluationError(`Alert output is non-finite: ${sourceId}:${outputId}`);
  }
  return output.value;
}

function outputMap(outputs: readonly AlertOutputSnapshot[], time: number): Map<string, AlertOutputSnapshot> {
  const map = new Map<string, AlertOutputSnapshot>();
  for (const output of outputs) {
    if (typeof output.sourceId !== "string" || typeof output.outputId !== "string" || output.sourceId.length === 0 || output.outputId.length === 0) {
      throw new AlertEvaluationError("Alert output references must be non-empty strings");
    }
    if (output.time !== undefined && output.time !== time) continue;
    const key = outputKey(output.sourceId, output.outputId);
    if (map.has(key)) throw new AlertEvaluationError(`Duplicate alert output: ${key}`);
    map.set(key, { ...output });
  }
  return map;
}

function canEmit(definition: AlertDefinition, runtime: RuntimeState, input: AlertEvaluationInput, _mode: AlertEvaluationMode): boolean {
  const frequency = definition.frequency ?? "once-per-bar";
  if (frequency === "once" && runtime.triggered) return false;
  if (frequency === "once-per-confirmed-bar" && input.isFinal !== true) return false;
  if (definition.cooldownMs !== undefined && runtime.lastTriggeredBarTimestamp !== null
    && input.candle.time - runtime.lastTriggeredBarTimestamp < definition.cooldownMs) return false;
  if ((frequency === "once-per-bar" || frequency === "once-per-confirmed-bar")
    && runtime.lastTriggeredBarTimestamp === input.candle.time) return false;
  return true;
}

function normalizeDefinition(definition: AlertDefinition): AlertDefinition {
  if (!isRecord(definition)) throw new AlertValidationError("Alert definition must be an object");
  const rawId = definition.id;
  if (typeof rawId !== "string") throw new AlertValidationError("Alert id must be a string");
  const id = normalizeId(rawId);
  if (!/^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(id)) throw new AlertValidationError(`Invalid alert id: ${definition.id}`);
  if (typeof definition.name !== "string") throw new AlertValidationError("Alert name must be a string");
  const name = definition.name.trim();
  if (name.length === 0 || name.length > 200) throw new AlertValidationError("Alert name must contain 1..200 characters");
  const condition = normalizeCondition(definition.condition);
  const frequency = definition.frequency ?? "once-per-bar";
  if (!["once", "every-event", "once-per-bar", "once-per-confirmed-bar"].includes(frequency)) throw new AlertValidationError(`Invalid alert frequency: ${String(frequency)}`);
  if (definition.cooldownMs !== undefined && (!Number.isInteger(definition.cooldownMs) || definition.cooldownMs < 0)) throw new AlertValidationError("Alert cooldownMs must be a non-negative integer");
  for (const [key, value] of [["symbol", definition.symbol], ["timeframe", definition.timeframe]] as const) {
    if (value !== undefined && (typeof value !== "string" || value.length > 128)) throw new AlertValidationError(`Invalid alert ${key}`);
  }
  return {
    id,
    name,
    condition,
    frequency: frequency as AlertFrequency,
    enabled: definition.enabled !== false,
    ...(definition.cooldownMs === undefined ? {} : { cooldownMs: definition.cooldownMs }),
    ...(definition.symbol === undefined ? {} : { symbol: definition.symbol }),
    ...(definition.timeframe === undefined ? {} : { timeframe: definition.timeframe }),
  };
}

function normalizeCondition(condition: AlertCondition): AlertCondition {
  const candidate = condition as any;
  if (!isRecord(candidate) || typeof candidate.type !== "string") throw new AlertValidationError("Alert condition is invalid");
  const type = candidate.type as AlertCondition["type"];
  if (type === "indicator-output-cross-above" || type === "indicator-output-cross-below") {
    return { type, left: normalizeReference(candidate.left), right: normalizeReference(candidate.right) } as AlertCondition;
  }
  if (type.startsWith("price-")) {
    if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) throw new AlertValidationError("Price alert threshold must be finite");
    if (candidate.field !== undefined && !["open", "high", "low", "close"].includes(candidate.field)) throw new AlertValidationError("Invalid price alert field");
    return { type, value: candidate.value, ...(candidate.field === undefined ? {} : { field: candidate.field }) } as AlertCondition;
  }
  if (type.startsWith("indicator-") || type.startsWith("script-")) {
    const isScript = type.startsWith("script-");
    const sourceId = isScript ? candidate.scriptId : candidate.indicatorId;
    if (typeof sourceId !== "string" || sourceId.length === 0 || typeof candidate.outputId !== "string" || candidate.outputId.length === 0) throw new AlertValidationError("Alert output reference is invalid");
    if (type === "script-true") return { type, scriptId: sourceId, outputId: candidate.outputId } as AlertCondition;
    if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) throw new AlertValidationError("Indicator/script threshold must be finite");
    return isScript
      ? { type, scriptId: sourceId, outputId: candidate.outputId, value: candidate.value } as AlertCondition
      : { type, indicatorId: sourceId, outputId: candidate.outputId, value: candidate.value } as AlertCondition;
  }
  if (type === "drawing-horizontal-cross-above" || type === "drawing-horizontal-cross-below") {
    if (typeof candidate.drawingId !== "string" || candidate.drawingId.length === 0) throw new AlertValidationError("Drawing alert requires a drawing id");
    if (candidate.field !== undefined && !["open", "high", "low", "close"].includes(candidate.field)) throw new AlertValidationError("Invalid drawing alert field");
    return { type, drawingId: candidate.drawingId, ...(candidate.field === undefined ? {} : { field: candidate.field }) } as AlertCondition;
  }
  throw new AlertValidationError(`Unsupported alert condition: ${type}`);
}

function normalizeReference(reference: unknown): { indicatorId: string; outputId: string } {
  if (!isRecord(reference) || typeof reference.indicatorId !== "string" || reference.indicatorId.length === 0 || typeof reference.outputId !== "string" || reference.outputId.length === 0) throw new AlertValidationError("Indicator output reference is invalid");
  return { indicatorId: reference.indicatorId, outputId: reference.outputId };
}

function cloneDefinition(definition: AlertDefinition): AlertDefinition {
  return { ...definition, condition: cloneCondition(definition.condition) };
}

function cloneCondition(condition: AlertCondition): AlertCondition {
  if (condition.type === "indicator-output-cross-above" || condition.type === "indicator-output-cross-below") return { ...condition, left: { ...condition.left }, right: { ...condition.right } };
  return { ...condition } as AlertCondition;
}

function cloneEvent(event: AlertEvent): AlertEvent {
  return { ...event };
}

function numeric(value: AlertValue): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function outputKey(sourceId: string, outputId: string): string {
  return `${sourceId}\u0000${outputId}`;
}

function normalizeId(id: string): string {
  if (typeof id !== "string") throw new AlertValidationError("Alert id must be a string");
  return id.trim();
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
