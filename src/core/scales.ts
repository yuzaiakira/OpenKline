import type {
  Candle,
  ChartDirection,
  PriceScaleConfiguration,
  PriceScaleDiagnostic,
  PriceScaleMode,
  PriceScaleOptions,
  PriceScaleRange,
  PriceScaleState,
} from "../types.js";

export interface PixelRange {
  start: number;
  end: number;
}

export interface TimeAxisTick {
  /** UTC Unix timestamp in milliseconds; labels never rewrite stored time. */
  readonly time: number;
  readonly label: string;
}

export interface TimeAxisTickOptions {
  readonly locale: string;
  readonly timeZone: string;
  /** Approximate CSS pixels reserved per label before renderer measurement. */
  readonly minimumLabelSpacing?: number;
}

type TimeTickUnit = "millisecond" | "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

interface TimeTickInterval {
  readonly unit: TimeTickUnit;
  readonly step: number;
  readonly approximateDuration: number;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const TIME_TICK_INTERVALS: readonly TimeTickInterval[] = [
  { unit: "millisecond", step: 1, approximateDuration: 1 },
  { unit: "millisecond", step: 10, approximateDuration: 10 },
  { unit: "millisecond", step: 100, approximateDuration: 100 },
  { unit: "millisecond", step: 500, approximateDuration: 500 },
  { unit: "second", step: 1, approximateDuration: SECOND },
  { unit: "second", step: 5, approximateDuration: 5 * SECOND },
  { unit: "second", step: 15, approximateDuration: 15 * SECOND },
  { unit: "second", step: 30, approximateDuration: 30 * SECOND },
  { unit: "minute", step: 1, approximateDuration: MINUTE },
  { unit: "minute", step: 5, approximateDuration: 5 * MINUTE },
  { unit: "minute", step: 15, approximateDuration: 15 * MINUTE },
  { unit: "minute", step: 30, approximateDuration: 30 * MINUTE },
  { unit: "hour", step: 1, approximateDuration: HOUR },
  { unit: "hour", step: 2, approximateDuration: 2 * HOUR },
  { unit: "hour", step: 4, approximateDuration: 4 * HOUR },
  { unit: "hour", step: 6, approximateDuration: 6 * HOUR },
  { unit: "hour", step: 12, approximateDuration: 12 * HOUR },
  { unit: "day", step: 1, approximateDuration: DAY },
  { unit: "day", step: 2, approximateDuration: 2 * DAY },
  { unit: "week", step: 1, approximateDuration: WEEK },
  { unit: "week", step: 2, approximateDuration: 2 * WEEK },
  { unit: "month", step: 1, approximateDuration: 30 * DAY },
  { unit: "month", step: 3, approximateDuration: 91 * DAY },
  { unit: "month", step: 6, approximateDuration: 182 * DAY },
  { unit: "year", step: 1, approximateDuration: 365 * DAY },
  { unit: "year", step: 2, approximateDuration: 2 * 365 * DAY },
  { unit: "year", step: 5, approximateDuration: 5 * 365 * DAY },
  { unit: "year", step: 10, approximateDuration: 10 * 365 * DAY },
];

export class TimeScale {
  private readonly timeStart: number;
  private readonly timeEnd: number;
  private readonly pixelStart: number;
  private readonly pixelEnd: number;

  public constructor(times: readonly number[], pixels: PixelRange, private readonly direction: ChartDirection = "ltr") {
    if (times.length === 0) {
      throw new Error("TimeScale requires at least one timestamp");
    }

    validatePixelRange(pixels);
    this.timeStart = times[0] ?? 0;
    this.timeEnd = times[times.length - 1] ?? this.timeStart;
    if (!Number.isFinite(this.timeStart) || !Number.isFinite(this.timeEnd) || this.timeEnd < this.timeStart) {
      throw new Error("TimeScale timestamps must be finite and ascending");
    }
    for (let index = 1; index < times.length; index += 1) {
      const previous = times[index - 1];
      const current = times[index];
      if (previous === undefined || current === undefined || !Number.isFinite(current) || current < previous) {
        throw new Error("TimeScale timestamps must be finite and ascending");
      }
    }
    this.pixelStart = pixels.start;
    this.pixelEnd = pixels.end;
  }

  public xForTime(time: number): number {
    if (this.timeStart === this.timeEnd) {
      return (this.pixelStart + this.pixelEnd) / 2;
    }
    const ratio = (time - this.timeStart) / (this.timeEnd - this.timeStart);
    const visualRatio = this.direction === "rtl" ? 1 - ratio : ratio;
    return this.pixelStart + visualRatio * (this.pixelEnd - this.pixelStart);
  }

  public timeForX(x: number): number {
    if (this.pixelStart === this.pixelEnd) {
      return this.timeStart;
    }
    const visualRatio = (x - this.pixelStart) / (this.pixelEnd - this.pixelStart);
    const ratio = this.direction === "rtl" ? 1 - visualRatio : visualRatio;
    return this.timeStart + ratio * (this.timeEnd - this.timeStart);
  }

  /**
   * Produce deterministic ticks for the actual elapsed UTC range. Labels use
   * `Intl` at display time, so named timezones observe daylight-saving rules
   * without modifying timestamps or assuming a fixed offset.
   */
  public getTicks(options: TimeAxisTickOptions): TimeAxisTick[] {
    const minimumLabelSpacing = options.minimumLabelSpacing ?? 92;
    if (!Number.isFinite(minimumLabelSpacing) || minimumLabelSpacing <= 0) {
      throw new Error("Time axis minimumLabelSpacing must be a positive finite number");
    }
    if (this.timeStart === this.timeEnd) {
      return [{ time: this.timeStart, label: formatTimeTick(this.timeStart, TIME_TICK_INTERVALS[0]!, options) }];
    }
    const availablePixels = this.pixelEnd - this.pixelStart;
    const targetCount = Math.max(2, Math.floor(availablePixels / minimumLabelSpacing) + 1);
    const interval = selectTimeTickInterval((this.timeEnd - this.timeStart) / Math.max(1, targetCount - 1));
    const times = new Set<number>([this.timeStart, this.timeEnd]);
    let cursor = advanceTimeTick(alignTimeTick(this.timeStart, interval), interval);
    let guard = 0;
    while (cursor < this.timeEnd && guard < 10_000) {
      if (cursor > this.timeStart) times.add(cursor);
      cursor = advanceTimeTick(cursor, interval);
      guard += 1;
    }
    return [...times]
      .sort((left, right) => left - right)
      .map((time) => ({ time, label: formatTimeTick(time, interval, options) }));
  }
}

/** Format one UTC timestamp for display without changing its underlying value. */
export function formatTimeTick(time: number, interval: Pick<TimeTickInterval, "unit" | "step">, options: Pick<TimeAxisTickOptions, "locale" | "timeZone">): string {
  const date = new Date(time);
  if (interval.unit === "millisecond") {
    const base = new Intl.DateTimeFormat(options.locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: options.timeZone,
    }).format(date);
    return `${base}.${String(date.getUTCMilliseconds()).padStart(3, "0")}`;
  }
  if (interval.unit === "second" || interval.unit === "minute") {
    return new Intl.DateTimeFormat(options.locale, {
      hour: "numeric",
      minute: "2-digit",
      ...(interval.unit === "second" ? { second: "2-digit" } : {}),
      timeZone: options.timeZone,
    }).format(date);
  }
  if (interval.unit === "hour") {
    return new Intl.DateTimeFormat(options.locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: options.timeZone,
    }).format(date);
  }
  if (interval.unit === "day" || interval.unit === "week") {
    return new Intl.DateTimeFormat(options.locale, {
      month: "short",
      day: "numeric",
      timeZone: options.timeZone,
    }).format(date);
  }
  if (interval.unit === "month") {
    return new Intl.DateTimeFormat(options.locale, {
      month: "short",
      year: "numeric",
      timeZone: options.timeZone,
    }).format(date);
  }
  return new Intl.DateTimeFormat(options.locale, { year: "numeric", timeZone: options.timeZone }).format(date);
}

function selectTimeTickInterval(targetDuration: number): TimeTickInterval {
  return TIME_TICK_INTERVALS.find((interval) => interval.approximateDuration >= targetDuration)
    ?? TIME_TICK_INTERVALS[TIME_TICK_INTERVALS.length - 1]!;
}

function alignTimeTick(time: number, interval: TimeTickInterval): number {
  if (interval.unit === "millisecond") return Math.floor(time / interval.step) * interval.step;
  if (interval.unit === "second") return Math.floor(time / (interval.step * SECOND)) * interval.step * SECOND;
  if (interval.unit === "minute") return Math.floor(time / (interval.step * MINUTE)) * interval.step * MINUTE;
  if (interval.unit === "hour") return Math.floor(time / (interval.step * HOUR)) * interval.step * HOUR;
  const date = new Date(time);
  if (interval.unit === "day") {
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), Math.floor((date.getUTCDate() - 1) / interval.step) * interval.step + 1);
  }
  if (interval.unit === "week") {
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const monday = midnight - mondayOffset * DAY;
    const mondayEpoch = Date.UTC(1970, 0, 5);
    return Math.floor((monday - mondayEpoch) / (interval.step * WEEK)) * interval.step * WEEK + mondayEpoch;
  }
  if (interval.unit === "month") {
    return Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / interval.step) * interval.step, 1);
  }
  return Date.UTC(Math.floor(date.getUTCFullYear() / interval.step) * interval.step, 0, 1);
}

function advanceTimeTick(time: number, interval: TimeTickInterval): number {
  if (interval.unit === "millisecond") return time + interval.step;
  if (interval.unit === "second") return time + interval.step * SECOND;
  if (interval.unit === "minute") return time + interval.step * MINUTE;
  if (interval.unit === "hour") return time + interval.step * HOUR;
  if (interval.unit === "day") return time + interval.step * DAY;
  if (interval.unit === "week") return time + interval.step * WEEK;
  const date = new Date(time);
  if (interval.unit === "month") date.setUTCMonth(date.getUTCMonth() + interval.step);
  else date.setUTCFullYear(date.getUTCFullYear() + interval.step);
  return date.getTime();
}

export class PriceScale {
  private readonly rawPriceMin: number;
  private readonly rawPriceMax: number;
  private readonly transformedPriceMin: number;
  private readonly transformedPriceMax: number;
  private readonly pixelTop: number;
  private readonly pixelBottom: number;
  private readonly configuration: PriceScaleConfiguration;
  private readonly activeTransform: PriceScaleMode;
  private readonly scaleDiagnostic: PriceScaleDiagnostic | undefined;

  /**
   * Maps raw financial prices to pixels. Percentage and indexed modes change
   * labels and geometry only; all inputs and inverse values remain raw prices.
   * The numeric padding argument is retained for the pre-7.0 public API.
   */
  public constructor(min: number, max: number, pixels: PixelRange, options: PriceScaleOptions | PriceScaleConfiguration | number = 0.08) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new Error("PriceScale requires a finite ascending range");
    }

    validatePixelRange(pixels);
    const normalized = normalizePriceScaleOptions(options);
    const range = typeof options === "object" && options !== null && "range" in options && options.range !== undefined
      ? normalizePriceScaleRange(options.range)
      : undefined;
    this.configuration = {
      ...normalized,
      ...(range === undefined ? {} : { range }),
    };
    const resolved = resolveTransform(min, max, this.configuration);
    this.activeTransform = resolved.mode;
    this.scaleDiagnostic = resolved.diagnostic;
    const transformedMin = transformPrice(min, resolved.mode, this.configuration.referencePrice);
    const transformedMax = transformPrice(max, resolved.mode, this.configuration.referencePrice);
    const sourceRange = transformedMax - transformedMin;
    if (sourceRange === 0) {
      // Preserve the historic single-value behavior: padding gives the scale a
      // finite extent even when a dataset contains only one price.
      const padding = Math.max(
        Math.abs(transformedMin) * Math.max(this.configuration.marginTop, this.configuration.marginBottom),
        1,
      );
      this.transformedPriceMin = transformedMin - padding;
      this.transformedPriceMax = transformedMin + padding;
    } else {
      const topPadding = sourceRange * this.configuration.marginTop;
      const bottomPadding = sourceRange * this.configuration.marginBottom;
      this.transformedPriceMin = transformedMin - bottomPadding;
      this.transformedPriceMax = transformedMax + topPadding;
    }
    this.rawPriceMin = inverseTransform(this.transformedPriceMin, resolved.mode, this.configuration.referencePrice);
    this.rawPriceMax = inverseTransform(this.transformedPriceMax, resolved.mode, this.configuration.referencePrice);
    this.pixelTop = pixels.start;
    this.pixelBottom = pixels.end;
  }

  public yForPrice(price: number): number {
    const transformed = transformPrice(price, this.activeTransform, this.configuration.referencePrice);
    const ratio = (transformed - this.transformedPriceMin) / (this.transformedPriceMax - this.transformedPriceMin);
    return this.pixelBottom - ratio * (this.pixelBottom - this.pixelTop);
  }

  public priceForY(y: number): number {
    const ratio = (this.pixelBottom - y) / (this.pixelBottom - this.pixelTop);
    const transformed = this.transformedPriceMin + ratio * (this.transformedPriceMax - this.transformedPriceMin);
    return inverseTransform(transformed, this.activeTransform, this.configuration.referencePrice);
  }

  /** Format the price in the user-selected display mode without losing raw precision. */
  public formatPrice(price: number, precision: number): string {
    const normalizedPrecision = Math.max(0, Math.min(100, Math.floor(precision)));
    if (this.activeTransform === "percentage") {
      return `${transformPrice(price, "percentage", this.configuration.referencePrice).toFixed(normalizedPrecision)}%`;
    }
    if (this.activeTransform === "indexed") {
      return transformPrice(price, "indexed", this.configuration.referencePrice).toFixed(normalizedPrecision);
    }
    return price.toFixed(normalizedPrecision);
  }

  /** Raw padded lower bound. In linear mode this retains the historic `min` value. */
  public get min(): number {
    return this.rawPriceMin;
  }

  /** Raw padded upper bound. In linear mode this retains the historic `max` value. */
  public get max(): number {
    return this.rawPriceMax;
  }

  public get mode(): PriceScaleMode {
    return this.activeTransform;
  }

  public get diagnostic(): PriceScaleDiagnostic | undefined {
    return this.scaleDiagnostic;
  }

  public get state(): PriceScaleState {
    return {
      ...this.configuration,
      activeMode: this.activeTransform,
      ...(this.scaleDiagnostic === undefined ? {} : { diagnostic: this.scaleDiagnostic }),
    };
  }
}

/** Canonicalize public price-scale options at the module boundary. */
export function normalizePriceScaleOptions(options: PriceScaleOptions | PriceScaleConfiguration | number = {}): PriceScaleConfiguration {
  if (typeof options === "number") {
    if (!Number.isFinite(options) || options < 0) {
      throw new Error("PriceScale paddingRatio must be a non-negative finite number");
    }
    return {
      mode: "linear",
      autoScale: true,
      marginTop: options,
      marginBottom: options,
      axisVisible: true,
    };
  }
  const mode = options.mode ?? "linear";
  if (mode !== "linear" && mode !== "logarithmic" && mode !== "percentage" && mode !== "indexed") {
    throw new Error("PriceScale mode is invalid");
  }
  const marginTop = options.marginTop ?? 0.08;
  const marginBottom = options.marginBottom ?? 0.08;
  if (!isMargin(marginTop) || !isMargin(marginBottom)) {
    throw new Error("PriceScale margins must be finite values from zero (inclusive) to one (exclusive)");
  }
  if (options.referencePrice !== undefined && (!Number.isFinite(options.referencePrice) || options.referencePrice <= 0)) {
    throw new Error("PriceScale referencePrice must be a positive finite number");
  }
  return {
    mode,
    autoScale: options.autoScale ?? true,
    ...(options.referencePrice === undefined ? {} : { referencePrice: options.referencePrice }),
    marginTop,
    marginBottom,
    axisVisible: options.axisVisible ?? true,
  };
}

/** Build a stable manual raw range without exposing renderer internals. */
export function normalizePriceScaleRange(range: PriceScaleRange): PriceScaleRange {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.max < range.min) {
    throw new Error("PriceScale range must be finite and ascending");
  }
  return range.min === range.max
    ? { min: range.min - 0.5, max: range.max + 0.5 }
    : { min: range.min, max: range.max };
}

function resolveTransform(min: number, max: number, configuration: PriceScaleConfiguration): { mode: PriceScaleMode; diagnostic?: PriceScaleDiagnostic } {
  if (configuration.mode === "logarithmic" && (min <= 0 || max <= 0)) {
    return {
      mode: "linear",
      diagnostic: {
        code: "LOGARITHMIC_REQUIRES_POSITIVE_VALUES",
        message: "Logarithmic price scaling requires a strictly positive visible range; linear scaling is active.",
      },
    };
  }
  if ((configuration.mode === "percentage" || configuration.mode === "indexed") && configuration.referencePrice === undefined) {
    return {
      mode: "linear",
      diagnostic: {
        code: "REFERENCE_REQUIRES_POSITIVE_VALUE",
        message: "Percentage and indexed price scaling require a positive reference price; linear scaling is active.",
      },
    };
  }
  return { mode: configuration.mode };
}

function transformPrice(price: number, mode: PriceScaleMode, referencePrice: number | undefined): number {
  if (mode === "logarithmic") return Math.log(price);
  if (mode === "percentage") return ((price / (referencePrice ?? 1)) - 1) * 100;
  if (mode === "indexed") return price / (referencePrice ?? 1) * 100;
  return price;
}

function inverseTransform(value: number, mode: PriceScaleMode, referencePrice: number | undefined): number {
  if (mode === "logarithmic") return Math.exp(value);
  if (mode === "percentage") return (value / 100 + 1) * (referencePrice ?? 1);
  if (mode === "indexed") return value / 100 * (referencePrice ?? 1);
  return value;
}

function isMargin(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 1;
}

function validatePixelRange(pixels: PixelRange): void {
  if (!Number.isFinite(pixels.start) || !Number.isFinite(pixels.end) || pixels.end <= pixels.start) {
    throw new Error("Pixel range must be finite and have a positive size");
  }
}

export function getCandlePriceRange(candles: readonly Candle[]): { min: number; max: number } {
  if (candles.length === 0) {
    throw new Error("Cannot calculate a price range without candles");
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    min = Math.min(min, candle.low);
    max = Math.max(max, candle.high);
  }
  return { min, max };
}
