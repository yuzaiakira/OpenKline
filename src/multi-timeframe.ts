import { validateCandle } from "./core/candle-store.js";
import { createDefaultIndicatorRegistry, type IndicatorRegistry } from "./indicators/index.js";
import type { IndicatorOutputKind, IndicatorPoint } from "./indicators/types.js";
import type { Candle, SeriesStyle } from "./types.js";

/** Fixed UTC durations supported by the provider-neutral Phase 10 engine. */
export type FixedTimeframeUnit = "m" | "h" | "D";

export interface FixedTimeframe {
  readonly id: string;
  readonly durationMs: number;
  readonly unit: FixedTimeframeUnit;
  readonly amount: number;
}

/** A calendar may be supplied by an application when a market has explicit expected slots. */
export interface TimeframeCalendar {
  readonly id: string;
  isExpectedSourceTime(time: number): boolean;
}

export type MultiTimeframeCoveragePolicy = "unknown" | "fixed-duration";
export type MultiTimeframeMissingVolumePolicy = "ignore" | "zero" | "unknown";
export type MultiTimeframeFinalityPolicy = "time-closed" | "complete-only";
export type MultiTimeframeBucketStatus = "forming" | "closed-complete" | "closed-partial" | "closed-uncertain";
export type MultiTimeframeCoverage = "complete" | "partial" | "unknown";

export interface MultiTimeframeAggregationOptions {
  readonly sourceTimeframe: string;
  readonly targetTimeframe: string;
  readonly coveragePolicy?: MultiTimeframeCoveragePolicy;
  readonly missingVolumePolicy?: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy?: MultiTimeframeFinalityPolicy;
  /** Source-time availability frontier. Omit to evaluate a historical snapshot. */
  readonly asOfTime?: number;
  /** Required for session-aware completeness; no session is guessed when omitted. */
  readonly calendar?: TimeframeCalendar;
}

export interface MultiTimeframeAggregationMetadata {
  readonly bucketStart: number;
  readonly bucketEnd: number;
  readonly availableAt: number | null;
  readonly status: MultiTimeframeBucketStatus;
  readonly coverage: MultiTimeframeCoverage;
  readonly sourceCount: number;
  readonly expectedSourceCount: number | null;
  readonly missingSourceCount: number | null;
  readonly sourceTimes: readonly number[];
}

export interface MultiTimeframeCandleObservation extends MultiTimeframeAggregationMetadata {
  readonly candle: Candle;
}

export interface MultiTimeframeAggregationResult {
  readonly sourceTimeframe: FixedTimeframe;
  readonly targetTimeframe: FixedTimeframe;
  readonly coveragePolicy: MultiTimeframeCoveragePolicy;
  readonly missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly asOfTime: number;
  readonly observations: readonly MultiTimeframeCandleObservation[];
}

export interface CausalTimeframeAggregatorOptions extends MultiTimeframeAggregationOptions {}

export interface MultiTimeframeIndicatorOptions extends MultiTimeframeAggregationOptions {
  readonly id?: string;
  readonly indicatorId: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly pane?: string | "new";
  readonly outputStyles?: Readonly<Record<string, SeriesStyle>>;
  readonly visible?: boolean;
}

export interface MultiTimeframeIndicatorApi {
  readonly id: string;
  readonly indicatorId: string;
  readonly paneId: string;
  getOptions(): MultiTimeframeIndicatorOptions & { readonly id: string };
  getResult(): MultiTimeframeIndicatorResult;
  setParameters(parameters: Readonly<Record<string, unknown>>): void;
  setOutputStyle(outputId: string, style: SeriesStyle): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface MultiTimeframeIndicatorPoint extends IndicatorPoint, MultiTimeframeAggregationMetadata {
  readonly time: number;
}

export interface MultiTimeframeIndicatorOutput {
  readonly id: string;
  readonly title: string;
  readonly kind: IndicatorOutputKind;
  readonly bandRole?: "upper" | "lower";
  readonly points: readonly MultiTimeframeIndicatorPoint[];
}

export interface MultiTimeframeIndicatorResult {
  readonly indicatorId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly sourceTimeframe: FixedTimeframe;
  readonly targetTimeframe: FixedTimeframe;
  readonly asOfTime: number;
  readonly coveragePolicy: MultiTimeframeCoveragePolicy;
  readonly finalityPolicy: MultiTimeframeFinalityPolicy;
  readonly outputs: readonly MultiTimeframeIndicatorOutput[];
  readonly observations: readonly MultiTimeframeCandleObservation[];
}

export interface MappedMultiTimeframePoint {
  readonly time: number;
  readonly value: number | null;
  readonly bucketStart: number | null;
  readonly bucketEnd: number | null;
  readonly availableAt: number | null;
}

export type PreviousTimeframeLevel = "open" | "high" | "low" | "close";

export interface MultiTimeframeReferenceOptions extends MultiTimeframeAggregationOptions {
  readonly id?: string;
  readonly levels?: readonly PreviousTimeframeLevel[];
  readonly visible?: boolean;
  readonly labels?: boolean;
  readonly labelPrefix?: string;
  readonly style?: MultiTimeframeReferenceStyle;
}

export interface MultiTimeframeReferenceStyle {
  readonly color?: string;
  readonly lineWidth?: number;
  readonly lineStyle?: "solid" | "dashed" | "dotted";
  readonly alpha?: number;
}

export interface MultiTimeframeReferenceApi {
  readonly id: string;
  getOptions(): MultiTimeframeReferenceOptions & { readonly id: string };
  getResult(): MultiTimeframeReferenceResult;
  setOptions(patch: Partial<Omit<MultiTimeframeReferenceOptions, "id" | "calendar">>): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface MultiTimeframeReferencePoint extends MultiTimeframeAggregationMetadata {
  readonly levels: Readonly<Partial<Record<PreviousTimeframeLevel, number>>>;
}

export interface MultiTimeframeReferenceResult {
  readonly sourceTimeframe: FixedTimeframe;
  readonly targetTimeframe: FixedTimeframe;
  readonly asOfTime: number;
  readonly points: readonly MultiTimeframeReferencePoint[];
}

export interface MappedMultiTimeframeReferencePoint {
  readonly time: number;
  readonly levels: Readonly<Partial<Record<PreviousTimeframeLevel, number>>>;
  readonly bucketStart: number | null;
  readonly bucketEnd: number | null;
  readonly availableAt: number | null;
}

/** Parse a fixed-duration UTC timeframe. Session, weekly, and monthly modes are intentionally rejected. */
export function parseFixedTimeframe(value: string): FixedTimeframe {
  if (typeof value !== "string") throw new TypeError("Timeframe must be a string");
  const match = /^(\d+)(m|h|D)$/.exec(value.trim());
  if (match === null) throw new RangeError(`Unsupported fixed timeframe: ${value}; use a positive duration such as 5m, 1h, or 1D`);
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) throw new RangeError(`Invalid timeframe amount: ${value}`);
  const unit = match[2] as FixedTimeframeUnit;
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  const durationMs = amount * multiplier;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new RangeError(`Timeframe duration is too large: ${value}`);
  return { id: `${amount}${unit}`, durationMs, unit, amount };
}

export function validateTimeframePair(sourceTimeframe: string, targetTimeframe: string): { readonly source: FixedTimeframe; readonly target: FixedTimeframe; readonly ratio: number } {
  const source = parseFixedTimeframe(sourceTimeframe);
  const target = parseFixedTimeframe(targetTimeframe);
  if (target.durationMs <= source.durationMs) throw new RangeError("Target timeframe must be larger than source timeframe");
  if (target.durationMs % source.durationMs !== 0) throw new RangeError("Target timeframe must be an integer multiple of source timeframe");
  return { source, target, ratio: target.durationMs / source.durationMs };
}

export function aggregateCandlesByTimeframe(candles: readonly Candle[], options: MultiTimeframeAggregationOptions): MultiTimeframeAggregationResult {
  const aggregator = new CausalTimeframeAggregator(options);
  aggregator.setData(candles);
  return aggregator.getResult(options.asOfTime);
}

/** Incrementally aggregates source bars while preserving correction and out-of-order semantics. */
export class CausalTimeframeAggregator {
  private readonly source: FixedTimeframe;
  private readonly target: FixedTimeframe;
  private coveragePolicy: MultiTimeframeCoveragePolicy;
  private missingVolumePolicy: MultiTimeframeMissingVolumePolicy;
  private finalityPolicy: MultiTimeframeFinalityPolicy;
  private calendar: TimeframeCalendar | undefined;
  private asOfTime: number;
  private readonly candles = new Map<number, Candle>();
  private readonly buckets = new Map<number, Map<number, Candle>>();
  private disposed = false;

  public constructor(options: CausalTimeframeAggregatorOptions) {
    const pair = validateTimeframePair(options.sourceTimeframe, options.targetTimeframe);
    this.source = pair.source;
    this.target = pair.target;
    this.coveragePolicy = options.coveragePolicy ?? "unknown";
    this.missingVolumePolicy = options.missingVolumePolicy ?? "ignore";
    this.finalityPolicy = options.finalityPolicy ?? "time-closed";
    this.calendar = options.calendar;
    this.asOfTime = normalizeAsOf(options.asOfTime);
  }

  public setData(candles: readonly Candle[]): void {
    this.assertAlive();
    this.candles.clear();
    this.buckets.clear();
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

  public setOptions(options: Pick<MultiTimeframeAggregationOptions, "coveragePolicy" | "missingVolumePolicy" | "finalityPolicy" | "calendar">): void {
    this.assertAlive();
    this.coveragePolicy = options.coveragePolicy ?? this.coveragePolicy;
    this.missingVolumePolicy = options.missingVolumePolicy ?? this.missingVolumePolicy;
    this.finalityPolicy = options.finalityPolicy ?? this.finalityPolicy;
    this.calendar = options.calendar;
  }

  public getResult(asOfTime: number | undefined = this.asOfTime): MultiTimeframeAggregationResult {
    this.assertAlive();
    const frontier = normalizeAsOf(asOfTime);
    const observations: MultiTimeframeCandleObservation[] = [];
    for (const bucketStart of [...this.buckets.keys()].sort((left, right) => left - right)) {
      const observation = this.buildObservation(bucketStart, frontier);
      if (observation !== undefined) observations.push(observation);
    }
    return {
      sourceTimeframe: { ...this.source },
      targetTimeframe: { ...this.target },
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
    this.buckets.clear();
  }

  private setSourceCandle(candle: Candle, index: number): void {
    validateCandle(candle, index);
    const previous = this.candles.get(candle.time);
    if (previous !== undefined) this.buckets.get(bucketStartFor(candle.time, this.target.durationMs))?.delete(candle.time);
    const copy = { ...candle };
    this.candles.set(candle.time, copy);
    const bucketStart = bucketStartFor(candle.time, this.target.durationMs);
    const bucket = this.buckets.get(bucketStart) ?? new Map<number, Candle>();
    bucket.set(candle.time, copy);
    this.buckets.set(bucketStart, bucket);
  }

  private buildObservation(bucketStart: number, asOfTime: number): MultiTimeframeCandleObservation | undefined {
    const bucketEnd = bucketStart + this.target.durationMs;
    const bucket = this.buckets.get(bucketStart) ?? new Map<number, Candle>();
    // A source candle is not final at its opening timestamp. Without provider
    // finality metadata, its OHLCV becomes eligible only after the source
    // interval has ended. Keeping the full bucket in `this.buckets` lets the
    // caller seek forward again; filtering here prevents historical snapshots
    // from disclosing future values or metadata.
    const sourceTimes = [...bucket.keys()]
      .filter((time) => isSourceCandleEligible(time, this.source.durationMs, asOfTime))
      .sort((left, right) => left - right);
    if (sourceTimes.length === 0) return undefined;
    const sourceCandles = sourceTimes.map((time) => bucket.get(time)!).filter((candle): candle is Candle => candle !== undefined);
    const coverage = this.resolveCoverage(bucketStart, sourceTimes);
    const expectedSourceCount = coverage.expected;
    const missingSourceCount = expectedSourceCount === null ? null : Math.max(0, expectedSourceCount - sourceTimes.length);
    const closed = asOfTime >= bucketEnd;
    const complete = coverage.kind === "complete" && missingSourceCount === 0;
    const status: MultiTimeframeBucketStatus = !closed
      ? "forming"
      : complete
        ? "closed-complete"
        : coverage.kind === "partial"
          ? "closed-partial"
          : "closed-uncertain";
    const eligible = closed && (this.finalityPolicy === "time-closed" || status === "closed-complete");
    const candle = aggregateBucket(sourceCandles, this.missingVolumePolicy, bucketStart);
    return {
      bucketStart,
      bucketEnd,
      availableAt: eligible ? bucketEnd : null,
      status,
      coverage: coverage.kind,
      sourceCount: sourceTimes.length,
      expectedSourceCount,
      missingSourceCount,
      sourceTimes,
      candle,
    };
  }

  private resolveCoverage(bucketStart: number, sourceTimes: readonly number[]): { readonly kind: MultiTimeframeCoverage; readonly expected: number | null } {
    if (this.coveragePolicy === "unknown" && this.calendar === undefined) return { kind: "unknown", expected: null };
    const expectedTimes: number[] = [];
    for (let time = bucketStart; time < bucketStart + this.target.durationMs; time += this.source.durationMs) {
      if (this.calendar === undefined || this.calendar.isExpectedSourceTime(time)) expectedTimes.push(time);
    }
    const present = new Set(sourceTimes);
    const complete = expectedTimes.length > 0 && expectedTimes.every((time) => present.has(time)) && sourceTimes.every((time) => expectedTimes.includes(time));
    return { kind: complete ? "complete" : "partial", expected: expectedTimes.length };
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Multi-timeframe aggregator has been disposed");
  }
}

export function calculateMultiTimeframeIndicator(candles: readonly Candle[], options: MultiTimeframeIndicatorOptions, registry: IndicatorRegistry = createDefaultIndicatorRegistry()): MultiTimeframeIndicatorResult {
  const aggregator = new CausalTimeframeAggregator(options);
  aggregator.setData(candles);
  const aggregation = aggregator.getResult(options.asOfTime);
  const eligible = aggregation.observations.filter((observation) => observation.availableAt !== null);
  const instance = registry.create(options.indicatorId, options.parameters ?? {});
  try {
    instance.setInput(eligible.map((observation) => observation.candle));
    const result = instance.getResult();
    const metadataByTime = new Map(eligible.map((observation) => [observation.bucketStart, observation]));
    return {
      indicatorId: result.indicatorId,
      parameters: { ...result.parameters },
      sourceTimeframe: aggregation.sourceTimeframe,
      targetTimeframe: aggregation.targetTimeframe,
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
          const observation = metadataByTime.get(point.time);
          return observation === undefined ? [] : [{ ...point, ...observation }];
        }),
      })),
    };
  } finally {
    instance.dispose();
    aggregator.dispose();
  }
}

export function mapMultiTimeframeIndicatorToSourceTimes(result: MultiTimeframeIndicatorResult, sourceTimes: readonly number[], outputId: string): MappedMultiTimeframePoint[] {
  const output = result.outputs.find((candidate) => candidate.id === outputId);
  if (output === undefined) throw new Error(`Unknown multi-timeframe indicator output: ${outputId}`);
  const points = [...output.points].filter((point) => point.availableAt !== null).sort((left, right) => left.availableAt! - right.availableAt!);
  let index = 0;
  let current: MultiTimeframeIndicatorPoint | undefined;
  return [...sourceTimes].sort((left, right) => left - right).map((time) => {
    if (time > result.asOfTime) {
      return { time, value: null, bucketStart: null, bucketEnd: null, availableAt: null };
    }
    while (index < points.length && points[index]!.availableAt! <= time) current = points[index++];
    return {
      time,
      value: current?.value ?? null,
      bucketStart: current?.bucketStart ?? null,
      bucketEnd: current?.bucketEnd ?? null,
      availableAt: current?.availableAt ?? null,
    };
  });
}

export function calculatePreviousTimeframeLevels(candles: readonly Candle[], options: MultiTimeframeAggregationOptions & { readonly levels?: readonly PreviousTimeframeLevel[] }): MultiTimeframeReferenceResult {
  const aggregation = aggregateCandlesByTimeframe(candles, options);
  const levels = options.levels ?? ["open", "high", "low", "close"];
  const allowed = new Set<PreviousTimeframeLevel>(["open", "high", "low", "close"]);
  if (levels.length === 0 || levels.some((level) => !allowed.has(level))) throw new RangeError("At least one valid previous timeframe level is required");
  let previous: MultiTimeframeCandleObservation | undefined;
  const points = aggregation.observations.map((observation) => {
    const currentPrevious = previous;
    const outputLevels: Partial<Record<PreviousTimeframeLevel, number>> = {};
    if (currentPrevious !== undefined) for (const level of levels) outputLevels[level] = currentPrevious.candle[level];
    if (observation.availableAt !== null) previous = observation;
    // Previous-period values become knowable when the previous bucket closes,
    // which is the availability frontier for the current bucket's reference.
    return { ...observation, availableAt: currentPrevious?.availableAt ?? null, levels: outputLevels };
  });
  return { sourceTimeframe: aggregation.sourceTimeframe, targetTimeframe: aggregation.targetTimeframe, asOfTime: aggregation.asOfTime, points };
}

export function mapMultiTimeframeReferenceToSourceTimes(result: MultiTimeframeReferenceResult, sourceTimes: readonly number[]): MappedMultiTimeframeReferencePoint[] {
  const points = result.points.filter((point) => point.availableAt !== null && Object.keys(point.levels).length > 0).sort((left, right) => left.availableAt! - right.availableAt!);
  let index = 0;
  let current: MultiTimeframeReferencePoint | undefined;
  return [...sourceTimes].sort((left, right) => left - right).map((time) => {
    if (time > result.asOfTime) {
      return { time, levels: {}, bucketStart: null, bucketEnd: null, availableAt: null };
    }
    while (index < points.length && points[index]!.availableAt! <= time) current = points[index++];
    return {
      time,
      levels: current?.levels ?? {},
      bucketStart: current?.bucketStart ?? null,
      bucketEnd: current?.bucketEnd ?? null,
      availableAt: current?.availableAt ?? null,
    };
  });
}

/** Shared OHLCV reducer used by fixed-duration and session-aware aggregation. */
export function aggregateCandleValues(candles: readonly Candle[], missingVolumePolicy: MultiTimeframeMissingVolumePolicy, bucketStart: number): Candle {
  const first = candles[0];
  if (first === undefined) return { time: bucketStart, open: Number.NaN, high: Number.NaN, low: Number.NaN, close: Number.NaN };
  const volumeValues = candles.map((candle) => candle.volume);
  const hasMissingVolume = volumeValues.some((volume) => volume === undefined);
  const allVolumeMissing = volumeValues.every((volume) => volume === undefined);
  let volume: number | undefined;
  if (!allVolumeMissing && !(missingVolumePolicy === "unknown" && hasMissingVolume)) {
    volume = volumeValues.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  }
  return {
    time: bucketStart,
    open: first.open,
    high: Math.max(...candles.map((candle) => candle.high)),
    low: Math.min(...candles.map((candle) => candle.low)),
    close: candles.at(-1)!.close,
    ...(volume === undefined ? {} : { volume }),
  };
}

const aggregateBucket = aggregateCandleValues;

function bucketStartFor(time: number, durationMs: number): number {
  return Math.floor(time / durationMs) * durationMs;
}

function isSourceCandleEligible(time: number, sourceDurationMs: number, asOfTime: number): boolean {
  return time + sourceDurationMs <= asOfTime;
}

function normalizeAsOf(value: number | undefined): number {
  if (value === undefined) return Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(value)) throw new RangeError("asOfTime must be finite");
  return value;
}
