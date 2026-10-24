import { PriceScale, TimeScale } from "../core/scales.js";
import type { VisibleChartData, VisiblePaneData } from "../core/chart-model.js";
import type { SeriesSnapshot } from "../core/series-store.js";
import type { ChartTheme, Candle, SeriesPoint } from "../types.js";
import type { DrawingRenderItem } from "../drawings/types.js";

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

export interface PaneBounds {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PlotBounds extends PaneBounds {
  volumeTop: number;
  volumeBottom: number;
}

export function getPaneBounds(width: number, height: number, panes: readonly VisiblePaneData[]): PaneBounds[] {
  const layout = panes.length === 0 ? [{ id: "main", preferredHeight: null, series: [] }] : panes;
  const left = 68;
  const right = Math.max(left + 1, width - 12);
  const top = 14;
  const bottom = Math.max(top + 1, height - 30);
  const gap = layout.length > 1 ? 8 : 0;
  const available = Math.max(1, bottom - top - gap * (layout.length - 1));
  const main = layout.find((pane) => pane.id === "main") ?? layout[0]!;
  const nonMain = layout.filter((pane) => pane.id !== main.id);
  const minimumMain = 80;
  const requestedNonMain = nonMain.reduce((sum, pane) => sum + (pane.preferredHeight ?? 140), 0);
  const scale = requestedNonMain + minimumMain > available
    ? available / Math.max(1, requestedNonMain + minimumMain)
    : 1;
  const mainHeight = scale === 1 ? Math.max(minimumMain, available - requestedNonMain) : minimumMain * scale;
  const heights = new Map<string, number>([[main.id, mainHeight]]);
  for (const pane of nonMain) heights.set(pane.id, (pane.preferredHeight ?? 140) * scale);

  const bounds: PaneBounds[] = [];
  let cursor = top;
  for (const pane of layout) {
    const paneHeight = Math.max(1, heights.get(pane.id) ?? available / layout.length);
    bounds.push({ id: pane.id, left, right, top: cursor, bottom: cursor + paneHeight });
    cursor += paneHeight + gap;
  }
  return bounds;
}

/** Backwards-compatible main/volume bounds helper for interaction consumers. */
export function getPlotBounds(width: number, height: number, hasVolume = false): PlotBounds {
  const panes: VisiblePaneData[] = [
    { id: "main", preferredHeight: null, series: [] },
    ...(hasVolume ? [{ id: "volume", preferredHeight: 120, series: [] }] : []),
  ];
  const bounds = getPaneBounds(width, height, panes);
  const main = bounds[0] ?? { id: "main", left: 68, right: width - 12, top: 14, bottom: height - 30 };
  const volume = bounds.find((pane) => pane.id === "volume");
  return { ...main, volumeTop: volume?.top ?? main.bottom, volumeBottom: volume?.bottom ?? main.bottom };
}

export class CanvasRenderer {
  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public render(
    data: VisibleChartData,
    size: RenderSize,
    theme: ChartTheme,
    options: RenderOptions,
    crosshair: { x: number; y: number } | null,
    drawings: readonly DrawingRenderItem[] = [],
    selectedDrawingId: string | null = null,
  ): void {
    const context = this.canvas.getContext("2d");
    if (context === null) throw new Error("CanvasRenderingContext2D is unavailable");
    const { width, height, devicePixelRatio } = size;
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = theme.background;
    context.fillRect(0, 0, width, height);
    if (data.times.length === 0 || width <= 0 || height <= 0) return;

    const panes = getPaneBounds(width, height, data.panes);
    const timeScale = new TimeScale(data.times, { start: panes[0]?.left ?? 68, end: panes[0]?.right ?? width - 12 });
    for (const pane of panes) {
      const paneData = data.panes.find((candidate) => candidate.id === pane.id);
      const series = paneData?.series ?? [];
      const scale = new PriceScaleForPane(series, pane);
      this.drawGrid(context, pane, scale, theme, options);
      context.save();
      context.beginPath();
      context.rect(pane.left, pane.top, pane.right - pane.left, pane.bottom - pane.top);
      context.clip();
      for (const item of series) {
        if (item.style.visible === false) continue;
        if (item.type === "candlestick") {
          this.drawCandles(context, item.data.filter(isCandle), timeScale, scale, theme, item.style);
        } else if (item.type === "line") {
          this.drawLine(context, item.data.filter(isPoint), timeScale, scale, item.style.color ?? theme.upCandle, item.style.lineWidth ?? 2);
        } else if (item.type === "area") {
          this.drawArea(context, item.data.filter(isPoint), timeScale, scale, pane, item.style.color ?? theme.upCandle, item.style.fillColor, item.style.lineWidth ?? 2);
        } else if (item.type === "volume" || item.type === "histogram") {
          this.drawHistogram(context, item.data.filter(isPoint), timeScale, scale, pane, theme, item.style);
        }
      }
      context.restore();
      if (pane.id !== panes[panes.length - 1]?.id) this.drawPaneDivider(context, pane, theme);
    }
    const mainPane = panes.find((pane) => pane.id === "main") ?? panes[0];
    const mainData = data.panes.find((pane) => pane.id === mainPane?.id);
    if (mainPane !== undefined && mainData !== undefined && drawings.length > 0) {
      const scale = new PriceScaleForPane(mainData.series, mainPane);
      const converter = {
        xForTime: (time: number) => timeScale.xForTime(time),
        yForPrice: (price: number) => scale.yForPrice(price),
        timeForX: (x: number) => timeScale.timeForX(x),
        priceForY: (y: number) => scale.priceForY(y),
      };
      this.drawDrawings(context, drawings, converter, mainPane, theme, selectedDrawingId);
    }
    const lastPane = panes[panes.length - 1];
    if (lastPane !== undefined) this.drawTimeLabels(context, data.times, timeScale, lastPane.bottom, theme, options);
    if (crosshair !== null) {
      this.drawCrosshair(context, crosshair, panes, theme);
      this.drawTooltip(context, data, timeScale, crosshair, panes, theme, options);
    }
  }

  private drawGrid(context: CanvasRenderingContext2D, pane: PaneBounds, scale: PriceScale, theme: ChartTheme, options: RenderOptions): void {
    context.strokeStyle = theme.grid;
    context.fillStyle = theme.text;
    context.lineWidth = 1;
    context.font = "12px system-ui, sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";
    for (let index = 0; index <= 3; index += 1) {
      const y = pane.top + index / 3 * (pane.bottom - pane.top);
      context.beginPath();
      context.moveTo(pane.left, y + 0.5);
      context.lineTo(pane.right, y + 0.5);
      context.stroke();
      context.fillText(scale.priceForY(y).toFixed(options.pricePrecision), pane.left - 8, y);
    }
  }

  private drawCandles(context: CanvasRenderingContext2D, candles: readonly Candle[], timeScale: TimeScale, scale: PriceScale, theme: ChartTheme, style: SeriesSnapshot["style"]): void {
    const bodyWidth = getBodyWidth(candles.map((candle) => timeScale.xForTime(candle.time)));
    for (const candle of candles) {
      const x = timeScale.xForTime(candle.time);
      const openY = scale.yForPrice(candle.open);
      const closeY = scale.yForPrice(candle.close);
      const color = candle.close >= candle.open ? style.upColor ?? theme.upCandle : style.downColor ?? theme.downCandle;
      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, scale.yForPrice(candle.high));
      context.lineTo(Math.round(x) + 0.5, scale.yForPrice(candle.low));
      context.stroke();
      context.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(1, Math.abs(closeY - openY)));
    }
  }

  private drawLine(context: CanvasRenderingContext2D, points: readonly Exclude<SeriesPoint, Candle>[], timeScale: TimeScale, scale: PriceScale, color: string, lineWidth: number): void {
    context.strokeStyle = color;
    context.lineWidth = normalizeLineWidth(lineWidth);
    context.beginPath();
    points.forEach((point, index) => {
      const x = timeScale.xForTime(point.time);
      const y = scale.yForPrice(point.value);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
  }

  private drawArea(context: CanvasRenderingContext2D, points: readonly Exclude<SeriesPoint, Candle>[], timeScale: TimeScale, scale: PriceScale, pane: PaneBounds, color: string, fillColor: string | undefined, lineWidth: number): void {
    if (points.length === 0) return;
    context.beginPath();
    points.forEach((point, index) => {
      const x = timeScale.xForTime(point.time);
      const y = scale.yForPrice(point.value);
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    const last = points[points.length - 1];
    const first = points[0];
    if (last !== undefined && first !== undefined) {
      const baseline = Math.max(pane.top, Math.min(pane.bottom, scale.yForPrice(0)));
      context.lineTo(timeScale.xForTime(last.time), baseline);
      context.lineTo(timeScale.xForTime(first.time), baseline);
      context.closePath();
      context.fillStyle = fillColor ?? color;
      context.globalAlpha = 0.2;
      context.fill();
      context.globalAlpha = 1;
    }
    this.drawLine(context, points, timeScale, scale, color, lineWidth);
  }

  private drawHistogram(context: CanvasRenderingContext2D, points: readonly Exclude<SeriesPoint, Candle>[], timeScale: TimeScale, scale: PriceScale, pane: PaneBounds, theme: ChartTheme, style: SeriesSnapshot["style"]): void {
    const bodyWidth = getBodyWidth(points.map((point) => timeScale.xForTime(point.time)));
    const baseline = Math.max(pane.top, Math.min(pane.bottom, scale.yForPrice(0)));
    for (const point of points) {
      const y = scale.yForPrice(point.value);
      const color = "color" in point && point.color !== undefined
        ? point.color
        : point.value >= 0 ? style.upColor ?? style.color ?? theme.volumeUp : style.downColor ?? style.color ?? theme.volumeDown;
      context.fillStyle = color;
      context.fillRect(timeScale.xForTime(point.time) - bodyWidth / 2, Math.min(y, baseline), bodyWidth, Math.max(1, Math.abs(y - baseline)));
    }
  }

  private drawPaneDivider(context: CanvasRenderingContext2D, pane: PaneBounds, theme: ChartTheme): void {
    context.strokeStyle = theme.border;
    context.beginPath();
    context.moveTo(pane.left, pane.bottom + 4);
    context.lineTo(pane.right, pane.bottom + 4);
    context.stroke();
  }

  private drawDrawings(
    context: CanvasRenderingContext2D,
    drawings: readonly DrawingRenderItem[],
    converter: { xForTime(time: number): number; yForPrice(price: number): number },
    pane: PaneBounds,
    theme: ChartTheme,
    selectedDrawingId: string | null,
  ): void {
    context.save();
    context.beginPath();
    context.rect(pane.left, pane.top, pane.right - pane.left, pane.bottom - pane.top);
    context.clip();
    for (const item of drawings) {
      const style = item.snapshot.style;
      const color = style.color ?? theme.crosshair;
      context.strokeStyle = color;
      context.fillStyle = style.fillColor ?? color;
      context.lineWidth = normalizeLineWidth(style.lineWidth ?? 1.5);
      context.globalAlpha = 0.9;
      for (const geometry of item.geometries) {
        if (geometry.kind === "line") {
          context.beginPath();
          context.moveTo(geometry.from.x, geometry.from.y);
          context.lineTo(geometry.to.x, geometry.to.y);
          context.stroke();
          if (geometry.label !== undefined) {
            context.fillStyle = style.textColor ?? color;
            context.font = "11px system-ui, sans-serif";
            context.textAlign = "left";
            context.textBaseline = "bottom";
            context.fillText(geometry.label, geometry.from.x + 4, geometry.from.y - 3);
          }
        } else if (geometry.kind === "rectangle") {
          context.strokeRect(geometry.left, geometry.top, geometry.width, geometry.height);
          if (style.fillColor !== undefined) {
            context.globalAlpha = 0.14;
            context.fillRect(geometry.left, geometry.top, geometry.width, geometry.height);
            context.globalAlpha = 0.9;
          }
        } else {
          context.fillStyle = style.textColor ?? color;
          context.font = "13px system-ui, sans-serif";
          context.textAlign = "left";
          context.textBaseline = "top";
          context.fillText(geometry.text, geometry.x, geometry.y);
        }
      }
      if (item.snapshot.id === selectedDrawingId) {
        context.fillStyle = style.textColor ?? color;
        for (const point of item.snapshot.points) {
          context.beginPath();
          context.arc(converter.xForTime(point.time), converter.yForPrice(point.price), 4, 0, Math.PI * 2);
          context.fill();
        }
      }
    }
    context.globalAlpha = 1;
    context.restore();
  }

  private drawTimeLabels(context: CanvasRenderingContext2D, times: readonly number[], timeScale: TimeScale, y: number, theme: ChartTheme, options: RenderOptions): void {
    context.fillStyle = theme.text;
    context.font = "12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    const labelIndexes = [0, Math.floor((times.length - 1) / 2), times.length - 1];
    const formatter = new Intl.DateTimeFormat(options.locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: options.timeZone });
    for (const index of labelIndexes) {
      const time = times[index];
      if (time !== undefined) context.fillText(formatter.format(new Date(time)), timeScale.xForTime(time), y + 8);
    }
  }

  private drawCrosshair(context: CanvasRenderingContext2D, crosshair: { x: number; y: number }, panes: readonly PaneBounds[], theme: ChartTheme): void {
    const first = panes[0];
    const last = panes[panes.length - 1];
    if (first === undefined || last === undefined) return;
    context.save();
    context.beginPath();
    context.rect(first.left, first.top, first.right - first.left, last.bottom - first.top);
    context.clip();
    context.strokeStyle = theme.crosshair;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(Math.round(crosshair.x) + 0.5, first.top);
    context.lineTo(Math.round(crosshair.x) + 0.5, last.bottom);
    const activePane = panes.find((pane) => crosshair.y >= pane.top && crosshair.y <= pane.bottom);
    if (activePane !== undefined) {
      context.moveTo(activePane.left, Math.round(crosshair.y) + 0.5);
      context.lineTo(activePane.right, Math.round(crosshair.y) + 0.5);
    }
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  private drawTooltip(context: CanvasRenderingContext2D, data: VisibleChartData, timeScale: TimeScale, crosshair: { x: number; y: number }, panes: readonly PaneBounds[], theme: ChartTheme, options: RenderOptions): void {
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
    const activePane = panes.find((pane) => crosshair.y >= pane.top && crosshair.y <= pane.bottom) ?? panes[0];
    if (activePane === undefined) return;
    const boxWidth = Math.min(240, Math.max(120, ...lines.map((line) => context.measureText(line).width + 20)));
    const boxHeight = lines.length * 16 + 12;
    const x = crosshair.x + boxWidth + 8 < activePane.right ? crosshair.x + 8 : crosshair.x - boxWidth - 8;
    const y = Math.max(activePane.top, Math.min(activePane.bottom - boxHeight, crosshair.y - boxHeight - 8));
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
  }
}

class PriceScaleForPane extends PriceScale {
  public constructor(series: readonly SeriesSnapshot[], pane: PaneBounds) {
    const range = getPaneRange(series);
    super(range.min, range.max, { start: pane.top, end: pane.bottom });
  }
}

export function getPriceRange(series: readonly SeriesSnapshot[]): { min: number; max: number } {
  return getPaneRange(series.filter((item) => item.type !== "volume"));
}

export function getPaneScaleRange(series: readonly SeriesSnapshot[]): { min: number; max: number } {
  return getPaneRange(series);
}

function getPaneRange(series: readonly SeriesSnapshot[]): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const item of series) {
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
  if (min === max) return { min: min - 0.5, max: max + 0.5 };
  return { min, max };
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
