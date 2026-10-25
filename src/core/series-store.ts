import { CandleStore } from "./candle-store.js";
import { isCandleSeriesType, toHeikinAshi } from "./candle-series.js";
import { PointStore, type TimeValuePoint } from "./point-store.js";
import type {
  Candle,
  SeriesBand,
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
  band?: SeriesBand;
  data: SeriesPoint[];
}

interface StoredSeries {
  id: string;
  type: SeriesType;
  paneId: string;
  title?: string;
  style: SeriesStyle;
  band?: SeriesBand;
  store: CandleStore | PointStore;
}

export class SeriesCollection {
  private readonly series = new Map<string, StoredSeries>();
  private nextId = 1;
  private timesCache: number[] | null = null;
  private timesSetCache: Set<number> | null = null;

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
      ...(options.band === undefined ? {} : { band: { ...options.band } }),
      store: isCandleSeriesType(type) ? new CandleStore() : new PointStore(),
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
    if (isCandleSeriesType(series.type)) {
      if (data.length > 0 && !isCandleData(data)) {
        throw new Error(`Series ${id} requires OHLCV candle data`);
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
    const cachedTimes = this.timesCache;
    const cachedSet = this.timesSetCache;
    if (isCandleSeriesType(series.type)) {
      if (!isCandle(point)) {
        throw new Error(`Series ${id} requires an OHLCV candle update`);
      }
      (series.store as CandleStore).update(point);
    } else {
      if (isCandle(point)) {
        throw new Error(`Series ${id} requires a time/value update`);
      }
      (series.store as PointStore).update(point);
    }
    if (cachedTimes === null || cachedSet === null) {
      this.invalidateTimes();
    } else if (cachedSet.has(point.time)) {
      // Replacing an existing timestamp does not change the shared time axis.
    } else if (point.time > (cachedTimes[cachedTimes.length - 1] ?? Number.NEGATIVE_INFINITY)) {
      cachedTimes.push(point.time);
      cachedSet.add(point.time);
    } else {
      // Historical insertion may belong anywhere in the sorted union.
      this.invalidateTimes();
    }
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

  public getLatestTime(id: string): number | undefined {
    const series = this.require(id);
    return series.store.getLatestTime();
  }

  public get(id: string, cutoffTime: number | null = null): SeriesSnapshot {
    const series = this.require(id);
    return this.snapshot(series, cutoffTime);
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
    this.timesSetCache = new Set(this.timesCache);
    return [...this.timesCache];
  }

  public getTimePointCount(cutoffTime: number | null = null): number {
    if (this.timesCache === null) this.getTimePoints();
    const times = this.timesCache ?? [];
    return cutoffTime === null ? times.length : upperBound(times, cutoffTime);
  }

  public getTimePointsRange(from: number, to: number, cutoffTime: number | null = null): number[] {
    if (this.timesCache === null) this.getTimePoints();
    const times = this.timesCache ?? [];
    const end = cutoffTime === null ? to : Math.min(to, upperBound(times, cutoffTime));
    return times.slice(from, end);
  }

  public getVisible(fromTime: number, toTime: number, cutoffTime: number | null = null): SeriesSnapshot[] {
    return [...this.series.values()].map((series) => ({
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      ...(series.title === undefined ? {} : { title: series.title }),
      style: { ...series.style },
      ...(series.band === undefined ? {} : { band: { ...series.band } }),
      data: this.getRangeByTime(series, fromTime, toTime, cutoffTime),
    }));
  }

  private require(id: string): StoredSeries {
    const series = this.series.get(id);
    if (series === undefined) {
      throw new Error(`Unknown series id: ${id}`);
    }
    return series;
  }

  private snapshot(series: StoredSeries, cutoffTime: number | null): SeriesSnapshot {
    return {
      id: series.id,
      type: series.type,
      paneId: series.paneId,
      ...(series.title === undefined ? {} : { title: series.title }),
      style: { ...series.style },
      ...(series.band === undefined ? {} : { band: { ...series.band } }),
      data: this.getRawSnapshotData(series, cutoffTime),
    };
  }

  private getTimes(series: StoredSeries): number[] {
    return series.store instanceof CandleStore
      ? series.store.getAll().map((candle) => candle.time)
      : series.store.getTimes();
  }

  private getRangeByTime(series: StoredSeries, from: number, to: number, cutoffTime: number | null = null): SeriesPoint[] {
    const effectiveTo = cutoffTime === null
      ? to
      : Math.min(to, cutoffTime === Number.MAX_SAFE_INTEGER ? Number.POSITIVE_INFINITY : cutoffTime + 1);
    if (series.store instanceof CandleStore) {
      if (series.type !== "heikin-ashi") return series.store.getRangeByTime(from, effectiveTo);
      // Heikin-Ashi open values depend on the preceding derived candle. Build
      // from the currently replay-visible raw store before slicing. This keeps
      // future raw bars from influencing a replay-visible HA projection.
      const raw = cutoffTime === null
        ? series.store.getAll()
        : series.store.getRangeByTime(Number.NEGATIVE_INFINITY, effectiveTo);
      return toHeikinAshi(raw).filter((candle) => candle.time >= from && candle.time < effectiveTo);
    }
    return series.store.getRangeByTime(from, effectiveTo);
  }

  private getRawSnapshotData(series: StoredSeries, cutoffTime: number | null): SeriesPoint[] {
    const effectiveTo = cutoffTime === null
      ? Number.POSITIVE_INFINITY
      : cutoffTime === Number.MAX_SAFE_INTEGER ? Number.POSITIVE_INFINITY : cutoffTime + 1;
    return series.store.getRangeByTime(Number.NEGATIVE_INFINITY, effectiveTo);
  }

  private invalidateTimes(): void {
    this.timesCache = null;
    this.timesSetCache = null;
  }
}

function isCandle(value: SeriesPoint): value is Candle {
  return "open" in value && "high" in value && "low" in value && "close" in value;
}

function isCandleData(data: SeriesData): data is readonly Candle[] {
  const first = data[0];
  return first !== undefined && isCandle(first);
}

function upperBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((values[middle] ?? Number.POSITIVE_INFINITY) <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

