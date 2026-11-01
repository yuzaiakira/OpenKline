import type { TransactionCost } from "../backtesting/types.js";
import { validateMarketReplayTape, type MarketReplayTape } from "../replay/market-event-tape.js";
import {
  createResearchScenarioArtifactVariant,
  parseResearchScenarioArtifact,
} from "./scenario-artifact.js";
import { ResearchScenarioRestoreError, restoreResearchScenario } from "./scenario-restore.js";
import type {
  ResearchCheckpointOptions,
  ResearchExecutionPolicy,
  ResearchLatencyPolicy,
  ResearchPrecisionPolicy,
  ResearchRiskLimits,
  ResearchScenarioArtifact,
  ResearchScenarioArtifactValidationOptions,
  ResearchScenarioAssumptions,
  ResearchScenarioExport,
  ResearchScenarioResultEvidence,
  ResearchSourceQuality,
} from "./types.js";

export const OPENKLINE_RESEARCH_SCENARIO_COMPARISON_VERSION = 1 as const;

const DEFAULT_MAX_SCENARIOS = 8;
const ABSOLUTE_MAX_SCENARIOS = 8;
const DEFAULT_MAX_EVENT_VISITS = 1_000_000;
const ABSOLUTE_MAX_EVENT_VISITS = 1_000_000;
const DEFAULT_MAX_SERIALIZED_RESULT_BYTES = 8 * 1024 * 1024;
const ABSOLUTE_MAX_SERIALIZED_RESULT_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_RESULT_RECORDS = 10_000;
const MAX_RESULT_RECORDS = 100_000;
const DEFAULT_MAX_DIAGNOSTICS = 1_000;
const MAX_DIAGNOSTICS = 10_000;

export type ResearchScenarioComparisonCompatibility =
  | "identical-decision-history"
  | "compatible-fixed-history"
  | "decision-history-different"
  | "incompatible-tape"
  | "not-evaluated";

export type ResearchScenarioComparisonCandidateStatus =
  | "verified"
  | "no-expected-result"
  | "mismatch"
  | "indeterminate"
  | "incompatible"
  | "failed"
  | "cancelled";

export type ResearchScenarioComparisonStatus = "verified" | "partial" | "cancelled";

export interface ResearchScenarioAssumptionPatch {
  readonly commission?: TransactionCost;
  readonly slippage?: TransactionCost;
  readonly priceImpact?: TransactionCost | null;
  readonly latency?: ResearchLatencyPolicy;
  readonly execution?: Partial<ResearchExecutionPolicy>;
  readonly risk?: Partial<ResearchRiskLimits>;
  readonly precision?: Partial<ResearchPrecisionPolicy>;
}

export interface ResearchScenarioComparisonBaselineInput {
  readonly artifact: ResearchScenarioArtifact | string | unknown;
  readonly tape: MarketReplayTape;
}

export type ResearchScenarioComparisonCandidateInput =
  | {
    readonly candidateId: string;
    readonly patch: ResearchScenarioAssumptionPatch;
    readonly label?: string;
  }
  | {
    readonly candidateId: string;
    readonly artifact: ResearchScenarioArtifact | string | unknown;
    readonly label?: string;
  };

export interface ResearchScenarioComparisonLimits {
  readonly maxScenarios: number;
  readonly maxEligibleEventVisits: number;
  readonly maxSerializedResultBytes: number;
  readonly maxResultRecords: number;
  readonly maxDiagnostics: number;
}

export interface ResearchScenarioComparisonProgress {
  readonly phase: "validating" | "restoring" | "comparing" | "disposing" | "completed";
  readonly candidateId: string | null;
  readonly candidateIndex: number;
  readonly candidateCount: number;
  readonly processedEligibleEventVisits: number;
  readonly percentage: number;
}

export interface ResearchScenarioComparisonOptions {
  readonly baseline: ResearchScenarioComparisonBaselineInput;
  readonly candidates: readonly ResearchScenarioComparisonCandidateInput[];
  readonly maxScenarios?: number;
  readonly maxEligibleEventVisits?: number;
  readonly maxSerializedResultBytes?: number;
  readonly maxResultRecords?: number;
  readonly maxDiagnostics?: number;
  readonly validation?: ResearchScenarioArtifactValidationOptions;
  /** Checkpoints are disabled when this is omitted. */
  readonly checkpoints?: ResearchCheckpointOptions;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ResearchScenarioComparisonProgress) => void;
}

export interface ResearchScenarioComparisonProvenance {
  readonly candidateId: string;
  readonly label: string | null;
  readonly scenarioId: string;
  readonly artifactContentHash: string;
  readonly tapeId: string;
  readonly tapeFingerprint: string;
  readonly assumptionFingerprint: string;
  readonly decisionHistoryFingerprint: string;
  readonly decisionActionFingerprint: string;
  readonly resultFingerprint: string | null;
  readonly expectedResultFingerprint: string | null;
}

export interface ResearchScenarioComparisonMetrics {
  readonly currency: string;
  readonly initialCapital: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number | null;
  readonly equity: number | null;
  readonly valuation: "complete" | "partial" | "unknown";
  readonly drawdown: number;
  readonly drawdownPercent: number | null;
  readonly totalFees: number;
  readonly positionQuantity: number;
  readonly marketValue: number | null;
  readonly simulatedQuantity: number;
  readonly remainingOrderQuantity: number;
  readonly orderCount: number;
  readonly fillCount: number;
  readonly modeledExecution: {
    readonly feeAmount: number;
    /** Price-unit deltas, not currency costs. */
    readonly slippagePriceDelta: number;
    /** Price-unit deltas, not currency costs. */
    readonly priceImpactPriceDelta: number;
  };
}

export interface ResearchScenarioComparisonOrderSummary {
  readonly id: string;
  readonly decisionEventId: string;
  readonly decisionCursor: number;
  readonly side: "buy" | "sell";
  readonly type: "market" | "limit";
  readonly status: string;
  readonly requestedQuantity: number;
  readonly simulatedQuantity: number;
  readonly remainingQuantity: number;
  readonly cumulativeFees: number;
}

export interface ResearchScenarioComparisonFillSummary {
  readonly id: string;
  readonly orderId: string;
  readonly side: "buy" | "sell";
  readonly time: number;
  readonly executionPrice: number;
  readonly quantity: number;
  readonly fee: number;
  readonly slippage: number;
  readonly priceImpact: number;
  readonly quality: ResearchSourceQuality;
  readonly scenarioBias: string;
}

export interface ResearchScenarioComparisonScenarioResult {
  readonly reconstructionStatus: "verified" | "mismatch" | "no-expected-result";
  readonly evaluationStatus: "complete" | "indeterminate";
  readonly provenance: ResearchScenarioComparisonProvenance;
  readonly evidence: ResearchScenarioResultEvidence;
  readonly metrics: ResearchScenarioComparisonMetrics;
  readonly diagnostics: {
    readonly quality: readonly ResearchSourceQuality[];
    readonly warnings: readonly string[];
    readonly sourceCoverage: readonly { readonly source: { readonly id: string; readonly version: string; readonly kind?: string }; readonly status: string; readonly coverage: string }[];
    readonly recordsTruncated: boolean;
  };
  readonly orderSummaries: readonly ResearchScenarioComparisonOrderSummary[];
  readonly fillSummaries: readonly ResearchScenarioComparisonFillSummary[];
  readonly indeterminateReasons: readonly string[];
}

export interface ResearchScenarioComparisonMonetaryUnits {
  readonly baselineCurrency: string;
  readonly candidateCurrency: string;
  readonly comparable: boolean;
}

export interface ResearchScenarioMetricDelta {
  readonly status: "available" | "unknown" | "not-comparable";
  readonly baseline: number | null;
  readonly candidate: number | null;
  readonly delta: number | null;
  readonly reason: string | null;
}

export interface ResearchScenarioComparisonDifferences {
  readonly mode: "controlled-fixed-history" | "descriptive-different-history";
  readonly monetaryUnits: ResearchScenarioComparisonMonetaryUnits;
  readonly marketValue: ResearchScenarioMetricDelta;
  readonly realizedPnl: ResearchScenarioMetricDelta;
  readonly unrealizedPnl: ResearchScenarioMetricDelta;
  readonly equity: ResearchScenarioMetricDelta;
  readonly drawdown: ResearchScenarioMetricDelta;
  readonly drawdownPercent: ResearchScenarioMetricDelta;
  readonly totalFees: ResearchScenarioMetricDelta;
  readonly modeledExecution: {
    readonly feeAmount: ResearchScenarioMetricDelta;
    /** Price-unit deltas are not currency costs. */
    readonly slippagePriceDelta: ResearchScenarioMetricDelta;
    /** Price-unit deltas are not currency costs. */
    readonly priceImpactPriceDelta: ResearchScenarioMetricDelta;
  };
  readonly simulatedQuantity: ResearchScenarioMetricDelta;
  readonly remainingOrderQuantity: ResearchScenarioMetricDelta;
  readonly fillCount: ResearchScenarioMetricDelta;
  readonly orderCount: ResearchScenarioMetricDelta;
}

export interface ResearchScenarioComparisonCandidateResult {
  readonly candidateId: string;
  readonly label: string | null;
  readonly compatibility: ResearchScenarioComparisonCompatibility;
  readonly status: ResearchScenarioComparisonCandidateStatus;
  readonly scenario: ResearchScenarioComparisonScenarioResult | null;
  readonly differences: ResearchScenarioComparisonDifferences | null;
  readonly error: { readonly code: string; readonly message: string } | null;
}

export interface ResearchScenarioComparisonResult {
  readonly version: typeof OPENKLINE_RESEARCH_SCENARIO_COMPARISON_VERSION;
  readonly status: ResearchScenarioComparisonStatus;
  readonly comparisonFingerprint: string;
  readonly baseline: ResearchScenarioComparisonScenarioResult | null;
  readonly candidates: readonly ResearchScenarioComparisonCandidateResult[];
  readonly limits: ResearchScenarioComparisonLimits;
  readonly processedEligibleEventVisits: number;
  readonly warnings: readonly string[];
}

export type ResearchScenarioComparisonErrorCode =
  | "INVALID_INPUT"
  | "INVALID_TAPE"
  | "BASELINE_RESTORE_FAILED"
  | "SCENARIO_LIMIT"
  | "EVENT_VISIT_LIMIT"
  | "RESULT_SIZE_LIMIT"
  | "CANCELLED";

export class ResearchScenarioComparisonError extends Error {
  public constructor(public readonly code: ResearchScenarioComparisonErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "ResearchScenarioComparisonError";
  }
}

interface PreparedCandidate {
  readonly candidateId: string;
  readonly label: string | null;
  readonly artifact: ResearchScenarioArtifact;
}

interface ComparisonState {
  processedEligibleEventVisits: number;
}

export function compareResearchScenarios(options: ResearchScenarioComparisonOptions): ResearchScenarioComparisonResult {
  const limits = normalizeLimits(options);
  validateSignal(options.signal);
  emit(options, progress("validating", null, 0, options.candidates.length, 0, limits.maxScenarios));

  const baselineArtifact = parseBaseline(options, limits);
  const candidates = prepareCandidates(options, baselineArtifact, limits);
  const estimatedVisits = estimateEventVisits([baselineArtifact, ...candidates.map((candidate) => candidate.artifact)]);
  if (estimatedVisits > limits.maxEligibleEventVisits) {
    throw new ResearchScenarioComparisonError("EVENT_VISIT_LIMIT", `comparison estimates ${estimatedVisits} eligible event visits, above ${limits.maxEligibleEventVisits}`);
  }

  const state: ComparisonState = { processedEligibleEventVisits: 0 };
  const baseline = restoreComparisonScenario(
    "baseline",
    null,
    baselineArtifact,
    options,
    limits,
    state,
    0,
    true,
  );
  if (baseline.kind === "cancelled") return finalizeComparison(options, limits, state, null, [], ["Comparison cancelled before baseline reconstruction"]);
  if (baseline.kind === "error" || baseline.scenario === null) {
    throw new ResearchScenarioComparisonError("BASELINE_RESTORE_FAILED", baseline.error?.message ?? "baseline scenario could not be restored");
  }

  const candidateResults: ResearchScenarioComparisonCandidateResult[] = [];
  for (const [index, candidate] of candidates.entries()) {
    if (options.signal?.aborted === true) {
      return finalizeComparison(options, limits, state, baseline.scenario, candidateResults, ["Comparison cancelled between candidate reconstructions"]);
    }
    emit(options, progress("restoring", candidate.candidateId, index + 1, candidates.length, state.processedEligibleEventVisits, limits.maxScenarios));
    const restored = restoreComparisonScenario(candidate.candidateId, candidate.label, candidate.artifact, options, limits, state, index + 1, false);
    if (restored.kind === "cancelled") {
      candidateResults.push(candidateError(candidate, "cancelled", "CANCELLED", restored.error?.message ?? "candidate reconstruction was cancelled"));
      return finalizeComparison(options, limits, state, baseline.scenario, candidateResults, ["Comparison cancelled during candidate reconstruction"]);
    }
    if (restored.kind === "error" || restored.scenario === null) {
      candidateResults.push(candidateError(candidate, "incompatible", restored.error?.code ?? "RESTORE_FAILED", restored.error?.message ?? "candidate reconstruction failed"));
      continue;
    }
    const compatibility = classifyCompatibility(baseline.scenario, restored.scenario);
    const differences = createDifferences(baseline.scenario, restored.scenario, compatibility);
    const status = restored.scenario.evaluationStatus === "indeterminate"
      ? "indeterminate"
      : restored.scenario.reconstructionStatus;
    candidateResults.push({
      candidateId: candidate.candidateId,
      label: candidate.label,
      compatibility,
      status,
      scenario: restored.scenario,
      differences,
      error: null,
    });
  }
  return finalizeComparison(options, limits, state, baseline.scenario, candidateResults, []);
}

function parseBaseline(options: ResearchScenarioComparisonOptions, limits: ResearchScenarioComparisonLimits): ResearchScenarioArtifact {
  try {
    validateMarketReplayTape(options.baseline.tape);
    return parseResearchScenarioArtifact(options.baseline.artifact, {
      ...(options.validation ?? {}),
      maxSerializedBytes: Math.min(options.validation?.maxSerializedBytes ?? 2 * 1024 * 1024, limits.maxSerializedResultBytes),
    });
  } catch (error) {
    if (error instanceof ResearchScenarioComparisonError) throw error;
    throw new ResearchScenarioComparisonError("INVALID_INPUT", error instanceof Error ? error.message : String(error));
  }
}

function prepareCandidates(
  options: ResearchScenarioComparisonOptions,
  baseline: ResearchScenarioArtifact,
  limits: ResearchScenarioComparisonLimits,
): readonly PreparedCandidate[] {
  if (options.candidates.length + 1 > limits.maxScenarios) {
    throw new ResearchScenarioComparisonError("SCENARIO_LIMIT", `comparison contains ${options.candidates.length + 1} scenarios, above ${limits.maxScenarios}`);
  }
  const ids = new Set<string>(["baseline"]);
  return options.candidates.map((candidate) => {
    assertCandidateId(candidate.candidateId);
    if (ids.has(candidate.candidateId)) throw new ResearchScenarioComparisonError("INVALID_INPUT", `duplicate comparison candidateId ${candidate.candidateId}`);
    ids.add(candidate.candidateId);
    const label = candidate.label === undefined ? null : boundedText(candidate.label, "candidate label");
    if ("patch" in candidate && "artifact" in candidate) throw new ResearchScenarioComparisonError("INVALID_INPUT", `candidate ${candidate.candidateId} cannot contain both patch and artifact`);
    try {
      if ("patch" in candidate) {
        const assumptions = applyAssumptionPatch(baseline.assumptions, candidate.patch);
        return { candidateId: candidate.candidateId, label, artifact: createResearchScenarioArtifactVariant(baseline, assumptions) };
      }
      return {
        candidateId: candidate.candidateId,
        label,
        artifact: parseResearchScenarioArtifact(candidate.artifact, options.validation),
      };
    } catch (error) {
      if (error instanceof ResearchScenarioComparisonError) throw error;
      throw new ResearchScenarioComparisonError("INVALID_INPUT", `candidate ${candidate.candidateId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function restoreComparisonScenario(
  candidateId: string,
  label: string | null,
  artifact: ResearchScenarioArtifact,
  options: ResearchScenarioComparisonOptions,
  limits: ResearchScenarioComparisonLimits,
  state: ComparisonState,
  candidateIndex: number,
  baseline: boolean,
): { readonly kind: "success"; readonly scenario: ResearchScenarioComparisonScenarioResult } | { readonly kind: "cancelled"; readonly error: { readonly code: string; readonly message: string } } | { readonly kind: "error"; readonly scenario: null; readonly error: { readonly code: string; readonly message: string } } {
  let restored: ReturnType<typeof restoreResearchScenario> | null = null;
  try {
    emit(options, progress("restoring", baseline ? null : candidateId, candidateIndex, options.candidates.length, state.processedEligibleEventVisits, limits.maxScenarios));
    const restoreOptions = {
      artifact,
      tape: options.baseline.tape,
      ...(options.validation === undefined ? {} : { validation: options.validation }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.checkpoints === undefined ? {} : { checkpoints: options.checkpoints }),
      onEventVisit: (eventIndex: number) => {
        if (options.signal?.aborted === true) throw new ResearchScenarioComparisonError("CANCELLED", "comparison was cancelled");
        if (state.processedEligibleEventVisits >= limits.maxEligibleEventVisits) throw new ResearchScenarioComparisonError("EVENT_VISIT_LIMIT", `comparison exceeded ${limits.maxEligibleEventVisits} eligible event visits at event ${eventIndex}`);
        state.processedEligibleEventVisits += 1;
        emit(options, progress("restoring", baseline ? null : candidateId, candidateIndex, options.candidates.length, state.processedEligibleEventVisits, limits.maxScenarios));
      },
    };
    restored = restoreResearchScenario(restoreOptions);
    try {
      emit(options, progress("comparing", baseline ? null : candidateId, candidateIndex, options.candidates.length, state.processedEligibleEventVisits, limits.maxScenarios));
      const scenario = createScenarioResult(candidateId, label, artifact, restored, limits);
      return { kind: "success", scenario };
    } finally {
      emit(options, progress("disposing", baseline ? null : candidateId, candidateIndex, options.candidates.length, state.processedEligibleEventVisits, limits.maxScenarios));
      restored.session.dispose();
      restored = null;
    }
  } catch (error) {
    restored?.session.dispose();
    const normalized = normalizeError(error);
    if (normalized.code === "CANCELLED" || normalized.code === "ABORT_ERR") return { kind: "cancelled", error: normalized };
    return { kind: "error", scenario: null, error: normalized };
  }
}

function createScenarioResult(
  candidateId: string,
  label: string | null,
  artifact: ResearchScenarioArtifact,
  restored: ReturnType<typeof restoreResearchScenario>,
  limits: ResearchScenarioComparisonLimits,
): ResearchScenarioComparisonScenarioResult {
  const scenario = restored.actual;
  const ledger = scenario.ledger;
  const position = ledger.position;
  const diagnostics = scenario.diagnostics;
  const indeterminateReasons = ledger.valuation === "complete" ? [] : [`Valuation is ${ledger.valuation}; equity and drawdown comparisons remain uncertainty-aware`];
  const recordsTruncated = scenario.orders.length > limits.maxResultRecords || scenario.fills.length > limits.maxResultRecords || diagnostics.warnings.length > limits.maxDiagnostics || diagnostics.sourceCoverage.length > limits.maxDiagnostics;
  const provenance: ResearchScenarioComparisonProvenance = {
    candidateId,
    label,
    scenarioId: scenario.scenarioId,
    artifactContentHash: artifact.integrity.contentHash,
    tapeId: scenario.tapeId,
    tapeFingerprint: scenario.tapeFingerprint,
    assumptionFingerprint: hashCanonical(scenario.assumptions),
    decisionHistoryFingerprint: hashCanonical(decisionHistoryProjection(scenario)),
    decisionActionFingerprint: hashCanonical(decisionActionProjection(scenario)),
    resultFingerprint: restored.actualResult.fingerprint,
    expectedResultFingerprint: restored.expectedResult?.fingerprint ?? null,
  };
  const evaluationStatus = ledger.valuation === "complete" ? "complete" : "indeterminate";
  return freeze({
    reconstructionStatus: restored.status,
    evaluationStatus,
    provenance,
    evidence: cloneEvidence(restored.actualResult),
    metrics: {
      currency: scenario.assumptions.currency,
      initialCapital: scenario.assumptions.initialCapital,
      realizedPnl: ledger.realizedPnl,
      unrealizedPnl: position?.unrealizedPnl ?? null,
      equity: ledger.equity,
      valuation: ledger.valuation,
      drawdown: ledger.drawdown,
      drawdownPercent: ledger.drawdownPercent,
      totalFees: ledger.totalFees,
      positionQuantity: position?.quantity ?? 0,
      marketValue: position?.marketValue ?? null,
      simulatedQuantity: scenario.orders.reduce((sum, order) => sum + order.simulatedQuantity, 0),
      remainingOrderQuantity: scenario.orders.reduce((sum, order) => sum + order.remainingQuantity, 0),
      orderCount: scenario.orders.length,
      fillCount: scenario.fills.length,
      modeledExecution: {
        feeAmount: scenario.fills.reduce((sum, fill) => sum + fill.fee, 0),
        slippagePriceDelta: scenario.fills.reduce((sum, fill) => sum + fill.slippage, 0),
        priceImpactPriceDelta: scenario.fills.reduce((sum, fill) => sum + fill.priceImpact, 0),
      },
    },
    diagnostics: {
      quality: diagnostics.quality.slice(0, limits.maxDiagnostics),
      warnings: diagnostics.warnings.slice(0, limits.maxDiagnostics),
      sourceCoverage: diagnostics.sourceCoverage.slice(0, limits.maxDiagnostics).map((entry) => ({ source: { ...entry.source }, status: entry.status, coverage: entry.coverage })),
      recordsTruncated,
    },
    orderSummaries: scenario.orders.slice(0, limits.maxResultRecords).map((order) => ({
      id: order.id,
      decisionEventId: order.decisionEventId,
      decisionCursor: order.decisionCursor,
      side: order.side,
      type: order.type,
      status: order.status,
      requestedQuantity: order.requestedQuantity,
      simulatedQuantity: order.simulatedQuantity,
      remainingQuantity: order.remainingQuantity,
      cumulativeFees: order.cumulativeFees,
    })),
    fillSummaries: scenario.fills.slice(0, limits.maxResultRecords).map((fill) => ({
      id: fill.id,
      orderId: fill.orderId,
      side: fill.side,
      time: fill.time,
      executionPrice: fill.executionPrice,
      quantity: fill.quantity,
      fee: fill.fee,
      slippage: fill.slippage,
      priceImpact: fill.priceImpact,
      quality: fill.quality.status,
      scenarioBias: fill.scenarioBias,
    })),
    indeterminateReasons,
  });
}

function classifyCompatibility(left: ResearchScenarioComparisonScenarioResult, right: ResearchScenarioComparisonScenarioResult): ResearchScenarioComparisonCompatibility {
  if (left.provenance.tapeId !== right.provenance.tapeId || left.provenance.tapeFingerprint !== right.provenance.tapeFingerprint) return "incompatible-tape";
  if (left.provenance.decisionHistoryFingerprint === right.provenance.decisionHistoryFingerprint) return "identical-decision-history";
  if (left.provenance.decisionActionFingerprint === right.provenance.decisionActionFingerprint) return "compatible-fixed-history";
  return "decision-history-different";
}

function createDifferences(
  baseline: ResearchScenarioComparisonScenarioResult,
  candidate: ResearchScenarioComparisonScenarioResult,
  compatibility: ResearchScenarioComparisonCompatibility,
): ResearchScenarioComparisonDifferences | null {
  if (compatibility === "incompatible-tape" || compatibility === "not-evaluated") return null;
  const mode = compatibility === "decision-history-different" ? "descriptive-different-history" : "controlled-fixed-history";
  const valuationComparable = baseline.evaluationStatus === "complete" && candidate.evaluationStatus === "complete";
  const currenciesComparable = baseline.metrics.currency === candidate.metrics.currency;
  const monetaryReason = currenciesComparable ? null : currencyMismatchReason(baseline.metrics.currency, candidate.metrics.currency);
  const monetaryDelta = (left: number | null, right: number | null, valuation = true): ResearchScenarioMetricDelta => metricDelta(left, right, valuation, currenciesComparable, monetaryReason);
  return {
    mode,
    monetaryUnits: {
      baselineCurrency: baseline.metrics.currency,
      candidateCurrency: candidate.metrics.currency,
      comparable: currenciesComparable,
    },
    marketValue: monetaryDelta(baseline.metrics.marketValue, candidate.metrics.marketValue, valuationComparable),
    realizedPnl: monetaryDelta(baseline.metrics.realizedPnl, candidate.metrics.realizedPnl),
    unrealizedPnl: monetaryDelta(baseline.metrics.unrealizedPnl, candidate.metrics.unrealizedPnl, valuationComparable),
    equity: monetaryDelta(baseline.metrics.equity, candidate.metrics.equity, valuationComparable),
    drawdown: monetaryDelta(baseline.metrics.drawdown, candidate.metrics.drawdown, valuationComparable),
    drawdownPercent: metricDelta(baseline.metrics.drawdownPercent, candidate.metrics.drawdownPercent, valuationComparable),
    totalFees: monetaryDelta(baseline.metrics.totalFees, candidate.metrics.totalFees),
    modeledExecution: {
      feeAmount: monetaryDelta(baseline.metrics.modeledExecution.feeAmount, candidate.metrics.modeledExecution.feeAmount),
      slippagePriceDelta: metricDelta(baseline.metrics.modeledExecution.slippagePriceDelta, candidate.metrics.modeledExecution.slippagePriceDelta),
      priceImpactPriceDelta: metricDelta(baseline.metrics.modeledExecution.priceImpactPriceDelta, candidate.metrics.modeledExecution.priceImpactPriceDelta),
    },
    simulatedQuantity: metricDelta(baseline.metrics.simulatedQuantity, candidate.metrics.simulatedQuantity),
    remainingOrderQuantity: metricDelta(baseline.metrics.remainingOrderQuantity, candidate.metrics.remainingOrderQuantity),
    fillCount: metricDelta(baseline.metrics.fillCount, candidate.metrics.fillCount),
    orderCount: metricDelta(baseline.metrics.orderCount, candidate.metrics.orderCount),
  };
}

function metricDelta(
  baseline: number | null,
  candidate: number | null,
  comparable = true,
  unitsComparable = true,
  unitsReason: string | null = null,
): ResearchScenarioMetricDelta {
  if (!unitsComparable) return { status: "not-comparable", baseline, candidate, delta: null, reason: unitsReason ?? "Scenario measurement units are incompatible" };
  if (!comparable) return { status: "unknown", baseline, candidate, delta: null, reason: "One or both scenario valuations are indeterminate" };
  if (baseline === null || candidate === null) return { status: "unknown", baseline, candidate, delta: null, reason: "One or both valuations are unavailable or indeterminate" };
  return { status: "available", baseline, candidate, delta: candidate - baseline, reason: null };
}

function currencyMismatchReason(baselineCurrency: string, candidateCurrency: string): string {
  return `Accounting currency mismatch: baseline ${baselineCurrency}, candidate ${candidateCurrency}; no FX conversion is configured`;
}

function candidateError(
  candidate: PreparedCandidate,
  status: ResearchScenarioComparisonCandidateStatus,
  code: string,
  message: string,
): ResearchScenarioComparisonCandidateResult {
  return { candidateId: candidate.candidateId, label: candidate.label, compatibility: "not-evaluated", status, scenario: null, differences: null, error: { code, message } };
}

function finalizeComparison(
  options: ResearchScenarioComparisonOptions,
  limits: ResearchScenarioComparisonLimits,
  state: ComparisonState,
  baseline: ResearchScenarioComparisonScenarioResult | null,
  candidates: readonly ResearchScenarioComparisonCandidateResult[],
  warnings: readonly string[],
): ResearchScenarioComparisonResult {
  const hasIncompleteCandidate = candidates.some((candidate) => candidate.status !== "verified" || candidate.scenario?.evaluationStatus !== "complete");
  const status: ResearchScenarioComparisonStatus = warnings.some((warning) => warning.toLowerCase().includes("cancel"))
    ? "cancelled"
    : hasIncompleteCandidate || baseline === null || baseline.evaluationStatus !== "complete" || baseline.reconstructionStatus !== "verified"
      ? "partial"
      : "verified";
  const draft = {
    version: OPENKLINE_RESEARCH_SCENARIO_COMPARISON_VERSION,
    status,
    baseline,
    candidates: [...candidates].sort((left, right) => left.candidateId.localeCompare(right.candidateId)),
    limits,
    processedEligibleEventVisits: state.processedEligibleEventVisits,
    warnings: [...warnings],
  } as const;
  const comparisonFingerprint = hashCanonical(draft);
  const result = { ...draft, comparisonFingerprint } as ResearchScenarioComparisonResult;
  const serializedBytes = new TextEncoder().encode(canonicalStringify(result)).byteLength;
  if (serializedBytes > limits.maxSerializedResultBytes) throw new ResearchScenarioComparisonError("RESULT_SIZE_LIMIT", `serialized comparison result is ${serializedBytes} bytes, above ${limits.maxSerializedResultBytes}`);
  emit(options, progress("completed", null, options.candidates.length, options.candidates.length, state.processedEligibleEventVisits, limits.maxScenarios));
  return freeze(result);
}

function applyAssumptionPatch(base: ResearchScenarioAssumptions, patch: ResearchScenarioAssumptionPatch): ResearchScenarioAssumptions {
  const record = plainRecord(patch, "assumption patch");
  assertKeys(record, ["commission", "slippage", "priceImpact", "latency", "execution", "risk", "precision"], "assumption patch");
  const executionPatch = record.execution === undefined ? {} : plainRecord(record.execution, "assumption patch.execution");
  assertKeys(executionPatch, ["maxParticipationRate", "allowPartialFills", "passivePolicy", "scenarioBias"], "assumption patch.execution");
  const riskPatch = record.risk === undefined ? {} : plainRecord(record.risk, "assumption patch.risk");
  assertKeys(riskPatch, ["maxOrderNotional", "maxOrderQuantity", "maxPositionQuantity", "maxPendingOrders", "maxDrawdown"], "assumption patch.risk");
  const precisionPatch = record.precision === undefined ? {} : plainRecord(record.precision, "assumption patch.precision");
  assertKeys(precisionPatch, ["tickSize", "quantityStep", "minimumQuantity", "tickPolicy", "quantityPolicy"], "assumption patch.precision");
  return {
    ...base,
    ...(record.commission === undefined ? {} : { commission: { ...plainRecord(record.commission, "assumption patch.commission") } as unknown as TransactionCost }),
    ...(record.slippage === undefined ? {} : { slippage: { ...plainRecord(record.slippage, "assumption patch.slippage") } as unknown as TransactionCost }),
    ...(record.priceImpact === undefined ? {} : { priceImpact: record.priceImpact === null ? null : { ...plainRecord(record.priceImpact, "assumption patch.priceImpact") } as unknown as TransactionCost }),
    ...(record.latency === undefined ? {} : { latency: { ...plainRecord(record.latency, "assumption patch.latency"), ...(isBoundedLatency(record.latency) ? { delaysMs: [...record.latency.delaysMs] } : {}) } as ResearchLatencyPolicy }),
    execution: { ...base.execution, ...executionPatch } as ResearchExecutionPolicy,
    risk: { ...base.risk, ...riskPatch } as ResearchRiskLimits,
    precision: { ...base.precision, ...precisionPatch } as ResearchPrecisionPolicy,
  };
}

function isBoundedLatency(value: unknown): value is { readonly type: "bounded"; readonly delaysMs: readonly number[] } {
  return plainRecordOrNull(value) !== null && (value as { readonly type?: unknown }).type === "bounded" && Array.isArray((value as { readonly delaysMs?: unknown }).delaysMs);
}

function decisionHistoryProjection(scenario: ResearchScenarioExport): readonly unknown[] {
  return scenario.decisions.map((decision) => ({ ...decision, scenarioId: undefined }));
}

function decisionActionProjection(scenario: ResearchScenarioExport): readonly unknown[] {
  const orderOrdinals = new Map<string, number>();
  return scenario.decisions.map((decision) => {
    if (decision.decisionType === "submit-order") {
      orderOrdinals.set(decision.orderId, decision.decisionOrdinal);
      return {
        decisionType: decision.decisionType,
        decisionOrdinal: decision.decisionOrdinal,
        decisionEventId: decision.decisionEventId,
        decisionCursor: decision.decisionCursor,
        decisionTime: decision.decisionTime,
        decisionClockTime: decision.decisionClockTime,
        eligibleClockTime: decision.eligibleClockTime,
        idempotencyKey: decision.idempotencyKey,
        side: decision.side,
        type: decision.type,
        quantity: decision.quantity,
        limitPrice: decision.limitPrice ?? null,
        reason: decision.reason ?? null,
      };
    }
    return {
      decisionType: decision.decisionType,
      decisionOrdinal: decision.decisionOrdinal,
      decisionEventId: decision.decisionEventId,
      decisionCursor: decision.decisionCursor,
      decisionTime: decision.decisionTime,
      decisionClockTime: decision.decisionClockTime,
      orderOrdinal: orderOrdinals.get(decision.orderId) ?? null,
      reason: decision.reason,
    };
  });
}

function estimateEventVisits(artifacts: readonly ResearchScenarioArtifact[]): number {
  return artifacts.reduce((total, artifact) => total + (artifact.replay.frontier.eventIndex === null ? 0 : artifact.replay.frontier.eventIndex + 1), 0);
}

function normalizeLimits(options: ResearchScenarioComparisonOptions): ResearchScenarioComparisonLimits {
  const maxScenarios = boundedInteger(options.maxScenarios, DEFAULT_MAX_SCENARIOS, ABSOLUTE_MAX_SCENARIOS, "maxScenarios");
  const maxEligibleEventVisits = boundedInteger(options.maxEligibleEventVisits, DEFAULT_MAX_EVENT_VISITS, ABSOLUTE_MAX_EVENT_VISITS, "maxEligibleEventVisits");
  const maxSerializedResultBytes = boundedInteger(options.maxSerializedResultBytes, DEFAULT_MAX_SERIALIZED_RESULT_BYTES, ABSOLUTE_MAX_SERIALIZED_RESULT_BYTES, "maxSerializedResultBytes");
  const maxResultRecords = boundedInteger(options.maxResultRecords, DEFAULT_MAX_RESULT_RECORDS, MAX_RESULT_RECORDS, "maxResultRecords");
  const maxDiagnostics = boundedInteger(options.maxDiagnostics, DEFAULT_MAX_DIAGNOSTICS, MAX_DIAGNOSTICS, "maxDiagnostics");
  return { maxScenarios, maxEligibleEventVisits, maxSerializedResultBytes, maxResultRecords, maxDiagnostics };
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number, label: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > maximum) throw new ResearchScenarioComparisonError("INVALID_INPUT", `${label} must be a positive safe integer no greater than ${maximum}`);
  return result;
}

function validateSignal(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new ResearchScenarioComparisonError("CANCELLED", "comparison was cancelled before validation");
}

function assertCandidateId(value: string): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) throw new ResearchScenarioComparisonError("INVALID_INPUT", "candidateId must be a non-empty string no longer than 256 characters");
}

function boundedText(value: string, label: string): string {
  if (typeof value !== "string" || value.length > 256) throw new ResearchScenarioComparisonError("INVALID_INPUT", `${label} must be no longer than 256 characters`);
  return value;
}

function plainRecord(value: unknown, label: string): Record<string, unknown> {
  const result = plainRecordOrNull(value);
  if (result === null) throw new ResearchScenarioComparisonError("INVALID_INPUT", `${label} must be a plain data object`);
  for (const symbol of Object.getOwnPropertySymbols(result)) throw new ResearchScenarioComparisonError("INVALID_INPUT", `${label} must not contain symbol properties: ${String(symbol)}`);
  for (const key of Object.keys(result)) {
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || descriptor.enumerable !== true) throw new ResearchScenarioComparisonError("INVALID_INPUT", `${label}.${key} must be a plain data property`);
  }
  return result;
}

function plainRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Record<string, unknown> : null;
}

function assertKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value)) if (!set.has(key)) throw new ResearchScenarioComparisonError("INVALID_INPUT", `${label} contains unsupported field ${key}`);
}

function normalizeError(error: unknown): { readonly code: string; readonly message: string } {
  if (error instanceof ResearchScenarioComparisonError) return { code: error.code, message: error.message };
  if (error instanceof ResearchScenarioRestoreError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: error.name, message: error.message };
  return { code: "UNKNOWN_ERROR", message: String(error) };
}

function cloneEvidence(value: ResearchScenarioResultEvidence): ResearchScenarioResultEvidence {
  return { algorithm: value.algorithm, fingerprint: value.fingerprint, state: value.state, cursor: { ...value.cursor } };
}

function progress(
  phase: ResearchScenarioComparisonProgress["phase"],
  candidateId: string | null,
  candidateIndex: number,
  candidateCount: number,
  processedEligibleEventVisits: number,
  maxScenarios: number,
): ResearchScenarioComparisonProgress {
  void maxScenarios;
  const denominator = Math.max(1, candidateCount + 1);
  const percentage = phase === "completed" ? 100 : Math.min(99, ((candidateIndex + (phase === "comparing" || phase === "disposing" ? 0.5 : 0)) / denominator) * 100);
  return { phase, candidateId, candidateIndex, candidateCount, processedEligibleEventVisits, percentage: Math.min(100, percentage), };
}

function emit(options: ResearchScenarioComparisonOptions, value: ResearchScenarioComparisonProgress): void {
  options.onProgress?.(value);
}

function hashCanonical(value: unknown): string {
  return fnv1a64(canonicalStringify(value));
}

function canonicalStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ResearchScenarioComparisonError("INVALID_INPUT", "comparison output contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(",")}}`;
  }
  throw new ResearchScenarioComparisonError("INVALID_INPUT", "comparison output contains an unsupported value");
}

function fnv1a64(value: string): string {
  let hash = 2_166_136_261;
  let high = 3_421_709_552;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619) >>> 0;
    high = Math.imul(high ^ hash, 16_777_619) >>> 0;
  }
  return `${high.toString(16).padStart(8, "0")}${hash.toString(16).padStart(8, "0")}`;
}

function freeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) freeze(child, seen);
  Object.freeze(value);
  return value;
}
