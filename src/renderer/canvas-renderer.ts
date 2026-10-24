import { PriceScale, TimeScale, getCandlePriceRange } from "../core/scales.js";
import type { ChartTheme, Candle } from "../types.js";
import type { VisibleCandleData } from "../core/chart-model.js";

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
}

export function getPlotBounds(width: number, height: number): PlotBounds {
  const left = 68;
  const right = 12;
  const top = 14;
  const bottom = 30;
  return {
    left,
    right: Math.max(left + 1, width - right),
    top,
    bottom: Math.max(top + 1, height - bottom),
  };
}

export class CanvasRenderer {
  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public render(
    data: VisibleCandleData,
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

    if (data.candles.length === 0 || width <= 0 || height <= 0) {
      return;
    }

    const layout = getPlotBounds(width, height);
    const plotRight = layout.right;
    const plotBottom = layout.bottom;
    const prices = getCandlePriceRange(data.candles);
    const priceScale = new PriceScale(prices.min, prices.max, { start: layout.top, end: plotBottom });
    const timeScale = new TimeScale(
      data.candles.map((candle) => candle.time),
      { start: layout.left, end: plotRight },
    );

    this.drawGrid(context, layout.left, plotRight, layout.top, plotBottom, priceScale, theme, options);
    context.save();
    context.beginPath();
    context.rect(layout.left, layout.top, plotRight - layout.left, plotBottom - layout.top);
    context.clip();
    this.drawCandles(context, data.candles, timeScale, priceScale, theme);
    context.restore();
    this.drawTimeLabels(context, data.candles, timeScale, plotBottom, theme, options);

    if (crosshair !== null) {
      this.drawCrosshair(context, crosshair, layout.left, plotRight, layout.top, plotBottom, theme);
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
      const price = priceScale.priceForY(y).toFixed(options.pricePrecision);
      context.fillText(price, left - 8, y);
    }
  }

  private drawCandles(
    context: CanvasRenderingContext2D,
    candles: readonly Candle[],
    timeScale: TimeScale,
    priceScale: PriceScale,
    theme: ChartTheme,
  ): void {
    let candleSpacing = 12;
    if (candles.length > 1) {
      candleSpacing = Number.POSITIVE_INFINITY;
      for (let index = 1; index < candles.length; index += 1) {
        const current = candles[index];
        const previous = candles[index - 1];
        if (current !== undefined && previous !== undefined) {
          candleSpacing = Math.min(
            candleSpacing,
            Math.abs(timeScale.xForTime(current.time) - timeScale.xForTime(previous.time)),
          );
        }
      }
      if (!Number.isFinite(candleSpacing)) {
        candleSpacing = 12;
      }
    }
    const bodyWidth = Math.max(1, Math.min(18, candleSpacing * 0.7));

    for (const candle of candles) {
      const x = timeScale.xForTime(candle.time);
      const openY = priceScale.yForPrice(candle.open);
      const closeY = priceScale.yForPrice(candle.close);
      const highY = priceScale.yForPrice(candle.high);
      const lowY = priceScale.yForPrice(candle.low);
      const color = candle.close >= candle.open ? theme.upCandle : theme.downCandle;

      context.strokeStyle = color;
      context.fillStyle = color;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, highY);
      context.lineTo(Math.round(x) + 0.5, lowY);
      context.stroke();

      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(1, Math.abs(closeY - openY));
      context.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    }
  }

  private drawTimeLabels(
    context: CanvasRenderingContext2D,
    candles: readonly Candle[],
    timeScale: TimeScale,
    y: number,
    theme: ChartTheme,
    options: RenderOptions,
  ): void {
    context.fillStyle = theme.text;
    context.font = "12px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    const labelIndexes = [0, Math.floor((candles.length - 1) / 2), candles.length - 1];
    const formatter = new Intl.DateTimeFormat(options.locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: options.timeZone,
    });

    for (const index of labelIndexes) {
      const candle = candles[index];
      if (candle === undefined) {
        continue;
      }
      context.fillText(formatter.format(new Date(candle.time)), timeScale.xForTime(candle.time), y + 8);
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
}
