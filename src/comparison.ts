import type { Candle } from "./types.js";
import { adjustCorporateActionData, type CorporateActionAdjustmentContext, type CorporateActionDataset, type CorporateActionAdjustmentMode, type CorporateActionVolumePolicy } from "./corporate-actions.js";

/** A validated raw price observation used by the comparison engine. */
export interface ComparisonPricePoint {
  readonly time: number;
  readonly price: number;
}

export type ComparisonNormalizationMode = "percentage" | "indexed";
export type ComparisonDataBasis = CorporateActionAdjustmentMode;

/** The explicit baseline policy used for every asset. */
export interface ComparisonBaseline {
  /** Requested UTC timestamp. Baseline observations may not be newer than this time. */
  readonly time: number;
  /** Maximum permitted age of an at-or-before baseline observation. */
  readonly maxAgeMs: number;
}

export interface ComparisonAssetInput {
  readonly id: string;
  readonly label?: string;
  readonly color?: string;
  readonly data: readonly ComparisonPricePoint[];
  /** Optional explicit source basis for auditability; legacy assets omit it. */
  readonly basis?: ComparisonDataBasis;
}

export interface ComparisonAssetSnapshot {
  readonly id: string;
  readonly label: string;
  readonly color?: string;
  readonly basis?: ComparisonDataBasis;
  readonly data: readonly ComparisonPricePoint[];
}

export interface ComparisonNormalizedPoint {
  readonly time: number;
  readonly value: number;
}

export interface ComparisonAssetOutput {
  readonly id: string;
  readonly label: string;
  readonly color?: string;
  readonly basis?: ComparisonDataBasis;
  readonly baselineTime: number | null;
  readonly baselinePrice: number | null;
  readonly data: readonly ComparisonNormalizedPoint[];
}

export interface ComparisonAssetStatus {
  readonly id: string;
  readonly label: string;
  readonly pointCount: number;
  readonly firstTime: number | null;
  readonly lastTime: number | null;
  readonly baselineTime: number | null;
  readonly baselinePrice: number | null;
  readonly eligible: boolean;
}

export interface ComparisonChange {
  readonly kind: "asset-added" | "asset-removed" | "data-replaced" | "data-updated" | "mode-changed" | "baseline-changed" | "cleared" | "disposed";
  readonly assetId?: string;
}

export type ComparisonChangeListener = (change: ComparisonChange) => void;

export interface ComparisonEngineOptions {
  readonly mode?: ComparisonNormalizationMode;
  readonly baseline?: ComparisonBaseline;
}

export interface ComparisonCorporateActionAssetInput {
  readonly id: string;
  readonly label?: string;
  readonly color?: string;
  readonly candles: readonly Candle[];
  readonly corporateActions: CorporateActionDataset;
  /** The basis is explicit; total-return is an index, not synthetic OHLC. */
  readonly mode: CorporateActionAdjustmentMode;
  readonly context?: CorporateActionAdjustmentContext;
  readonly asOfTime?: number;
  /** Optional fixed source duration for causal candle availability. */
  readonly sourceDurationMs?: number;
  readonly volumePolicy?: CorporateActionVolumePolicy;
  readonly totalReturnBase?: number;
}

interface StoredAsset {
  readonly id: string;
  label: string;
  color?: string;
  basis?: ComparisonDataBasis;
  data: ComparisonPricePoint[];
}

/**
 * Framework-independent relative-performance calculator.
 *
 * Baselines are selected from the latest observation at or before the
 * requested UTC time. A maximum age is always explicit and defaults to zero,
 * which means an asset must have an observation exactly at the requested
 * baseline timestamp. No future observation is ever used as a baseline.
 */
export class ComparisonEngine {
  private readonly assets = new Map<string, StoredAsset>();
  private readonly listeners = new Set<ComparisonChangeListener>();
  private mode: ComparisonNormalizationMode;
  private baseline: ComparisonBaseline | null;
  private normalizedCache: ComparisonAssetOutput[] | null = null;
  private disposed = false;

  public constructor(options: ComparisonEngineOptions = {}) {
    this.mode = options.mode ?? "percentage";
    this.baseline = options.baseline === undefined ? null : normalizeBaseline(options.baseline);
  }

  public addAsset(input: ComparisonAssetInput): void;
  public addAsset(id: string, data: readonly ComparisonPricePoint[], options?: { readonly label?: string; readonly color?: string }): void;
  public addAsset(
    inputOrId: ComparisonAssetInput | string,
    data?: readonly ComparisonPricePoint[],
    options: { readonly label?: string; readonly color?: string } = {},
  ): void {
    this.assertAlive();
    const input: ComparisonAssetInput = typeof inputOrId === "string"
      ? { id: inputOrId, data: data ?? [], ...options }
      : inputOrId;
    const id = normalizeAssetId(input.id);
    if (this.assets.has(id)) throw new Error(`Comparison asset already exists: ${id}`);
    this.assets.set(id, {
      id,
      label: normalizeLabel(input.label ?? id),
      ...(input.color === undefined ? {} : { color: normalizeColor(input.color) }),
      ...(input.basis === undefined ? {} : { basis: normalizeBasis(input.basis) }),
      data: normalizeData(input.data),
    });
    this.invalidate();
    this.emit({ kind: "asset-added", assetId: id });
  }

  /** Add a comparison asset from raw candles using an explicit corporate-action basis. */
  public addCorporateActionAsset(input: ComparisonCorporateActionAssetInput): void {
    this.assertAlive();
    const adjustment = adjustCorporateActionData(input.candles, input.corporateActions, {
      mode: input.mode,
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.asOfTime === undefined ? {} : { asOfTime: input.asOfTime }),
      ...(input.sourceDurationMs === undefined ? {} : { sourceDurationMs: input.sourceDurationMs }),
      ...(input.volumePolicy === undefined ? {} : { volumePolicy: input.volumePolicy }),
      ...(input.totalReturnBase === undefined ? {} : { totalReturnBase: input.totalReturnBase }),
    });
    const data = adjustment.totalReturn === null
      ? (adjustment.candles ?? []).map((candle) => ({ time: candle.time, price: candle.close }))
      : adjustment.totalReturn.map((point) => ({ time: point.time, price: point.value }));
    this.addAsset({ id: input.id, ...(input.label === undefined ? {} : { label: input.label }), ...(input.color === undefined ? {} : { color: input.color }), basis: input.mode, data });
  }

  public removeAsset(id: string): boolean {
    this.assertAlive();
    const normalizedId = normalizeAssetId(id);
    const removed = this.assets.delete(normalizedId);
    if (removed) {
      this.invalidate();
      this.emit({ kind: "asset-removed", assetId: normalizedId });
    }
    return removed;
  }

  public clear(): void {
    this.assertAlive();
    if (this.assets.size === 0) return;
    this.assets.clear();
    this.invalidate();
    this.emit({ kind: "cleared" });
  }

  public replaceAssetData(id: string, data: readonly ComparisonPricePoint[]): void {
    this.assertAlive();
    const asset = this.requireAsset(id);
    asset.data = normalizeData(data);
    this.invalidate();
    this.emit({ kind: "data-replaced", assetId: asset.id });
  }

  /** Alias that mirrors the setData naming used by SeriesApi consumers. */
  public setAssetData(id: string, data: readonly ComparisonPricePoint[]): void {
    this.replaceAssetData(id, data);
  }

  /** Replace or insert one raw observation while preserving chronological order. */
  public updateAsset(id: string, point: ComparisonPricePoint | Candle): void {
    this.assertAlive();
    const asset = this.requireAsset(id);
    const next = normalizePoint(point);
    const index = lowerBound(asset.data, next.time);
    const current = asset.data[index];
    if (current?.time === next.time) asset.data[index] = next;
    else asset.data.splice(index, 0, next);
    this.invalidate();
    this.emit({ kind: "data-updated", assetId: asset.id });
  }

  public setMode(mode: ComparisonNormalizationMode): void {
    this.assertAlive();
    if (mode !== "percentage" && mode !== "indexed") throw new Error(`Unsupported comparison mode: ${String(mode)}`);
    if (this.mode === mode) return;
    this.mode = mode;
    this.invalidate();
    this.emit({ kind: "mode-changed" });
  }

  public getMode(): ComparisonNormalizationMode {
    this.assertAlive();
    return this.mode;
  }

  public setBaseline(time: number | null, options: { readonly maxAgeMs?: number } = {}): void {
    this.assertAlive();
    this.baseline = time === null ? null : normalizeBaseline({
      time,
      maxAgeMs: options.maxAgeMs ?? this.baseline?.maxAgeMs ?? 0,
    });
    this.invalidate();
    this.emit({ kind: "baseline-changed" });
  }

  /** Alias emphasizing that the input is a UTC millisecond timestamp. */
  public setBaselineTime(time: number | null, options: { readonly maxAgeMs?: number } = {}): void {
    this.setBaseline(time, options);
  }

  public getBaseline(): ComparisonBaseline | null {
    this.assertAlive();
    return this.baseline === null ? null : { ...this.baseline };
  }

  public getAssetIds(): string[] {
    this.assertAlive();
    return [...this.assets.keys()];
  }

  public getAssets(): ComparisonAssetSnapshot[] {
    this.assertAlive();
    return [...this.assets.values()].map((asset) => snapshotAsset(asset));
  }

  public getRawData(id: string): ComparisonPricePoint[] {
    this.assertAlive();
    return [...this.requireAsset(id).data].map((point) => ({ ...point }));
  }

  public getRawValueAt(id: string, time: number): number | null {
    this.assertAlive();
    const point = this.requireAsset(id).data[lowerBound(this.requireAsset(id).data, normalizeTime(time))];
    return point?.time === time ? point.price : null;
  }

  public getNormalizedData(): ComparisonAssetOutput[] {
    this.assertAlive();
    if (this.normalizedCache === null) this.normalizedCache = [...this.assets.values()].map((asset) => this.normalizeAsset(asset));
    return this.normalizedCache.map((asset) => ({
      ...asset,
      data: asset.data.map((point) => ({ ...point })),
    }));
  }

  public getNormalizedValueAt(id: string, time: number): number | null {
    this.assertAlive();
    const normalizedTime = normalizeTime(time);
    const asset = this.getNormalizedData().find((candidate) => candidate.id === normalizeAssetId(id));
    const point = asset?.data[lowerBound(asset.data, normalizedTime)];
    return point?.time === normalizedTime ? point.value : null;
  }

  public getStatus(): ComparisonAssetStatus[] {
    this.assertAlive();
    return this.getNormalizedData().map((asset) => {
      const raw = this.requireAsset(asset.id).data;
      return {
        id: asset.id,
        label: asset.label,
        pointCount: raw.length,
        firstTime: raw[0]?.time ?? null,
        lastTime: raw.at(-1)?.time ?? null,
        baselineTime: asset.baselineTime,
        baselinePrice: asset.baselinePrice,
        eligible: asset.baselinePrice !== null,
      };
    });
  }

  public subscribe(listener: ComparisonChangeListener): () => void {
    this.assertAlive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.assets.clear();
    this.listeners.clear();
    this.normalizedCache = null;
  }

  private normalizeAsset(asset: StoredAsset): ComparisonAssetOutput {
    const baselinePoint = this.baseline === null ? undefined : findAtOrBefore(asset.data, this.baseline.time);
    const eligible = baselinePoint !== undefined
      && this.baseline !== null
      && this.baseline.time - baselinePoint.time <= this.baseline.maxAgeMs
      && baselinePoint.price > 0
      && Number.isFinite(baselinePoint.price);
    if (!eligible || this.baseline === null || baselinePoint === undefined) {
      return {
        id: asset.id,
        label: asset.label,
        ...(asset.color === undefined ? {} : { color: asset.color }),
        ...(asset.basis === undefined ? {} : { basis: asset.basis }),
        baselineTime: baselinePoint?.time ?? null,
        baselinePrice: null,
        data: [],
      };
    }
    const data = asset.data
      .filter((point) => point.time >= this.baseline!.time)
      .map((point) => ({
        time: point.time,
        value: this.mode === "percentage"
          ? ((point.price / baselinePoint.price) - 1) * 100
          : (point.price / baselinePoint.price) * 100,
      }));
    return {
      id: asset.id,
      label: asset.label,
      ...(asset.color === undefined ? {} : { color: asset.color }),
      ...(asset.basis === undefined ? {} : { basis: asset.basis }),
      baselineTime: baselinePoint.time,
      baselinePrice: baselinePoint.price,
      data,
    };
  }

  private requireAsset(id: string): StoredAsset {
    const normalizedId = normalizeAssetId(id);
    const asset = this.assets.get(normalizedId);
    if (asset === undefined) throw new Error(`Unknown comparison asset: ${normalizedId}`);
    return asset;
  }

  private invalidate(): void {
    this.normalizedCache = null;
  }

  private emit(change: ComparisonChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("ComparisonEngine has been disposed");
  }
}

function normalizeData(data: readonly ComparisonPricePoint[]): ComparisonPricePoint[] {
  if (!Array.isArray(data)) throw new Error("Comparison asset data must be an array");
  const normalized = data.map((point, index) => normalizePoint(point, index));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index]!.time <= normalized[index - 1]!.time) throw new Error(`Comparison timestamps must be strictly increasing at index ${index}`);
  }
  return normalized;
}

function normalizePoint(point: ComparisonPricePoint | Candle, index = 0): ComparisonPricePoint {
  if (!isRecord(point) || !Number.isFinite(point.time) || !Number.isSafeInteger(point.time) || point.time < 0) {
    throw new Error(`Invalid comparison timestamp at index ${index}`);
  }
  const price = "price" in point ? point.price : point.close;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) throw new Error(`Invalid comparison price at index ${index}`);
  return { time: point.time, price };
}

function normalizeBaseline(value: ComparisonBaseline): ComparisonBaseline {
  return { time: normalizeTime(value.time), maxAgeMs: normalizeAge(value.maxAgeMs) };
}

function normalizeTime(value: number): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) throw new Error("Comparison time must be a non-negative UTC millisecond integer");
  return value;
}

function normalizeAge(value: number): number {
  if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0) throw new Error("Comparison baseline maxAgeMs must be a non-negative integer");
  return value;
}

function normalizeAssetId(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Comparison asset id must be a non-empty string");
  return value.trim();
}

function normalizeLabel(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Comparison asset label must be a non-empty string");
  return value.trim();
}

function normalizeColor(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error("Comparison asset color must be a non-empty string");
  return value;
}

function normalizeBasis(value: ComparisonDataBasis): ComparisonDataBasis {
  if (value !== "raw" && value !== "split-adjusted" && value !== "total-return") throw new Error(`Unsupported comparison data basis: ${String(value)}`);
  return value;
}

function findAtOrBefore(data: readonly ComparisonPricePoint[], time: number): ComparisonPricePoint | undefined {
  const index = upperBound(data, time) - 1;
  return index < 0 ? undefined : data[index];
}

function lowerBound(data: readonly { readonly time: number }[], time: number): number {
  let low = 0;
  let high = data.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (data[middle]!.time < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function upperBound(data: readonly { readonly time: number }[], time: number): number {
  let low = 0;
  let high = data.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (data[middle]!.time <= time) low = middle + 1;
    else high = middle;
  }
  return low;
}

function snapshotAsset(asset: StoredAsset): ComparisonAssetSnapshot {
  return {
    id: asset.id,
    label: asset.label,
    ...(asset.color === undefined ? {} : { color: asset.color }),
    ...(asset.basis === undefined ? {} : { basis: asset.basis }),
    data: asset.data.map((point) => ({ ...point })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
