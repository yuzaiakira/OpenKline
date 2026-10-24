import { CandleStore } from "./candle-store.js";
import type { Candle } from "../types.js";

export interface VisibleCandleData {
  candles: Candle[];
  from: number;
  to: number;
}

export class ChartModel {
  private readonly store = new CandleStore();
  private viewportWidth = 800;
  private visibleCount = 100;
  private rangeStart = 0;

  public setData(candles: readonly Candle[]): void {
    this.store.setData(candles);
    this.visibleCount = this.calculateVisibleCount();
    this.rangeStart = Math.max(0, this.store.length - this.visibleCount);
  }

  public update(candle: Candle): void {
    const wasAtLatest = this.rangeStart + this.visibleCount >= this.store.length;
    this.store.update(candle);
    if (wasAtLatest) {
      this.rangeStart = Math.max(0, this.store.length - this.visibleCount);
    } else {
      this.rangeStart = this.clampStart(this.rangeStart);
    }
  }

  public resize(width: number): void {
    if (!Number.isFinite(width) || width < 0) {
      throw new Error("Chart width must be a non-negative finite number");
    }

    const oldEnd = this.rangeStart + this.visibleCount;
    this.viewportWidth = width;
    this.visibleCount = this.calculateVisibleCount();
    if (oldEnd >= this.store.length) {
      this.rangeStart = Math.max(0, this.store.length - this.visibleCount);
    } else {
      this.rangeStart = this.clampStart(this.rangeStart);
    }
  }

  public pan(deltaBars: number): void {
    if (!Number.isFinite(deltaBars)) {
      return;
    }
    this.rangeStart = this.clampStart(this.rangeStart + Math.round(deltaBars));
  }

  public zoom(scale: number, anchorRatio = 0.5): void {
    if (!Number.isFinite(scale) || scale <= 0 || this.store.length === 0) {
      return;
    }

    const safeAnchor = Math.min(1, Math.max(0, anchorRatio));
    const anchorIndex = this.rangeStart + Math.round((this.visibleCount - 1) * safeAnchor);
    const nextCount = Math.max(2, Math.min(this.store.length, Math.round(this.visibleCount * scale)));
    this.visibleCount = nextCount;
    this.rangeStart = this.clampStart(anchorIndex - Math.round((nextCount - 1) * safeAnchor));
  }

  public getVisibleData(): VisibleCandleData {
    const from = this.clampStart(this.rangeStart);
    const to = Math.min(this.store.length, from + this.visibleCount);
    return { candles: this.store.getRange(from, to), from, to };
  }

  public get allCandles(): Candle[] {
    return this.store.getAll();
  }

  public get barSpacing(): number {
    return this.viewportWidth / Math.max(this.visibleCount, 1);
  }

  private calculateVisibleCount(): number {
    if (this.store.length === 0) {
      return 2;
    }
    return Math.max(2, Math.min(this.store.length, Math.floor(this.viewportWidth / 8)));
  }

  private clampStart(start: number): number {
    return Math.max(0, Math.min(Math.max(0, this.store.length - this.visibleCount), Math.round(start)));
  }
}
