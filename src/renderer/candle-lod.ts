import { TimeScale } from "../core/scales.js";
import type { Candle } from "../types.js";

export interface CandleRenderPoint {
  readonly candle: Candle;
  readonly x: number;
}

interface CandleRenderBucket {
  readonly first: Candle;
  last: Candle;
  high: number;
  low: number;
  volume: number;
  hasVolume: boolean;
}

export interface CandleRenderPane {
  readonly left: number;
  readonly right: number;
}

/**
 * Build display-only candle aggregates when several source bars occupy one
 * CSS-pixel column. The source series is never changed: interaction, tooltips,
 * indicators, and scale calculations continue to consume the original data.
 */
export function prepareCandleRenderPoints(
  candles: readonly Candle[],
  timeScale: TimeScale,
  pane: CandleRenderPane,
  applyLod = true,
): CandleRenderPoint[] {
  const xs = candles.map((candle) => timeScale.xForTime(candle.time));
  const pixelColumns = Math.max(1, Math.ceil(pane.right - pane.left));
  const maxIndividualCandles = Math.max(512, pixelColumns * 2);
  if (!applyLod || candles.length <= maxIndividualCandles) {
    return candles.map((candle, index) => ({ candle, x: xs[index] ?? pane.left }));
  }

  const buckets = new Map<number, CandleRenderBucket>();
  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index]!;
    const x = xs[index] ?? pane.left;
    const column = Math.max(0, Math.min(pixelColumns - 1, Math.floor(x - pane.left)));
    const current = buckets.get(column);
    if (current === undefined) {
      buckets.set(column, {
        first: candle,
        last: candle,
        high: candle.high,
        low: candle.low,
        volume: candle.volume ?? 0,
        hasVolume: candle.volume !== undefined,
      });
      continue;
    }
    current.last = candle;
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    if (candle.volume !== undefined) {
      current.volume += candle.volume;
      current.hasVolume = true;
    }
  }

  return [...buckets.entries()].map(([column, bucket]) => ({
    candle: {
      time: bucket.first.time,
      open: bucket.first.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.last.close,
      ...(bucket.hasVolume ? { volume: bucket.volume } : {}),
    },
    x: pane.left + column + 0.5,
  }));
}
