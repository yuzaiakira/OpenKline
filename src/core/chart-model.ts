import { SeriesCollection, type SeriesData, type SeriesSnapshot } from "./series-store.js";
import type { Candle, SeriesOptions, SeriesPoint, SeriesType } from "../types.js";

export interface VisibleChartData {
  series: SeriesSnapshot[];
  times: number[];
  candles: Candle[];
  from: number;
  to: number;
}
/** Shared time/viewport model used by every chart series type. */
export class ChartModel {
  private readonly collection = new SeriesCollection();
  private viewportWidth = 800;
  private visibleCount = 100;
  private rangeStart = 0;
  private primaryCandleId: string | null = null;

  public addSeries(type: SeriesType, options: SeriesOptions = {}): string {
    const id = this.collection.add(type, options);
    if (type === "candlestick" && this.primaryCandleId === null) {
      this.primaryCandleId = id;
    }
    this.rangeStart = this.clampStart(this.rangeStart);
    return id;
  }

  public removeSeries(id: string): void {
    this.collection.remove(id);
    if (this.primaryCandleId === id) {
      this.primaryCandleId = this.collection.getIds().find((seriesId) => this.collection.get(seriesId).type === "candlestick") ?? null;
    }
    this.visibleCount = this.calculateVisibleCount();
    this.rangeStart = this.clampStart(this.rangeStart);
  }

  public destroy(): void {
    this.collection.clear();
    this.primaryCandleId = null;
    this.rangeStart = 0;
    this.visibleCount = 1;
  }

  public setSeriesData(id: string, data: SeriesData): void {
    this.collection.setData(id, data);
    this.resetToLatest();
  }

  public updateSeries(id: string, point: SeriesPoint): void {
    const wasAtLatest = this.isAtLatest();
    this.collection.update(id, point);
    this.visibleCount = this.calculateVisibleCount();
    this.rangeStart = wasAtLatest
      ? Math.max(0, this.collection.getTimePoints().length - this.visibleCount)
      : this.clampStart(this.rangeStart);
  }

  public setSeriesStyle(id: string, style: SeriesOptions["style"]): void {
    this.collection.setStyle(id, style ?? {});
  }

  public getSeries(id: string): SeriesSnapshot {
    return this.collection.get(id);
  }

  public getSeriesIds(): string[] {
    return this.collection.getIds();
  }

  /** Legacy convenience API: create/reuse the primary candlestick series. */
  public setData(candles: readonly Candle[]): void {
    const id = this.ensurePrimaryCandles();
    this.setSeriesData(id, candles);
  }

  /** Legacy convenience API for the primary candlestick series. */
  public update(candle: Candle): void {
    const id = this.ensurePrimaryCandles();
    this.updateSeries(id, candle);
  }

  public resize(width: number): void {
    if (!Number.isFinite(width) || width < 0) {
      throw new Error("Chart width must be a non-negative finite number");
    }

    const oldEnd = this.rangeStart + this.visibleCount;
    this.viewportWidth = width;
    this.visibleCount = this.calculateVisibleCount();
    const length = this.collection.getTimePoints().length;
    if (oldEnd >= length) {
      this.rangeStart = Math.max(0, length - this.visibleCount);
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
    const length = this.collection.getTimePoints().length;
    if (!Number.isFinite(scale) || scale <= 0 || length === 0) {
      return;
    }

    const safeAnchor = Math.min(1, Math.max(0, anchorRatio));
    const anchorIndex = this.rangeStart + Math.round((this.visibleCount - 1) * safeAnchor);
    const nextCount = Math.max(1, Math.min(length, Math.round(this.visibleCount * scale)));
    this.visibleCount = nextCount;
    this.rangeStart = this.clampStart(anchorIndex - Math.round((nextCount - 1) * safeAnchor));
  }

  public getVisibleData(): VisibleChartData {
    const times = this.collection.getTimePoints();
    const from = this.clampStart(this.rangeStart);
    const to = Math.min(times.length, from + this.visibleCount);
    const visibleTimes = times.slice(from, to);
    const firstTime = visibleTimes[0];
    const lastTime = visibleTimes[visibleTimes.length - 1];
    const series = firstTime === undefined || lastTime === undefined
      ? []
      : this.collection.getVisible(firstTime, Math.min(Number.MAX_SAFE_INTEGER, lastTime + 1));
    const primary = this.primaryCandleId === null ? undefined : series.find((item) => item.id === this.primaryCandleId);
    return {
      series,
      times: visibleTimes,
      candles: primary?.data.filter(isCandle) ?? [],
      from,
      to,
    };
  }

  public get allCandles(): Candle[] {
    return this.primaryCandleId === null ? [] : this.collection.get(this.primaryCandleId).data.filter(isCandle);
  }

  public get barSpacing(): number {
    return this.viewportWidth / Math.max(this.visibleCount, 1);
  }

  private ensurePrimaryCandles(): string {
    if (this.primaryCandleId !== null) {
      return this.primaryCandleId;
    }
    this.primaryCandleId = this.collection.add("candlestick");
    return this.primaryCandleId;
  }

  private resetToLatest(): void {
    this.visibleCount = this.calculateVisibleCount();
    this.rangeStart = Math.max(0, this.collection.getTimePoints().length - this.visibleCount);
  }

  private isAtLatest(): boolean {
    return this.rangeStart + this.visibleCount >= this.collection.getTimePoints().length;
  }

  private calculateVisibleCount(): number {
    const length = this.collection.getTimePoints().length;
    if (length === 0) {
      return 1;
    }
    return Math.min(length, Math.max(1, Math.floor(this.viewportWidth / 8)));
  }

  private clampStart(start: number): number {
    const length = this.collection.getTimePoints().length;
    return Math.max(0, Math.min(Math.max(0, length - this.visibleCount), Math.round(start)));
  }
}

function isCandle(value: SeriesPoint): value is Candle {
  return "open" in value && "high" in value && "low" in value && "close" in value;
}

