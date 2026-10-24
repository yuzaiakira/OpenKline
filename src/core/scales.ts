import type { Candle } from "../types.js";

export interface PixelRange {
  start: number;
  end: number;
}

export class TimeScale {
  private readonly timeStart: number;
  private readonly timeEnd: number;
  private readonly pixelStart: number;
  private readonly pixelEnd: number;

  public constructor(times: readonly number[], pixels: PixelRange) {
    if (times.length === 0) {
      throw new Error("TimeScale requires at least one timestamp");
    }

    this.timeStart = times[0] ?? 0;
    this.timeEnd = times[times.length - 1] ?? this.timeStart;
    this.pixelStart = pixels.start;
    this.pixelEnd = pixels.end;
  }

  public xForTime(time: number): number {
    if (this.timeStart === this.timeEnd) {
      return (this.pixelStart + this.pixelEnd) / 2;
    }
    const ratio = (time - this.timeStart) / (this.timeEnd - this.timeStart);
    return this.pixelStart + ratio * (this.pixelEnd - this.pixelStart);
  }

  public timeForX(x: number): number {
    if (this.pixelStart === this.pixelEnd) {
      return this.timeStart;
    }
    const ratio = (x - this.pixelStart) / (this.pixelEnd - this.pixelStart);
    return this.timeStart + ratio * (this.timeEnd - this.timeStart);
  }
}

export class PriceScale {
  private readonly priceMin: number;
  private readonly priceMax: number;
  private readonly pixelTop: number;
  private readonly pixelBottom: number;

  public constructor(min: number, max: number, pixels: PixelRange, paddingRatio = 0.08) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new Error("PriceScale requires a finite ascending range");
    }

    const sourceRange = max - min;
    const padding = sourceRange === 0 ? Math.max(Math.abs(min) * paddingRatio, 1) : sourceRange * paddingRatio;
    this.priceMin = min - padding;
    this.priceMax = max + padding;
    this.pixelTop = pixels.start;
    this.pixelBottom = pixels.end;
  }

  public yForPrice(price: number): number {
    const ratio = (price - this.priceMin) / (this.priceMax - this.priceMin);
    return this.pixelBottom - ratio * (this.pixelBottom - this.pixelTop);
  }

  public priceForY(y: number): number {
    const ratio = (this.pixelBottom - y) / (this.pixelBottom - this.pixelTop);
    return this.priceMin + ratio * (this.priceMax - this.priceMin);
  }

  public get min(): number {
    return this.priceMin;
  }

  public get max(): number {
    return this.priceMax;
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
