import { PaneLayout, type PaneConfig } from "./pane-layout.js";
import { isCandleSeriesType } from "./candle-series.js";
import { SeriesCollection, type SeriesData, type SeriesSnapshot } from "./series-store.js";
import type { Candle, PaneOptions, SeriesOptions, SeriesPoint, SeriesType } from "../types.js";

export interface VisiblePaneData {
  id: string;
  preferredHeight: number | null;
  minHeight: number;
  series: SeriesSnapshot[];
}

export interface VisibleChartData {
  series: SeriesSnapshot[];
  panes: VisiblePaneData[];
  times: number[];
  candles: Candle[];
  from: number;
  to: number;
}
/** Shared time/viewport model used by every chart series type. */
export class ChartModel {
  private readonly collection = new SeriesCollection();
  private readonly paneLayout = new PaneLayout();
  private viewportWidth = 800;
  private visibleCount = 100;
  private rangeStart = 0;
  private primaryCandleId: string | null = null;

  public addSeries(type: SeriesType, options: SeriesOptions = {}): string {
    const paneId = this.resolvePane(type, options.pane);
    const id = this.collection.add(type, { ...options, pane: paneId });
    if (isCandleSeriesType(type) && this.primaryCandleId === null) {
      this.primaryCandleId = id;
    }
    this.rangeStart = this.clampStart(this.rangeStart);
    return id;
  }

  public removeSeries(id: string): void {
    const paneId = this.collection.getPaneId(id);
    this.collection.remove(id);
    if (this.primaryCandleId === id) {
      this.primaryCandleId = this.collection.getIds().find((seriesId) => isCandleSeriesType(this.collection.get(seriesId).type)) ?? null;
    }
    this.preserveViewportAfterDataChange(false);
    if (paneId !== "main" && !this.collection.getIds().some((seriesId) => this.collection.getPaneId(seriesId) === paneId)) {
      this.paneLayout.remove(paneId);
    }
  }

  public addPane(options: PaneOptions = {}): string {
    return this.paneLayout.add(options);
  }

  public removePane(id: string): void {
    if (id === "main") throw new Error("The main pane cannot be removed");
    for (const seriesId of this.collection.getIds()) {
      if (this.collection.getPaneId(seriesId) === id) this.collection.setPane(seriesId, "main");
    }
    this.paneLayout.remove(id);
  }

  public setPaneHeight(id: string, height: number): void {
    this.paneLayout.setHeight(id, height);
  }

  public getPaneHeight(id: string): number | null {
    return this.paneLayout.getHeight(id);
  }

  public getPaneIds(): string[] {
    return this.paneLayout.getIds();
  }

  public setSeriesPane(id: string, paneId: string): void {
    if (!this.paneLayout.has(paneId)) throw new Error(`Unknown pane id: ${paneId}`);
    this.collection.setPane(id, paneId);
  }

  public destroy(): void {
    this.collection.clear();
    this.paneLayout.clearAdditional();
    this.primaryCandleId = null;
    this.rangeStart = 0;
    this.visibleCount = 1;
  }

  public setSeriesData(id: string, data: SeriesData): void {
    const hadTimePoints = this.collection.getTimePointCount() > 0;
    const wasAtLatest = this.isAtLatest();
    this.collection.setData(id, data);
    if (!hadTimePoints) this.resetToLatest();
    else this.preserveViewportAfterDataChange(wasAtLatest);
  }

  public updateSeries(id: string, point: SeriesPoint): void {
    const hadTimePoints = this.collection.getTimePointCount() > 0;
    const wasAtLatest = this.isAtLatest();
    this.collection.update(id, point);
    if (!hadTimePoints) this.resetToLatest();
    else this.preserveViewportAfterDataChange(wasAtLatest);
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

  public getAllSeries(): SeriesSnapshot[] {
    return this.collection.getIds().map((id) => this.collection.get(id));
  }

  public getPaneConfigs(): PaneConfig[] {
    return this.paneLayout.getConfigs();
  }

  public getViewportState(): { readonly rangeStart: number; readonly visibleCount: number } {
    return { rangeStart: this.rangeStart, visibleCount: this.visibleCount };
  }

  public setViewportState(state: { rangeStart: number; visibleCount: number }): void {
    if (!Number.isInteger(state.rangeStart) || state.rangeStart < 0 || !Number.isInteger(state.visibleCount) || state.visibleCount < 1) {
      throw new Error("Invalid viewport state");
    }
    this.visibleCount = Math.min(Math.max(1, state.visibleCount), Math.max(1, this.collection.getTimePointCount()));
    this.rangeStart = this.clampStart(state.rangeStart);
  }

  /** Legacy convenience API: create/reuse the primary candlestick series. */
  public setData(candles: readonly Candle[]): void {
    const id = this.ensurePrimaryCandles();
    this.collection.setData(id, candles);
    this.resetToLatest();
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

    const wasAtLatest = this.isAtLatest();
    this.viewportWidth = width;
    const length = this.collection.getTimePointCount();
    if (length === 0) {
      this.visibleCount = 1;
      this.rangeStart = 0;
    } else {
      this.visibleCount = Math.min(Math.max(1, this.visibleCount), length);
      if (wasAtLatest) {
        this.rangeStart = Math.max(0, length - this.visibleCount);
      } else {
        this.rangeStart = this.clampStart(this.rangeStart);
      }
    }
  }

  /** Show every timestamp in the shared time axis. */
  public fitContent(): void {
    const length = this.collection.getTimePointCount();
    this.visibleCount = Math.max(1, length);
    this.rangeStart = 0;
  }

  /** Restore the default density and follow the newest data. */
  public resetView(): void {
    this.visibleCount = this.calculateVisibleCount();
    this.rangeStart = Math.max(0, this.collection.getTimePointCount() - this.visibleCount);
  }

  private preserveViewportAfterDataChange(followLatest: boolean): void {
    const length = this.collection.getTimePointCount();
    if (length === 0) {
      this.visibleCount = 1;
      this.rangeStart = 0;
      return;
    }
    this.visibleCount = Math.min(Math.max(1, this.visibleCount), length);
    if (followLatest) {
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
    const length = this.collection.getTimePointCount();
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
    const from = this.clampStart(this.rangeStart);
    const to = Math.min(this.collection.getTimePointCount(), from + this.visibleCount);
    const visibleTimes = this.collection.getTimePointsRange(from, to);
    const firstTime = visibleTimes[0];
    const lastTime = visibleTimes[visibleTimes.length - 1];
    const series = firstTime === undefined || lastTime === undefined
      ? []
      : this.collection.getVisible(firstTime, Math.min(Number.MAX_SAFE_INTEGER, lastTime + 1));
    const primary = this.primaryCandleId === null ? undefined : series.find((item) => item.id === this.primaryCandleId);
    const panes = this.paneLayout.getConfigs().map((pane) => ({
      id: pane.id,
      preferredHeight: pane.preferredHeight,
      minHeight: pane.minHeight,
      series: series.filter((item) => item.paneId === pane.id),
    }));
    return {
      series,
      panes,
      times: visibleTimes,
      candles: primary?.data.filter(isCandle) ?? [],
      from,
      to,
    };
  }

  public get allCandles(): Candle[] {
    return this.primaryCandleId === null ? [] : this.collection.get(this.primaryCandleId).data.filter(isCandle);
  }

  public getLatestCandleTime(): number | undefined {
    return this.primaryCandleId === null ? undefined : this.collection.getLatestTime(this.primaryCandleId);
  }

  public isPrimaryCandleSeries(id: string): boolean {
    return this.primaryCandleId === id;
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

  private resolvePane(type: SeriesType, requestedPane: string | undefined): string {
    if (requestedPane === "new") {
      return this.paneLayout.add({ height: 160 });
    }
    const paneId = requestedPane ?? (type === "volume" || type === "histogram" ? "volume" : "main");
    if (!this.paneLayout.has(paneId)) {
      this.paneLayout.add({ id: paneId, height: type === "volume" || type === "histogram" ? 120 : 160 });
    }
    return paneId;
  }

  private resetToLatest(): void {
    this.resetView();
  }

  private isAtLatest(): boolean {
    return this.rangeStart + this.visibleCount >= this.collection.getTimePointCount();
  }

  private calculateVisibleCount(): number {
    const length = this.collection.getTimePointCount();
    if (length === 0) {
      return 1;
    }
    return Math.min(length, Math.max(1, Math.floor(this.viewportWidth / 8)));
  }

  private clampStart(start: number): number {
    const length = this.collection.getTimePointCount();
    return Math.max(0, Math.min(Math.max(0, length - this.visibleCount), Math.round(start)));
  }
}

function isCandle(value: SeriesPoint): value is Candle {
  return "open" in value && "high" in value && "low" in value && "close" in value;
}

