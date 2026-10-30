import { createDefaultIndicatorRegistry, type IndicatorRegistry } from "./indicators/index.js";
import type { IndicatorInstance } from "./indicators/types.js";
import {
  SessionAwareCandleAggregator,
  type SessionAggregationOptions,
  type SessionCandleObservation,
  type SessionIndicatorChartOptions,
  type SessionIndicatorResult,
  type SessionReferenceChartOptions,
  type SessionReferenceResult,
} from "./session-aggregation.js";
import { parseFixedTimeframe, type PreviousTimeframeLevel } from "./multi-timeframe.js";
import type { Candle } from "./types.js";

/**
 * Internal state holder for chart-owned session analysis.
 *
 * The public calculation helpers intentionally remain snapshot-oriented. A
 * Chart, however, receives one candle at a time, so it keeps the indexed
 * aggregation alive and only materializes a new snapshot when an update can
 * change a completed/available result. This file is intentionally not
 * re-exported from the package entry point.
 */
class SessionAggregationRuntime {
  private sourceDurationMs: number;
  private aggregator: SessionAwareCandleAggregator;
  private options: SessionAggregationOptions;
  private aggregation: ReturnType<SessionAwareCandleAggregator["getResult"]> | undefined;
  private dirty = true;

  public constructor(options: SessionAggregationOptions) {
    this.options = options;
    this.sourceDurationMs = parseFixedTimeframe(options.sourceTimeframe).durationMs;
    this.aggregator = new SessionAwareCandleAggregator(options);
  }

  public setData(candles: readonly Candle[], asOfTime: number | undefined): void {
    this.aggregator.setData(candles);
    this.aggregator.setAsOfTime(asOfTime);
    this.aggregation = undefined;
    this.dirty = true;
  }

  public update(candle: Candle, asOfTime: number | undefined): boolean {
    const previous = this.getCachedAggregation();
    const frontier = asOfTime ?? Number.MAX_SAFE_INTEGER;
    this.aggregator.update(candle);
    this.aggregator.setAsOfTime(asOfTime);
    this.dirty = true;
    const changed = previous === undefined || this.mayChangeAvailableOutput(previous, candle, frontier);
    if (changed) this.getAggregation();
    return changed;
  }

  public setOptions(options: SessionAggregationOptions, candles: readonly Candle[], asOfTime: number | undefined): void {
    this.aggregator.dispose();
    this.options = options;
    this.sourceDurationMs = parseFixedTimeframe(options.sourceTimeframe).durationMs;
    this.aggregator = new SessionAwareCandleAggregator(options);
    this.setData(candles, asOfTime);
  }

  public getAggregation(): ReturnType<SessionAwareCandleAggregator["getResult"]> {
    if (this.dirty || this.aggregation === undefined) {
      this.aggregation = this.aggregator.getResult();
      this.dirty = false;
    }
    return this.aggregation;
  }

  public hasPendingChanges(): boolean {
    return this.dirty || this.aggregation === undefined;
  }

  public dispose(): void {
    this.aggregator.dispose();
    this.aggregation = undefined;
    this.dirty = false;
  }

  private getCachedAggregation(): ReturnType<SessionAwareCandleAggregator["getResult"]> | undefined {
    return this.aggregation;
  }

  private mayChangeAvailableOutput(
    previous: ReturnType<SessionAwareCandleAggregator["getResult"]>,
    candle: Candle,
    frontier: number,
  ): boolean {
    if (frontier < previous.asOfTime) return true;
    if (previous.observations.some((observation) => previous.asOfTime < observation.periodEnd && frontier >= observation.periodEnd)) return true;

    const match = this.options.calendar.findSegmentContaining(candle.time);
    const expected = match !== null && this.options.calendar.isExpectedSourceInterval(candle.time, this.sourceDurationMs);
    if (!expected || candle.time + this.sourceDurationMs > frontier) return false;

    const periodKey = sessionPeriodKey(match!.session.tradingDate, this.options.targetPeriod, this.options.calendar.definition.weekStartsOn ?? 1);
    const observation = previous.observations.find((item) => item.periodKey === periodKey);
    // A newly observed candle in a new, still-forming period does not change
    // any available output. The period-end transition will be detected once
    // that period has an indexed observation.
    if (observation === undefined) return false;
    if (observation.availableAt !== null) return true;
    if (observation.expectedSourceCount !== null && !observation.sourceTimes.includes(candle.time)) {
      return observation.sourceCount + 1 >= observation.expectedSourceCount;
    }
    return false;
  }
}

export class SessionIndicatorRuntime {
  private readonly registry: IndicatorRegistry;
  private aggregationRuntime: SessionAggregationRuntime;
  private instance: IndicatorInstance;
  private eligibleInput: Candle[] = [];
  private result: SessionIndicatorResult | undefined;
  private initialized = false;
  private disposed = false;

  public constructor(options: SessionIndicatorChartOptions, registry: IndicatorRegistry = createDefaultIndicatorRegistry()) {
    this.registry = registry;
    this.aggregationRuntime = new SessionAggregationRuntime(options);
    this.instance = registry.create(options.indicatorId, options.parameters ?? {});
  }

  public setData(candles: readonly Candle[], asOfTime: number | undefined): SessionIndicatorResult {
    this.assertAlive();
    this.aggregationRuntime.setData(candles, asOfTime);
    return this.rebuild();
  }

  public update(candle: Candle, asOfTime: number | undefined): boolean {
    this.assertAlive();
    const changed = this.aggregationRuntime.update(candle, asOfTime);
    if (changed) this.rebuild();
    return changed;
  }

  public setOptions(options: SessionIndicatorChartOptions, candles: readonly Candle[], asOfTime: number | undefined): SessionIndicatorResult {
    this.assertAlive();
    this.instance.dispose();
    this.instance = this.registry.create(options.indicatorId, options.parameters ?? {});
    this.eligibleInput = [];
    this.initialized = false;
    this.aggregationRuntime.setOptions(options, candles, asOfTime);
    return this.rebuild();
  }

  public getResult(): SessionIndicatorResult {
    this.assertAlive();
    return this.result === undefined || this.aggregationRuntime.hasPendingChanges() ? this.rebuild() : this.result;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.instance.dispose();
    this.aggregationRuntime.dispose();
    this.result = undefined;
    this.eligibleInput = [];
    this.initialized = false;
  }

  private rebuild(): SessionIndicatorResult {
    const aggregation = this.aggregationRuntime.getAggregation();
    const eligible = aggregation.observations.filter((observation) => observation.availableAt !== null);
    const eligibleCandles = eligible.map((observation) => observation.candle);
    if (!this.initialized || !isPrefix(this.eligibleInput, eligibleCandles)) {
      this.instance.setInput(eligibleCandles);
    } else {
      for (let index = this.eligibleInput.length; index < eligible.length; index += 1) {
        this.instance.update(eligible[index]!.candle);
      }
    }
    this.eligibleInput = eligibleCandles.map((candle) => ({ ...candle }));
    this.initialized = true;
    const raw = this.instance.getResultReference?.() ?? this.instance.getResult();
    const metadata = new Map(eligible.map((observation) => [observation.candle.time, observation]));
    this.result = {
      indicatorId: raw.indicatorId,
      parameters: { ...raw.parameters },
      sourceTimeframe: aggregation.sourceTimeframe,
      targetPeriod: aggregation.targetPeriod,
      calendar: aggregation.calendar,
      asOfTime: aggregation.asOfTime,
      coveragePolicy: aggregation.coveragePolicy,
      finalityPolicy: aggregation.finalityPolicy,
      observations: aggregation.observations,
      outputs: raw.outputs.map((output) => ({
        id: output.id,
        title: output.title,
        kind: output.kind,
        ...(output.bandRole === undefined ? {} : { bandRole: output.bandRole }),
        points: output.points.flatMap((point) => {
          const item = metadata.get(point.time);
          return item === undefined ? [] : [{ ...point, ...item }];
        }),
      })),
    };
    return this.result;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Session indicator runtime has been disposed");
  }
}

export class SessionReferenceRuntime {
  private aggregationRuntime: SessionAggregationRuntime;
  private options: SessionReferenceChartOptions;
  private result: SessionReferenceResult | undefined;
  private disposed = false;

  public constructor(options: SessionReferenceChartOptions) {
    this.options = options;
    this.aggregationRuntime = new SessionAggregationRuntime(options);
  }

  public setData(candles: readonly Candle[], asOfTime: number | undefined): SessionReferenceResult {
    this.assertAlive();
    this.aggregationRuntime.setData(candles, asOfTime);
    return this.rebuild();
  }

  public update(candle: Candle, asOfTime: number | undefined): boolean {
    this.assertAlive();
    const changed = this.aggregationRuntime.update(candle, asOfTime);
    if (changed) this.rebuild();
    return changed;
  }

  public setOptions(options: SessionReferenceChartOptions, candles: readonly Candle[], asOfTime: number | undefined): SessionReferenceResult {
    this.assertAlive();
    this.options = options;
    this.aggregationRuntime.setOptions(options, candles, asOfTime);
    return this.rebuild();
  }

  public getResult(): SessionReferenceResult {
    this.assertAlive();
    return this.result === undefined || this.aggregationRuntime.hasPendingChanges() ? this.rebuild() : this.result;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.aggregationRuntime.dispose();
    this.result = undefined;
  }

  private rebuild(): SessionReferenceResult {
    const aggregation = this.aggregationRuntime.getAggregation();
    const levels = this.options.levels ?? ["open", "high", "low", "close"];
    const allowed = new Set<PreviousTimeframeLevel>(["open", "high", "low", "close"]);
    if (levels.length === 0 || levels.some((level) => !allowed.has(level))) throw new RangeError("At least one valid previous session level is required");
    let previous: SessionCandleObservation | undefined;
    this.result = {
      sourceTimeframe: aggregation.sourceTimeframe,
      targetPeriod: aggregation.targetPeriod,
      calendar: aggregation.calendar,
      asOfTime: aggregation.asOfTime,
      points: aggregation.observations.map((observation) => {
        const output: Partial<Record<PreviousTimeframeLevel, number>> = {};
        if (previous !== undefined) for (const level of levels) output[level] = previous.candle[level];
        const availableAt = previous?.availableAt ?? null;
        if (observation.availableAt !== null) previous = observation;
        return { ...observation, availableAt, levels: output };
      }),
    };
    return this.result;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Session reference runtime has been disposed");
  }
}

function isPrefix(previous: readonly Candle[], next: readonly Candle[]): boolean {
  if (next.length < previous.length) return false;
  return previous.every((candle, index) => sameCandle(candle, next[index]!));
}

function sameCandle(left: Candle, right: Candle): boolean {
  return left.time === right.time
    && left.open === right.open
    && left.high === right.high
    && left.low === right.low
    && left.close === right.close
    && left.volume === right.volume;
}

function sessionPeriodKey(date: string, period: SessionAggregationOptions["targetPeriod"], weekStartsOn: number): string {
  if (period === "session") return date;
  if (period === "month") return date.slice(0, 7);
  const parsed = parseDate(date);
  const weekday = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  return addDate(date, -((weekday - weekStartsOn + 7) % 7));
}

function parseDate(date: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new RangeError(`Invalid trading date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function addDate(date: string, days: number): string {
  const parsed = parseDate(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}
