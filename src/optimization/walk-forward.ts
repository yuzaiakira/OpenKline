import { createBacktest } from "../backtesting/index.js";
import type { BacktestResult, PerformanceMetrics } from "../backtesting/types.js";
import { fingerprintCandles } from "../backtesting/metrics.js";
import { createDefaultStrategyRegistry, type StrategyRegistry } from "../strategies/index.js";
import { runOptimization } from "./engine.js";
import { OptimizationCancellationError, OptimizationResourceLimitError, OptimizationValidationError, type InvalidOptimizationCandidate, type OptimizationExecutionSettings, type OptimizationObjectiveName, type OptimizationOptions, type OptimizationParameterCandidate, type OptimizationParameterDefinition, type OptimizationProgress, type OptimizationResourceLimits, type OptimizationScore } from "./types.js";
import type { Candle } from "../types.js";

export type WalkForwardMode = "anchored" | "rolling";

export interface WalkForwardSplitOptions {
  readonly mode: WalkForwardMode;
  readonly trainingWindowLength: number;
  readonly testWindowLength: number;
  readonly stepSize: number;
  readonly validationWindowLength?: number;
  readonly gapBars?: number;
  readonly warmupBars?: number;
}

export interface WalkForwardFoldDefinition {
  readonly foldId: string;
  readonly trainingStartIndex: number;
  readonly trainingEndIndex: number;
  readonly validationStartIndex: number | null;
  readonly validationEndIndex: number | null;
  readonly testStartIndex: number;
  readonly testEndIndex: number;
  readonly warmupStartIndex: number;
  readonly tradingStartIndex: number;
}

export interface WalkForwardProgress {
  readonly phase: "splitting" | "training" | "validation" | "out-of-sample" | "completed";
  readonly foldIndex: number;
  readonly foldCount: number;
  readonly percentage: number;
  readonly optimizationProgress: OptimizationProgress | null;
}

export interface WalkForwardFoldResult {
  readonly definition: WalkForwardFoldDefinition;
  readonly trainingDatasetFingerprint: string;
  readonly validationDatasetFingerprint: string | null;
  readonly outOfSampleDatasetFingerprint: string;
  readonly trainingCandidateCount: number;
  readonly invalidTrainingCandidates: readonly InvalidOptimizationCandidate[];
  readonly selectedCandidate: OptimizationParameterCandidate | null;
  readonly trainingScore: OptimizationScore | null;
  readonly trainingMetrics: PerformanceMetrics | null;
  readonly validationMetrics: PerformanceMetrics | null;
  readonly outOfSampleMetrics: PerformanceMetrics | null;
  readonly outOfSampleTrades: readonly BacktestResult["trades"][number][];
  readonly outOfSampleEquityCurve: readonly BacktestResult["equityCurve"][number][];
  readonly outOfSampleResult: BacktestResult | null;
  readonly diagnostics: readonly string[];
}

export interface WalkForwardAggregate {
  readonly mode: "reset-per-fold";
  readonly foldCount: number;
  readonly evaluatedFoldCount: number;
  readonly profitableOutOfSampleFoldCount: number;
  readonly averageOutOfSampleReturn: number | null;
  readonly averageOutOfSampleDrawdown: number | null;
  readonly independentNetProfitSum: number | null;
  readonly overlappingTestWindows: boolean;
  readonly executableEquityCurve: null;
}

export interface WalkForwardOptions extends OptimizationExecutionSettings {
  readonly strategy: string;
  readonly candles: readonly Candle[];
  readonly searchSpace: readonly OptimizationParameterDefinition[];
  readonly objective: OptimizationObjectiveName;
  readonly split: WalkForwardSplitOptions;
  readonly limits: OptimizationResourceLimits;
  readonly maxFolds?: number;
  readonly minimumTradeCount?: number;
  readonly minimumObservationCount?: number;
  readonly strategyRegistry?: StrategyRegistry;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: WalkForwardProgress) => void;
}

export interface WalkForwardResult {
  readonly engineVersion: 1;
  readonly analysisId: string;
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly objective: OptimizationObjectiveName;
  readonly datasetFingerprint: string;
  readonly split: WalkForwardSplitOptions;
  readonly folds: readonly WalkForwardFoldResult[];
  readonly aggregate: WalkForwardAggregate;
  readonly warnings: readonly string[];
  readonly elapsedMs: number;
}

export function createWalkForwardFolds(candles: readonly Candle[], split: WalkForwardSplitOptions, maxFolds = 1_000): readonly WalkForwardFoldDefinition[] {
  validateSplit(split);
  if (!Number.isSafeInteger(maxFolds) || maxFolds < 1) throw new OptimizationValidationError("maxFolds must be a positive safe integer");
  const validationLength = split.validationWindowLength ?? 0;
  const gap = split.gapBars ?? 0;
  const warmup = split.warmupBars ?? 0;
  const folds: WalkForwardFoldDefinition[] = [];
  let trainingEnd = split.trainingWindowLength;
  while (true) {
    const trainingStart = split.mode === "anchored" ? 0 : trainingEnd - split.trainingWindowLength;
    const validationStart = trainingEnd + gap;
    const validationEnd = validationStart + validationLength;
    const testStart = validationEnd;
    const testEnd = testStart + split.testWindowLength;
    if (trainingStart < 0 || testEnd > candles.length) break;
    if (folds.length >= maxFolds) throw new OptimizationResourceLimitError(`Walk-Forward fold count exceeds maxFolds (${maxFolds})`);
    const warmupStart = Math.max(0, testStart - warmup);
    folds.push({ foldId: `fold-${folds.length + 1}`, trainingStartIndex: trainingStart, trainingEndIndex: trainingEnd, validationStartIndex: validationLength === 0 ? null : validationStart, validationEndIndex: validationLength === 0 ? null : validationEnd, testStartIndex: testStart, testEndIndex: testEnd, warmupStartIndex: warmupStart, tradingStartIndex: testStart - warmupStart });
    trainingEnd += split.stepSize;
  }
  if (folds.length === 0) throw new OptimizationValidationError("Split configuration does not produce a complete training/test fold");
  return folds;
}

export function runWalkForward(options: WalkForwardOptions): WalkForwardResult {
  validateOptions(options);
  const startedAt = Date.now();
  const registry = options.strategyRegistry ?? createDefaultStrategyRegistry();
  const folds = createWalkForwardFolds(options.candles, options.split, options.maxFolds ?? 1_000);
  emit(options, { phase: "splitting", foldIndex: 0, foldCount: folds.length, percentage: 0, optimizationProgress: null });
  const results: WalkForwardFoldResult[] = [];
  for (let index = 0; index < folds.length; index += 1) {
    if (options.signal?.aborted === true) throw new OptimizationCancellationError("Walk-Forward analysis was cancelled");
    const definition = folds[index];
    if (definition === undefined) continue;
    const training = options.candles.slice(definition.trainingStartIndex, definition.trainingEndIndex);
    const validation = definition.validationStartIndex === null || definition.validationEndIndex === null ? null : options.candles.slice(definition.validationStartIndex, definition.validationEndIndex);
    const evaluationCandles = options.candles.slice(definition.warmupStartIndex, definition.testEndIndex);
    const trainingFingerprint = fingerprintCandles(training);
    const validationFingerprint = validation === null ? null : fingerprintCandles(validation);
    const test = options.candles.slice(definition.testStartIndex, definition.testEndIndex);
    const testFingerprint = fingerprintCandles(test);
    emit(options, { phase: "training", foldIndex: index, foldCount: folds.length, percentage: index / folds.length * 100, optimizationProgress: null });
    const trainingOptions: OptimizationOptions = {
      strategy: options.strategy,
      candles: training,
      searchSpace: options.searchSpace,
      objective: options.objective,
      initialCapital: options.initialCapital,
      positionSizing: options.positionSizing,
      commission: options.commission,
      slippage: options.slippage,
      ...(options.shortSelling === undefined ? {} : { shortSelling: options.shortSelling }),
      ...(options.reversal === undefined ? {} : { reversal: options.reversal }),
      ...(options.allowFractionalQuantity === undefined ? {} : { allowFractionalQuantity: options.allowFractionalQuantity }),
      limits: options.limits,
      ...(options.strategyRegistry === undefined ? {} : { strategyRegistry: options.strategyRegistry }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.minimumTradeCount === undefined ? {} : { minimumTradeCount: options.minimumTradeCount }),
      ...(options.minimumObservationCount === undefined ? {} : { minimumObservationCount: options.minimumObservationCount }),
      onProgress: (optimizationProgress) => emit(options, { phase: "training", foldIndex: index, foldCount: folds.length, percentage: (index + optimizationProgress.percentage / 100) / folds.length * 100, optimizationProgress }),
    };
    const trainingReport = runOptimization(trainingOptions);
    const selected = trainingReport.rankedCandidates.find((candidate) => candidate.status === "evaluated" && candidate.objective.available) ?? null;
    const diagnostics: string[] = [];
    if (selected === null) diagnostics.push("No training candidate met the objective filters; out-of-sample evaluation was skipped");
    if (validation !== null) emit(options, { phase: "validation", foldIndex: index, foldCount: folds.length, percentage: (index + 0.7) / folds.length * 100, optimizationProgress: null });
    const validationResult = selected === null || validation === null ? null : runBoundaryBacktest(options, selected.candidate.parameters, validation, 0);
    emit(options, { phase: "out-of-sample", foldIndex: index, foldCount: folds.length, percentage: (index + 0.8) / folds.length * 100, optimizationProgress: null });
    const outOfSampleResult = selected === null ? null : runBoundaryBacktest(options, selected.candidate.parameters, evaluationCandles, definition.tradingStartIndex);
    if (outOfSampleResult === null) diagnostics.push("No out-of-sample result was produced");
    results.push({ definition, trainingDatasetFingerprint: trainingFingerprint, validationDatasetFingerprint: validationFingerprint, outOfSampleDatasetFingerprint: testFingerprint, trainingCandidateCount: trainingReport.counts.valid, invalidTrainingCandidates: trainingReport.invalidCandidates, selectedCandidate: selected?.candidate ?? null, trainingScore: selected?.objective ?? null, trainingMetrics: selected?.metrics ?? null, validationMetrics: validationResult?.metrics ?? null, outOfSampleMetrics: outOfSampleResult?.metrics ?? null, outOfSampleTrades: outOfSampleResult?.trades ?? [], outOfSampleEquityCurve: outOfSampleResult?.equityCurve ?? [], outOfSampleResult, diagnostics });
  }
  const aggregate = aggregateFolds(results);
  const warnings = ["Walk-Forward results are historical evidence under simulated execution assumptions, not a prediction of future profitability", "Parameter search across many candidates increases multiple-testing and overfitting risk", "Reset-per-fold outcomes are independent reports; no continuous executable equity curve is claimed", ...(aggregate.overlappingTestWindows ? ["Test windows overlap; independent fold outcomes must not be summed as a portfolio"] : [])];
  const strategyMetadata = registry.getMetadata(options.strategy);
  const datasetFingerprint = fingerprintCandles(options.candles);
  const result: WalkForwardResult = { engineVersion: 1, analysisId: `walk-forward-${datasetFingerprint}-${strategyMetadata.id}-${folds.length}`, strategyId: strategyMetadata.id, strategyVersion: strategyMetadata.version, objective: options.objective, datasetFingerprint, split: { ...options.split }, folds: results, aggregate, warnings, elapsedMs: Date.now() - startedAt };
  emit(options, { phase: "completed", foldIndex: folds.length, foldCount: folds.length, percentage: 100, optimizationProgress: null });
  return result;
}

function runBoundaryBacktest(options: WalkForwardOptions, parameters: Readonly<Record<string, unknown>>, candles: readonly Candle[], tradingStartIndex: number): BacktestResult {
  const session = createBacktest({ strategy: options.strategy, parameters: { ...parameters }, candles, initialCapital: options.initialCapital, positionSizing: options.positionSizing, commission: options.commission, slippage: options.slippage, tradingStartIndex, ...(options.shortSelling === undefined ? {} : { shortSelling: options.shortSelling }), ...(options.reversal === undefined ? {} : { reversal: options.reversal }), ...(options.allowFractionalQuantity === undefined ? {} : { allowFractionalQuantity: options.allowFractionalQuantity }), ...(options.strategyRegistry === undefined ? {} : { strategyRegistry: options.strategyRegistry }), ...(options.signal === undefined ? {} : { signal: options.signal }) });
  try { return session.run(); } finally { session.dispose(); }
}

function aggregateFolds(folds: readonly WalkForwardFoldResult[]): WalkForwardAggregate {
  const evaluated = folds.filter((fold) => fold.outOfSampleMetrics !== null);
  const returns = evaluated.map((fold) => fold.outOfSampleMetrics?.totalReturn).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  const drawdowns = evaluated.map((fold) => fold.outOfSampleMetrics?.maxDrawdown).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  const profits = evaluated.map((fold) => fold.outOfSampleMetrics?.netProfit).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  let overlapping = false;
  for (let index = 1; index < folds.length; index += 1) if ((folds[index - 1]?.definition.testEndIndex ?? 0) > (folds[index]?.definition.testStartIndex ?? 0)) overlapping = true;
  return { mode: "reset-per-fold", foldCount: folds.length, evaluatedFoldCount: evaluated.length, profitableOutOfSampleFoldCount: evaluated.filter((fold) => (fold.outOfSampleMetrics?.netProfit ?? 0) > 0).length, averageOutOfSampleReturn: average(returns), averageOutOfSampleDrawdown: average(drawdowns), independentNetProfitSum: profits.length === 0 ? null : profits.reduce((sum, value) => sum + value, 0), overlappingTestWindows: overlapping, executableEquityCurve: null };
}

function average(values: readonly number[]): number | null { return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length; }
function emit(options: WalkForwardOptions, progress: WalkForwardProgress): void { options.onProgress?.(progress); }

function validateOptions(options: WalkForwardOptions): void {
  if (options.candles.length === 0) throw new OptimizationValidationError("candles must not be empty");
  if (!Number.isFinite(options.initialCapital) || options.initialCapital <= 0) throw new OptimizationValidationError("initialCapital must be positive and finite");
}

function validateSplit(split: WalkForwardSplitOptions): void {
  for (const [name, value] of [["trainingWindowLength", split.trainingWindowLength], ["testWindowLength", split.testWindowLength], ["stepSize", split.stepSize]] as const) if (!Number.isSafeInteger(value) || value < 1) throw new OptimizationValidationError(`${name} must be a positive integer`);
  for (const [name, value] of [["validationWindowLength", split.validationWindowLength ?? 0], ["gapBars", split.gapBars ?? 0], ["warmupBars", split.warmupBars ?? 0]] as const) if (!Number.isSafeInteger(value) || value < 0) throw new OptimizationValidationError(`${name} must be a non-negative integer`);
  if (split.mode !== "anchored" && split.mode !== "rolling") throw new OptimizationValidationError(`Unsupported Walk-Forward mode: ${split.mode}`);
}
