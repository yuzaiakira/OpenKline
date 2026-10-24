import { ChartModel } from "./core/chart-model.js";
import { PriceScale, TimeScale } from "./core/scales.js";
import { CanvasRenderer, getPlotBounds, getPriceRange } from "./renderer/canvas-renderer.js";
import type { SeriesData } from "./core/series-store.js";
import type { Datafeed, GetBarsQuery } from "./types.js";
import type {
  Candle,
  AreaPoint,
  ChartEventHandler,
  ChartEventName,
  ChartEvents,
  ChartOptions,
  ChartTheme,
  CrosshairMoveEvent,
  LinePoint,
  SeriesApi,
  SeriesOptions,
  SeriesPoint,
  SeriesType,
  VolumePoint,
} from "./types.js";

const LIGHT_THEME: ChartTheme = {
  background: "#ffffff",
  text: "#52606d",
  grid: "#e6eaf0",
  border: "#d9e0e8",
  upCandle: "#16a34a",
  downCandle: "#dc2626",
  crosshair: "#64748b",
  volumeUp: "#16a34a",
  volumeDown: "#dc2626",
};

const DARK_THEME: ChartTheme = {
  background: "#111827",
  text: "#aab7c4",
  grid: "#263244",
  border: "#334155",
  upCandle: "#22c55e",
  downCandle: "#ef4444",
  crosshair: "#94a3b8",
  volumeUp: "#22c55e",
  volumeDown: "#ef4444",
};

export class Chart {
  private readonly canvas: HTMLCanvasElement;
  private readonly model = new ChartModel();
  private readonly renderer: CanvasRenderer;
  private readonly listeners = new Map<ChartEventName, Set<ChartEventHandler<ChartEventName>>>();
  private readonly resizeObserver: ResizeObserver | null;
  private theme: ChartTheme;
  private locale: string;
  private timeZone: string;
  private pricePrecision: number;
  private width: number;
  private height: number;
  private devicePixelRatio = 1;
  private crosshair: { x: number; y: number } | null = null;
  private dragging = false;
  private lastPointerX = 0;
  private datafeedCleanup: (() => void) | null = null;
  private datafeedRequestId = 0;
  private destroyed = false;

  public constructor(private readonly container: HTMLElement, options: ChartOptions = {}) {
    this.theme = resolveTheme(options.theme);
    this.locale = options.locale ?? "en-US";
    this.timeZone = options.timeZone ?? "UTC";
    this.pricePrecision = normalizePricePrecision(options.pricePrecision ?? 2);
    this.width = options.width ?? container.clientWidth;
    this.height = options.height ?? container.clientHeight;

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.canvas.setAttribute("aria-label", "Financial price chart");
    this.canvas.tabIndex = 0;
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.container.appendChild(this.canvas);
    this.renderer = new CanvasRenderer(this.canvas);

    this.attachInteractions();
    this.resize(this.width, this.height);

    this.resizeObserver = options.autoSize === false || typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry !== undefined) {
            this.resize(entry.contentRect.width, entry.contentRect.height);
          }
        });
    this.resizeObserver?.observe(this.container);
  }

  public setData(candles: readonly Candle[]): void {
    this.assertAlive();
    this.model.setData(candles);
    this.render();
  }

  public update(candle: Candle): void {
    this.assertAlive();
    this.model.update(candle);
    this.render();
  }

  public addCandlestickSeries(options: SeriesOptions = {}): SeriesApi<Candle> {
    return this.createSeriesApi("candlestick", options);
  }

  public addLineSeries(options: SeriesOptions = {}): SeriesApi<LinePoint> {
    return this.createSeriesApi("line", options);
  }

  public addAreaSeries(options: SeriesOptions = {}): SeriesApi<AreaPoint> {
    return this.createSeriesApi("area", options);
  }

  public addVolumeSeries(options: SeriesOptions = {}): SeriesApi<VolumePoint> {
    return this.createSeriesApi("volume", options);
  }

  public removeSeries(id: string): void {
    this.assertAlive();
    this.model.removeSeries(id);
    this.render();
  }

  /** Return the IDs of all live series in insertion order. */
  public getSeriesIds(): string[] {
    this.assertAlive();
    return this.model.getSeriesIds();
  }

  /** Load historical bars and optionally subscribe to future bar updates. */
  public async setDatafeed(datafeed: Datafeed, query: GetBarsQuery): Promise<void> {
    this.assertAlive();
    this.stopDatafeed();
    const requestId = this.datafeedRequestId;
    try {
      const bars = await datafeed.getBars(query);
      if (this.destroyed || requestId !== this.datafeedRequestId) {
        return;
      }
      this.setData(bars);
      if (datafeed.subscribeBars !== undefined) {
        this.datafeedCleanup = datafeed.subscribeBars({
          symbol: query.symbol,
          timeframe: query.timeframe,
          onBar: (bar) => this.update(bar),
          onError: (error) => this.emit("datafeedError", error),
        });
      }
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      if (this.destroyed || requestId !== this.datafeedRequestId) {
        return;
      }
      this.emit("datafeedError", normalized);
      throw normalized;
    }
  }

  /** Stop any active datafeed subscription. */
  public stopDatafeed(): void {
    this.datafeedRequestId += 1;
    this.datafeedCleanup?.();
    this.datafeedCleanup = null;
  }

  public resize(width: number, height: number): void {
    this.assertAlive();
    this.width = Math.max(0, Math.floor(width));
    this.height = Math.max(0, Math.floor(height));
    this.devicePixelRatio = typeof window === "undefined" ? 1 : Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.floor(this.width * this.devicePixelRatio));
    const pixelHeight = Math.max(1, Math.floor(this.height * this.devicePixelRatio));
    if (this.canvas.width !== pixelWidth) {
      this.canvas.width = pixelWidth;
    }
    if (this.canvas.height !== pixelHeight) {
      this.canvas.height = pixelHeight;
    }
    this.model.resize(this.width);
    this.render();
  }

  public setOptions(options: ChartOptions): void {
    this.assertAlive();
    if (options.theme !== undefined) {
      this.theme = resolveTheme(options.theme);
    }
    if (options.locale !== undefined) {
      this.locale = options.locale;
    }
    if (options.timeZone !== undefined) {
      this.timeZone = options.timeZone;
    }
    if (options.pricePrecision !== undefined) {
      this.pricePrecision = normalizePricePrecision(options.pricePrecision);
    }
    if (options.width !== undefined || options.height !== undefined) {
      this.resize(options.width ?? this.width, options.height ?? this.height);
      return;
    }
    this.render();
  }

  /** Return the current visible bar indexes for interaction and diagnostics. */
  public getVisibleRange(): { from: number; to: number } {
    this.assertAlive();
    const { from, to } = this.model.getVisibleData();
    return { from, to };
  }

  /** Pan the shared viewport by a number of bars and redraw. */
  public pan(deltaBars: number): void {
    this.assertAlive();
    this.model.pan(deltaBars);
    this.render();
  }

  /** Zoom the shared viewport around an anchor ratio and redraw. */
  public zoom(scale: number, anchorRatio = 0.5): void {
    this.assertAlive();
    this.model.zoom(scale, anchorRatio);
    this.render();
  }

  /** Return a defensive copy of the currently stored candles. */
  public getData(): Candle[] {
    this.assertAlive();
    return this.model.allCandles;
  }

  public subscribe<Name extends ChartEventName>(name: Name, handler: ChartEventHandler<Name>): () => void {
    const handlers = this.listeners.get(name) ?? new Set<ChartEventHandler<ChartEventName>>();
    handlers.add(handler as ChartEventHandler<ChartEventName>);
    this.listeners.set(name, handlers);
    return () => handlers.delete(handler as ChartEventHandler<ChartEventName>);
  }

  public destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.stopDatafeed();
    this.model.destroy();
    this.resizeObserver?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerUp);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.remove();
    this.listeners.clear();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.dragging = true;
    this.lastPointerX = event.offsetX;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.dragging) {
      const delta = event.offsetX - this.lastPointerX;
      this.model.pan(-delta / Math.max(this.model.barSpacing, 1));
      this.lastPointerX = event.offsetX;
    }

    this.crosshair = { x: event.offsetX, y: event.offsetY };
    this.emitCrosshair(event.offsetX, event.offsetY);
    this.render();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
  };

  private readonly handlePointerLeave = (): void => {
    if (!this.dragging) {
      this.crosshair = null;
      this.emitCrosshair(null, null);
      this.render();
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 0.8 : 1.25;
    this.model.zoom(factor, event.offsetX / Math.max(this.width, 1));
    this.render();
  };

  private attachInteractions(): void {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
  }

  private emitCrosshair(x: number | null, y: number | null): void {
    const data = this.model.getVisibleData();
    const event: CrosshairMoveEvent = { time: null, price: null, x: x ?? 0, y: y ?? 0, series: [] };
    const hasVolume = data.series.some((series) => series.type === "volume");
    const bounds = getPlotBounds(this.width, this.height, hasVolume);
    if (
      x !== null
      && y !== null
      && x >= bounds.left
      && x <= bounds.right
      && y >= bounds.top
      && y <= bounds.bottom
      && data.series.some((series) => series.data.length > 0)
    ) {
      const prices = getPriceRange(data.series);
      const scale = new PriceScale(prices.min, prices.max, { start: bounds.top, end: bounds.bottom });
      const timeScale = new TimeScale(data.times, { start: bounds.left, end: bounds.right });
      event.time = Math.round(timeScale.timeForX(x));
      event.price = y <= bounds.bottom ? scale.priceForY(y) : null;
      const nearest = nearestTime(data.times, event.time);
      event.series = data.series.map((series) => ({
        id: series.id,
        type: series.type,
        ...(series.title === undefined ? {} : { title: series.title }),
        value: nearest === null
          ? null
          : series.data.find((point) => point.time === nearest) ?? null,
      }));
    }
    this.emit("crosshairMove", event);
  }

  private emit<Name extends ChartEventName>(name: Name, event: ChartEvents[Name]): void {
    const handlers = this.listeners.get(name);
    handlers?.forEach((handler) => handler(event as never));
  }

  private render(): void {
    this.renderer.render(
      this.model.getVisibleData(),
      { width: this.width, height: this.height, devicePixelRatio: this.devicePixelRatio },
      this.theme,
      { locale: this.locale, timeZone: this.timeZone, pricePrecision: this.pricePrecision },
      this.crosshair,
    );
  }

  private createSeriesApi<T extends SeriesPoint>(type: SeriesType, options: SeriesOptions): SeriesApi<T> {
    this.assertAlive();
    const id = this.model.addSeries(type, options);
    return {
      id,
      type,
      setData: (data) => {
        this.assertAlive();
        this.model.setSeriesData(id, data as SeriesData);
        this.render();
      },
      update: (point) => {
        this.assertAlive();
        this.model.updateSeries(id, point);
        this.render();
      },
      getData: () => {
        this.assertAlive();
        return this.model.getSeries(id).data as T[];
      },
      setStyle: (style) => {
        this.assertAlive();
        this.model.setSeriesStyle(id, style);
        this.render();
      },
      remove: () => {
        this.removeSeries(id);
      },
    };
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("Chart has been destroyed");
    }
  }
}

function normalizePricePrecision(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new RangeError("pricePrecision must be an integer between 0 and 100");
  }
  return value;
}

function resolveTheme(theme: ChartOptions["theme"]): ChartTheme {
  const base = theme === "dark" ? DARK_THEME : LIGHT_THEME;
  return typeof theme === "object" && theme !== null ? { ...base, ...theme } : { ...base };
}

function nearestTime(times: readonly number[], target: number): number | null {
  if (times.length === 0 || !Number.isFinite(target)) return null;
  return times.reduce((nearest, time) => Math.abs(time - target) < Math.abs(nearest - target) ? time : nearest, times[0] ?? target);
}

export function createChart(container: HTMLElement, options?: ChartOptions): Chart {
  return new Chart(container, options);
}
