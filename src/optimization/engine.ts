import { BacktestCancellationError, createBacktest } from "../backtesting/index.js";
import type { BacktestResult } from "../backtesting/types.js";
import { fingerprintCandles } from "../backtesting/metrics.js";
import { createDefaultStrategyRegistry } from "../strategies/index.js";
import { compareOptimizationScores, getOptimizationObjective, scoreBacktestResult } from "./objectives.js";
import { generateOptimizationCandidates } from "./parameter-space.js";
import { OptimizationCancellationError, OptimizationTimeoutError, OptimizationValidationError, type OptimizationCandidateResult, type OptimizationOptions, type OptimizationProgress, type OptimizationResult } from "./types.js";

export function runOptimization(options: OptimizationOptions): OptimizationResult {
  validateOptions(options);
  const startedAt = Date.now();
  const registry = options.strategyRegistry ?? createDefaultStrategyRegistry();
  const objective = getOptimizationObjective(options.objective);
  const datasetFingerprint = fingerprintCandles(options.candles);
  const generation = generateOptimizationCandidates(options.strategy, options.searchSpace, options.limits.maxCandidates, registry);
  const candidates = generation.candidates;
  const results: OptimizationCandidateResult[] = [];
  const maxRetainedResults = options.limits.maxRetainedResults ?? candidates.length;
  let evaluatedCandidates = 0;
  let failedCandidates = 0;
  let retainedFullResults = 0;
  let assumptions = null as OptimizationResult["assumptions"];
  let lastProgress = progress("evaluating", candidates.length, candidates.length, generation.invalidCandidates.length, evaluatedCandidates, failedCandidates, retainedFullResults, null, startedAt);
  emit(options, lastProgress);
  for (const candidate of candidates) {
    if (options.signal?.aborted === true) throw cancellation(lastProgress);
    if (options.limits.maxTotalExecutionTimeMs !== undefined && Date.now() - startedAt > options.limits.maxTotalExecutionTimeMs) throw new OptimizationTimeoutError(undefined, lastProgress);
    const candidateStartedAt = Date.now();
    let backtestResult: BacktestResult | null = null;
    let status: "evaluated" | "failed" = "evaluated";
    let error: string | null = null;
    try {
      const session = createBacktest({
        strategy: options.strategy,
        parameters: candidate.parameters,
        candles: options.candles,
        initialCapital: options.initialCapital,
        positionSizing: options.positionSizing,
        commission: options.commission,
        slippage: options.slippage,
        ...(options.shortSelling === undefined ? {} : { shortSelling: options.shortSelling }),
        ...(options.reversal === undefined ? {} : { reversal: options.reversal }),
        ...(options.allowFractionalQuantity === undefined ? {} : { allowFractionalQuantity: options.allowFractionalQuantity }),
        ...(options.strategyRegistry === undefined ? {} : { strategyRegistry: options.strategyRegistry }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      try { backtestResult = session.run(); } finally { session.dispose(); }
      assumptions = backtestResult.assumptions;
      evaluatedCandidates += 1;
    } catch (nextError) {
      if (nextError instanceof BacktestCancellationError || isAborted(options.signal)) throw cancellation(lastProgress);
      status = "failed";
      failedCandidates += 1;
      error = nextError instanceof Error ? nextError.message : String(nextError);
    }
    const result = backtestResult === null
      ? failedResult(candidate, options.objective, datasetFingerprint, error, Date.now() - candidateStartedAt)
      : evaluatedResult(candidate, backtestResult, options, datasetFingerprint, Date.now() - candidateStartedAt, options.retainBacktestResults === true && retainedFullResults < maxRetainedResults);
    if (result.backtestResult !== null) retainedFullResults += 1;
    results.push({ ...result, status });
    lastProgress = progress("evaluating", candidates.length, candidates.length, generation.invalidCandidates.length, evaluatedCandidates, failedCandidates, retainedFullResults, candidate.candidateId, startedAt);
    emit(options, lastProgress);
  }
  lastProgress = progress("ranking", candidates.length, candidates.length, generation.invalidCandidates.length, evaluatedCandidates, failedCandidates, retainedFullResults, null, startedAt);
  emit(options, lastProgress);
  const rankedCandidates = [...results].sort(compareCandidateResults);
  return {
    engineVersion: 1,
    jobId: `optimization-${datasetFingerprint}-${objective.name}-${generation.generatedCount}`,
    strategyId: candidates[0]?.strategyId ?? registry.getMetadata(options.strategy).id,
    strategyVersion: candidates[0]?.strategyVersion ?? registry.getMetadata(options.strategy).version,
    objective: options.objective,
    objectiveDirection: objective.direction,
    datasetFingerprint,
    dataset: { barCount: options.candles.length, firstTime: options.candles[0]?.time ?? null, lastTime: options.candles.at(-1)?.time ?? null },
    counts: { generated: generation.generatedCount, valid: candidates.length, invalid: generation.invalidCandidates.length, duplicates: generation.duplicateCount, evaluated: evaluatedCandidates, failed: failedCandidates, cancelled: 0, retainedFullResults },
    invalidCandidates: generation.invalidCandidates,
    candidates: results,
    rankedCandidates,
    assumptions,
    elapsedMs: Date.now() - startedAt,
  };
}

function evaluatedResult(candidate: OptimizationCandidateResult["candidate"], backtestResult: BacktestResult, options: OptimizationOptions, datasetFingerprint: string, elapsedMs: number, retain: boolean): OptimizationCandidateResult {
  return { candidate, status: "evaluated", objective: scoreBacktestResult(backtestResult, options.objective, options.minimumTradeCount ?? 1, options.minimumObservationCount ?? 1), metrics: backtestResult.metrics, tradeCount: backtestResult.trades.length, observationCount: backtestResult.equityCurve.length, inputFingerprint: datasetFingerprint, assumptions: backtestResult.assumptions, error: null, elapsedMs, backtestResult: retain ? backtestResult : null };
}

function failedResult(candidate: OptimizationCandidateResult["candidate"], objective: OptimizationOptions["objective"], datasetFingerprint: string, error: string | null, elapsedMs: number): OptimizationCandidateResult {
  return { candidate, status: "failed", objective: { objective, direction: getOptimizationObjective(objective).direction, value: null, available: false, unavailableReason: "Candidate execution failed" }, metrics: null, tradeCount: 0, observationCount: 0, inputFingerprint: datasetFingerprint, assumptions: null, error, elapsedMs, backtestResult: null };
}

function compareCandidateResults(left: OptimizationCandidateResult, right: OptimizationCandidateResult): number {
  const scoreComparison = compareOptimizationScores(left.objective, right.objective);
  if (scoreComparison !== 0) return scoreComparison;
  const leftDrawdown = left.metrics?.maxDrawdown ?? Number.POSITIVE_INFINITY;
  const rightDrawdown = right.metrics?.maxDrawdown ?? Number.POSITIVE_INFINITY;
  if (leftDrawdown !== rightDrawdown) return leftDrawdown - rightDrawdown;
  return left.candidate.parameterKey.localeCompare(right.candidate.parameterKey);
}

function progress(phase: OptimizationProgress["phase"], totalCandidates: number, validCandidates: number, invalidCandidates: number, evaluatedCandidates: number, failedCandidates: number, retainedResults: number, currentCandidateId: string | null, startedAt: number): OptimizationProgress {
  const percentage = phase === "ranking" ? 100 : totalCandidates === 0 ? 100 : Math.min(100, (evaluatedCandidates + failedCandidates) / totalCandidates * 100);
  return { phase, totalCandidates, validCandidates, invalidCandidates, evaluatedCandidates, failedCandidates, cancelledCandidates: 0, retainedResults, ...(currentCandidateId === null ? {} : { currentCandidateId }), percentage, elapsedMs: Date.now() - startedAt };
}

function emit(options: OptimizationOptions, value: OptimizationProgress): void { options.onProgress?.(value); }
function cancellation(progressValue: OptimizationProgress): OptimizationCancellationError { return new OptimizationCancellationError(undefined, { ...progressValue, cancelledCandidates: progressValue.cancelledCandidates + 1 }); }
function isAborted(signal: AbortSignal | undefined): boolean { return signal !== undefined && signal.aborted; }

function validateOptions(options: OptimizationOptions): void {
  if (!Number.isFinite(options.initialCapital) || options.initialCapital <= 0) throw new OptimizationValidationError("initialCapital must be positive and finite");
  if (!Number.isSafeInteger(options.minimumTradeCount ?? 1) || (options.minimumTradeCount ?? 1) < 0) throw new OptimizationValidationError("minimumTradeCount must be a non-negative safe integer");
  if (!Number.isSafeInteger(options.minimumObservationCount ?? 1) || (options.minimumObservationCount ?? 1) < 1) throw new OptimizationValidationError("minimumObservationCount must be a positive safe integer");
  if (options.candles.length === 0) throw new OptimizationValidationError("candles must not be empty");
  if (options.limits.maxTotalExecutionTimeMs !== undefined && (!Number.isFinite(options.limits.maxTotalExecutionTimeMs) || options.limits.maxTotalExecutionTimeMs <= 0)) throw new OptimizationValidationError("maxTotalExecutionTimeMs must be positive when provided");
  if (options.limits.maxRetainedResults !== undefined && (!Number.isSafeInteger(options.limits.maxRetainedResults) || options.limits.maxRetainedResults < 0)) throw new OptimizationValidationError("maxRetainedResults must be a non-negative safe integer");
}
