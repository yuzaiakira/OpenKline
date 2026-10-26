import { createBacktestWorker, BacktestWorkerError, type BacktestWorkerFactory } from "../backtesting/worker-runtime.js";
import type { BacktestResult } from "../backtesting/types.js";
import { fingerprintCandles } from "../backtesting/metrics.js";
import { createDefaultStrategyRegistry } from "../strategies/index.js";
import { compareOptimizationScores, getOptimizationObjective, scoreBacktestResult } from "./objectives.js";
import { generateOptimizationCandidates } from "./parameter-space.js";
import { OptimizationValidationError, type OptimizationCandidateResult, type OptimizationOptions, type OptimizationParameterCandidate, type OptimizationProgress, type OptimizationResult } from "./types.js";
import type { BacktestWorkerOptions } from "../backtesting/worker-protocol.js";

export type OptimizationWorkerFactory = BacktestWorkerFactory;
export type OptimizationWorkerStatusState = "idle" | "running" | "completed" | "cancelled" | "failed" | "disposed";
export type OptimizationWorkerErrorCode = "CANCELLED" | "SUPERSEDED" | "TIMEOUT" | "WORKER_DISPOSED" | "WORKER_CRASHED" | "WORKER_UNAVAILABLE" | "EXECUTION_FAILED";

export interface OptimizationWorkerRuntimeOptions {
  readonly factory?: OptimizationWorkerFactory;
  readonly workerCount?: number;
  readonly candidateTimeoutMs?: number;
  readonly overallTimeoutMs?: number;
  readonly retryWorkerCrash?: boolean;
}

export interface OptimizationWorkerStatus {
  readonly state: OptimizationWorkerStatusState;
  readonly jobId: string | null;
  readonly activeWorkers: number;
  readonly progress: OptimizationProgress | null;
  readonly error?: string;
}

type OptimizationWorkerStatusUpdate = Omit<Partial<OptimizationWorkerStatus>, "error"> & { readonly error?: string | undefined };

export interface OptimizationWorkerApi {
  getStatus(): OptimizationWorkerStatus;
  subscribe(listener: (status: OptimizationWorkerStatus) => void): () => void;
  run(): Promise<OptimizationResult>;
  cancel(): void;
  dispose(): void;
}

export class OptimizationWorkerError extends Error {
  public constructor(public readonly code: OptimizationWorkerErrorCode, message: string) { super(message); this.name = "OptimizationWorkerError"; }
}

interface ActiveJob {
  readonly generation: number;
  readonly jobId: string;
  readonly resolve: (result: OptimizationResult) => void;
  readonly reject: (error: unknown) => void;
  readonly sessions: Set<ReturnType<typeof createBacktestWorker>>;
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export function createOptimizationWorker(options: OptimizationOptions, runtimeOptions: OptimizationWorkerRuntimeOptions = {}): OptimizationWorkerApi {
  return new OptimizationWorkerSession(options, runtimeOptions);
}

export class OptimizationWorkerSession implements OptimizationWorkerApi {
  private readonly options: OptimizationOptions;
  private readonly factory: OptimizationWorkerFactory | undefined;
  private readonly workerCount: number;
  private readonly candidateTimeoutMs: number;
  private readonly overallTimeoutMs: number | undefined;
  private readonly retryWorkerCrash: boolean;
  private readonly listeners = new Set<(status: OptimizationWorkerStatus) => void>();
  private status: OptimizationWorkerStatus = { state: "idle", jobId: null, activeWorkers: 0, progress: null };
  private active: ActiveJob | null = null;
  private nextGeneration = 0;
  private disposed = false;

  public constructor(options: OptimizationOptions, runtimeOptions: OptimizationWorkerRuntimeOptions = {}) {
    if (options.strategyRegistry !== undefined) throw new OptimizationValidationError("Optimization Worker accepts only the trusted built-in strategy registry");
    this.options = { ...options, candles: options.candles.map((candle) => ({ ...candle })), searchSpace: options.searchSpace.map((definition) => ({ ...definition })) };
    this.factory = runtimeOptions.factory;
    this.workerCount = runtimeOptions.workerCount ?? 1;
    this.candidateTimeoutMs = runtimeOptions.candidateTimeoutMs ?? 30_000;
    this.overallTimeoutMs = runtimeOptions.overallTimeoutMs;
    this.retryWorkerCrash = runtimeOptions.retryWorkerCrash ?? true;
    if (!Number.isSafeInteger(this.workerCount) || this.workerCount < 1 || this.workerCount > 64) throw new OptimizationValidationError("workerCount must be an integer from 1 through 64");
    if (!Number.isSafeInteger(this.candidateTimeoutMs) || this.candidateTimeoutMs < 1) throw new OptimizationValidationError("candidateTimeoutMs must be a positive integer");
    if (this.overallTimeoutMs !== undefined && (!Number.isSafeInteger(this.overallTimeoutMs) || this.overallTimeoutMs < 1)) throw new OptimizationValidationError("overallTimeoutMs must be a positive integer");
  }

  public getStatus(): OptimizationWorkerStatus { return { ...this.status, ...(this.status.progress === null ? {} : { progress: { ...this.status.progress } }) }; }

  public subscribe(listener: (status: OptimizationWorkerStatus) => void): () => void {
    if (this.disposed) throw new OptimizationWorkerError("WORKER_DISPOSED", "Optimization Worker runtime was disposed");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public run(): Promise<OptimizationResult> {
    this.assertAlive();
    if (this.active !== null) this.cancelInternal("SUPERSEDED");
    const generation = ++this.nextGeneration;
    const jobId = `optimization-worker-${generation}`;
    let resolve!: (result: OptimizationResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<OptimizationResult>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    const active: ActiveJob = { generation, jobId, resolve, reject, sessions: new Set(), cancelled: false, timer: null };
    this.active = active;
    this.updateStatus({ state: "running", jobId, activeWorkers: 0, progress: null, error: undefined });
    if (this.overallTimeoutMs !== undefined) active.timer = setTimeout(() => { if (this.active === active) this.cancelInternal("TIMEOUT"); }, this.overallTimeoutMs);
    void this.execute(active);
    return promise;
  }

  public cancel(): void { this.assertAlive(); if (this.active !== null) this.cancelInternal("CANCELLED"); }

  public dispose(): void {
    if (this.disposed) return;
    if (this.active !== null) this.cancelInternal("WORKER_DISPOSED");
    this.disposed = true;
    this.updateStatus({ state: "disposed", jobId: null, activeWorkers: 0, progress: null, error: undefined });
    this.listeners.clear();
  }

  private async execute(active: ActiveJob): Promise<void> {
    try {
      const startedAt = Date.now();
      const registry = createDefaultStrategyRegistry();
      const generation = generateOptimizationCandidates(this.options.strategy, this.options.searchSpace, this.options.limits.maxCandidates, registry);
      const datasetFingerprint = fingerprintCandles(this.options.candles);
      const objective = getOptimizationObjective(this.options.objective);
      const progress = createProgress("evaluating", generation.candidates.length, generation.invalidCandidates.length, 0, 0, 0, null, startedAt);
      this.publishProgress(active, progress);
      const results: Array<OptimizationCandidateResult | undefined> = Array.from({ length: generation.candidates.length }, () => undefined);
      let nextIndex = 0;
      let evaluated = 0;
      let failed = 0;
      let retained = 0;
      const maxRetained = this.options.limits.maxRetainedResults ?? generation.candidates.length;
      const launch = async (): Promise<void> => {
        while (!active.cancelled) {
          const index = nextIndex++;
          const candidate = generation.candidates[index];
          if (candidate === undefined) return;
          let result: OptimizationCandidateResult;
          try {
            const backtest = await this.runCandidate(active, candidate);
            if (active.cancelled) return;
            evaluated += 1;
            const keepFull = this.options.retainBacktestResults === true && retained < maxRetained;
            if (keepFull) retained += 1;
            result = { candidate, status: "evaluated", objective: scoreBacktestResult(backtest, this.options.objective, this.options.minimumTradeCount ?? 1, this.options.minimumObservationCount ?? 1), metrics: backtest.metrics, tradeCount: backtest.trades.length, observationCount: backtest.equityCurve.length, inputFingerprint: datasetFingerprint, assumptions: backtest.assumptions, error: null, elapsedMs: 0, backtestResult: keepFull ? backtest : null };
          } catch (error) {
            if (active.cancelled) return;
            failed += 1;
            result = failedCandidate(candidate, this.options.objective, datasetFingerprint, error instanceof Error ? error.message : String(error));
          }
          results[index] = result;
          this.publishProgress(active, createProgress("evaluating", generation.candidates.length, generation.invalidCandidates.length, evaluated, failed, retained, candidate.candidateId, startedAt));
        }
      };
      await Promise.all(Array.from({ length: Math.min(this.workerCount, Math.max(1, generation.candidates.length)) }, () => launch()));
      if (this.active !== active || active.cancelled) return;
      const compactResults = results.filter((result): result is OptimizationCandidateResult => result !== undefined);
      const rankedCandidates = [...compactResults].sort(compareCandidateResults);
      const firstAssumptions = compactResults.find((result) => result.assumptions !== null)?.assumptions ?? null;
      const finalProgress = createProgress("ranking", generation.candidates.length, generation.invalidCandidates.length, evaluated, failed, retained, null, startedAt);
      this.publishProgress(active, finalProgress);
      const report: OptimizationResult = {
        engineVersion: 1,
        jobId: active.jobId,
        strategyId: generation.candidates[0]?.strategyId ?? registry.getMetadata(this.options.strategy).id,
        strategyVersion: generation.candidates[0]?.strategyVersion ?? registry.getMetadata(this.options.strategy).version,
        objective: this.options.objective,
        objectiveDirection: objective.direction,
        datasetFingerprint,
        dataset: { barCount: this.options.candles.length, firstTime: this.options.candles[0]?.time ?? null, lastTime: this.options.candles.at(-1)?.time ?? null },
        counts: { generated: generation.generatedCount, valid: generation.candidates.length, invalid: generation.invalidCandidates.length, duplicates: generation.duplicateCount, evaluated, failed, cancelled: 0, retainedFullResults: retained },
        invalidCandidates: generation.invalidCandidates,
        candidates: compactResults,
        rankedCandidates,
        assumptions: firstAssumptions,
        elapsedMs: finalProgress.elapsedMs,
      };
      this.clearTimer(active);
      this.active = null;
      this.updateStatus({ state: "completed", jobId: active.jobId, activeWorkers: 0, progress: finalProgress, error: undefined });
      active.resolve(report);
    } catch (error) {
      if (this.active !== active || active.cancelled) return;
      this.clearTimer(active);
      this.active = null;
      const normalized = error instanceof OptimizationWorkerError ? error : new OptimizationWorkerError("EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
      this.updateStatus({ state: "failed", jobId: active.jobId, activeWorkers: 0, error: normalized.message });
      active.reject(normalized);
    }
  }

  private async runCandidate(active: ActiveJob, candidate: OptimizationParameterCandidate): Promise<BacktestResult> {
    let attempt = 0;
    while (true) {
      if (active.cancelled) throw new OptimizationWorkerError("CANCELLED", "Optimization Worker execution was cancelled");
      const workerOptions: BacktestWorkerOptions = {
        strategy: this.options.strategy,
        parameters: { ...candidate.parameters },
        candles: this.options.candles,
        initialCapital: this.options.initialCapital,
        positionSizing: this.options.positionSizing,
        commission: this.options.commission,
        slippage: this.options.slippage,
        ...(this.options.shortSelling === undefined ? {} : { shortSelling: this.options.shortSelling }),
        ...(this.options.reversal === undefined ? {} : { reversal: this.options.reversal }),
        ...(this.options.allowFractionalQuantity === undefined ? {} : { allowFractionalQuantity: this.options.allowFractionalQuantity }),
      };
      const session = createBacktestWorker(workerOptions, { ...(this.factory === undefined ? {} : { factory: this.factory }), timeoutMs: this.candidateTimeoutMs });
      active.sessions.add(session);
      try {
        return await session.run();
      } catch (error) {
        const code = error instanceof BacktestWorkerError ? error.code : "EXECUTION_FAILED";
        if (this.retryWorkerCrash && attempt === 0 && (code === "WORKER_CRASHED" || code === "WORKER_UNAVAILABLE")) { attempt += 1; continue; }
        throw error;
      } finally {
        active.sessions.delete(session);
        session.dispose();
      }
    }
  }

  private cancelInternal(code: "CANCELLED" | "SUPERSEDED" | "TIMEOUT" | "WORKER_DISPOSED"): void {
    const active = this.active;
    if (active === null) return;
    active.cancelled = true;
    this.clearTimer(active);
    active.sessions.forEach((session) => session.cancel());
    this.active = null;
    this.updateStatus({ state: code === "WORKER_DISPOSED" ? "disposed" : "cancelled", jobId: active.jobId, activeWorkers: 0, error: code === "SUPERSEDED" ? "Optimization Worker execution was superseded" : code === "TIMEOUT" ? "Optimization Worker execution timed out" : code === "WORKER_DISPOSED" ? "Optimization Worker runtime was disposed" : "Optimization Worker execution was cancelled" });
    active.reject(new OptimizationWorkerError(code, this.status.error ?? "Optimization Worker execution ended"));
  }

  private publishProgress(active: ActiveJob, progress: OptimizationProgress): void {
    if (this.active !== active || active.cancelled) return;
    this.updateStatus({ state: "running", jobId: active.jobId, activeWorkers: active.sessions.size, progress, error: undefined });
    this.options.onProgress?.(progress);
  }

  private clearTimer(active: ActiveJob): void { if (active.timer !== null) { clearTimeout(active.timer); active.timer = null; } }
  private updateStatus(update: OptimizationWorkerStatusUpdate): void {
    const next = { ...this.status, ...update };
    this.status = { state: next.state, jobId: next.jobId, activeWorkers: next.activeWorkers, progress: next.progress, ...(next.error === undefined ? {} : { error: next.error }) };
    const snapshot = this.getStatus();
    this.listeners.forEach((listener) => listener(snapshot));
  }
  private assertAlive(): void { if (this.disposed) throw new OptimizationWorkerError("WORKER_DISPOSED", "Optimization Worker runtime was disposed"); }
}

function createProgress(phase: OptimizationProgress["phase"], totalCandidates: number, invalidCandidates: number, evaluatedCandidates: number, failedCandidates: number, retainedResults: number, currentCandidateId: string | null, startedAt: number): OptimizationProgress {
  const percentage = phase === "ranking" ? 100 : totalCandidates === 0 ? 100 : Math.min(100, (evaluatedCandidates + failedCandidates) / totalCandidates * 100);
  return { phase, totalCandidates, validCandidates: totalCandidates, invalidCandidates, evaluatedCandidates, failedCandidates, cancelledCandidates: 0, retainedResults, ...(currentCandidateId === null ? {} : { currentCandidateId }), percentage, elapsedMs: Date.now() - startedAt };
}

function failedCandidate(candidate: OptimizationParameterCandidate, objective: OptimizationOptions["objective"], fingerprint: string, error: string): OptimizationCandidateResult {
  return { candidate, status: "failed", objective: { objective, direction: getOptimizationObjective(objective).direction, value: null, available: false, unavailableReason: "Candidate execution failed" }, metrics: null, tradeCount: 0, observationCount: 0, inputFingerprint: fingerprint, assumptions: null, error, elapsedMs: 0, backtestResult: null };
}

function compareCandidateResults(left: OptimizationCandidateResult, right: OptimizationCandidateResult): number {
  const score = compareOptimizationScores(left.objective, right.objective);
  if (score !== 0) return score;
  const leftDrawdown = left.metrics?.maxDrawdown ?? Number.POSITIVE_INFINITY;
  const rightDrawdown = right.metrics?.maxDrawdown ?? Number.POSITIVE_INFINITY;
  if (leftDrawdown !== rightDrawdown) return leftDrawdown - rightDrawdown;
  return left.candidate.parameterKey.localeCompare(right.candidate.parameterKey);
}
