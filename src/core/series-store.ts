import { CandleStore } from "./candle-store.js";
import { PointStore, type TimeValuePoint } from "./point-store.js";
import type {
  Candle,
  SeriesOptions,
  SeriesPoint,
  SeriesStyle,
  SeriesType,
} from "../types.js";

export type SeriesData = readonly Candle[] | readonly TimeValuePoint[];

export interface SeriesSnapshot {
  id: string;
  type: SeriesType;
  paneId: string;
  title?: string;
  style: SeriesStyle;
  data: SeriesPoint[];
}

interface StoredSeries {
  id: string;
  type: SeriesType;
  paneId: string;
  title?: string;
  style: SeriesStyle;
  store: CandleStore | PointStore;
}

export class SeriesCollection {
  private readonly series = new Map<string, StoredSeries>();
  private nextId = 1;
  private timesCache: number[] | null = null;

  public add(type: SeriesType, options: SeriesOptions = {}): string {
    const id = options.id ?? `${type}-${this.nextId++}`;
    if (this.series.has(id)) {
      throw new Error(`Series id already exists: ${id}`);
    }
    this.series.set(id, {
      id,
      type,
      paneId: options.pane ?? "main",
      ...(options.title === undefined ? {} : { title: options.title }),
      style: { ...options.style },
      store: type === "candlestick" ? new CandleStore() : new PointStore(),
    });
    this.invalidateTimes();
    return id;
  }

  public remove(id: string): void {
    if (!this.series.delete(id)) {
      throw new Error(`Unknown series id: ${id}`);
    }
    this.invalidateTimes();
  }

  public clear(): void {
    this.series.clear();
    this.invalidateTimes();
  }

  public setData(id: string, data: SeriesData): void {
    const series = this.require(id);
    if (series.type === "candlestick") {
      if (data.length > 0 && !isCandleData(data)) {
        throw new Error(`Series ${id} requires candlestick data`);
      }
      (series.store as CandleStore).setData(data as readonly Candle[]);
    } else {
      if (data.length > 0 && isCandleData(data)) {
        throw new Error(`Series ${id} requires time/value points`);
      }
      (series.store as PointStore).setData(data as readonly TimeValuePoint[]);
    }
    this.invalidateTimes();
  }

  public update(id: string, point: SeriesPoint): void {
    const series = this.require(id);
    if (series.type === "candlestick") {
      if (!isCandle(point)) {
        throw new Error(`Series ${id} requires a candlestick update`);
      }
      (series.store as CandleStore).update(point);
    } else {
      if (isCandle(point)) {
        throw new Error(`Series ${id} requires a time/value update`);
      }
      (series.store as PointStore).update(point);
    }
    this.invalidateTimes();
  }

  public setStyle(id: string, style: SeriesStyle): void {
    const series = this.require(id);
    series.style = { ...series.style, ...style };
  }

  public setPane(id: string, paneId: string): void {
    const series = this.require(id);
    series.paneId = paneId;
  }

  public getPaneId(id: string): string {
    return this.require(id).paneId;
  }

  public get(id: string): SeriesSnapshot {
    const series = this.require(id);
    return this.snapshot(series);
  }

  public getIds(): string[] {
    return [...this.series.keys()];
  }

  public getTimePoints(): number[] {
    if (this.timesCache !== null) {
      return [...this.timesCache];
    }
    const times = new Set<number>();
    for (const series of this.series.values()) {
      for (const time of this.getTimes(series)) {
        times.add(time);
      }
    }
    this.timesCache = [...times].sort((left, right) => left - right);
    return [...this.timesCache];
  }

  public getVisible(fromTime: number, toTime: number): SeriesSnapshot[] {
    return [...this.series.values()].map((series) => ({
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      ...(series.title === undefined ? {} : { title: series.title }),
      style: { ...series.style },
      data: this.getRangeByTime(series, fromTime, toTime),
    }));
  }

  private require(id: string): StoredSeries {
    const series = this.series.get(id);
    if (series === undefined) {
      throw new Error(`Unknown series id: ${id}`);
    }
    return series;
  }

  private snapshot(series: StoredSeries): SeriesSnapshot {
    return {
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      ...(series.title === undefined ? {} : { title: series.title }),
      style: { ...series.style },
      data: series.store instanceof CandleStore ? series.store.getAll() : series.store.getAll(),
    };
  }

  private getTimes(series: StoredSeries): number[] {
    return series.store instanceof CandleStore
      ? series.store.getAll().map((candle) => candle.time)
      : series.store.getTimes();
  }

  private getRangeByTime(series: StoredSeries, from: number, to: number): SeriesPoint[] {
    return series.store instanceof CandleStore
      ? series.store.getRangeByTime(from, to)
      : series.store.getRangeByTime(from, to);
  }

  private invalidateTimes(): void {
    this.timesCache = null;
  }
}

function isCandle(value: SeriesPoint): value is Candle {
  return "open" in value && "high" in value && "low" in value && "close" in value;
}

function isCandleData(data: SeriesData): data is readonly Candle[] {
  const first = data[0];
  return first !== undefined && isCandle(first);
}

