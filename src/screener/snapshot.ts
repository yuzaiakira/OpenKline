import { validateCandle, validateCandles } from "../core/candle-store.js";
import { canonicalInstrumentIdentity } from "./identity.js";
import { evaluateScreenerRuleSet, validateScreenerRuleSet } from "./rules.js";
import type { ScreenerRuleEvaluation, ScreenerRuleSet } from "./rule-types.js";
import { validateScreenerUniverse } from "./universe.js";
import {
  DEFAULT_SCREENER_LIMITS,
  OPENKLINE_SCREENER_VERSION,
  ScreenerValidationError,
  type ScreenerBar,
  type ScreenerHistoryPage,
  type ScreenerHistoryRequest,
  type ScreenerInstrument,
  type ScreenerLimits,
  type ScreenerMarketDataProvider,
  type ScreenerUniverse,
} from "./types.js";

export type ScreenerSnapshotMatch = "matched" | "unmatched" | "unavailable";
export type ScreenerDataStatus = "complete" | "partial" | "stale" | "invalid" | "error";

export interface ScreenerSnapshotLimits extends ScreenerLimits {
  readonly maxPagesPerInstrument: number;
  readonly maxConcurrency: number;
}

export const DEFAULT_SCREENER_SNAPSHOT_LIMITS: ScreenerSnapshotLimits = {
  ...DEFAULT_SCREENER_LIMITS,
  maxPagesPerInstrument: 1_000,
  maxConcurrency: 8,
};

export interface ScreenerSnapshotProgress {
  readonly completed: number;
  readonly total: number;
  readonly instrument: ScreenerInstrument;
  readonly match: ScreenerSnapshotMatch;
}

export interface ScreenerSnapshotOptions {
  readonly provider: ScreenerMarketDataProvider;
  readonly universe: ScreenerUniverse;
  readonly ruleSet: ScreenerRuleSet;
  readonly timeframe: string;
  readonly generation?: number;
  readonly jobId?: string;
  readonly evaluationTime?: number;
  readonly signal?: AbortSignal;
  readonly strict?: boolean;
  readonly limits?: Partial<ScreenerSnapshotLimits>;
  readonly onProgress?: (progress: ScreenerSnapshotProgress) => void;
  readonly onInstrumentData?: (instrument: ScreenerInstrument, bars: readonly ScreenerBar[]) => void;
}

export interface ScreenerSymbolSnapshot {
  readonly resultId: string;
  readonly instrument: ScreenerInstrument;
  readonly instrumentIdentity: string;
  readonly ruleSetId: string;
  readonly timeframe: string;
  readonly generation: number;
  readonly match: ScreenerSnapshotMatch;
  readonly dataStatus: ScreenerDataStatus;
  readonly evaluated: boolean;
  readonly sourceBarTime: number | null;
  readonly sourceBarRevision: number | null;
  readonly barsEvaluated: number;
  readonly evaluation: ScreenerRuleEvaluation | null;
  readonly diagnostics: readonly string[];
}

export interface ScreenerSnapshotResult {
  readonly version: typeof OPENKLINE_SCREENER_VERSION;
  readonly jobId: string;
  readonly generation: number;
  readonly timeframe: string;
  readonly evaluationTime: number;
  readonly ruleSetId: string;
  readonly universe: ScreenerUniverse;
  readonly results: readonly ScreenerSymbolSnapshot[];
  readonly counts: { readonly evaluated: number; readonly matched: number; readonly unmatched: number; readonly unavailable: number };
  readonly diagnostics: readonly string[];
}

export class ScreenerSnapshotCancellationError extends Error {
  public constructor(message = "Screener snapshot was cancelled") {
    super(message);
    this.name = "ScreenerSnapshotCancellationError";
  }
}

export class ScreenerSnapshotValidationError extends ScreenerValidationError {
  public constructor(message: string) {
    super(message);
    this.name = "ScreenerSnapshotValidationError";
  }
}

export async function runScreenerSnapshot(options: ScreenerSnapshotOptions): Promise<ScreenerSnapshotResult> {
  const limits = resolveLimits(options.limits);
  const universe = validateScreenerUniverse(options.universe, { limits });
  const ruleSet = validateScreenerRuleSet(options.ruleSet);
  requireTimeframe(options.timeframe);
  throwIfAborted(options.signal);
  if (options.provider === undefined || typeof options.provider.getHistory !== "function" || typeof options.provider.resolveInstrument !== "function") {
    throw new ScreenerSnapshotValidationError("A market-data provider with history and instrument resolution is required");
  }
  const generation = options.generation ?? 1;
  if (!Number.isInteger(generation) || generation < 1) throw new ScreenerSnapshotValidationError("Screener generation must be a positive integer");
  const evaluationTime = options.evaluationTime ?? Date.now();
  if (!Number.isFinite(evaluationTime) || evaluationTime < 0) throw new ScreenerSnapshotValidationError("Screener evaluationTime must be a finite non-negative timestamp");
  const jobId = options.jobId ?? `screener-snapshot-${generation}`;
  if (jobId.trim().length === 0) throw new ScreenerSnapshotValidationError("Screener jobId must not be empty");

  const results = new Array<ScreenerSymbolSnapshot>(universe.instruments.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (true) {
      throwIfAborted(options.signal);
      const index = next;
      next += 1;
      const instrument = universe.instruments[index];
      if (instrument === undefined) return;
      const result = await evaluateInstrument(options, instrument, ruleSet, limits, generation, jobId);
      results[index] = result;
      options.onProgress?.({ completed: results.filter((item) => item !== undefined).length, total: universe.instruments.length, instrument, match: result.match });
      if (options.strict && result.match === "unavailable") throw new ScreenerSnapshotValidationError(`Strict screener snapshot failed for ${instrument.symbol}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limits.maxConcurrency, universe.instruments.length) }, () => worker()));
  throwIfAborted(options.signal);
  const ordered = results.filter((result): result is ScreenerSymbolSnapshot => result !== undefined);
  const counts = {
    evaluated: ordered.filter((result) => result.evaluated).length,
    matched: ordered.filter((result) => result.match === "matched").length,
    unmatched: ordered.filter((result) => result.match === "unmatched").length,
    unavailable: ordered.filter((result) => result.match === "unavailable").length,
  };
  return {
    version: OPENKLINE_SCREENER_VERSION,
    jobId,
    generation,
    timeframe: options.timeframe,
    evaluationTime,
    ruleSetId: ruleSet.id,
    universe,
    results: ordered,
    counts,
    diagnostics: ordered.flatMap((result) => result.diagnostics.map((message) => `${result.instrument.symbol}: ${message}`)),
  };
}

async function evaluateInstrument(
  options: ScreenerSnapshotOptions,
  instrument: ScreenerInstrument,
  ruleSet: ScreenerRuleSet,
  limits: ScreenerSnapshotLimits,
  generation: number,
  jobId: string,
): Promise<ScreenerSymbolSnapshot> {
  const identity = canonicalInstrumentIdentity(instrument);
  const base = { instrument, instrumentIdentity: identity, ruleSetId: ruleSet.id, timeframe: options.timeframe, generation };
  try {
    throwIfAborted(options.signal);
    const resolved = await options.provider.resolveInstrument(instrument, options.signal);
    if (canonicalInstrumentIdentity(resolved) !== identity) throw new Error("Provider resolved an instrument with a different canonical identity");
    const bars = await loadScreenerHistory(options.provider, resolved, options.timeframe, options.signal, limits);
    options.onInstrumentData?.(resolved, bars);
    if (bars.length === 0) return createUnavailable(base, "no-eligible-confirmed-bar", "No confirmed bar was returned", jobId);
    const candles = bars.map((bar) => bar.candle);
    const evaluation = evaluateScreenerRuleSet(ruleSet, candles);
    const match = evaluation.state === "matched" ? "matched" : evaluation.state === "not-matched" ? "unmatched" : "unavailable";
    const dataStatus: ScreenerDataStatus = evaluation.state === "unavailable" ? "partial" : "complete";
    return {
      ...base,
      resultId: createResultId(base, bars[bars.length - 1]?.candle.time ?? null, bars[bars.length - 1]?.revision ?? null, match, dataStatus, evaluation),
      match,
      dataStatus,
      evaluated: evaluation.state !== "unavailable",
      sourceBarTime: bars[bars.length - 1]?.candle.time ?? null,
      sourceBarRevision: bars[bars.length - 1]?.revision ?? null,
      barsEvaluated: candles.length,
      evaluation,
      diagnostics: evaluation.diagnostics.map((diagnostic) => diagnostic.message),
    };
  } catch (error) {
    if (error instanceof ScreenerSnapshotCancellationError || isAbortError(error) || options.signal?.aborted) throw new ScreenerSnapshotCancellationError();
    return createUnavailable(base, "provider-error", error instanceof Error ? error.message : String(error), jobId);
  }
}

export async function loadScreenerHistory(
  provider: ScreenerMarketDataProvider,
  instrument: ScreenerInstrument,
  timeframe: string,
  signal: AbortSignal | undefined,
  limits: ScreenerSnapshotLimits,
): Promise<ScreenerBar[]> {
  const byTime = new Map<number, ScreenerBar>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < limits.maxPagesPerInstrument; pageNumber += 1) {
    throwIfAborted(signal);
    const request: ScreenerHistoryRequest = { instrument, timeframe, limit: limits.maxPageSize, ...(cursor === undefined ? {} : { cursor }), ...(signal === undefined ? {} : { signal }) };
    const page = await provider.getHistory(request);
    validatePage(page);
    for (const bar of page.bars) {
      validateScreenerBar(bar);
      if (bar.finality !== "confirmed") continue;
      const existing = byTime.get(bar.candle.time);
      if (existing === undefined || bar.revision > existing.revision || (bar.revision === existing.revision && bar.receivedAt >= existing.receivedAt)) byTime.set(bar.candle.time, cloneBar(bar));
      if (byTime.size > limits.maxBarsPerInstrument) throw new ScreenerSnapshotValidationError(`Instrument exceeds maxBarsPerInstrument=${limits.maxBarsPerInstrument}`);
    }
    if (page.nextCursor === null) break;
    if (page.nextCursor === cursor) throw new ScreenerSnapshotValidationError("Provider repeated a screener history cursor");
    cursor = page.nextCursor;
    if (page.complete) break;
    if (pageNumber === limits.maxPagesPerInstrument - 1) throw new ScreenerSnapshotValidationError(`Instrument exceeded maxPagesPerInstrument=${limits.maxPagesPerInstrument}`);
  }
  const bars = [...byTime.values()].sort((left, right) => left.candle.time - right.candle.time);
  validateCandles(bars.map((bar) => bar.candle));
  return bars;
}

function createUnavailable(
  base: { readonly instrument: ScreenerInstrument; readonly instrumentIdentity: string; readonly ruleSetId: string; readonly timeframe: string; readonly generation: number },
  code: string,
  message: string,
  jobId: string,
): ScreenerSymbolSnapshot {
  return {
    ...base,
    resultId: createResultId(base, null, null, "unavailable", "error", null),
    match: "unavailable",
    dataStatus: code === "provider-error" ? "error" : code === "no-eligible-confirmed-bar" ? "partial" : "invalid",
    evaluated: false,
    sourceBarTime: null,
    sourceBarRevision: null,
    barsEvaluated: 0,
    evaluation: null,
    diagnostics: [`${code}: ${message}`, `job:${jobId}`],
  };
}

function createResultId(
  base: { readonly instrumentIdentity: string; readonly ruleSetId: string; readonly timeframe: string; readonly generation: number },
  sourceBarTime: number | null,
  sourceBarRevision: number | null,
  match: ScreenerSnapshotMatch,
  dataStatus: ScreenerDataStatus,
  evaluation: ScreenerRuleEvaluation | null,
): string {
  return JSON.stringify({ instrument: base.instrumentIdentity, ruleSet: base.ruleSetId, timeframe: base.timeframe, sourceBarTime, sourceBarRevision, generation: base.generation, match, dataStatus, value: evaluation?.value ?? null, previousValue: evaluation?.previousValue ?? null, diagnostics: evaluation?.diagnostics ?? [] });
}

function validatePage(page: ScreenerHistoryPage): void {
  if (typeof page !== "object" || page === null || !Array.isArray(page.bars) || (page.nextCursor !== null && typeof page.nextCursor !== "string") || typeof page.complete !== "boolean") throw new ScreenerSnapshotValidationError("Provider returned an invalid screener history page");
}

function validateScreenerBar(bar: ScreenerBar): void {
  if (typeof bar !== "object" || bar === null || (bar.finality !== "confirmed" && bar.finality !== "developing") || !Number.isInteger(bar.revision) || bar.revision < 0 || typeof bar.source !== "string" || bar.source.trim().length === 0 || !Number.isFinite(bar.receivedAt) || bar.receivedAt < 0) throw new ScreenerSnapshotValidationError("Provider returned an invalid screener bar envelope");
  validateCandle(bar.candle);
}

function resolveLimits(overrides: Partial<ScreenerSnapshotLimits> | undefined): ScreenerSnapshotLimits {
  const limits = { ...DEFAULT_SCREENER_SNAPSHOT_LIMITS, ...(overrides ?? {}) };
  for (const [name, value] of Object.entries(limits)) if (!Number.isInteger(value) || value < 1) throw new ScreenerSnapshotValidationError(`Screener snapshot limit ${name} must be a positive integer`);
  return limits;
}

function requireTimeframe(timeframe: string): void { if (typeof timeframe !== "string" || timeframe.trim().length === 0) throw new ScreenerSnapshotValidationError("Screener timeframe must not be empty"); }
function throwIfAborted(signal: AbortSignal | undefined): void { if (signal?.aborted) throw new ScreenerSnapshotCancellationError(); }
function isAbortError(error: unknown): boolean { return error instanceof Error && error.name === "AbortError"; }
function cloneBar(bar: ScreenerBar): ScreenerBar { return { ...bar, candle: { ...bar.candle } }; }

