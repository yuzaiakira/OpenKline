import { PriceScale, TimeScale } from "../core/scales.js";
import type { VisibleChartData } from "../core/chart-model.js";
import type { SeriesSnapshot } from "../core/series-store.js";
import type { ChartTheme, Candle, SeriesPoint } from "../types.js";

export interface RenderSize {
  width: number;
  height: number;
  devicePixelRatio: number;
}
export interface RenderOptions {
  locale: string;
  timeZone: string;
  pricePrecision: number;
}

export interface PlotBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  volumeTop: number;
  volumeBottom: number;
}

export function getPlotBounds(width: number, height: number, hasVolume = false): PlotBounds {
  const left = 68;
  const right = Math.max(left + 1, width - 12);
  const top = 14;
  const bottom = Math.max(top + 1, height - 30);
  const volumeTop = hasVolume ? top + Math.max(1, (bottom - top) * 0.78) : bottom;
  return {
    left,
    right,
    top,
    bottom: hasVolume ? Math.max(top + 1, volumeTop - 8) : bottom,
    volumeTop,
    volumeBottom: bottom,
  };
}

export class CanvasRenderer {
  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public render(
    data: VisibleChartData,
    size: RenderSize,
    theme: ChartTheme,
    options: RenderOptions,
    crosshair: { x: number; y: number } | null,
  ): void {
    const context = this.canvas.getContext("2d");
    if (context === null) {
      throw new Error("CanvasRenderingContext2D is unavailable");
    }

    const { width, height, devicePixelRatio } = size;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.background;
    context.fillRect(0, 0, width, height);

    if (data.times.length === 0 || width <= 0 || height <= 0) {
      return;
    }

    const hasVolume = data.series.some((series) => series.type === "volume");
    const layout = getPlotBounds(width, height, hasVolume);
    const timeScale = new TimeScale(data.times, { start: layout.left, end: layout.right });
    const prices = getPriceRange(data.series);
    const priceScale = new PriceScale(prices.min, prices.max, { start: layout.top, end: layout.bottom });

    this.drawGrid(context, layout.left, layout.right, layout.top, layout.bottom, priceScale, theme, options);
    context.save();
    context.beginPath();
    context.rect(layout.left, layout.top, layout.right - layout.left, layout.bottom - layout.top);
    context.clip();
    for (const series of data.series) {
      if (series.style.visible === false) {
        continue;
      }
      if (series.type === "candlestick") {
        this.drawCandles(context, series.data.filter(isCandle), timeScale, priceScale, theme, series.style);
      } else if (series.type === "line") {
        this.drawLine(context, series.data.filter(isPoint), timeScale, priceScale, series.style.color ?? theme.upCandle, series.style.lineWidth ?? 2);
      } else if (series.type === "area") {
        this.drawArea(context, series.data.filter(isPoint), timeScale, priceScale, layout.bottom, series.style.color ?? theme.upCandle, series.style.fillColor, series.style.lineWidth ?? 2);
      }
    }
    context.restore();

    if (hasVolume) {
      const volumeMax = getVolumeMax(data.series);
      const volumeScale = new PriceScale(0, Math.max(volumeMax, 1), { start: layout.volumeTop, end: layout.volumeBottom }, 0);
      context.save();
      context.beginPath();
      context.rect(layout.left, layout.volumeTop, layout.right - layout.left, layout.volumeBottom - layout.volumeTop);
      context.clip();
      for (const series of data.series) {
        if (series.type === "volume" && series.style.visible !== false) {
          this.drawVolume(context, series.data.filter(isPoint), timeScale, volumeScale, theme, series.style);
        }
      }
      context.restore();
      this.drawVolumeDivider(context, layout, theme);
    }

    this.drawTimeLabels(context, data.times, timeScale, layout.volumeBottom, theme, options);
    if (crosshair !== null) {
      this.drawCrosshair(context, crosshair, layout.left, layout.right, layout.top, layout.volumeBottom, theme);
      this.drawTooltip(context, data, timeScale, priceScale, crosshair, layout, theme, options);
    }
  }

  private drawGrid(
    context: CanvasRenderingContext2D,
    left: number,
    right: number,
    top: number,
    bottom: number,
    priceScale: PriceScale,
    theme: ChartTheme,
    options: RenderOptions,
  ): void {
    context.strokeStyle = theme.grid;
    context.fillStyle = theme.text;
    context.lineWidth = 1;
    context.font = "12px system-ui, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let index = 0; index <= 4; index += 1) {
      const ratio = index / 4;
      const y = top + ratio * (bottom - top);
      context.beginPath();
      context.moveTo(left, y + 0.5);
      context.lineTo(right, y + 0.5);
      context.stroke();
      context.fillText(priceScale.priceForY(y).toFixed(options.pricePrecision), left - 8, y);
    }
  }

  private drawCandles(
    context: CanvasRenderingContext2D,
    candles: readonly Candle[],
    timeScale: TimeScale,
    priceScale: PriceScale,
    theme: ChartTheme,
    style: SeriesSnapshot["style"],
  ): void {
    const bodyWidth = getBodyWidth(candles.map((candle) => timeScale.xForTime(candle.time)));
    for (const candle of candles) {
      const x = timeScale.xForTime(candle.time);
      const openY = priceScale.yForPrice(candle.open);
      const closeY = priceScale.yForPrice(candle.close);
      const color = candle.close >= candle.open
        ? style.upColor ?? theme.upCandle
        : style.downColor ?? theme.downCandle;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, priceScale.yForPrice(candle.high));
      context.lineTo(Math.round(x) + 0.5, priceScale.yForPrice(candle.low));
      context.stroke();
      context.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(1, Math.abs(closeY - openY)));
    }
  }

  private drawLine(
    context: CanvasRenderingContext2D,
    points: readonly Exclude<SeriesPoint, Candle>[],
    timeScale: TimeScale,
    priceScale: PriceScale,
    color: string,
    lineWidth: number,
  ): void {
    context.strokeStyle = color;
    context.lineWidth = normalizeLineWidth(lineWidth);
    context.beginPath();
    points.forEach((point, index) => {
      const x = timeScale.xForTime(point.time);
      const y = priceScale.yForPrice(point.value);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.stroke();
  }

  private drawArea(
    context: CanvasRenderingContext2D,
    points: readonly Exclude<SeriesPoint, Candle>[],
    timeScale: TimeScale,
    priceScale: PriceScale,
    baseline: number,
    color: string,
    fillColor: string | undefined,
    lineWidth: number,
  ): void {
    if (points.length === 0) return;
    context.beginPath();
    points.forEach((point, index) => {
      const x = timeScale.xForTime(point.time);
      const y = priceScale.yForPrice(point.value);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    const last = points[points.length - 1];
    const first = points[0];
    if (last !== undefined && first !== undefined) {
      context.lineTo(timeScale.xForTime(last.time), baseline);
      context.lineTo(timeScale.xForTime(first.time), baseline);
      context.closePath();
      context.fillStyle = fillColor ?? color;
      context.globalAlpha = 0.2;
      context.fill();
      context.globalAlpha = 1;
    }
    this.drawLine(context, points, timeScale, priceScale, color, lineWidth);
  }

  private drawVolume(
    context: CanvasRenderingContext2D,
    points: readonly Exclude<SeriesPoint, Candle>[],
    timeScale: TimeScale,
    volumeScale: PriceScale,
    theme: ChartTheme,
    style: SeriesSnapshot["style"],
  ): void {
    const bodyWidth = getBodyWidth(points.map((point) => timeScale.xForTime(point.time)));
    for (const point of points) {
      const volumePoint = point as { time: number; value: number; color?: string };
      const x = timeScale.xForTime(point.time);
      context.fillStyle = volumePoint.color ?? style.color ?? theme.volumeUp;
      const y = volumeScale.yForPrice(point.value);
      context.fillRect(x - bodyWidth / 2, y, bodyWidth, volumeScale.yForPrice(0) - y);
    }
  }

  private drawVolumeDivider(context: CanvasRenderingContext2D, layout: PlotBounds, theme: ChartTheme): void {
    context.strokeStyle = theme.border;
    context.beginPath();
    context.moveTo(layout.left, layout.volumeTop - 4);
    context.lineTo(layout.right, layout.volumeTop - 4);
    context.stroke();
  }

  private drawTimeLabels(
    context: CanvasRenderingContext2D,
    times: readonly number[],
    timeScale: TimeScale,
    y: number,
    theme: ChartTheme,
    options: RenderOptions,
  ): void {
    context.fillStyle = theme.text;
    context.font = "12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    const labelIndexes = [0, Math.floor((times.length - 1) / 2), times.length - 1];
    const formatter = new Intl.DateTimeFormat(options.locale, {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: options.timeZone,
    });
    for (const index of labelIndexes) {
      const time = times[index];
      if (time !== undefined) context.fillText(formatter.format(new Date(time)), timeScale.xForTime(time), y + 8);
    }
  }

  private drawCrosshair(
    context: CanvasRenderingContext2D,
    crosshair: { x: number; y: number },
    left: number,
    right: number,
    top: number,
    bottom: number,
    theme: ChartTheme,
  ): void {
    context.save();
    context.beginPath();
    context.rect(left, top, right - left, bottom - top);
    context.clip();
    context.strokeStyle = theme.crosshair;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(Math.round(crosshair.x) + 0.5, top);
    context.lineTo(Math.round(crosshair.x) + 0.5, bottom);
    context.moveTo(left, Math.round(crosshair.y) + 0.5);
    context.lineTo(right, Math.round(crosshair.y) + 0.5);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  private drawTooltip(
    context: CanvasRenderingContext2D,
    data: VisibleChartData,
    timeScale: TimeScale,
    priceScale: PriceScale,
    crosshair: { x: number; y: number },
    layout: PlotBounds,
    theme: ChartTheme,
    options: RenderOptions,
  ): void {
    const time = nearestTime(data.times, timeScale.timeForX(crosshair.x));
    if (time === null) return;
    const formatter = new Intl.DateTimeFormat(options.locale, { dateStyle: "short", timeStyle: "short", timeZone: options.timeZone });
    const lines = [formatter.format(new Date(time))];
    for (const series of data.series) {
      const value = series.data.find((point) => point.time === time);
      if (value === undefined) continue;
      const text = isCandle(value) ? value.close.toFixed(options.pricePrecision) : value.value.toFixed(options.pricePrecision);
      lines.push(`${series.title ?? series.id}: ${text}`);
    }
    const boxWidth = Math.min(220, Math.max(120, ...lines.map((line) => context.measureText(line).width + 20)));
    const boxHeight = lines.length * 16 + 12;
    const x = crosshair.x + boxWidth + 8 < layout.right ? crosshair.x + 8 : crosshair.x - boxWidth - 8;
    const y = Math.max(layout.top, Math.min(layout.bottom - boxHeight, crosshair.y - boxHeight - 8));
    context.fillStyle = theme.background;
    context.globalAlpha = 0.94;
    context.fillRect(x, y, boxWidth, boxHeight);
    context.globalAlpha = 1;
    context.strokeStyle = theme.border;
    context.strokeRect(x, y, boxWidth, boxHeight);
    context.fillStyle = theme.text;
    context.textAlign = "left";
    context.textBaseline = "top";
    lines.forEach((line, index) => context.fillText(line, x + 8, y + 6 + index * 16));
    // Keep the price scale referenced here so future tooltip extensions can use
    // the exact plotted coordinate without creating a second transform.
    void priceScale;
  }
}

export function getPriceRange(series: readonly SeriesSnapshot[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of series) {
    if (item.type === "volume") continue;
    for (const point of item.data) {
      if (isCandle(point)) {
        min = Math.min(min, point.low);
        max = Math.max(max, point.high);
      } else {
        min = Math.min(min, point.value);
        max = Math.max(max, point.value);
      }
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1 };
  return { min, max };
}

function getVolumeMax(series: readonly SeriesSnapshot[]): number {
  let max = 0;
  for (const item of series) {
    if (item.type === "volume") {
      for (const point of item.data) {
        if (!isCandle(point)) max = Math.max(max, point.value);
      }
    }
  }
  return max;
}

function getBodyWidth(xs: readonly number[]): number {
  let spacing = 12;
  if (xs.length > 1) {
    spacing = Number.POSITIVE_INFINITY;
    for (let index = 1; index < xs.length; index += 1) {
      const current = xs[index];
      const previous = xs[index - 1];
      if (current !== undefined && previous !== undefined) spacing = Math.min(spacing, Math.abs(current - previous));
    }
    if (!Number.isFinite(spacing)) spacing = 12;
  }
  return Math.max(1, Math.min(18, spacing * 0.7));
}

function normalizeLineWidth(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(8, value)) : 2;
}

function isCandle(point: SeriesPoint): point is Candle {
  return "open" in point && "high" in point && "low" in point && "close" in point;
}

function isPoint(point: SeriesPoint): point is Exclude<SeriesPoint, Candle> {
  return !isCandle(point);
}

function nearestTime(times: readonly number[], target: number): number | null {
  if (times.length === 0 || !Number.isFinite(target)) return null;
  return times.reduce((nearest, time) => Math.abs(time - target) < Math.abs(nearest - target) ? time : nearest, times[0] ?? target);
}

