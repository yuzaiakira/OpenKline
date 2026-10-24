import type { Candle } from "../types.js";
import {
  closeValues,
  emaValues,
  multiOutput,
  output,
  parameterRecord,
  point,
  smaValues,
  trueRangeValues,
  wilderValues,
  withTimes,
} from "./math.js";
import { IndicatorValidationError, type IndicatorDefinition, type IndicatorIncrementalContext, type IndicatorResult } from "./types.js";

export interface PeriodParameters extends Record<string, unknown> {
  period: number;
}

export interface MacdParameters extends Record<string, unknown> {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface BollingerParameters extends Record<string, unknown> {
  period: number;
  standardDeviations: number;
}

export interface StochasticParameters extends Record<string, unknown> {
  kPeriod: number;
  dPeriod: number;
}

export type VwapSession = "none" | "utc-day";

export interface VwapParameters extends Record<string, unknown> {
  session: VwapSession;
}

const periodParameter = (name = "period"): { name: string; type: "integer"; required: true; min: number } => ({
  name, type: "integer", required: true, min: 1,
});

export const smaDefinition: IndicatorDefinition<PeriodParameters> = {
  metadata: {
    id: "SMA",
    name: "Simple Moving Average",
    version: 1,
    description: "Arithmetic mean of closing prices over a fixed period.",
    parameters: [periodParameter()],
    outputs: [{ id: "value", title: "SMA", kind: "line" }],
  },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => {
    const values = smaValues(closeValues(input), parameters.period);
    return output("SMA", parameterRecord(parameters), "value", "SMA", "line", withTimes(input, values));
  },
  calculateIncremental: appendSma,
};

export const emaDefinition: IndicatorDefinition<PeriodParameters> = {
  metadata: {
    id: "EMA",
    name: "Exponential Moving Average",
    version: 1,
    description: "Exponentially weighted closing-price average.",
    parameters: [periodParameter()],
    outputs: [{ id: "value", title: "EMA", kind: "line" }],
  },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => {
    const values = emaValues(closeValues(input), parameters.period);
    return output("EMA", parameterRecord(parameters), "value", "EMA", "line", withTimes(input, values));
  },
  calculateIncremental: appendEma,
};

export const rsiDefinition: IndicatorDefinition<PeriodParameters> = {
  metadata: {
    id: "RSI",
    name: "Relative Strength Index",
    version: 1,
    description: "Wilder relative strength index of closing-price changes.",
    parameters: [periodParameter()],
    outputs: [{ id: "value", title: "RSI", kind: "line" }],
  },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => output("RSI", parameterRecord(parameters), "value", "RSI", "line", withTimes(input, rsiValues(input, parameters.period))),
};

export const macdDefinition: IndicatorDefinition<MacdParameters> = {
  metadata: {
    id: "MACD",
    name: "Moving Average Convergence Divergence",
    version: 1,
    description: "Fast EMA minus slow EMA with signal and histogram outputs.",
    parameters: [periodParameter("fastPeriod"), periodParameter("slowPeriod"), periodParameter("signalPeriod")],
    outputs: [
      { id: "macd", title: "MACD", kind: "line" },
      { id: "signal", title: "Signal", kind: "line" },
      { id: "histogram", title: "Histogram", kind: "histogram" },
    ],
  },
  validateParameters: (parameters) => {
    const fastPeriod = readInteger(parameters, "fastPeriod");
    const slowPeriod = readInteger(parameters, "slowPeriod");
    const signalPeriod = readInteger(parameters, "signalPeriod");
    if (fastPeriod >= slowPeriod) throw new IndicatorValidationError("MACD fastPeriod must be less than slowPeriod");
    return { fastPeriod, slowPeriod, signalPeriod };
  },
  calculate: (input, parameters) => calculateMacd(input, parameters),
};

export const bollingerBandsDefinition: IndicatorDefinition<BollingerParameters> = {
  metadata: {
    id: "BOLLINGER_BANDS",
    name: "Bollinger Bands",
    version: 1,
    description: "Moving average with standard-deviation upper and lower bands.",
    parameters: [periodParameter(), { name: "standardDeviations", type: "number", required: true, min: 0 }],
    outputs: [
      { id: "middle", title: "Middle", kind: "line" },
      { id: "upper", title: "Upper", kind: "band" },
      { id: "lower", title: "Lower", kind: "band" },
    ],
  },
  validateParameters: (parameters) => ({
    period: readInteger(parameters, "period"),
    standardDeviations: readNonNegative(parameters, "standardDeviations"),
  }),
  calculate: (input, parameters) => calculateBollinger(input, parameters),
};

export const atrDefinition: IndicatorDefinition<PeriodParameters> = {
  metadata: {
    id: "ATR",
    name: "Average True Range",
    version: 1,
    description: "Wilder average true range including the first bar range.",
    parameters: [periodParameter()],
    outputs: [{ id: "value", title: "ATR", kind: "line" }],
  },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  calculate: (input, parameters) => output("ATR", parameterRecord(parameters), "value", "ATR", "line", withTimes(input, wilderValues(trueRangeValues(input), parameters.period))),
};

export const stochasticDefinition: IndicatorDefinition<StochasticParameters> = {
  metadata: {
    id: "STOCHASTIC",
    name: "Stochastic Oscillator",
    version: 1,
    description: "Rolling high/low stochastic %K with a simple %D signal.",
    parameters: [periodParameter("kPeriod"), periodParameter("dPeriod")],
    outputs: [
      { id: "k", title: "%K", kind: "line" },
      { id: "d", title: "%D", kind: "line" },
    ],
  },
  validateParameters: (parameters) => ({ kPeriod: readInteger(parameters, "kPeriod"), dPeriod: readInteger(parameters, "dPeriod") }),
  calculate: (input, parameters) => calculateStochastic(input, parameters),
};

export const vwapDefinition: IndicatorDefinition<VwapParameters> = {
  metadata: {
    id: "VWAP",
    name: "Volume Weighted Average Price",
    version: 1,
    description: "Typical-price volume weighted average with explicit session reset semantics.",
    parameters: [{ name: "session", type: "enum", required: true, values: ["none", "utc-day"] }],
    outputs: [{ id: "value", title: "VWAP", kind: "line" }],
  },
  validateParameters: (parameters) => {
    if (!isRecord(parameters) || (parameters.session !== "none" && parameters.session !== "utc-day")) {
      throw new IndicatorValidationError("VWAP requires an explicit session of 'none' or 'utc-day'");
    }
    return { session: parameters.session };
  },
  calculate: (input, parameters) => calculateVwap(input, parameters),
};

export const builtInIndicatorDefinitions: readonly IndicatorDefinition[] = [
  smaDefinition,
  emaDefinition,
  rsiDefinition,
  macdDefinition,
  bollingerBandsDefinition,
  atrDefinition,
  stochasticDefinition,
  vwapDefinition,
];

function appendSma(context: IndicatorIncrementalContext<PeriodParameters>): IndicatorResult | undefined {
  const period = context.parameters.period;
  const previousPoints = context.previousResult.outputs[0]?.points;
  if (previousPoints === undefined) return undefined;
  const values = [...context.previousInput.slice(Math.max(0, context.previousInput.length - period + 1)), context.candle].map((candle) => candle.close);
  const value = values.length < period ? null : values.reduce((sum, item) => sum + item, 0) / period;
  return output("SMA", parameterRecord(context.parameters), "value", "SMA", "line", [...previousPoints, point(context.candle.time, value)]);
}

function appendEma(context: IndicatorIncrementalContext<PeriodParameters>): IndicatorResult | undefined {
  const period = context.parameters.period;
  const previousPoints = context.previousResult.outputs[0]?.points;
  if (previousPoints === undefined) return undefined;
  const index = context.previousInput.length;
  let value: number | null = null;
  if (index >= period - 1) {
    const previous = previousPoints[previousPoints.length - 1]?.value;
    if (index === period - 1) {
      value = [...context.previousInput, context.candle].slice(-period).reduce((sum, candle) => sum + candle.close, 0) / period;
    } else if (previous !== null && previous !== undefined) {
      const alpha = 2 / (period + 1);
      value = (context.candle.close - previous) * alpha + previous;
    }
  }
  return output("EMA", parameterRecord(context.parameters), "value", "EMA", "line", [...previousPoints, point(context.candle.time, value)]);
}

function rsiValues(input: readonly Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = input.map(() => null);
  if (input.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = (input[index]?.close ?? 0) - (input[index - 1]?.close ?? 0);
    if (change >= 0) gains += change;
    else losses -= change;
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  result[period] = rsiValue(averageGain, averageLoss);
  for (let index = period + 1; index < input.length; index += 1) {
    const change = (input[index]?.close ?? 0) - (input[index - 1]?.close ?? 0);
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    result[index] = rsiValue(averageGain, averageLoss);
  }
  return result;
}

function rsiValue(averageGain: number, averageLoss: number): number {
  if (averageLoss === 0) return averageGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + averageGain / averageLoss);
}

function calculateMacd(input: readonly Candle[], parameters: MacdParameters): IndicatorResult {
  const closes = closeValues(input);
  const fast = emaValues(closes, parameters.fastPeriod);
  const slow = emaValues(closes, parameters.slowPeriod);
  const macd: (number | null)[] = input.map((_, index) => {
    const fastValue = fast[index];
    const slowValue = slow[index];
    return fastValue !== undefined && fastValue !== null && slowValue !== undefined && slowValue !== null
      ? fastValue - slowValue
      : null;
  });
  const compactMacd = macd.filter((value): value is number => value !== null);
  const compactSignal = emaValues(compactMacd, parameters.signalPeriod);
  let signalIndex = 0;
  const signal = macd.map((value) => {
    if (value === null) return null;
    const next = compactSignal[signalIndex];
    signalIndex += 1;
    return next ?? null;
  });
  const histogram = macd.map((value, index) => {
    const signalValue = signal[index];
    return value !== null && signalValue !== undefined && signalValue !== null ? value - signalValue : null;
  });
  return multiOutput("MACD", parameterRecord(parameters), [
    { id: "macd", title: "MACD", kind: "line", points: withTimes(input, macd) },
    { id: "signal", title: "Signal", kind: "line", points: withTimes(input, signal) },
    { id: "histogram", title: "Histogram", kind: "histogram", points: withTimes(input, histogram) },
  ]);
}

function calculateBollinger(input: readonly Candle[], parameters: BollingerParameters): IndicatorResult {
  const closes = closeValues(input);
  const middle = smaValues(closes, parameters.period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let index = 0; index < closes.length; index += 1) {
    if (index < parameters.period - 1) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const window = closes.slice(index - parameters.period + 1, index + 1);
    const mean = middle[index] ?? 0;
    const deviation = Math.sqrt(window.reduce((sum, value) => sum + (value - mean) ** 2, 0) / parameters.period);
    upper.push(mean + parameters.standardDeviations * deviation);
    lower.push(mean - parameters.standardDeviations * deviation);
  }
  return multiOutput("BOLLINGER_BANDS", parameterRecord(parameters), [
    { id: "middle", title: "Middle", kind: "line", points: withTimes(input, middle) },
    { id: "upper", title: "Upper", kind: "band", points: withTimes(input, upper) },
    { id: "lower", title: "Lower", kind: "band", points: withTimes(input, lower) },
  ]);
}

function calculateStochastic(input: readonly Candle[], parameters: StochasticParameters): IndicatorResult {
  const kValues: (number | null)[] = input.map((_, index) => {
    if (index < parameters.kPeriod - 1) return null;
    const window = input.slice(index - parameters.kPeriod + 1, index + 1);
    const high = Math.max(...window.map((candle) => candle.high));
    const low = Math.min(...window.map((candle) => candle.low));
    const range = high - low;
    return range === 0 ? 50 : ((input[index]?.close ?? low) - low) / range * 100;
  });
  const dValues: (number | null)[] = input.map((_, index) => {
    const start = index - parameters.dPeriod + 1;
    if (start < 0) return null;
    const window = kValues.slice(start, index + 1);
    const numericValues = window.filter((value): value is number => value !== null);
    if (numericValues.length < parameters.dPeriod) return null;
    return numericValues.reduce((sum, value) => sum + value, 0) / parameters.dPeriod;
  });
  return multiOutput("STOCHASTIC", parameterRecord(parameters), [
    { id: "k", title: "%K", kind: "line", points: withTimes(input, kValues) },
    { id: "d", title: "%D", kind: "line", points: withTimes(input, dValues) },
  ]);
}

function calculateVwap(input: readonly Candle[], parameters: VwapParameters): IndicatorResult {
  let cumulativePriceVolume = 0;
  let cumulativeVolume = 0;
  let sessionKey: number | undefined;
  const points = input.map((candle) => {
    const nextSessionKey = parameters.session === "utc-day" ? utcDayKey(candle.time) : undefined;
    if (nextSessionKey !== sessionKey) {
      cumulativePriceVolume = 0;
      cumulativeVolume = 0;
      sessionKey = nextSessionKey;
    }
    if (candle.volume === undefined || candle.volume <= 0) return point(candle.time, null);
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePriceVolume += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;
    return point(candle.time, cumulativePriceVolume / cumulativeVolume);
  });
  return output("VWAP", parameterRecord(parameters), "value", "VWAP", "line", points);
}

function utcDayKey(time: number): number {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function readInteger(parameters: unknown, name: string): number {
  if (!isRecord(parameters) || !Number.isInteger(parameters[name]) || (parameters[name] as number) < 1) {
    throw new IndicatorValidationError(`${name} must be a positive integer`);
  }
  return parameters[name] as number;
}

function readNonNegative(parameters: unknown, name: string): number {
  if (!isRecord(parameters) || typeof parameters[name] !== "number" || !Number.isFinite(parameters[name]) || (parameters[name] as number) < 0) {
    throw new IndicatorValidationError(`${name} must be a finite non-negative number`);
  }
  return parameters[name] as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
