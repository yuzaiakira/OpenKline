import type { Candle } from "../types.js";

export class CandleValidationError extends Error {
  public readonly index: number;

  public constructor(index: number, reason: string) {
    super(`Invalid candle at index ${index}: ${reason}`);
    this.name = "CandleValidationError";
    this.index = index;
  }
}

export function validateCandle(candle: Candle, index = 0): void {
  if (!Number.isFinite(candle.time) || candle.time < 0 || !Number.isInteger(candle.time)) {
    throw new CandleValidationError(index, "time must be a non-negative integer in milliseconds");
  }

  if (
    !Number.isFinite(candle.open)
    || !Number.isFinite(candle.high)
    || !Number.isFinite(candle.low)
    || !Number.isFinite(candle.close)
  ) {
    throw new CandleValidationError(index, "OHLC values must be finite numbers");
  }

  if (candle.high < Math.max(candle.open, candle.close)) {
    throw new CandleValidationError(index, "high must be greater than or equal to open and close");
  }

  if (candle.low > Math.min(candle.open, candle.close)) {
    throw new CandleValidationError(index, "low must be less than or equal to open and close");
  }

  if (candle.volume !== undefined && (!Number.isFinite(candle.volume) || candle.volume < 0)) {
    throw new CandleValidationError(index, "volume must be a finite, non-negative number");
  }
}

export function validateCandles(candles: readonly Candle[]): void {
  let previousTime: number | undefined;
  candles.forEach((candle, index) => {
    validateCandle(candle, index);
    if (previousTime !== undefined && candle.time <= previousTime) {
      throw new CandleValidationError(index, "timestamps must be strictly increasing");
    }
    previousTime = candle.time;
  });
}

export class CandleStore {
  private candles: Candle[] = [];

  public setData(candles: readonly Candle[]): void {
    validateCandles(candles);
    this.candles = candles.map((candle) => ({ ...candle }));
  }

  public update(candle: Candle): void {
    validateCandle(candle, this.candles.length);
    const index = this.findInsertionIndex(candle.time);
    const current = this.candles[index];

    if (current !== undefined && current.time === candle.time) {
      this.candles[index] = { ...candle };
      return;
    }

    this.candles.splice(index, 0, { ...candle });
  }

  public get length(): number {
    return this.candles.length;
  }

  public getAll(): Candle[] {
    return this.candles.map((candle) => ({ ...candle }));
  }

  public getRange(from: number, to: number): Candle[] {
    return this.candles.slice(from, to).map((candle) => ({ ...candle }));
  }

  private findInsertionIndex(time: number): number {
    let low = 0;
    let high = this.candles.length;

    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const middleCandle = this.candles[middle];
      if (middleCandle === undefined || middleCandle.time >= time) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }

    return low;
  }
}
