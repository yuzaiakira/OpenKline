import type { Candle } from "../types.js";
import type { StrategyRegistry } from "../strategies/index.js";
import type { BacktestResult, BacktestAssumptions, PerformanceMetrics, PositionSizing, ShortSellingOptions, TransactionCost } from "../backtesting/types.js";

export type OptimizationObjectiveName = "net-profit" | "total-return" | "max-drawdown" | "win-rate" | "profit-factor";
export type OptimizationObjectiveDirection = "maximize" | "minimize";
export type OptimizationParameterValue = string | number | boolean;

export interface IntegerRangeParameter { readonly name: string; readonly type: "integer-range"; readonly start: number; readonly end: number; readonly step: number; }
export interface NumberRangeParameter { readonly name: string; readonly type: "number-range"; readonly start: number; readonly end: number; readonly step: number; }
export interface ValuesParameter { readonly name: string; readonly type: "values"; readonly values: readonly OptimizationParameterValue[]; }
export interface FixedParameter { readonly name: string; readonly type: "fixed"; readonly value: OptimizationParameterValue; }
export type OptimizationParameterDefinition = IntegerRangeParameter | NumberRangeParameter | ValuesParameter | FixedParameter;

export interface OptimizationParameterCandidate {
  readonly candidateId: string;
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly parameters: Readonly<Record<string, OptimizationParameterValue>>;
  readonly parameterKey: string;
}

export interface InvalidOptimizationCandidate {
  readonly parameters: Readonly<Record<string, OptimizationParameterValue>>;
  readonly parameterKey: string;
  readonly reason: string;
}

export interface ParameterGenerationResult {
  readonly candidates: readonly OptimizationParameterCandidate[];
  readonly invalidCandidates: readonly InvalidOptimizationCandidate[];
  readonly duplicateCount: number;
  readonly generatedCount: number;
}

export interface OptimizationExecutionSettings {
  readonly initialCapital: number;
  readonly positionSizing: PositionSizing;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly shortSelling?: ShortSellingOptions;
  readonly reversal?: "reject" | "close-and-reverse";
  readonly allowFractionalQuantity?: boolean;
}

export interface OptimizationResourceLimits {
  readonly maxCandidates: number;
  readonly maxRetainedResults?: number;
  readonly maxTotalExecutionTimeMs?: number;
}

export interface OptimizationProgress {
  readonly phase: "generating" | "evaluating" | "ranking";
  readonly totalCandidates: number;
  readonly validCandidates: number;
  readonly invalidCandidates: number;
  readonly evaluatedCandidates: number;
  readonly failedCandidates: number;
  readonly cancelledCandidates: number;
  readonly retainedResults: number;
  readonly currentCandidateId?: string;
  readonly percentage: number;
  readonly elapsedMs: number;
}

export interface OptimizationScore {
  readonly objective: OptimizationObjectiveName;
  readonly direction: OptimizationObjectiveDirection;
  readonly value: number | null;
  readonly available: boolean;
  readonly unavailableReason: string | null;
}

export interface OptimizationCandidateResult {
  readonly candidate: OptimizationParameterCandidate;
  readonly status: "evaluated" | "failed";
  readonly objective: OptimizationScore;
  readonly metrics: PerformanceMetrics | null;
  readonly tradeCount: number;
  readonly observationCount: number;
  readonly inputFingerprint: string;
  readonly assumptions: BacktestAssumptions | null;
  readonly error: string | null;
  readonly elapsedMs: number;
  readonly backtestResult: BacktestResult | null;
}

export interface OptimizationCounts {
  readonly generated: number;
  readonly valid: number;
  readonly invalid: number;
  readonly duplicates: number;
  readonly evaluated: number;
  readonly failed: number;
  readonly cancelled: number;
  readonly retainedFullResults: number;
}

export interface OptimizationResult {
  readonly engineVersion: 1;
  readonly jobId: string;
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly objective: OptimizationObjectiveName;
  readonly objectiveDirection: OptimizationObjectiveDirection;
  readonly datasetFingerprint: string;
  readonly dataset: { readonly barCount: number; readonly firstTime: number | null; readonly lastTime: number | null };
  readonly counts: OptimizationCounts;
  readonly invalidCandidates: readonly InvalidOptimizationCandidate[];
  readonly candidates: readonly OptimizationCandidateResult[];
  readonly rankedCandidates: readonly OptimizationCandidateResult[];
  readonly assumptions: BacktestAssumptions | null;
  readonly elapsedMs: number;
}

export interface OptimizationOptions extends OptimizationExecutionSettings {
  readonly strategy: string;
  readonly candles: readonly Candle[];
  readonly searchSpace: readonly OptimizationParameterDefinition[];
  readonly objective: OptimizationObjectiveName;
  readonly minimumTradeCount?: number;
  readonly minimumObservationCount?: number;
  readonly limits: OptimizationResourceLimits;
  readonly strategyRegistry?: StrategyRegistry;
  readonly retainBacktestResults?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: OptimizationProgress) => void;
}

export class OptimizationValidationError extends Error { public constructor(message: string) { super(message); this.name = "OptimizationValidationError"; } }
export class OptimizationResourceLimitError extends Error { public constructor(message: string) { super(message); this.name = "OptimizationResourceLimitError"; } }
export class OptimizationCancellationError extends Error {
  public readonly progress: OptimizationProgress | null;
  public constructor(message = "Optimization was cancelled", progress: OptimizationProgress | null = null) { super(message); this.name = "OptimizationCancellationError"; this.progress = progress; }
}
export class OptimizationTimeoutError extends Error {
  public readonly progress: OptimizationProgress | null;
  public constructor(message = "Optimization exceeded its total execution timeout", progress: OptimizationProgress | null = null) { super(message); this.name = "OptimizationTimeoutError"; this.progress = progress; }
}
