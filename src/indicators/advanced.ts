import type { Candle } from "../types.js";
import {
  emaValues,
  multiOutput,
  output,
  parameterRecord,
  point,
  trueRangeValues,
  wilderValues,
  withTimes,
} from "./math.js";
import { IndicatorValidationError, type IndicatorDefinition, type IndicatorResult } from "./types.js";

export interface RateOfChangeParameters extends Record<string, unknown> { period: number; }
export interface CciParameters extends Record<string, unknown> { period: number; constant: number; }
export interface AdxParameters extends Record<string, unknown> { period: number; }
export interface KeltnerParameters extends Record<string, unknown> { period: number; multiplier: number; }

const periodParameter = (name = "period"): { name: string; type: "integer"; required: true; min: number } => ({ name, type: "integer", required: true, min: 1 });

export const rateOfChangeDefinition: IndicatorDefinition<RateOfChangeParameters> = {
  metadata: { id: "ROC", name: "Rate of Change", version: 1, category: "momentum", description: "Percentage change between the current close and the close a fixed period ago.", parameters: [periodParameter()], outputs: [{ id: "value", title: "ROC", kind: "line" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => output("ROC", parameterRecord(parameters), "value", "ROC", "line", withTimes(input, input.map((candle, index) => {
    if (index < parameters.period) return null;
    const previous = input[index - parameters.period]?.close;
    return previous === undefined || previous === 0 ? null : (candle.close - previous) / previous * 100;
  }))),
};

export const cciDefinition: IndicatorDefinition<CciParameters> = {
  metadata: { id: "CCI", name: "Commodity Channel Index", version: 1, category: "momentum", description: "Typical-price deviation from its simple moving average using the conventional constant.", parameters: [periodParameter(), { name: "constant", type: "number", required: true, min: 0 }], outputs: [{ id: "value", title: "CCI", kind: "line" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period"), constant: readNonNegative(parameters, "constant") }),
  calculate: (input, parameters) => output("CCI", parameterRecord(parameters), "value", "CCI", "line", withTimes(input, calculateCci(input, parameters))),
};

export const williamsRDefinition: IndicatorDefinition<RateOfChangeParameters> = {
  metadata: { id: "WILLIAMS_R", name: "Williams %R", version: 1, category: "oscillator", description: "Momentum oscillator measuring the close within the rolling high-low range.", parameters: [periodParameter()], outputs: [{ id: "value", title: "Williams %R", kind: "line" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => output("WILLIAMS_R", parameterRecord(parameters), "value", "Williams %R", "line", withTimes(input, input.map((candle, index) => {
    if (index < parameters.period - 1) return null;
    const window = input.slice(index - parameters.period + 1, index + 1);
    const high = Math.max(...window.map((item) => item.high));
    const low = Math.min(...window.map((item) => item.low));
    return high === low ? 0 : (high - candle.close) / (high - low) * -100;
  }))),
};

export const obvDefinition: IndicatorDefinition<Record<string, never>> = {
  metadata: { id: "OBV", name: "On-Balance Volume", version: 1, category: "volume", description: "Cumulative volume signed by close-to-close direction; missing volume contributes zero.", parameters: [], outputs: [{ id: "value", title: "OBV", kind: "line" }] },
  validateParameters: (parameters) => {
    if (!isRecord(parameters) || Object.keys(parameters).length !== 0) throw new IndicatorValidationError("OBV does not accept parameters");
    return {};
  },
  calculate: (input) => output("OBV", {}, "value", "OBV", "line", calculateObv(input)),
};

export const mfiDefinition: IndicatorDefinition<RateOfChangeParameters> = {
  metadata: { id: "MFI", name: "Money Flow Index", version: 1, category: "volume", description: "Volume-weighted typical-price momentum with a 0–100 bounded money-flow ratio.", parameters: [periodParameter()], outputs: [{ id: "value", title: "MFI", kind: "line" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => output("MFI", parameterRecord(parameters), "value", "MFI", "line", withTimes(input, calculateMfi(input, parameters.period))),
};

export const adxDefinition: IndicatorDefinition<AdxParameters> = {
  metadata: { id: "ADX", name: "Average Directional Index", version: 1, category: "trend", description: "Wilder-smoothed trend strength with aligned +DI and -DI outputs.", parameters: [periodParameter()], outputs: [{ id: "adx", title: "ADX", kind: "line" }, { id: "plusDi", title: "+DI", kind: "line" }, { id: "minusDi", title: "-DI", kind: "line" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => calculateAdx(input, parameters),
};

export const donchianChannelsDefinition: IndicatorDefinition<RateOfChangeParameters> = {
  metadata: { id: "DONCHIAN_CHANNELS", name: "Donchian Channels", version: 1, category: "trend", overlay: true, description: "Rolling highest high, lowest low, and midpoint channel boundaries.", parameters: [periodParameter()], outputs: [{ id: "upper", title: "Upper", kind: "band", bandRole: "upper" }, { id: "middle", title: "Middle", kind: "line" }, { id: "lower", title: "Lower", kind: "band", bandRole: "lower" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => calculateDonchian(input, parameters),
};

export const keltnerChannelsDefinition: IndicatorDefinition<KeltnerParameters> = {
  metadata: { id: "KELTNER_CHANNELS", name: "Keltner Channels", version: 1, category: "volatility", overlay: true, description: "EMA close channel expanded by a Wilder ATR using the configured multiplier.", parameters: [periodParameter(), { name: "multiplier", type: "number", required: true, min: 0 }], outputs: [{ id: "upper", title: "Upper", kind: "band", bandRole: "upper" }, { id: "middle", title: "Middle", kind: "line" }, { id: "lower", title: "Lower", kind: "band", bandRole: "lower" }] },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period"), multiplier: readNonNegative(parameters, "multiplier") }),
  calculate: (input, parameters) => calculateKeltner(input, parameters),
};

export const advancedIndicatorDefinitions: readonly IndicatorDefinition[] = [rateOfChangeDefinition, cciDefinition, williamsRDefinition, obvDefinition, mfiDefinition, adxDefinition, donchianChannelsDefinition, keltnerChannelsDefinition];

function calculateCci(input: readonly Candle[], parameters: CciParameters): (number | null)[] {
  const typical = input.map((candle) => (candle.high + candle.low + candle.close) / 3);
  return typical.map((value, index) => {
    if (index < parameters.period - 1) return null;
    const window = typical.slice(index - parameters.period + 1, index + 1);
    const mean = window.reduce((sum, item) => sum + item, 0) / parameters.period;
    const deviation = window.reduce((sum, item) => sum + Math.abs(item - mean), 0) / parameters.period;
    return deviation === 0 || parameters.constant === 0 ? 0 : (value - mean) / (parameters.constant * deviation);
  });
}

function calculateObv(input: readonly Candle[]): ReturnType<typeof point>[] {
  let total = 0;
  return input.map((candle, index) => {
    const previous = input[index - 1];
    if (previous !== undefined) {
      const volume = candle.volume ?? 0;
      if (candle.close > previous.close) total += volume;
      else if (candle.close < previous.close) total -= volume;
    }
    return point(candle.time, total);
  });
}

function calculateMfi(input: readonly Candle[], period: number): (number | null)[] {
  const typical = input.map((candle) => (candle.high + candle.low + candle.close) / 3);
  const positive = input.map((candle, index) => index === 0 || typical[index]! <= typical[index - 1]! ? 0 : typical[index]! * (candle.volume ?? 0));
  const negative = input.map((candle, index) => index === 0 || typical[index]! >= typical[index - 1]! ? 0 : typical[index]! * (candle.volume ?? 0));
  return input.map((_candle, index) => {
    if (index < period - 1) return null;
    const start = index - period + 1;
    const positiveFlow = positive.slice(start, index + 1).reduce((sum, value) => sum + value, 0);
    const negativeFlow = negative.slice(start, index + 1).reduce((sum, value) => sum + value, 0);
    if (negativeFlow === 0) return positiveFlow === 0 ? 50 : 100;
    return 100 - 100 / (1 + positiveFlow / negativeFlow);
  });
}

function calculateAdx(input: readonly Candle[], parameters: AdxParameters): IndicatorResult {
  const trueRanges = trueRangeValues(input);
  const plusDirectional = input.map((candle, index) => {
    const previous = input[index - 1]; if (previous === undefined) return 0;
    const up = candle.high - previous.high; const down = previous.low - candle.low;
    return up > down && up > 0 ? up : 0;
  });
  const minusDirectional = input.map((candle, index) => {
    const previous = input[index - 1]; if (previous === undefined) return 0;
    const up = candle.high - previous.high; const down = previous.low - candle.low;
    return down > up && down > 0 ? down : 0;
  });
  const tr = wilderValues(trueRanges, parameters.period);
  const plus = wilderValues(plusDirectional, parameters.period);
  const minus = wilderValues(minusDirectional, parameters.period);
  const plusDi = input.map((_candle, index) => { const range = tr[index]; return range === null || range === undefined || range === 0 || plus[index] === null || plus[index] === undefined ? null : plus[index]! / range * 100; });
  const minusDi = input.map((_candle, index) => { const range = tr[index]; return range === null || range === undefined || range === 0 || minus[index] === null || minus[index] === undefined ? null : minus[index]! / range * 100; });
  const dx = input.map((_candle, index) => { const positive = plusDi[index]; const negative = minusDi[index]; if (positive === null || positive === undefined || negative === null || negative === undefined) return null; const total = positive + negative; return total === 0 ? 0 : Math.abs(positive - negative) / total * 100; });
  return multiOutput("ADX", parameterRecord(parameters), [
    { id: "adx", title: "ADX", kind: "line", points: withTimes(input, wilderNullable(dx, parameters.period)) },
    { id: "plusDi", title: "+DI", kind: "line", points: withTimes(input, plusDi) },
    { id: "minusDi", title: "-DI", kind: "line", points: withTimes(input, minusDi) },
  ]);
}

function calculateDonchian(input: readonly Candle[], parameters: RateOfChangeParameters): IndicatorResult {
  const upper: (number | null)[] = []; const middle: (number | null)[] = []; const lower: (number | null)[] = [];
  input.forEach((_candle, index) => {
    if (index < parameters.period - 1) { upper.push(null); middle.push(null); lower.push(null); return; }
    const window = input.slice(index - parameters.period + 1, index + 1); const high = Math.max(...window.map((item) => item.high)); const low = Math.min(...window.map((item) => item.low));
    upper.push(high); lower.push(low); middle.push((high + low) / 2);
  });
  return multiOutput("DONCHIAN_CHANNELS", parameterRecord(parameters), [
    { id: "upper", title: "Upper", kind: "band", bandRole: "upper", points: withTimes(input, upper) },
    { id: "middle", title: "Middle", kind: "line", points: withTimes(input, middle) },
    { id: "lower", title: "Lower", kind: "band", bandRole: "lower", points: withTimes(input, lower) },
  ]);
}

function calculateKeltner(input: readonly Candle[], parameters: KeltnerParameters): IndicatorResult {
  const middle = emaValues(input.map((candle) => candle.close), parameters.period); const atr = wilderValues(trueRangeValues(input), parameters.period);
  const upper = middle.map((value, index) => value === null || atr[index] === null ? null : value + parameters.multiplier * (atr[index] ?? 0));
  const lower = middle.map((value, index) => value === null || atr[index] === null ? null : value - parameters.multiplier * (atr[index] ?? 0));
  return multiOutput("KELTNER_CHANNELS", parameterRecord(parameters), [
    { id: "upper", title: "Upper", kind: "band", bandRole: "upper", points: withTimes(input, upper) },
    { id: "middle", title: "Middle", kind: "line", points: withTimes(input, middle) },
    { id: "lower", title: "Lower", kind: "band", bandRole: "lower", points: withTimes(input, lower) },
  ]);
}

function wilderNullable(values: readonly (number | null)[], period: number): (number | null)[] {
  const result = values.map(() => null as number | null); let count = 0; let sum = 0; let previous: number | null = null;
  values.forEach((value, index) => {
    if (value === null) return; count += 1;
    if (count < period) { sum += value; return; }
    if (count === period) { sum += value; previous = sum / period; } else if (previous !== null) previous = (previous * (period - 1) + value) / period;
    result[index] = previous;
  });
  return result;
}

function readInteger(parameters: unknown, name: string): number {
  if (!isRecord(parameters) || !Number.isInteger(parameters[name]) || (parameters[name] as number) < 1) throw new IndicatorValidationError(`${name} must be a positive integer`);
  return parameters[name] as number;
}

function readNonNegative(parameters: unknown, name: string): number {
  if (!isRecord(parameters) || typeof parameters[name] !== "number" || !Number.isFinite(parameters[name]) || (parameters[name] as number) < 0) throw new IndicatorValidationError(`${name} must be a finite non-negative number`);
  return parameters[name] as number;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
