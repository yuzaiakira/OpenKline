import type { Candle, CandleSeriesType, SeriesType } from "../types.js";

export function isCandleSeriesType(type: SeriesType): type is CandleSeriesType {
  return type === "candlestick" || type === "ohlc" || type === "hollow-candlestick" || type === "heikin-ashi";
}

/**
 * Derive display-only Heikin-Ashi candles from raw OHLCV input.
 * Callers must retain the supplied raw data for indicators, persistence, and
 * financial anchors; this function never mutates either input or output state.
 */
export function toHeikinAshi(candles: readonly Candle[]): Candle[] {
  let previousOpen: number | undefined;
  let previousClose: number | undefined;
  return candles.map((candle) => {
    const close = (candle.open + candle.high + candle.low + candle.close) / 4;
    const open = previousOpen === undefined || previousClose === undefined
      ? (candle.open + candle.close) / 2
      : (previousOpen + previousClose) / 2;
    const result: Candle = {
      time: candle.time,
      open,
      high: Math.max(candle.high, open, close),
      low: Math.min(candle.low, open, close),
      close,
      ...(candle.volume === undefined ? {} : { volume: candle.volume }),
    };
    previousOpen = open;
    previousClose = close;
    return result;
  });
}
