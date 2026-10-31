import type {
  MarketReplayClockPolicy,
  MarketReplayKnowledgePolicy,
  MarketReplaySource,
  MarketReplayTape,
} from "../replay/market-event-tape.js";
import type {
  ResearchDecisionRecord,
  ResearchLatencyPolicy,
  ResearchScenarioArtifact,
  ResearchScenarioArtifactCreateOptions,
  ResearchScenarioArtifactIntegrity,
  ResearchScenarioArtifactValidationOptions,
  ResearchScenarioAssumptions,
  ResearchScenarioCursor,
  ResearchScenarioExport,
  ResearchScenarioFrontier,
  ResearchScenarioResultEvidence,
} from "./types.js";
import { OPENKLINE_RESEARCH_SCENARIO_ARTIFACT_VERSION } from "./types.js";

const DEFAULT_MAX_SERIALIZED_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_DECISIONS = 100_000;
const DEFAULT_MAX_STRING_LENGTH = 256;
const DEFAULT_MAX_NESTING_DEPTH = 32;
const ABSOLUTE_MAX_SERIALIZED_BYTES = 8 * 1024 * 1024;
const ABSOLUTE_MAX_DECISIONS = 100_000;
const ABSOLUTE_MAX_STRING_LENGTH = 4_096;
const ABSOLUTE_MAX_NESTING_DEPTH = 64;
const MAX_ARRAY_LENGTH = 100_000;
const MAX_FINANCIAL_VALUE = 1e18;

export type ResearchScenarioArtifactErrorCode =
  | "INVALID_ARTIFACT"
  | "MALFORMED_JSON"
  | "SIZE_LIMIT"
  | "NESTING_LIMIT"
  | "CYCLIC_VALUE"
  | "UNSUPPORTED_VERSION"
  | "UNKNOWN_FIELD"
  | "INVALID_NUMBER"
  | "INVALID_DECISION"
  | "INVALID_INTEGRITY";

export class ResearchScenarioArtifactValidationError extends Error {
  public constructor(public readonly code: ResearchScenarioArtifactErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ResearchScenarioArtifactValidationError";
  }
}

export interface ResearchScenarioArtifactInput {
  readonly scenario: ResearchScenarioExport;
  readonly tape: MarketReplayTape;
  readonly frontier: ResearchScenarioFrontier;
  readonly options?: ResearchScenarioArtifactCreateOptions;
}

interface NormalizedValidationLimits {
  readonly maxSerializedBytes: number;
  readonly maxDecisions: number;
  readonly maxStringLength: number;
  readonly maxNestingDepth: number;
}

export function createResearchScenarioArtifact(input: ResearchScenarioArtifactInput): ResearchScenarioArtifact {
  const expectedResult = input.options?.includeExpectedResult === false
    ? undefined
    : createResearchScenarioResultEvidence(input.scenario, input.frontier);
  const base: Omit<ResearchScenarioArtifact, "integrity"> = {
    artifactType: "openkline-research-scenario",
    schemaVersion: OPENKLINE_RESEARCH_SCENARIO_ARTIFACT_VERSION,
    scenarioId: input.scenario.scenarioId,
    tape: {
      id: input.tape.id,
      fingerprint: input.tape.fingerprint,
      version: input.tape.version,
      orderingVersion: input.tape.ordering.version,
      instrumentIds: [...input.tape.instrumentIds],
      sources: input.tape.sources.map(cloneSource),
    },
    replay: {
      tapeVersion: input.tape.version,
      orderingVersion: input.tape.ordering.version,
      clockPolicy: input.scenario.assumptions.clockPolicy,
      knowledgePolicy: input.scenario.assumptions.knowledgePolicy,
      frontier: cloneFrontier(input.frontier),
    },
    assumptions: cloneAssumptions(input.scenario.assumptions),
    decisions: input.scenario.decisions.map(cloneDecision),
    decisionHistory: {
      complete: true,
      count: input.scenario.decisions.length,
      lastDecisionOrdinal: input.scenario.decisions.at(-1)?.decisionOrdinal ?? null,
    },
    journalRetention: { ...input.scenario.journalRetention },
    ...(expectedResult === undefined ? {} : { expectedResult }),
  };
  const integrity: ResearchScenarioArtifactIntegrity = {
    algorithm: "fnv1a64",
    contentHash: fnv1a64(canonicalStringify(base)),
    authenticated: false,
  };
  const artifact = { ...base, integrity };
  validateResearchScenarioArtifact(artifact);
  return artifact;
}

export function validateResearchScenarioArtifact(
  value: unknown,
  options: ResearchScenarioArtifactValidationOptions = {},
): asserts value is ResearchScenarioArtifact {
  const limits = normalizeLimits(options);
  scanValue(value, 0, new Set<object>(), limits);
  const artifact = record(value, "scenario artifact");
  exactKeys(artifact, ["artifactType", "schemaVersion", "scenarioId", "tape", "replay", "assumptions", "decisions", "decisionHistory", "journalRetention", "integrity"], ["expectedResult"], "scenario artifact");
  if (artifact.artifactType !== "openkline-research-scenario") fail("INVALID_ARTIFACT", "artifactType is unsupported");
  if (artifact.schemaVersion !== OPENKLINE_RESEARCH_SCENARIO_ARTIFACT_VERSION) fail("UNSUPPORTED_VERSION", "scenario artifact schemaVersion is unsupported");
  const scenarioId = stringValue(artifact.scenarioId, "scenarioId", limits);
  validateTapeBinding(artifact.tape, limits);
  validateReplay(artifact.replay, limits);
  validateAssumptions(artifact.assumptions, limits);
  validateDecisions(artifact.decisions, scenarioId, artifact.replay, limits);
  validateDecisionHistory(artifact.decisionHistory, artifact.decisions, limits);
  validateJournalRetention(artifact.journalRetention);
  if (artifact.expectedResult !== undefined) validateExpectedResult(artifact.expectedResult, limits);
  validateIntegrity(artifact.integrity, artifact, limits);
}

export function parseResearchScenarioArtifact(
  value: string | unknown,
  options: ResearchScenarioArtifactValidationOptions = {},
): ResearchScenarioArtifact {
  const limits = normalizeLimits(options);
  let parsed: unknown = value;
  if (typeof value === "string") {
    if (utf8ByteLength(value) > limits.maxSerializedBytes) fail("SIZE_LIMIT", `serialized scenario exceeds ${limits.maxSerializedBytes} bytes`);
    try {
      parsed = JSON.parse(value) as unknown;
    } catch (error) {
      fail("MALFORMED_JSON", `invalid scenario JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  validateResearchScenarioArtifact(parsed, limits);
  return parsed;
}

export function serializeResearchScenarioArtifact(value: ResearchScenarioArtifact): string {
  validateResearchScenarioArtifact(value);
  return canonicalStringify(value);
}

export function createResearchScenarioResultEvidence(
  scenario: ResearchScenarioExport,
  frontier: ResearchScenarioFrontier,
): ResearchScenarioResultEvidence {
  return {
    algorithm: "fnv1a64",
    fingerprint: fingerprintResearchScenarioResult(scenario, frontier),
    state: frontier.state,
    cursor: cloneCursor(frontier),
  };
}

export function fingerprintResearchScenarioResult(
  scenario: ResearchScenarioExport,
  frontier: ResearchScenarioFrontier,
): string {
  return fnv1a64(canonicalStringify({
    version: scenario.version,
    scenarioId: scenario.scenarioId,
    tapeFingerprint: scenario.tapeFingerprint,
    tapeId: scenario.tapeId,
    assumptions: scenario.assumptions,
    decisions: scenario.decisions,
    orders: scenario.orders,
    fills: scenario.fills,
    ledger: scenario.ledger,
    journal: scenario.journal,
    journalRetention: scenario.journalRetention,
    diagnostics: scenario.diagnostics,
    frontier,
  }));
}

function validateTapeBinding(value: unknown, limits: NormalizedValidationLimits): void {
  const tape = record(value, "tape binding");
  exactKeys(tape, ["id", "fingerprint", "version", "orderingVersion", "instrumentIds", "sources"], [], "tape binding");
  stringValue(tape.id, "tape.id", limits);
  const fingerprint = stringValue(tape.fingerprint, "tape.fingerprint", limits);
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) fail("INVALID_ARTIFACT", "tape.fingerprint must be a 16-character hexadecimal content fingerprint");
  positiveSafeInteger(tape.version, "tape.version");
  positiveSafeInteger(tape.orderingVersion, "tape.orderingVersion");
  const instrumentIds = stringArray(tape.instrumentIds, "tape.instrumentIds", limits);
  if (new Set(instrumentIds).size !== instrumentIds.length) fail("INVALID_ARTIFACT", "tape.instrumentIds must be unique");
  const sources = arrayValue(tape.sources, "tape.sources", limits);
  if (sources.length > 1_000) fail("SIZE_LIMIT", "tape.sources exceeds 1000 entries");
  const sourceKeys = new Set<string>();
  for (const [index, source] of sources.entries()) {
    validateSource(source, `tape.sources[${index}]`, limits);
    const typed = source as Record<string, unknown>;
    const key = `${typed.id}\u0000${typed.version}`;
    if (sourceKeys.has(key)) fail("INVALID_ARTIFACT", `duplicate tape source ${key}`);
    sourceKeys.add(key);
  }
}

function validateReplay(value: unknown, limits: NormalizedValidationLimits): void {
  const replay = record(value, "replay metadata");
  exactKeys(replay, ["tapeVersion", "orderingVersion", "clockPolicy", "knowledgePolicy", "frontier"], [], "replay metadata");
  positiveSafeInteger(replay.tapeVersion, "replay.tapeVersion");
  positiveSafeInteger(replay.orderingVersion, "replay.orderingVersion");
  clockPolicy(replay.clockPolicy, "replay.clockPolicy");
  knowledgePolicy(replay.knowledgePolicy, "replay.knowledgePolicy");
  validateFrontier(replay.frontier, limits);
}

function validateFrontier(value: unknown, limits: NormalizedValidationLimits): void {
  const frontier = record(value, "replay.frontier");
  exactKeys(frontier, ["eventIndex", "eventId", "time", "clockTime", "state"], [], "replay.frontier");
  nullableSafeInteger(frontier.eventIndex, "replay.frontier.eventIndex");
  nullableString(frontier.eventId, "replay.frontier.eventId", limits);
  nullableSafeInteger(frontier.time, "replay.frontier.time");
  nullableSafeInteger(frontier.clockTime, "replay.frontier.clockTime");
  restorableState(frontier.state, "replay.frontier.state");
  const index = frontier.eventIndex as number | null;
  const id = frontier.eventId as string | null;
  if ((index === null) !== (id === null)) fail("INVALID_ARTIFACT", "frontier eventIndex and eventId must be null together");
  if (index === null && (frontier.time !== null || frontier.clockTime !== null)) fail("INVALID_ARTIFACT", "empty frontier must not contain timestamps");
  if (index === null && frontier.state !== "idle" && frontier.state !== "ready") fail("INVALID_ARTIFACT", "empty frontier state must be idle or ready");
  if (index !== null && frontier.state === "idle") fail("INVALID_ARTIFACT", "non-empty frontier cannot be idle");
}

function validateAssumptions(value: unknown, limits: NormalizedValidationLimits): void {
  const assumptions = record(value, "assumptions");
  exactKeys(assumptions, ["instrumentId", "venueId", "currency", "initialCapital", "clockPolicy", "knowledgePolicy", "latency", "execution", "precision", "commission", "slippage", "priceImpact", "maxQuoteAgeMs", "risk", "corporateActionSource", "maxJournalEntries", "maxDepth"], [], "assumptions");
  stringValue(assumptions.instrumentId, "assumptions.instrumentId", limits);
  nullableString(assumptions.venueId, "assumptions.venueId", limits);
  stringValue(assumptions.currency, "assumptions.currency", limits);
  finiteNonNegative(assumptions.initialCapital, "assumptions.initialCapital");
  clockPolicy(assumptions.clockPolicy, "assumptions.clockPolicy");
  knowledgePolicy(assumptions.knowledgePolicy, "assumptions.knowledgePolicy");
  validateLatency(assumptions.latency, limits);
  validateExecution(assumptions.execution);
  validatePrecision(assumptions.precision);
  validateCost(assumptions.commission, "assumptions.commission");
  validateCost(assumptions.slippage, "assumptions.slippage");
  if (assumptions.priceImpact !== null) validateCost(assumptions.priceImpact, "assumptions.priceImpact");
  finiteNonNegative(assumptions.maxQuoteAgeMs, "assumptions.maxQuoteAgeMs");
  validateRisk(assumptions.risk);
  if (assumptions.corporateActionSource !== null) validateSource(assumptions.corporateActionSource, "assumptions.corporateActionSource", limits);
  positiveSafeInteger(assumptions.maxJournalEntries, "assumptions.maxJournalEntries");
  positiveSafeInteger(assumptions.maxDepth, "assumptions.maxDepth");
}

function validateLatency(value: unknown, limits: NormalizedValidationLimits): void {
  const latency = record(value, "assumptions.latency");
  const type = latency.type;
  if (type === "zero") {
    exactKeys(latency, ["type"], [], "assumptions.latency");
    return;
  }
  if (type === "fixed") {
    exactKeys(latency, ["type", "delayMs"], [], "assumptions.latency");
    finiteNonNegative(latency.delayMs, "assumptions.latency.delayMs");
    return;
  }
  if (type !== "bounded") fail("INVALID_ARTIFACT", "assumptions.latency.type is unsupported");
  exactKeys(latency, ["type", "delaysMs"], [], "assumptions.latency");
  const delays = arrayValue(latency.delaysMs, "assumptions.latency.delaysMs", limits);
  if (delays.length === 0 || delays.length > 10_000) fail("INVALID_ARTIFACT", "bounded latency must contain 1..10000 delays");
  delays.forEach((delay, index) => finiteNonNegative(delay, `assumptions.latency.delaysMs[${index}]`));
}

function validateExecution(value: unknown): void {
  const execution = record(value, "assumptions.execution");
  exactKeys(execution, ["maxParticipationRate", "allowPartialFills", "passivePolicy"], ["scenarioBias"], "assumptions.execution");
  finitePositiveBounded(execution.maxParticipationRate, 1, "assumptions.execution.maxParticipationRate");
  booleanValue(execution.allowPartialFills, "assumptions.execution.allowPartialFills");
  enumValue(execution.passivePolicy, ["no-inferred-passive-fill", "conservative-eligibility", "explicit-scenario"], "assumptions.execution.passivePolicy");
  if (execution.scenarioBias !== undefined) enumValue(execution.scenarioBias, ["optimistic", "conservative"], "assumptions.execution.scenarioBias");
}

function validatePrecision(value: unknown): void {
  const precision = record(value, "assumptions.precision");
  exactKeys(precision, ["tickPolicy", "quantityPolicy"], ["tickSize", "quantityStep", "minimumQuantity"], "assumptions.precision");
  enumValue(precision.tickPolicy, ["reject", "round"], "assumptions.precision.tickPolicy");
  enumValue(precision.quantityPolicy, ["reject", "round"], "assumptions.precision.quantityPolicy");
  if (precision.tickSize !== undefined) finitePositive(precision.tickSize, "assumptions.precision.tickSize");
  if (precision.quantityStep !== undefined) finitePositive(precision.quantityStep, "assumptions.precision.quantityStep");
  if (precision.minimumQuantity !== undefined) finitePositive(precision.minimumQuantity, "assumptions.precision.minimumQuantity");
}

function validateRisk(value: unknown): void {
  const risk = record(value, "assumptions.risk");
  exactKeys(risk, [], ["maxOrderNotional", "maxOrderQuantity", "maxPositionQuantity", "maxPendingOrders", "maxDrawdown"], "assumptions.risk");
  if (risk.maxOrderNotional !== undefined) finiteNonNegative(risk.maxOrderNotional, "assumptions.risk.maxOrderNotional");
  if (risk.maxOrderQuantity !== undefined) finitePositive(risk.maxOrderQuantity, "assumptions.risk.maxOrderQuantity");
  if (risk.maxPositionQuantity !== undefined) finitePositive(risk.maxPositionQuantity, "assumptions.risk.maxPositionQuantity");
  if (risk.maxPendingOrders !== undefined) positiveSafeInteger(risk.maxPendingOrders, "assumptions.risk.maxPendingOrders");
  if (risk.maxDrawdown !== undefined) finiteNonNegative(risk.maxDrawdown, "assumptions.risk.maxDrawdown");
}

function validateCost(value: unknown, label: string): void {
  const cost = record(value, label);
  exactKeys(cost, ["type", "value"], [], label);
  enumValue(cost.type, ["percent", "fixed"], `${label}.type`);
  finiteNonNegative(cost.value, `${label}.value`);
  if (cost.type === "percent" && (cost.value as number) >= 1) fail("INVALID_ARTIFACT", `${label}.value must be less than 1 for percent costs`);
}

function validateDecisions(value: unknown, scenarioId: string, replay: unknown, limits: NormalizedValidationLimits): void {
  const decisions = arrayValue(value, "decisions", limits);
  if (decisions.length > limits.maxDecisions) fail("SIZE_LIMIT", `decisions exceeds ${limits.maxDecisions} entries`);
  const frontier = record(record(replay, "replay metadata").frontier, "replay.frontier");
  const frontierIndex = frontier.eventIndex as number | null;
  const decisionIds = new Set<string>();
  const orderIds = new Set<string>();
  const idempotencyKeys = new Set<string>();
  const submittedOrders = new Map<string, { cursor: number; idempotencyKey: string }>();
  let previousCursor = -1;
  let previousOrdinal = 0;
  for (const [index, valueAtIndex] of decisions.entries()) {
    const decision = record(valueAtIndex, `decisions[${index}]`);
    const type = decision.decisionType;
    if (type === "submit-order") {
      exactKeys(decision, ["idempotencyKey", "side", "type", "quantity", "decisionId", "decisionType", "decisionOrdinal", "orderId", "scenarioId", "decisionEventId", "decisionCursor", "decisionTime", "decisionClockTime", "eligibleClockTime"], ["limitPrice", "reason"], `decisions[${index}]`);
      const idempotencyKey = stringValue(decision.idempotencyKey, `decisions[${index}].idempotencyKey`, limits);
      if (idempotencyKeys.has(idempotencyKey)) fail("INVALID_DECISION", `duplicate idempotency key ${idempotencyKey}`);
      idempotencyKeys.add(idempotencyKey);
      enumValue(decision.side, ["buy", "sell"], `decisions[${index}].side`);
      enumValue(decision.type, ["market", "limit"], `decisions[${index}].type`);
      positiveFinancial(decision.quantity, `decisions[${index}].quantity`);
      if (decision.type === "limit") {
        if (decision.limitPrice === undefined) fail("INVALID_DECISION", `decisions[${index}] limit orders require limitPrice`);
        positiveFinancial(decision.limitPrice, `decisions[${index}].limitPrice`);
      } else if (decision.limitPrice !== undefined) positiveFinancial(decision.limitPrice, `decisions[${index}].limitPrice`);
      optionalString(decision.reason, `decisions[${index}].reason`, limits);
      validateDecisionCommon(decision, index, scenarioId, limits);
      const orderId = stringValue(decision.orderId, `decisions[${index}].orderId`, limits);
      if (orderIds.has(orderId)) fail("INVALID_DECISION", `duplicate orderId ${orderId}`);
      orderIds.add(orderId);
      submittedOrders.set(orderId, { cursor: decision.decisionCursor as number, idempotencyKey });
    } else if (type === "cancel-order") {
      exactKeys(decision, ["decisionId", "decisionType", "decisionOrdinal", "orderId", "scenarioId", "decisionEventId", "decisionCursor", "decisionTime", "decisionClockTime", "eligibleClockTime", "reason"], [], `decisions[${index}]`);
      validateDecisionCommon(decision, index, scenarioId, limits);
      if (decision.eligibleClockTime !== null) fail("INVALID_DECISION", `decisions[${index}].eligibleClockTime must be null for cancellation`);
      const orderId = stringValue(decision.orderId, `decisions[${index}].orderId`, limits);
      const submitted = submittedOrders.get(orderId);
      if (submitted === undefined) fail("INVALID_DECISION", `cancellation ${decision.decisionId} references an unavailable order ${orderId}`);
      if ((decision.decisionCursor as number) < submitted.cursor) fail("INVALID_DECISION", `cancellation ${decision.decisionId} precedes its submit decision`);
      stringValue(decision.reason, `decisions[${index}].reason`, limits);
    } else {
      fail("INVALID_DECISION", `decisions[${index}].decisionType is unsupported`);
    }
    const decisionId = stringValue(decision.decisionId, `decisions[${index}].decisionId`, limits);
    if (decisionIds.has(decisionId)) fail("INVALID_DECISION", `duplicate decisionId ${decisionId}`);
    decisionIds.add(decisionId);
    const cursor = decision.decisionCursor as number;
    const ordinal = decision.decisionOrdinal as number;
    if (cursor < previousCursor || (cursor === previousCursor && ordinal <= previousOrdinal)) fail("INVALID_DECISION", "decisions must be ordered by replay cursor and strictly increasing ordinal");
    previousCursor = cursor;
    previousOrdinal = ordinal;
    if (frontierIndex === null || cursor > frontierIndex) fail("INVALID_DECISION", `decision ${decisionId} lies beyond the recorded frontier`);
  }
}

function validateDecisionCommon(value: Record<string, unknown>, index: number, scenarioId: string, limits: NormalizedValidationLimits): void {
  stringValue(value.decisionId, `decisions[${index}].decisionId`, limits);
  positiveSafeInteger(value.decisionOrdinal, `decisions[${index}].decisionOrdinal`);
  if (value.scenarioId !== scenarioId) fail("INVALID_DECISION", `decisions[${index}].scenarioId does not match artifact scenarioId`);
  stringValue(value.scenarioId, `decisions[${index}].scenarioId`, limits);
  stringValue(value.decisionEventId, `decisions[${index}].decisionEventId`, limits);
  nonNegativeSafeInteger(value.decisionCursor, `decisions[${index}].decisionCursor`);
  safeTimestamp(value.decisionTime, `decisions[${index}].decisionTime`);
  nullableSafeInteger(value.decisionClockTime, `decisions[${index}].decisionClockTime`);
  nullableSafeInteger(value.eligibleClockTime, `decisions[${index}].eligibleClockTime`);
}

function validateDecisionHistory(value: unknown, decisions: unknown, limits: NormalizedValidationLimits): void {
  const history = record(value, "decisionHistory");
  exactKeys(history, ["complete", "count", "lastDecisionOrdinal"], [], "decisionHistory");
  booleanValue(history.complete, "decisionHistory.complete");
  const count = nonNegativeSafeInteger(history.count, "decisionHistory.count");
  const decisionCount = arrayValue(decisions, "decisions", limits).length;
  if (count !== decisionCount) fail("INVALID_ARTIFACT", "decisionHistory.count does not match decisions.length");
  nullableSafeInteger(history.lastDecisionOrdinal, "decisionHistory.lastDecisionOrdinal");
  if (count === 0 && history.lastDecisionOrdinal !== null) fail("INVALID_ARTIFACT", "empty decision history must have a null lastDecisionOrdinal");
  if (count > 0 && history.lastDecisionOrdinal === null) fail("INVALID_ARTIFACT", "non-empty decision history must have a lastDecisionOrdinal");
}

function validateJournalRetention(value: unknown): void {
  const retention = record(value, "journalRetention");
  exactKeys(retention, ["retainedEntries", "totalEmittedEntries", "evictedEntries", "complete"], [], "journalRetention");
  const retained = nonNegativeSafeInteger(retention.retainedEntries, "journalRetention.retainedEntries");
  const total = nonNegativeSafeInteger(retention.totalEmittedEntries, "journalRetention.totalEmittedEntries");
  const evicted = nonNegativeSafeInteger(retention.evictedEntries, "journalRetention.evictedEntries");
  booleanValue(retention.complete, "journalRetention.complete");
  if (retained > total || evicted > total || retained + evicted !== total) fail("INVALID_ARTIFACT", "journal retention counts are inconsistent");
  if ((retention.complete === true) !== (evicted === 0)) fail("INVALID_ARTIFACT", "journalRetention.complete must match evictedEntries");
}

function validateExpectedResult(value: unknown, limits: NormalizedValidationLimits): void {
  const expected = record(value, "expectedResult");
  exactKeys(expected, ["algorithm", "fingerprint", "state", "cursor"], [], "expectedResult");
  if (expected.algorithm !== "fnv1a64") fail("INVALID_ARTIFACT", "expectedResult.algorithm is unsupported");
  const fingerprint = stringValue(expected.fingerprint, "expectedResult.fingerprint", limits);
  if (!/^[0-9a-f]{16}$/.test(fingerprint)) fail("INVALID_ARTIFACT", "expectedResult.fingerprint must be a 16-character hexadecimal hash");
  restorableState(expected.state, "expectedResult.state");
  validateCursor(expected.cursor, "expectedResult.cursor", limits);
}

function validateCursor(value: unknown, label: string, limits: NormalizedValidationLimits): void {
  const cursor = record(value, label);
  exactKeys(cursor, ["eventIndex", "eventId", "time", "clockTime"], [], label);
  nullableSafeInteger(cursor.eventIndex, `${label}.eventIndex`);
  nullableString(cursor.eventId, `${label}.eventId`, limits);
  nullableSafeInteger(cursor.time, `${label}.time`);
  nullableSafeInteger(cursor.clockTime, `${label}.clockTime`);
}

function validateIntegrity(value: unknown, artifact: Record<string, unknown>, limits: NormalizedValidationLimits): void {
  const integrity = record(value, "integrity");
  exactKeys(integrity, ["algorithm", "contentHash", "authenticated"], [], "integrity");
  if (integrity.algorithm !== "fnv1a64" || integrity.authenticated !== false) fail("INVALID_INTEGRITY", "artifact integrity must be an unauthenticated fnv1a64 content hash");
  const contentHash = stringValue(integrity.contentHash, "integrity.contentHash", limits);
  if (!/^[0-9a-f]{16}$/.test(contentHash)) fail("INVALID_INTEGRITY", "integrity.contentHash must be a 16-character hexadecimal hash");
  const { integrity: ignored, ...unsigned } = artifact;
  void ignored;
  if (fnv1a64(canonicalStringify(unsigned)) !== contentHash) fail("INVALID_INTEGRITY", "artifact content hash does not match canonical content");
  if (utf8ByteLength(canonicalStringify(artifact)) > limits.maxSerializedBytes) fail("SIZE_LIMIT", `serialized scenario exceeds ${limits.maxSerializedBytes} bytes`);
}

function validateSource(value: unknown, label: string, limits: NormalizedValidationLimits): void {
  const source = record(value, label);
  exactKeys(source, ["id", "version"], ["kind"], label);
  stringValue(source.id, `${label}.id`, limits);
  stringValue(source.version, `${label}.version`, limits);
  optionalString(source.kind, `${label}.kind`, limits);
}

function cloneAssumptions(value: ResearchScenarioAssumptions): ResearchScenarioAssumptions {
  return {
    instrumentId: value.instrumentId,
    venueId: value.venueId,
    currency: value.currency,
    initialCapital: value.initialCapital,
    clockPolicy: value.clockPolicy,
    knowledgePolicy: value.knowledgePolicy,
    latency: cloneLatency(value.latency),
    execution: { ...value.execution },
    precision: { ...value.precision },
    commission: { ...value.commission },
    slippage: { ...value.slippage },
    priceImpact: value.priceImpact === null ? null : { ...value.priceImpact },
    maxQuoteAgeMs: value.maxQuoteAgeMs,
    risk: { ...value.risk },
    corporateActionSource: value.corporateActionSource === null ? null : cloneSource(value.corporateActionSource),
    maxJournalEntries: value.maxJournalEntries,
    maxDepth: value.maxDepth,
  };
}

function cloneLatency(value: ResearchLatencyPolicy): ResearchLatencyPolicy {
  return value.type === "bounded" ? { type: "bounded", delaysMs: [...value.delaysMs] } : { ...value };
}

function cloneDecision(value: ResearchDecisionRecord): ResearchDecisionRecord {
  return value.decisionType === "submit-order"
    ? { ...value, ...(value.limitPrice === undefined ? {} : { limitPrice: value.limitPrice }), ...(value.reason === undefined ? {} : { reason: value.reason }) }
    : { ...value };
}

function cloneSource(value: MarketReplaySource): MarketReplaySource {
  return { id: value.id, version: value.version, ...(value.kind === undefined ? {} : { kind: value.kind }) };
}

function cloneCursor(value: ResearchScenarioCursor): ResearchScenarioCursor {
  return { eventIndex: value.eventIndex, eventId: value.eventId, time: value.time, clockTime: value.clockTime };
}

function cloneFrontier(value: ResearchScenarioFrontier): ResearchScenarioFrontier {
  return { ...cloneCursor(value), state: value.state };
}

function normalizeLimits(options: ResearchScenarioArtifactValidationOptions): NormalizedValidationLimits {
  const maxSerializedBytes = boundedLimit(options.maxSerializedBytes, DEFAULT_MAX_SERIALIZED_BYTES, ABSOLUTE_MAX_SERIALIZED_BYTES, "maxSerializedBytes");
  const maxDecisions = boundedLimit(options.maxDecisions, DEFAULT_MAX_DECISIONS, ABSOLUTE_MAX_DECISIONS, "maxDecisions");
  const maxStringLength = boundedLimit(options.maxStringLength, DEFAULT_MAX_STRING_LENGTH, ABSOLUTE_MAX_STRING_LENGTH, "maxStringLength");
  const maxNestingDepth = boundedLimit(options.maxNestingDepth, DEFAULT_MAX_NESTING_DEPTH, ABSOLUTE_MAX_NESTING_DEPTH, "maxNestingDepth");
  return { maxSerializedBytes, maxDecisions, maxStringLength, maxNestingDepth };
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) fail("SIZE_LIMIT", `${label} must be a positive safe integer no greater than ${maximum}`);
  return value;
}

function scanValue(value: unknown, depth: number, ancestors: Set<object>, limits: NormalizedValidationLimits): void {
  if (depth > limits.maxNestingDepth) fail("NESTING_LIMIT", `value exceeds nesting depth ${limits.maxNestingDepth}`);
  if (value === null) return;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > MAX_FINANCIAL_VALUE) fail("INVALID_NUMBER", "numeric values must be finite and bounded");
    return;
  }
  if (typeof value === "string") {
    if (value.length > limits.maxStringLength) fail("SIZE_LIMIT", `string exceeds ${limits.maxStringLength} characters`);
    return;
  }
  if (typeof value === "boolean") return;
  if (typeof value !== "object") fail("INVALID_ARTIFACT", "functions, symbols, bigint, and undefined values are not allowed");
  if (ancestors.has(value)) fail("CYCLIC_VALUE", "cyclic artifact data is not allowed");
  if (!Array.isArray(value) && !isPlainRecord(value)) fail("INVALID_ARTIFACT", "artifact objects must be plain records");
  if (Array.isArray(value) && value.length > MAX_ARRAY_LENGTH) fail("SIZE_LIMIT", `array exceeds ${MAX_ARRAY_LENGTH} entries`);
  for (const key of Object.keys(value)) if (key === "__proto__" || key === "prototype" || key === "constructor") fail("INVALID_ARTIFACT", `prototype-pollution key ${key} is not allowed`);
  ancestors.add(value);
  if (Array.isArray(value)) {
    for (const entry of value) scanValue(entry, depth + 1, ancestors, limits);
  } else {
    for (const entry of Object.values(value)) scanValue(entry, depth + 1, ancestors, limits);
  }
  ancestors.delete(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainRecord(value)) fail("INVALID_ARTIFACT", `${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown, label: string, limits: NormalizedValidationLimits): unknown[] {
  if (!Array.isArray(value)) fail("INVALID_ARTIFACT", `${label} must be an array`);
  if (value.length > Math.min(MAX_ARRAY_LENGTH, limits.maxDecisions)) fail("SIZE_LIMIT", `${label} exceeds its bounded length`);
  return value;
}

function stringArray(value: unknown, label: string, limits: NormalizedValidationLimits): string[] {
  const values = arrayValue(value, label, limits);
  return values.map((entry, index) => stringValue(entry, `${label}[${index}]`, limits));
}

function exactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("UNKNOWN_FIELD", `${label}.${key} is not recognized`);
  for (const key of required) if (!Object.prototype.hasOwnProperty.call(value, key)) fail("INVALID_ARTIFACT", `${label}.${key} is required`);
}

function stringValue(value: unknown, label: string, limits: NormalizedValidationLimits): string {
  if (typeof value !== "string" || value.length === 0 || value.length > limits.maxStringLength) fail("INVALID_ARTIFACT", `${label} must be a non-empty bounded string`);
  return value;
}

function optionalString(value: unknown, label: string, limits: NormalizedValidationLimits): void {
  if (value !== undefined) stringValue(value, label, limits);
}

function nullableString(value: unknown, label: string, limits: NormalizedValidationLimits): void {
  if (value !== null) stringValue(value, label, limits);
}

function booleanValue(value: unknown, label: string): void {
  if (typeof value !== "boolean") fail("INVALID_ARTIFACT", `${label} must be boolean`);
}

function enumValue(value: unknown, values: readonly string[], label: string): void {
  if (typeof value !== "string" || !values.includes(value)) fail("INVALID_ARTIFACT", `${label} has an unsupported value`);
}

function clockPolicy(value: unknown, label: string): asserts value is MarketReplayClockPolicy {
  enumValue(value, ["event-time", "receive-time"], label);
}

function knowledgePolicy(value: unknown, label: string): asserts value is MarketReplayKnowledgePolicy {
  enumValue(value, ["strict-causal", "retrospective"], label);
}

function restorableState(value: unknown, label: string): void {
  enumValue(value, ["idle", "ready", "paused", "completed"], label);
}

function finiteNonNegative(value: unknown, label: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_FINANCIAL_VALUE) fail("INVALID_NUMBER", `${label} must be finite, non-negative, and bounded`);
}

function finitePositive(value: unknown, label: string): void {
  finiteNonNegative(value, label);
  if ((value as number) <= 0) fail("INVALID_NUMBER", `${label} must be positive`);
}

function finitePositiveBounded(value: unknown, upperBound: number, label: string): void {
  finitePositive(value, label);
  if ((value as number) > upperBound) fail("INVALID_NUMBER", `${label} exceeds ${upperBound}`);
}

function positiveFinancial(value: unknown, label: string): void {
  finitePositive(value, label);
}

function positiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail("INVALID_NUMBER", `${label} must be a positive safe integer`);
  return value as number;
}

function nonNegativeSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail("INVALID_NUMBER", `${label} must be a non-negative safe integer`);
  return value as number;
}

function nullableSafeInteger(value: unknown, label: string): void {
  if (value !== null) nonNegativeSafeInteger(value, label);
}

function safeTimestamp(value: unknown, label: string): void {
  nonNegativeSafeInteger(value, label);
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (isPlainRecord(value)) return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  fail("INVALID_ARTIFACT", "artifact contains a non-serializable value");
}

function fnv1a64(value: string): string {
  let hash = BigInt("14695981039346656037");
  const prime = BigInt("1099511628211");
  const mask = BigInt("18446744073709551615");
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fail(code: ResearchScenarioArtifactErrorCode, message: string): never {
  throw new ResearchScenarioArtifactValidationError(code, message);
}
