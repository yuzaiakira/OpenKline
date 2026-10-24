import type { Candle } from "../types.js";
import type { IndicatorPoint, IndicatorResult, IndicatorValue } from "./types.js";

export function point(time: number, value: IndicatorValue): IndicatorPoint {
  return { time, value };
}

export function output(
  indicatorId: string,
  parameters: Record<string, unknown>,
  id: string,
  title: string,
  kind: "line" | "histogram" | "band",
  points: readonly IndicatorPoint[],
): IndicatorResult {
  return {
    indicatorId,
    parameters: { ...parameters },
    outputs: [{ id, title, kind, points: [...points] }],
  };
}

export function multiOutput(
  indicatorId: string,
  parameters: Record<string, unknown>,
  outputs: IndicatorResult["outputs"],
): IndicatorResult {
  return { indicatorId, parameters: { ...parameters }, outputs: [...outputs] };
}

export function smaValues(values: readonly number[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index] ?? 0;
    if (index >= period) sum -= values[index - period] ?? 0;
    result.push(index >= period - 1 ? sum / period : null);
  }
  return result;
}

export function emaValues(values: readonly number[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  const alpha = 2 / (period + 1);
  let previous: number | undefined;
  for (let index = 0; index < values.length; index += 1) {
    if (index < period - 1) {
      result.push(null);
      continue;
    }
    const value = values[index] ?? 0;
    if (previous === undefined) {
      previous = values.slice(index - period + 1, index + 1).reduce((sum, item) => sum + item, 0) / period;
    } else {
      previous = (value - previous) * alpha + previous;
    }
    result.push(previous);
  }
  return result;
}

export function closeValues(input: readonly Candle[]): number[] {
  return input.map((candle) => candle.close);
}

export function withTimes(input: readonly Candle[], values: readonly IndicatorValue[]): IndicatorPoint[] {
  return input.map((candle, index) => point(candle.time, values[index] ?? null));
}

export function trueRangeValues(input: readonly Candle[]): number[] {
  let previousClose: number | undefined;
  return input.map((candle) => {
    const range = previousClose === undefined
      ? candle.high - candle.low
      : Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose));
    previousClose = candle.close;
    return range;
  });
}

export function wilderValues(values: readonly number[], period: number): IndicatorValue[] {
  const result: IndicatorValue[] = [];
  let previous: number | undefined;
  for (let index = 0; index < values.length; index += 1) {
    if (index < period - 1) {
      result.push(null);
      continue;
    }
    const value = values[index] ?? 0;
    if (previous === undefined) {
      previous = values.slice(index - period + 1, index + 1).reduce((sum, item) => sum + item, 0) / period;
    } else {
      previous = (previous * (period - 1) + value) / period;
    }
    result.push(previous);
  }
  return result;
}

export function parameterRecord(value: Record<string, unknown>): Record<string, unknown> {
  return { ...value };
}
