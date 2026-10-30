import { validateCandle } from "./core/candle-store.js";
import type { Candle, ChartIndicatorApi, SeriesStyle } from "./types.js";

/** Price source used by Anchored VWAP. */
export type AnchoredVwapPriceSource = "typical" | "close";

/** A single causal Anchored VWAP observation. */
export interface AnchoredVwapPoint {
  readonly time: number;
  /** Null means that no positive eligible volume has been observed yet. */
  readonly value: number | null;
  readonly cumulativeVolume: number;
}

export interface AnchoredVwapOptions {
  readonly anchorTime: number;
  readonly priceSource?: AnchoredVwapPriceSource;
}

export interface AnchoredVwapChartOptions extends AnchoredVwapOptions {
  readonly id?: string;
  readonly style?: SeriesStyle;
}

export interface AnchoredVwapApi extends ChartIndicatorApi {
  getOptions(): { readonly anchorTime: number; readonly priceSource: AnchoredVwapPriceSource };
  setAnchor(time: number): void;
  setPriceSource(source: AnchoredVwapPriceSource): void;
  /** Start a pointer/touch placement that snaps to a visible candle timestamp. */
  startPlacement(): void;
}

export interface AnchoredVwapResult {
  readonly anchorTime: number;
  readonly priceSource: AnchoredVwapPriceSource;
  readonly points: readonly AnchoredVwapPoint[];
  readonly totalEligibleVolume: number;
  readonly eligibleCandleCount: number;
  readonly volumeCandleCount: number;
  readonly firstEligibleTime: number | null;
  readonly lastEligibleTime: number | null;
  readonly currentValue: number | null;
}

export type VolumeProfileAllocationMethod = "close" | "range-uniform";
export type VolumeProfileMode = "fixed" | "visible";
export type VolumeProfilePosition = "left" | "right";

export interface VolumeProfilePriceBounds {
  readonly min: number;
  readonly max: number;
}

export interface VolumeProfileCalculationOptions {
  /** Inclusive lower and exclusive upper UTC millisecond boundaries. */
  readonly from: number;
  readonly to: number;
  readonly binCount?: number;
  readonly allocation?: VolumeProfileAllocationMethod;
  readonly valueAreaPercentage?: number;
  readonly priceBounds?: VolumeProfilePriceBounds;
}

export interface VolumeProfileDisplayOptions {
  readonly position?: VolumeProfilePosition;
  readonly width?: number;
  readonly opacity?: number;
  readonly color?: string;
  readonly valueAreaColor?: string;
  readonly pocColor?: string;
  readonly showPoc?: boolean;
  readonly showValueArea?: boolean;
  readonly showLabels?: boolean;
  readonly visible?: boolean;
}

export interface VolumeProfileOptions extends VolumeProfileDisplayOptions {
  readonly id?: string;
  readonly mode?: VolumeProfileMode;
  readonly range?: { readonly from: number; readonly to: number };
  readonly binCount?: number;
  readonly allocation?: VolumeProfileAllocationMethod;
  readonly valueAreaPercentage?: number;
}

export interface ResolvedVolumeProfileOptions {
  readonly id: string;
  readonly mode: VolumeProfileMode;
  readonly range?: { readonly from: number; readonly to: number };
  readonly binCount: number;
  readonly allocation: VolumeProfileAllocationMethod;
  readonly valueAreaPercentage: number;
  readonly position: VolumeProfilePosition;
  readonly width: number;
  readonly opacity: number;
  readonly color: string;
  readonly valueAreaColor: string;
  readonly pocColor: string;
  readonly showPoc: boolean;
  readonly showValueArea: boolean;
  readonly showLabels: boolean;
  readonly visible: boolean;
}

export type VolumeProfileOptionsPatch = Partial<Omit<VolumeProfileOptions, "id">>;

export interface VolumeProfileApi {
  readonly id: string;
  getOptions(): ResolvedVolumeProfileOptions;
  getResult(): EstimatedVolumeProfileResult;
  setOptions(options: VolumeProfileOptionsPatch): void;
  setMode(mode: VolumeProfileMode, range?: { readonly from: number; readonly to: number }): void;
  setRange(range: { readonly from: number; readonly to: number }): void;
  setVisible(visible: boolean): void;
  remove(): void;
}

export interface VolumeProfileBin {
  readonly index: number;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly center: number;
  readonly estimatedVolume: number;
}

export type VolumeProfileStatus = "ready" | "empty";

export interface EstimatedVolumeProfileResult {
  readonly status: VolumeProfileStatus;
  readonly from: number;
  readonly to: number;
  readonly allocation: VolumeProfileAllocationMethod;
  readonly valueAreaPercentage: number;
  readonly bins: readonly VolumeProfileBin[];
  readonly totalEligibleVolume: number;
  readonly eligibleCandleCount: number;
  readonly volumeCandleCount: number;
  readonly priceBounds: VolumeProfilePriceBounds | null;
  readonly pointOfControl: {
    readonly index: number;
    readonly price: number;
    readonly estimatedVolume: number;
  } | null;
  readonly valueArea: {
    readonly lowIndex: number;
    readonly highIndex: number;
    readonly low: number;
    readonly high: number;
    readonly volume: number;
    readonly percentageAchieved: number;
  } | null;
}

export class VolumeAnalyticsValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "VolumeAnalyticsValidationError";
  }
}

const DEFAULT_PROFILE_BIN_COUNT = 24;
const DEFAULT_VALUE_AREA_PERCENTAGE = 0.7;

/**
 * Calculate a causal Anchored VWAP from candle OHLCV data.
 *
 * Input corrections are normalized by timestamp with the last observation
 * winning. Missing and zero volume are retained as observations but do not
 * contribute to the denominator or numerator.
 */
export function calculateAnchoredVwap(
  candles: readonly Candle[],
  options: AnchoredVwapOptions,
): AnchoredVwapResult {
  const anchorTime = validateTimestamp(options.anchorTime, "anchorTime");
  const priceSource = options.priceSource ?? "typical";
  if (priceSource !== "typical" && priceSource !== "close") {
    throw new VolumeAnalyticsValidationError(`Unsupported Anchored VWAP price source: ${String(priceSource)}`);
  }
  const normalized = normalizeCandles(candles);
  const points: AnchoredVwapPoint[] = [];
  let totalEligibleVolume = 0;
  let weightedAverage: number | null = null;
  let eligibleCandleCount = 0;
  let volumeCandleCount = 0;
  let firstEligibleTime: number | null = null;
  let lastEligibleTime: number | null = null;

  for (const candle of normalized) {
    if (candle.time < anchorTime) continue;
    eligibleCandleCount += 1;
    firstEligibleTime ??= candle.time;
    lastEligibleTime = candle.time;
    const volume = positiveFiniteVolume(candle.volume);
    if (volume > 0) {
      const price = priceSource === "close" ? candle.close : typicalPrice(candle);
      weightedAverage = weightedAverage === null
        ? price
        : weightedAverageOf(weightedAverage, totalEligibleVolume, price, volume);
      totalEligibleVolume = safeAdd(totalEligibleVolume, volume);
      volumeCandleCount += 1;
    }
    points.push({ time: candle.time, value: weightedAverage, cumulativeVolume: totalEligibleVolume });
  }

  return {
    anchorTime,
    priceSource,
    points,
    totalEligibleVolume,
    eligibleCandleCount,
    volumeCandleCount,
    firstEligibleTime,
    lastEligibleTime,
    currentValue: weightedAverage,
  };
}

/**
 * Calculate an OHLCV-derived estimated volume-at-price profile.
 *
 * The result is an approximation. It does not represent exchange-reported
 * tick volume, bid/ask volume, delta, or order-book liquidity.
 */
export function calculateEstimatedVolumeProfile(
  candles: readonly Candle[],
  options: VolumeProfileCalculationOptions,
): EstimatedVolumeProfileResult {
  const from = validateTimestamp(options.from, "from");
  const to = validateTimestamp(options.to, "to");
  if (to <= from) throw new VolumeAnalyticsValidationError("Volume Profile range must satisfy from < to");
  const binCount = validateBinCount(options.binCount ?? DEFAULT_PROFILE_BIN_COUNT);
  const allocation = options.allocation ?? "close";
  if (allocation !== "close" && allocation !== "range-uniform") {
    throw new VolumeAnalyticsValidationError(`Unsupported volume allocation method: ${String(allocation)}`);
  }
  const valueAreaPercentage = validateValueAreaPercentage(options.valueAreaPercentage ?? DEFAULT_VALUE_AREA_PERCENTAGE);
  const normalized = normalizeCandles(candles);
  const eligible = normalized.filter((candle) => candle.time >= from && candle.time < to);
  const priceBounds = resolvePriceBounds(eligible, options.priceBounds);
  if (priceBounds === null) {
    return emptyProfile(from, to, allocation, valueAreaPercentage);
  }

  const volumes = Array.from({ length: binCount }, () => 0);
  let totalEligibleVolume = 0;
  let volumeCandleCount = 0;
  const min = priceBounds.min;
  const max = priceBounds.max;
  const scaledRange = scaledRangeFor(min, max);

  for (const candle of eligible) {
    const volume = positiveFiniteVolume(candle.volume);
    if (volume <= 0) continue;
    volumeCandleCount += 1;
    totalEligibleVolume = safeAdd(totalEligibleVolume, volume);
    if (allocation === "close" || candle.high === candle.low || min === max) {
      const index = binIndex(normalizedFraction(candle.close, min, max, scaledRange), binCount);
      volumes[index] = safeAdd(volumes[index] ?? 0, volume);
      continue;
    }

    const lowFraction = clamp01(normalizedFraction(candle.low, min, max, scaledRange));
    const highFraction = clamp01(normalizedFraction(candle.high, min, max, scaledRange));
    const lower = Math.min(lowFraction, highFraction);
    const upper = Math.max(lowFraction, highFraction);
    const span = upper - lower;
    if (!(span > 0)) {
      const index = binIndex(lower, binCount);
      volumes[index] = safeAdd(volumes[index] ?? 0, volume);
      continue;
    }
    let allocated = 0;
    for (let index = 0; index < binCount; index += 1) {
      const binLower = index / binCount;
      const binUpper = (index + 1) / binCount;
      const overlap = Math.max(0, Math.min(upper, binUpper) - Math.max(lower, binLower));
      if (overlap <= 0) continue;
      const share = index === binCount - 1 && overlap >= 0 ? volume - allocated : volume * (overlap / span);
      const safeShare = Math.max(0, Number.isFinite(share) ? share : 0);
      volumes[index] = safeAdd(volumes[index] ?? 0, safeShare);
      allocated = safeAdd(allocated, safeShare);
    }
    if (allocated === 0) {
      const index = binIndex(lower, binCount);
      volumes[index] = safeAdd(volumes[index] ?? 0, volume);
    }
  }

  const bins = createBins(priceBounds, volumes);
  const pointOfControl = findPointOfControl(bins);
  const valueArea = pointOfControl === null
    ? null
    : expandValueArea(bins, pointOfControl.index, totalEligibleVolume, valueAreaPercentage);
  return {
    status: volumeCandleCount > 0 && totalEligibleVolume > 0 ? "ready" : "empty",
    from,
    to,
    allocation,
    valueAreaPercentage,
    bins,
    totalEligibleVolume,
    eligibleCandleCount: eligible.length,
    volumeCandleCount,
    priceBounds: { ...priceBounds },
    pointOfControl,
    valueArea,
  };
}

/** Resolve display defaults and validate a profile configuration. */
export function resolveVolumeProfileOptions(options: VolumeProfileOptions, fallbackId = "volume-profile-1"): ResolvedVolumeProfileOptions {
  const id = options.id ?? fallbackId;
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(id)) throw new VolumeAnalyticsValidationError(`Invalid volume profile id: ${id}`);
  const mode = options.mode ?? "visible";
  if (mode !== "fixed" && mode !== "visible") throw new VolumeAnalyticsValidationError(`Unsupported volume profile mode: ${String(mode)}`);
  const range = options.range === undefined ? undefined : {
    from: validateTimestamp(options.range.from, "profile range.from"),
    to: validateTimestamp(options.range.to, "profile range.to"),
  };
  if (mode === "fixed" && (range === undefined || range.to <= range.from)) {
    throw new VolumeAnalyticsValidationError("Fixed Volume Profile mode requires a non-empty range");
  }
  return {
    id,
    mode,
    ...(range === undefined ? {} : { range }),
    binCount: validateBinCount(options.binCount ?? DEFAULT_PROFILE_BIN_COUNT),
    allocation: options.allocation ?? "close",
    valueAreaPercentage: validateValueAreaPercentage(options.valueAreaPercentage ?? DEFAULT_VALUE_AREA_PERCENTAGE),
    position: options.position ?? "right",
    width: validatePositive(options.width ?? 0.24, "profile width"),
    opacity: validateFraction(options.opacity ?? 0.45, "profile opacity"),
    color: options.color ?? "#60a5fa",
    valueAreaColor: options.valueAreaColor ?? "#34d399",
    pocColor: options.pocColor ?? "#f59e0b",
    showPoc: options.showPoc ?? true,
    showValueArea: options.showValueArea ?? true,
    showLabels: options.showLabels ?? true,
    visible: options.visible ?? true,
  };
}

/** Stateful wrapper that invalidates safely on append, correction, and disposal. */
export class AnchoredVwapCalculator {
  private candles: Candle[] = [];
  private options: AnchoredVwapOptions;
  private disposed = false;

  public constructor(options: AnchoredVwapOptions) {
    this.options = normalizeAnchoredVwapOptions(options);
  }

  public setData(candles: readonly Candle[]): void {
    this.assertAlive();
    this.candles = normalizeCandles(candles);
  }

  public update(candle: Candle): void {
    this.assertAlive();
    validateCandle(candle);
    const index = lowerBound(this.candles, candle.time);
    if (this.candles[index]?.time === candle.time) this.candles[index] = { ...candle };
    else this.candles.splice(index, 0, { ...candle });
  }

  public setOptions(options: AnchoredVwapOptions): void {
    this.assertAlive();
    this.options = normalizeAnchoredVwapOptions(options);
  }

  public getOptions(): AnchoredVwapOptions {
    this.assertAlive();
    return { ...this.options };
  }

  public getResult(): AnchoredVwapResult {
    this.assertAlive();
    return calculateAnchoredVwap(this.candles, this.options);
  }

  public dispose(): void {
    this.disposed = true;
    this.candles = [];
  }

  private assertAlive(): void {
    if (this.disposed) throw new VolumeAnalyticsValidationError("Anchored VWAP calculator has been disposed");
  }
}

function normalizeAnchoredVwapOptions(options: AnchoredVwapOptions): AnchoredVwapOptions {
  return { anchorTime: validateTimestamp(options.anchorTime, "anchorTime"), priceSource: options.priceSource ?? "typical" };
}

function normalizeCandles(candles: readonly Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  candles.forEach((candle, index) => {
    validateCandle(candle, index);
    byTime.set(candle.time, { ...candle });
  });
  return [...byTime.values()].sort((left, right) => left.time - right.time);
}

function validateTimestamp(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || !Number.isSafeInteger(value)) {
    throw new VolumeAnalyticsValidationError(`${name} must be a non-negative safe integer timestamp`);
  }
  return value;
}

function validateBinCount(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) {
    throw new VolumeAnalyticsValidationError("binCount must be an integer between 1 and 10000");
  }
  return value;
}

function validateValueAreaPercentage(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new VolumeAnalyticsValidationError("valueAreaPercentage must be greater than 0 and at most 1");
  }
  return value;
}

function validatePositive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new VolumeAnalyticsValidationError(`${name} must be positive`);
  return value;
}

function validateFraction(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new VolumeAnalyticsValidationError(`${name} must be between 0 and 1`);
  return value;
}

function positiveFiniteVolume(volume: number | undefined): number {
  return volume !== undefined && Number.isFinite(volume) && volume > 0 ? volume : 0;
}

function typicalPrice(candle: Candle): number {
  return (candle.high + candle.low + candle.close) / 3;
}

function weightedAverageOf(oldAverage: number, oldVolume: number, nextPrice: number, nextVolume: number): number {
  const scale = Math.max(oldVolume, nextVolume, 1);
  const oldWeight = oldVolume / scale;
  const nextWeight = nextVolume / scale;
  const denominator = oldWeight + nextWeight;
  if (!(denominator > 0) || !Number.isFinite(denominator)) return nextPrice;
  const average = oldAverage * (oldWeight / denominator) + nextPrice * (nextWeight / denominator);
  return Number.isFinite(average) ? average : nextPrice;
}

function safeAdd(left: number, right: number): number {
  const sum = left + right;
  return Number.isFinite(sum) ? sum : Number.MAX_VALUE;
}

function resolvePriceBounds(candles: readonly Candle[], explicit: VolumeProfilePriceBounds | undefined): VolumeProfilePriceBounds | null {
  if (explicit !== undefined) {
    if (!Number.isFinite(explicit.min) || !Number.isFinite(explicit.max) || explicit.max < explicit.min) {
      throw new VolumeAnalyticsValidationError("priceBounds must contain finite min <= max values");
    }
    return { min: explicit.min, max: explicit.max };
  }
  if (candles.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const candle of candles) {
    min = Math.min(min, candle.low);
    max = Math.max(max, candle.high);
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

function emptyProfile(from: number, to: number, allocation: VolumeProfileAllocationMethod, valueAreaPercentage: number): EstimatedVolumeProfileResult {
  return {
    status: "empty",
    from,
    to,
    allocation,
    valueAreaPercentage,
    bins: [],
    totalEligibleVolume: 0,
    eligibleCandleCount: 0,
    volumeCandleCount: 0,
    priceBounds: null,
    pointOfControl: null,
    valueArea: null,
  };
}

function scaledRangeFor(min: number, max: number): { readonly scale: number; readonly min: number; readonly max: number; readonly span: number } {
  const scale = Math.max(1, Math.abs(min), Math.abs(max));
  const scaledMin = min / scale;
  const scaledMax = max / scale;
  return { scale, min: scaledMin, max: scaledMax, span: Math.max(0, scaledMax - scaledMin) };
}

function normalizedFraction(value: number, min: number, max: number, range: { readonly min: number; readonly max: number; readonly span: number }): number {
  if (range.span === 0) return 0;
  const scaledValue = value / Math.max(1, Math.abs(min), Math.abs(max));
  return clamp01((scaledValue - range.min) / range.span);
}

function binIndex(fraction: number, binCount: number): number {
  return Math.max(0, Math.min(binCount - 1, Math.floor(clamp01(fraction) * binCount)));
}

function createBins(bounds: VolumeProfilePriceBounds, volumes: readonly number[]): VolumeProfileBin[] {
  const range = scaledRangeFor(bounds.min, bounds.max);
  return volumes.map((estimatedVolume, index) => {
    const lowerFraction = volumes.length === 0 ? 0 : index / volumes.length;
    const upperFraction = volumes.length === 0 ? 0 : (index + 1) / volumes.length;
    const lowerBound = interpolate(bounds.min, bounds.max, lowerFraction);
    const upperBound = interpolate(bounds.min, bounds.max, upperFraction);
    return {
      index,
      lowerBound,
      upperBound,
      center: range.span === 0 ? bounds.min : interpolate(bounds.min, bounds.max, (lowerFraction + upperFraction) / 2),
      estimatedVolume,
    };
  });
}

function interpolate(min: number, max: number, fraction: number): number {
  const value = min * (1 - fraction) + max * fraction;
  if (Number.isFinite(value)) return value;
  return fraction < 0.5 ? min : max;
}

function findPointOfControl(bins: readonly VolumeProfileBin[]): { index: number; price: number; estimatedVolume: number } | null {
  let best: VolumeProfileBin | undefined;
  for (const bin of bins) {
    if (bin.estimatedVolume <= 0) continue;
    if (best === undefined || bin.estimatedVolume > best.estimatedVolume || (bin.estimatedVolume === best.estimatedVolume && bin.index < best.index)) best = bin;
  }
  return best === undefined ? null : { index: best.index, price: best.center, estimatedVolume: best.estimatedVolume };
}

function expandValueArea(
  bins: readonly VolumeProfileBin[],
  pocIndex: number,
  totalVolume: number,
  targetPercentage: number,
): EstimatedVolumeProfileResult["valueArea"] {
  if (bins.length === 0 || totalVolume <= 0) return null;
  let lowIndex = pocIndex;
  let highIndex = pocIndex;
  let volume = bins[pocIndex]?.estimatedVolume ?? 0;
  const target = totalVolume * targetPercentage;
  while (volume < target && (lowIndex > 0 || highIndex < bins.length - 1)) {
    const left = lowIndex > 0 ? bins[lowIndex - 1]?.estimatedVolume ?? 0 : -1;
    const right = highIndex < bins.length - 1 ? bins[highIndex + 1]?.estimatedVolume ?? 0 : -1;
    if (left >= right && lowIndex > 0) {
      lowIndex -= 1;
      volume = safeAdd(volume, bins[lowIndex]?.estimatedVolume ?? 0);
    } else if (highIndex < bins.length - 1) {
      highIndex += 1;
      volume = safeAdd(volume, bins[highIndex]?.estimatedVolume ?? 0);
    } else {
      break;
    }
  }
  const low = bins[lowIndex]?.lowerBound;
  const high = bins[highIndex]?.upperBound;
  if (low === undefined || high === undefined) return null;
  return {
    lowIndex,
    highIndex,
    low,
    high,
    volume,
    percentageAchieved: totalVolume === 0 ? 0 : volume / totalVolume,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function lowerBound(candles: readonly Candle[], time: number): number {
  let low = 0;
  let high = candles.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((candles[middle]?.time ?? Number.POSITIVE_INFINITY) < time) low = middle + 1;
    else high = middle;
  }
  return low;
}
