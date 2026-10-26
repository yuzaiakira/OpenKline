import { createDefaultStrategyRegistry } from "../strategies/index.js";
import { runOptimization } from "./engine.js";
import { canonicalParameterSerialization } from "./parameter-space.js";
import type { WalkForwardResult } from "./walk-forward.js";
import type { OptimizationCandidateResult, OptimizationExecutionSettings, OptimizationObjectiveName, OptimizationOptions, OptimizationParameterDefinition, OptimizationResult, OptimizationResourceLimits } from "./types.js";
import { OptimizationValidationError } from "./types.js";

export interface ParameterSensitivityOptions extends OptimizationExecutionSettings {
  readonly strategy: string;
  readonly candles: readonly import("../types.js").Candle[];
  readonly selectedParameters: Readonly<Record<string, unknown>>;
  readonly objective: OptimizationObjectiveName;
  readonly limits: OptimizationResourceLimits;
  readonly radius?: number;
  readonly parameterSteps?: Readonly<Record<string, number>>;
  readonly stabilityTolerance?: number;
  readonly minimumTradeCount?: number;
  readonly minimumObservationCount?: number;
}

export interface VariationSummary {
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly range: number | null;
  readonly relativeRange: number | null;
}

export interface ParameterSensitivityReport {
  readonly selectedParameters: Readonly<Record<string, unknown>>;
  readonly neighborCount: number;
  readonly validNeighborResults: readonly OptimizationCandidateResult[];
  readonly scoreDistribution: readonly number[];
  readonly scoreVariation: VariationSummary;
  readonly drawdownVariation: VariationSummary;
  readonly tradeCountVariation: VariationSummary;
  readonly stable: boolean | null;
  readonly diagnostic: string;
  readonly optimization: OptimizationResult;
}

export interface WalkForwardFoldRobustness {
  readonly foldId: string;
  readonly trainingReturn: number | null;
  readonly outOfSampleReturn: number | null;
  readonly returnDegradation: number | null;
  readonly trainingDrawdown: number | null;
  readonly outOfSampleDrawdown: number | null;
  readonly drawdownChange: number | null;
  readonly trainingTradeCount: number | null;
  readonly outOfSampleTradeCount: number | null;
  readonly tradeCountChange: number | null;
  readonly changedParameterCount: number | null;
}

export interface WalkForwardRobustnessReport {
  readonly foldComparisons: readonly WalkForwardFoldRobustness[];
  readonly parameterStability: { readonly transitionCount: number; readonly stableTransitionCount: number; readonly changedParameterCount: number };
  readonly outOfSampleConsistency: { readonly evaluatedFoldCount: number; readonly profitableFoldCount: number; readonly profitableFoldFraction: number | null };
  readonly warnings: readonly string[];
}

export function analyzeParameterSensitivity(options: ParameterSensitivityOptions): ParameterSensitivityReport {
  const radius = options.radius ?? 1;
  if (!Number.isSafeInteger(radius) || radius < 1) throw new OptimizationValidationError("sensitivity radius must be a positive integer");
  const registry = createDefaultStrategyRegistry();
  const metadata = registry.getMetadata(options.strategy);
  const searchSpace: OptimizationParameterDefinition[] = metadata.parameters.map((parameter) => {
    const selected = options.selectedParameters[parameter.name];
    if (selected === undefined) throw new OptimizationValidationError(`Selected parameters are missing ${parameter.name}`);
    if (typeof selected === "number" && Number.isFinite(selected) && (parameter.type === "integer" || parameter.type === "number")) {
      const step = options.parameterSteps?.[parameter.name] ?? 1;
      if (!Number.isFinite(step) || step <= 0) throw new OptimizationValidationError(`Sensitivity step for ${parameter.name} must be positive`);
      const values = Array.from({ length: radius * 2 + 1 }, (_, index) => parameter.type === "integer" ? selected + (index - radius) * step : Number((selected + (index - radius) * step).toPrecision(15)));
      return { name: parameter.name, type: "values", values };
    }
    return { name: parameter.name, type: "fixed", value: selected as string | number | boolean };
  });
  const optimizationOptions: OptimizationOptions = { strategy: options.strategy, candles: options.candles, searchSpace, objective: options.objective, initialCapital: options.initialCapital, positionSizing: options.positionSizing, commission: options.commission, slippage: options.slippage, ...(options.shortSelling === undefined ? {} : { shortSelling: options.shortSelling }), ...(options.reversal === undefined ? {} : { reversal: options.reversal }), ...(options.allowFractionalQuantity === undefined ? {} : { allowFractionalQuantity: options.allowFractionalQuantity }), ...(options.minimumTradeCount === undefined ? {} : { minimumTradeCount: options.minimumTradeCount }), ...(options.minimumObservationCount === undefined ? {} : { minimumObservationCount: options.minimumObservationCount }), limits: options.limits };
  const optimization = runOptimization(optimizationOptions);
  const centerKey = stableParameters(options.selectedParameters);
  const neighbors = optimization.rankedCandidates.filter((candidate) => candidate.candidate.parameterKey !== centerKey && candidate.status === "evaluated");
  const scores = neighbors.map((candidate) => candidate.objective.value).filter((value): value is number => value !== null && Number.isFinite(value));
  const drawdowns = neighbors.map((candidate) => candidate.metrics?.maxDrawdown ?? null).filter((value): value is number => value !== null && Number.isFinite(value));
  const trades = neighbors.map((candidate) => candidate.tradeCount).filter((value) => Number.isSafeInteger(value));
  const scoreVariation = variation(scores);
  const drawdownVariation = variation(drawdowns);
  const tradeCountVariation = variation(trades);
  const tolerance = options.stabilityTolerance ?? 0.25;
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new OptimizationValidationError("stabilityTolerance must be non-negative");
  const stable = scores.length === 0 ? null : (scoreVariation.relativeRange ?? 1) <= tolerance;
  return { selectedParameters: { ...options.selectedParameters }, neighborCount: neighbors.length, validNeighborResults: neighbors, scoreDistribution: scores, scoreVariation, drawdownVariation, tradeCountVariation, stable, diagnostic: stable === null ? "No valid neighboring score was available" : stable ? "Neighboring scores are descriptively stable within the configured tolerance" : "Performance is concentrated or varies materially across neighboring parameters", optimization };
}

export function analyzeWalkForwardRobustness(result: WalkForwardResult): WalkForwardRobustnessReport {
  const comparisons: WalkForwardFoldRobustness[] = [];
  let stableTransitions = 0;
  let changedParameterCount = 0;
  for (let index = 0; index < result.folds.length; index += 1) {
    const fold = result.folds[index];
    if (fold === undefined) continue;
    const previous = result.folds[index - 1];
    const parameterDelta = previous?.selectedCandidate === null || previous?.selectedCandidate === undefined || fold.selectedCandidate === null ? null : countChangedParameters(previous.selectedCandidate.parameters, fold.selectedCandidate.parameters);
    if (parameterDelta !== null) { changedParameterCount += parameterDelta; if (parameterDelta === 0) stableTransitions += 1; }
    comparisons.push({ foldId: fold.definition.foldId, trainingReturn: fold.trainingMetrics?.totalReturn ?? null, outOfSampleReturn: fold.outOfSampleMetrics?.totalReturn ?? null, returnDegradation: difference(fold.outOfSampleMetrics?.totalReturn, fold.trainingMetrics?.totalReturn), trainingDrawdown: fold.trainingMetrics?.maxDrawdown ?? null, outOfSampleDrawdown: fold.outOfSampleMetrics?.maxDrawdown ?? null, drawdownChange: difference(fold.outOfSampleMetrics?.maxDrawdown, fold.trainingMetrics?.maxDrawdown), trainingTradeCount: fold.trainingMetrics?.closedTradeCount ?? null, outOfSampleTradeCount: fold.outOfSampleMetrics?.closedTradeCount ?? null, tradeCountChange: difference(fold.outOfSampleMetrics?.closedTradeCount, fold.trainingMetrics?.closedTradeCount), changedParameterCount: parameterDelta });
  }
  const evaluated = result.aggregate.evaluatedFoldCount;
  const profitable = result.aggregate.profitableOutOfSampleFoldCount;
  return { foldComparisons: comparisons, parameterStability: { transitionCount: Math.max(0, comparisons.length - 1), stableTransitionCount: stableTransitions, changedParameterCount }, outOfSampleConsistency: { evaluatedFoldCount: evaluated, profitableFoldCount: profitable, profitableFoldFraction: evaluated === 0 ? null : profitable / evaluated }, warnings: ["Degradation and stability values are descriptive historical diagnostics, not confidence intervals or predictive probabilities", "Testing many parameters creates multiple-testing and overfitting risk", ...(result.aggregate.overlappingTestWindows ? ["Overlapping out-of-sample windows are not a continuous portfolio"] : [])] };
}

function stableParameters(parameters: Readonly<Record<string, unknown>>): string { return canonicalParameterSerialization(parameters); }
function countChangedParameters(left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): number { const keys = new Set([...Object.keys(left), ...Object.keys(right)]); return [...keys].filter((key) => stableParameters({ value: left[key] }) !== stableParameters({ value: right[key] })).length; }
function difference(left: number | null | undefined, right: number | null | undefined): number | null { return left === null || left === undefined || right === null || right === undefined ? null : left - right; }
function variation(values: readonly number[]): VariationSummary { if (values.length === 0) return { minimum: null, maximum: null, range: null, relativeRange: null }; const minimum = Math.min(...values); const maximum = Math.max(...values); const range = maximum - minimum; const denominator = Math.abs(values.reduce((sum, value) => sum + value, 0) / values.length); return { minimum, maximum, range, relativeRange: denominator === 0 ? (range === 0 ? 0 : null) : range / denominator }; }
