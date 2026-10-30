import { validateCandle } from "./core/candle-store.js";
import { createDefaultIndicatorRegistry, type IndicatorRegistry } from "./indicators/index.js";
import type { IndicatorOutputKind, IndicatorPoint } from "./indicators/types.js";
import {
  aggregateCandleValues,
  parseFixedTimeframe,
  type FixedTimeframe,
  type MappedMultiTimeframePoint,
  type MultiTimeframeBucketStatus,
  type MultiTimeframeCoverage,
  type MultiTimeframeCoveragePolicy,
  type MultiTimeframeFinalityPolicy,
  type MultiTimeframeMissingVolumePolicy,
  type PreviousTimeframeLevel,
  type MultiTimeframeReferenceStyle,
} from "./multi-timeframe.js";
import { tradingDateForTimestamp, TradingCalendarEngine, type TradingCalendarSnapshot, type TradingSession } from "./trading-calendar.js";
import type { Candle, SeriesStyle } from "./types.js";

const DEFAULT_SESSION_LOOKAHEAD_DAYS = 370;

export type TradingAggregationPeriod = "session" | "week" | "month";

export interface SessionAggregationOptions {
  readonly sourceTimeframe: string;
  readonly targetPeriod: TradingAggregationPeriod;
  readonly calendar: TradingCalendarEngine;
  readonly coveragePolicy?: MultiTimeframeCoveragePolicy;
  readonly missingVolumePolicy?: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy?: MultiTimeframeFinalityPolicy;
  readonly asOfTime?: number;
}

export interface SessionAggregationMetadata {
  readonly periodKey: string;
  readonly periodStart: number;
  readonly periodEnd: number;
  readonly availableAt: number | null;
  readonly status: MultiTimeframeBucketStatus;
  readonly coverage: MultiTimeframeCoverage;
  readonly sessionIds: readonly string[];
  readonly tradingDates: readonly string[];
  readonly sourceCount: number;
  readonly expectedSourceCount: number | null;
  readonly missingSourceCount: number | null;
  readonly sourceTimes: readonly number[];
}

export interface SessionCandleObservation extends SessionAggregationMetadata {
  readonly candle: Candle;
}

export interface SessionAggregationResult {
  readonly sourceTimeframe: FixedTimeframe;
  readonly targetPeriod: TradingAggregationPeriod;
  readonly calendar: TradingCalendarSnapshot;
  readonly coveragePolicy: MultiTimeframeCoveragePolicy;
  readonly missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly asOfTime: number;
  readonly observations: readonly SessionCandleObservation[];
}

export interface SessionIndicatorOptions extends SessionAggregationOptions {
  readonly indicatorId: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly outputStyles?: Readonly<Record<string, SeriesStyle>>;
}

/** Chart-owned session indicator configuration; derived values are not persisted. */
export interface SessionIndicatorChartOptions extends SessionIndicatorOptions {
  readonly id?: string;
  readonly pane?: string | "new";
  readonly visible?: boolean;
  readonly outputStyles?: Readonly<Record<string, SeriesStyle>>;
}

export interface SessionIndicatorApi {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  getOptions(): SessionIndicatorChartOptions & { readonly id: string };
  getResult(): SessionIndicatorResult;
  setParameters(parameters: Readonly<Record<string, unknown>>): void;
  setOutputStyle(outputId: string, style: SeriesStyle): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface SessionIndicatorPoint extends IndicatorPoint, SessionAggregationMetadata {
  readonly time: number;
}

export interface SessionIndicatorOutput {
  readonly id: string;
  readonly title: string;
  readonly kind: IndicatorOutputKind;
  readonly bandRole?: "upper" | "lower";
  readonly points: readonly SessionIndicatorPoint[];
}

export interface SessionIndicatorResult {
  readonly indicatorId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly sourceTimeframe: FixedTimeframe;
  readonly targetPeriod: TradingAggregationPeriod;
  readonly calendar: TradingCalendarSnapshot;
  readonly asOfTime: number;
  readonly coveragePolicy: MultiTimeframeCoveragePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly observations: readonly SessionCandleObservation[];
  readonly outputs: readonly SessionIndicatorOutput[];
}

export interface SessionReferenceOptions extends SessionAggregationOptions {
  readonly levels?: readonly PreviousTimeframeLevel[];
}

/** Chart-owned previous-session level configuration. */
export interface SessionReferenceChartOptions extends SessionReferenceOptions {
  readonly id?: string;
  readonly visible?: boolean;
  readonly labels?: boolean;
  readonly labelPrefix?: string;
  readonly style?: MultiTimeframeReferenceStyle;
}

export interface SessionReferenceApi {
  readonly id: string;
  getOptions(): SessionReferenceChartOptions & { readonly id: string };
  getResult(): SessionReferenceResult;
  setOptions(patch: Partial<Omit<SessionReferenceChartOptions, "id" | "calendar">>): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface SessionReferencePoint extends SessionAggregationMetadata {
  readonly levels: Readonly<Partial<Record<PreviousTimeframeLevel, number>>>;
}

export interface SessionReferenceResult {
  readonly sourceTimeframe: FixedTimeframe;
  readonly targetPeriod: TradingAggregationPeriod;
  readonly calendar: TradingCalendarSnapshot;
  readonly asOfTime: number;
  readonly points: readonly SessionReferencePoint[];
}

export interface MappedSessionReferencePoint {
  readonly time: number;
  readonly levels: Readonly<Partial<Record<PreviousTimeframeLevel, number>>>;
  readonly periodKey: string | null;
  readonly periodStart: number | null;
  readonly periodEnd: number | null;
  readonly availableAt: number | null;
}

interface PeriodSchedule {
  readonly periodKey: string;
  readonly sessions: readonly TradingSession[];
}

/**
 * Incremental source store and deterministic session/week/month projection.
 * Session boundaries come from the selected calendar; OHLCV reduction is shared
 * with the Phase 10 fixed-duration aggregator.
 */
export class SessionAwareCandleAggregator {
  private readonly source: FixedTimeframe;
  private targetPeriod: TradingAggregationPeriod;
  private calendar: TradingCalendarEngine;
  private coveragePolicy: MultiTimeframeCoveragePolicy;
  private missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  private finalityPolicy: MultiTimeframeFinalityPolicy;
  private asOfTime: number;
  private readonly candles = new Map<number, Candle>();
  private readonly localDateSessions = new Map<string, readonly TradingSession[]>();
  private readonly expectedSlots = new Map<string, readonly number[]>();
  private readonly periodSchedules = new Map<string, PeriodSchedule>();
  /** Cursor used only while getResult walks source candles in time order. */
  private sessionCursor: TradingSession | null = null;
  private disposed = false;

  public constructor(options: SessionAggregationOptions) {
    this.source = parseFixedTimeframe(options.sourceTimeframe);
    this.targetPeriod = normalizePeriod(options.targetPeriod);
    this.calendar = options.calendar;
    this.coveragePolicy = options.coveragePolicy ?? "fixed-duration";
    this.missingVolumePolicy = options.missingVolumePolicy ?? "ignore";
    this.finalityPolicy = options.finalityPolicy ?? "time-closed";
    this.asOfTime = normalizeAsOf(options.asOfTime);
  }

  public setData(candles: readonly Candle[]): void {
    this.assertAlive();
    this.candles.clear();
    candles.forEach((candle, index) => this.setSourceCandle(candle, index));
  }

  public update(candle: Candle): void {
    this.assertAlive();
    validateCandle(candle, this.candles.size);
    this.setSourceCandle(candle, this.candles.size);
  }

  public setAsOfTime(asOfTime: number | undefined): void {
    this.assertAlive();
    this.asOfTime = normalizeAsOf(asOfTime);
  }

  public setCalendar(calendar: TradingCalendarEngine): void {
    this.assertAlive();
    this.calendar = calendar;
    this.clearCalendarCaches();
  }

  public setOptions(options: Pick<SessionAggregationOptions, "targetPeriod" | "coveragePolicy" | "missingVolumePolicy" | "finalityPolicy">): void {
    this.assertAlive();
    this.targetPeriod = normalizePeriod(options.targetPeriod);
    this.coveragePolicy = options.coveragePolicy ?? this.coveragePolicy;
    this.missingVolumePolicy = options.missingVolumePolicy ?? this.missingVolumePolicy;
    this.finalityPolicy = options.finalityPolicy ?? this.finalityPolicy;
    this.periodSchedules.clear();
  }

  public getResult(asOfTime: number | undefined = this.asOfTime): SessionAggregationResult {
    this.assertAlive();
    const frontier = normalizeAsOf(asOfTime);
    this.sessionCursor = null;
    const groups = new Map<string, { sessions: Map<string, TradingSession>; candles: Candle[] }>();
    for (const candle of [...this.candles.values()].sort((left, right) => left.time - right.time)) {
      if (candle.time + this.source.durationMs > frontier) continue;
      const match = this.resolveSessionSegment(candle.time);
      if (match === null || !this.calendar.isExpectedSourceInterval(candle.time, this.source.durationMs)) continue;
      const periodKey = periodKeyFor(match.session.tradingDate, this.targetPeriod, this.calendar.definition.weekStartsOn ?? 1);
      const group = groups.get(periodKey) ?? { sessions: new Map<string, TradingSession>(), candles: [] };
      group.sessions.set(match.session.id, match.session);
      group.candles.push({ ...candle });
      groups.set(periodKey, group);
    }

    const observations: SessionCandleObservation[] = [];
    for (const [periodKey, group] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      const schedule = this.getPeriodSchedule(periodKey, [...group.sessions.values()][0]!);
      const sourceTimes = group.candles.map((candle) => candle.time).sort((left, right) => left - right);
      const periodStart = schedule.sessions[0]?.start ?? Math.min(...sourceTimes);
      const periodEnd = schedule.sessions.at(-1)?.end ?? Math.max(...sourceTimes) + this.source.durationMs;
      const expected = this.coveragePolicy === "unknown" ? null : this.expectedSlotsFor(schedule.sessions);
      const sourceSet = new Set(sourceTimes);
      // Source timestamps are unique because the backing store is keyed by
      // time. A size check plus set membership preserves the two-way coverage
      // invariant without repeatedly scanning the expected-slot array with
      // Array.includes for every source candle.
      const complete = expected !== null && expected.length === sourceSet.size && expected.every((time) => sourceSet.has(time));
      const coverage = expected === null
        ? "unknown"
        : complete ? "complete" : "partial";
      const missing = expected === null ? null : Math.max(0, expected.length - sourceTimes.length);
      const closed = frontier >= periodEnd;
      const completeBucket = coverage === "complete" && missing === 0;
      const status: MultiTimeframeBucketStatus = !closed
        ? "forming"
        : completeBucket
          ? "closed-complete"
          : coverage === "partial"
            ? "closed-partial"
            : "closed-uncertain";
      const available = closed && (this.finalityPolicy === "time-closed" || status === "closed-complete") ? periodEnd : null;
      const orderedCandles = [...group.candles].sort((left, right) => left.time - right.time);
      observations.push({
        periodKey,
        periodStart,
        periodEnd,
        availableAt: available,
        status,
        coverage,
        sessionIds: schedule.sessions.map((session) => session.id),
        tradingDates: schedule.sessions.map((session) => session.tradingDate),
        sourceCount: sourceTimes.length,
        expectedSourceCount: expected?.length ?? null,
        missingSourceCount: missing,
        sourceTimes,
        candle: aggregateCandleValues(orderedCandles, this.missingVolumePolicy, periodStart),
      });
    }
    return {
      sourceTimeframe: { ...this.source },
      targetPeriod: this.targetPeriod,
      calendar: this.calendar.snapshot(),
      coveragePolicy: this.coveragePolicy,
      missingVolumePolicy: this.missingVolumePolicy,
      finalityPolicy: this.finalityPolicy,
      asOfTime: frontier,
      observations,
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.candles.clear();
    this.clearCalendarCaches();
  }

  private setSourceCandle(candle: Candle, index: number): void {
    validateCandle(candle, index);
    this.candles.set(candle.time, { ...candle });
  }

  private resolveSessionSegment(time: number): { readonly session: TradingSession } | null {
    if (this.sessionCursor !== null) {
      const current = this.sessionCursor.segments.find((segment) => time >= segment.start && time < segment.end);
      if (current !== undefined) return { session: this.sessionCursor };
      if (time >= this.sessionCursor.end) {
        let date = addDate(this.sessionCursor.tradingDate, 1);
        for (let days = 0; days <= DEFAULT_SESSION_LOOKAHEAD_DAYS; days += 1) {
          const candidate = this.calendar.resolveSession(date);
          if (candidate !== null) {
            this.sessionCursor = candidate;
            if (time < candidate.start) return null;
            const segment = candidate.segments.find((item) => time >= item.start && time < item.end);
            if (segment !== undefined) return { session: candidate };
            if (time < candidate.end) return null;
          }
          date = addDate(date, 1);
        }
        this.sessionCursor = null;
        // A sparse dataset can legitimately jump farther than the bounded
        // cursor look-ahead; fall back to the calendar's date-aware resolver
        // instead of silently dropping the later candle.
        return this.resolveSessionSegment(time);
      }
      return null;
    }
    const localDate = tradingDateForTimestamp(time, this.calendar.timeZone);
    let candidates = this.localDateSessions.get(localDate);
    if (candidates === undefined) {
      const dates = [localDate, addDate(localDate, -1), addDate(localDate, 1)];
      candidates = dates.map((date) => this.calendar.resolveSession(date)).filter((session): session is TradingSession => session !== null);
      this.localDateSessions.set(localDate, candidates);
    }
    for (const session of candidates) {
      if (session.segments.some((segment) => time >= segment.start && time < segment.end)) {
        this.sessionCursor = session;
        return { session };
      }
    }
    return null;
  }

  private expectedSlotsFor(sessions: readonly TradingSession[]): readonly number[] {
    const slots: number[] = [];
    for (const session of sessions) {
      let cached = this.expectedSlots.get(session.id);
      if (cached === undefined) {
        const generated: number[] = [];
        for (const segment of session.segments) {
          for (let time = segment.start; time + this.source.durationMs <= segment.end; time += this.source.durationMs) generated.push(time);
        }
        cached = generated;
        this.expectedSlots.set(session.id, cached);
      }
      slots.push(...cached);
    }
    return slots.sort((left, right) => left - right);
  }

  private getPeriodSchedule(periodKey: string, observedSession: TradingSession): PeriodSchedule {
    const existing = this.periodSchedules.get(periodKey);
    if (existing !== undefined) return existing;
    const dates = periodDateRange(observedSession.tradingDate, this.targetPeriod, this.calendar.definition.weekStartsOn ?? 1);
    const from = Date.UTC(Number(dates.start.slice(0, 4)), Number(dates.start.slice(5, 7)) - 1, Number(dates.start.slice(8, 10))) - 3 * 86_400_000;
    const to = Date.UTC(Number(dates.end.slice(0, 4)), Number(dates.end.slice(5, 7)) - 1, Number(dates.end.slice(8, 10))) + 3 * 86_400_000;
    const sessions = this.calendar.enumerateSessions(from, to, { maxSessions: 10_000 }).filter((session) => session.tradingDate >= dates.start && session.tradingDate < dates.end);
    const schedule = { periodKey, sessions };
    this.periodSchedules.set(periodKey, schedule);
    return schedule;
  }

  private clearCalendarCaches(): void {
    this.localDateSessions.clear();
    this.expectedSlots.clear();
    this.periodSchedules.clear();
    this.sessionCursor = null;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Session-aware aggregator has been disposed");
  }
}

export function aggregateCandlesByTradingPeriod(candles: readonly Candle[], options: SessionAggregationOptions): SessionAggregationResult {
  const aggregator = new SessionAwareCandleAggregator(options);
  aggregator.setData(candles);
  const result = aggregator.getResult(options.asOfTime);
  aggregator.dispose();
  return result;
}

export function calculateSessionIndicator(candles: readonly Candle[], options: SessionIndicatorOptions, registry: IndicatorRegistry = createDefaultIndicatorRegistry()): SessionIndicatorResult {
  const aggregation = aggregateCandlesByTradingPeriod(candles, options);
  const eligible = aggregation.observations.filter((observation) => observation.availableAt !== null);
  const instance = registry.create(options.indicatorId, options.parameters ?? {});
  try {
    instance.setInput(eligible.map((observation) => observation.candle));
    const result = instance.getResult();
    const metadata = new Map(eligible.map((observation) => [observation.candle.time, observation]));
    return {
      indicatorId: result.indicatorId,
      parameters: { ...result.parameters },
      sourceTimeframe: aggregation.sourceTimeframe,
      targetPeriod: aggregation.targetPeriod,
      calendar: aggregation.calendar,
      asOfTime: aggregation.asOfTime,
      coveragePolicy: aggregation.coveragePolicy,
      finalityPolicy: aggregation.finalityPolicy,
      observations: aggregation.observations,
      outputs: result.outputs.map((output) => ({
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
  } finally {
    instance.dispose();
  }
}

export function mapSessionIndicatorToSourceTimes(result: SessionIndicatorResult, sourceTimes: readonly number[], outputId: string): MappedMultiTimeframePoint[] {
  const output = result.outputs.find((candidate) => candidate.id === outputId);
  if (output === undefined) throw new Error(`Unknown session indicator output: ${outputId}`);
  const points = output.points.filter((point) => point.availableAt !== null).sort((left, right) => left.availableAt! - right.availableAt!);
  let index = 0;
  let current: SessionIndicatorPoint | undefined;
  return [...sourceTimes].sort((left, right) => left - right).map((time) => {
    if (time > result.asOfTime) return { time, value: null, bucketStart: null, bucketEnd: null, availableAt: null };
    while (index < points.length && points[index]!.availableAt! <= time) current = points[index++];
    return {
      time,
      value: current?.value ?? null,
      bucketStart: current?.periodStart ?? null,
      bucketEnd: current?.periodEnd ?? null,
      availableAt: current?.availableAt ?? null,
    };
  });
}

export function calculatePreviousSessionLevels(candles: readonly Candle[], options: SessionReferenceOptions): SessionReferenceResult {
  const aggregation = aggregateCandlesByTradingPeriod(candles, options);
  const levels = options.levels ?? ["open", "high", "low", "close"];
  const allowed = new Set<PreviousTimeframeLevel>(["open", "high", "low", "close"]);
  if (levels.length === 0 || levels.some((level) => !allowed.has(level))) throw new RangeError("At least one valid previous session level is required");
  let previous: SessionCandleObservation | undefined;
  const points = aggregation.observations.map((observation) => {
    const output: Partial<Record<PreviousTimeframeLevel, number>> = {};
    if (previous !== undefined) for (const level of levels) output[level] = previous.candle[level];
    const availableAt = previous?.availableAt ?? null;
    if (observation.availableAt !== null) previous = observation;
    return { ...observation, availableAt, levels: output };
  });
  return {
    sourceTimeframe: aggregation.sourceTimeframe,
    targetPeriod: aggregation.targetPeriod,
    calendar: aggregation.calendar,
    asOfTime: aggregation.asOfTime,
    points,
  };
}

export function mapSessionReferenceToSourceTimes(result: SessionReferenceResult, sourceTimes: readonly number[]): readonly MappedSessionReferencePoint[] {
  const points = result.points.filter((point) => point.availableAt !== null && Object.keys(point.levels).length > 0).sort((left, right) => left.availableAt! - right.availableAt!);
  let index = 0;
  let current: SessionReferencePoint | undefined;
  return [...sourceTimes].sort((left, right) => left - right).map((time) => {
    if (time > result.asOfTime) return { time, levels: {}, periodKey: null, periodStart: null, periodEnd: null, availableAt: null };
    while (index < points.length && points[index]!.availableAt! <= time) current = points[index++];
    return {
      time,
      levels: current?.levels ?? {},
      periodKey: current?.periodKey ?? null,
      periodStart: current?.periodStart ?? null,
      periodEnd: current?.periodEnd ?? null,
      availableAt: current?.availableAt ?? null,
    };
  });
}

function normalizePeriod(period: TradingAggregationPeriod): TradingAggregationPeriod {
  if (period !== "session" && period !== "week" && period !== "month") throw new RangeError(`Unsupported trading aggregation period: ${String(period)}`);
  return period;
}

function normalizeAsOf(value: number | undefined): number {
  if (value === undefined) return Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(value)) throw new RangeError("asOfTime must be finite");
  return value;
}

function periodKeyFor(date: string, period: TradingAggregationPeriod, weekStartsOn: number): string {
  if (period === "session") return date;
  if (period === "month") return date.slice(0, 7);
  return addDate(date, -((dayOfDate(date) - weekStartsOn + 7) % 7));
}

function periodDateRange(date: string, period: TradingAggregationPeriod, weekStartsOn: number): { readonly start: string; readonly end: string } {
  if (period === "session") return { start: date, end: addDate(date, 1) };
  if (period === "week") {
    const start = periodKeyFor(date, period, weekStartsOn);
    return { start, end: addDate(start, 7) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const parsed = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const next = new Date(Date.UTC(parsed, month, 1));
  const end = `${String(next.getUTCFullYear()).padStart(4, "0")}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

function dayOfDate(date: string): number {
  const parsed = parseDateParts(date);
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
}

function addDate(date: string, days: number): string {
  const parsed = parseDateParts(date);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return `${String(value.getUTCFullYear()).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function parseDateParts(date: string): { readonly year: number; readonly month: number; readonly day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (match === null) throw new RangeError(`Invalid trading date: ${date}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}
