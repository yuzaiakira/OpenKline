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
import { IndicatorValidationError, type IndicatorDefinition, type IndicatorIncrementalContext, type IndicatorResult, type IndicatorIncrementalUpdate, type IndicatorPoint } from "./types.js";

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
  incrementalInputLength: (parameters) => parameters.period,
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
  incrementalInputLength: (parameters) => parameters.period,
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
  calculateIncremental: appendRsi,
  incrementalInputLength: () => 0,
  initializeIncrementalState: initializeRsiState,
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
  calculateIncremental: appendMacd,
  incrementalInputLength: (parameters) => parameters.slowPeriod,
  initializeIncrementalState: initializeMacdState,
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
      { id: "upper", title: "Upper", kind: "band", bandRole: "upper" },
      { id: "lower", title: "Lower", kind: "band", bandRole: "lower" },
    ],
  },
  validateParameters: (parameters) => ({
    period: readInteger(parameters, "period"),
    standardDeviations: readNonNegative(parameters, "standardDeviations"),
  }),
  calculate: (input, parameters) => calculateBollinger(input, parameters),
  calculateIncremental: appendBollinger,
  incrementalInputLength: (parameters) => parameters.period,
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
  calculateIncremental: appendAtr,
  incrementalInputLength: () => 0,
  initializeIncrementalState: initializeAtrState,
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
  calculateIncremental: appendStochastic,
  incrementalInputLength: (parameters) => parameters.kPeriod,
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
  calculateIncremental: appendVwap,
  incrementalInputLength: () => 0,
  initializeIncrementalState: initializeVwapState,
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
  return output("SMA", parameterRecord(context.parameters), "value", "SMA", "line", appendIndicatorPoint(previousPoints, point(context.candle.time, value)));
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
  return output("EMA", parameterRecord(context.parameters), "value", "EMA", "line", appendIndicatorPoint(previousPoints, point(context.candle.time, value)));
}

interface RsiState {
  count: number;
  previousClose: number | null;
  gainSum: number;
  lossSum: number;
  averageGain: number | null;
  averageLoss: number | null;
}

function isRsiState(value: unknown): value is RsiState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.count === "number"
    && (state.previousClose === null || typeof state.previousClose === "number")
    && typeof state.gainSum === "number"
    && typeof state.lossSum === "number"
    && (state.averageGain === null || typeof state.averageGain === "number")
    && (state.averageLoss === null || typeof state.averageLoss === "number");
}

function initializeRsiState(input: readonly Candle[], parameters: PeriodParameters): RsiState {
  let state: RsiState = { count: 0, previousClose: null, gainSum: 0, lossSum: 0, averageGain: null, averageLoss: null };
  for (const candle of input) state = advanceRsiState(state, candle, parameters.period);
  return state;
}

function appendRsi(context: IndicatorIncrementalContext<PeriodParameters>): IndicatorIncrementalUpdate | undefined {
  const previousPoints = context.previousResult.outputs[0]?.points;
  if (previousPoints === undefined) return undefined;
  const state = isRsiState(context.previousState)
    ? context.previousState
    : initializeRsiState(context.previousInput, context.parameters);
  const next = advanceRsiState(state, context.candle, context.parameters.period);
  const value = next.averageGain === null || next.averageLoss === null ? null : rsiValue(next.averageGain, next.averageLoss);
  return {
    result: output("RSI", parameterRecord(context.parameters), "value", "RSI", "line", appendIndicatorPoint(previousPoints, point(context.candle.time, next.count <= context.parameters.period ? null : value))),
    state: next,
  };
}

function advanceRsiState(state: RsiState, candle: Candle, period: number): RsiState {
  const index = state.count;
  const next: RsiState = { ...state, count: index + 1, previousClose: candle.close };
  if (state.previousClose === null) return next;
  const change = candle.close - state.previousClose;
  if (index <= period) {
    next.gainSum += Math.max(change, 0);
    next.lossSum += Math.max(-change, 0);
    if (index === period) {
      next.averageGain = next.gainSum / period;
      next.averageLoss = next.lossSum / period;
    }
  } else if (state.averageGain !== null && state.averageLoss !== null) {
    next.averageGain = (state.averageGain * (period - 1) + Math.max(change, 0)) / period;
    next.averageLoss = (state.averageLoss * (period - 1) + Math.max(-change, 0)) / period;
  }
  return next;
}

interface MacdState {
  count: number;
  fast: number | null;
  slow: number | null;
  signal: number | null;
  macdCount: number;
  macdWindow: number[];
}

function isMacdState(value: unknown): value is MacdState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.count === "number"
    && (state.fast === null || typeof state.fast === "number")
    && (state.slow === null || typeof state.slow === "number")
    && (state.signal === null || typeof state.signal === "number")
    && typeof state.macdCount === "number"
    && Array.isArray(state.macdWindow)
    && state.macdWindow.every((item) => typeof item === "number");
}

function initializeMacdState(input: readonly Candle[], parameters: MacdParameters): MacdState {
  const fast = emaValues(closeValues(input), parameters.fastPeriod);
  const slow = emaValues(closeValues(input), parameters.slowPeriod);
  const result = calculateMacd(input, parameters);
  const macdPoints = result.outputs[0]?.points ?? [];
  const signalPoints = result.outputs[1]?.points ?? [];
  return {
    count: input.length,
    fast: fast[fast.length - 1] ?? null,
    slow: slow[slow.length - 1] ?? null,
    signal: signalPoints[signalPoints.length - 1]?.value ?? null,
    macdCount: macdPoints.filter((item) => item.value !== null).length,
    macdWindow: macdPoints.filter((item): item is typeof item & { value: number } => item.value !== null).slice(-parameters.signalPeriod).map((item) => item.value),
  };
}

function appendMacd(context: IndicatorIncrementalContext<MacdParameters>): IndicatorIncrementalUpdate | undefined {
  const macdPoints = context.previousResult.outputs[0]?.points;
  const signalPoints = context.previousResult.outputs[1]?.points;
  const histogramPoints = context.previousResult.outputs[2]?.points;
  if (macdPoints === undefined || signalPoints === undefined || histogramPoints === undefined) return undefined;
  const state = isMacdState(context.previousState)
    ? context.previousState
    : initializeMacdState(context.previousInput, context.parameters);
  const fast = appendEmaValue(context.previousInput, context.candle.close, state.count, context.parameters.fastPeriod, state.fast);
  const slow = appendEmaValue(context.previousInput, context.candle.close, state.count, context.parameters.slowPeriod, state.slow);
  const macdValue = fast !== null && slow !== null ? fast - slow : null;
  let signalValue: number | null = null;
  let macdCount = state.macdCount;
  let macdWindow = state.macdWindow;
  if (macdValue !== null) {
    macdCount += 1;
    macdWindow = [...macdWindow, macdValue].slice(-context.parameters.signalPeriod);
    if (macdCount >= context.parameters.signalPeriod) {
      signalValue = macdCount === context.parameters.signalPeriod
        ? macdWindow.reduce((sum, value) => sum + value, 0) / context.parameters.signalPeriod
        : state.signal === null
          ? null
          : state.signal + (macdValue - state.signal) * (2 / (context.parameters.signalPeriod + 1));
    }
  }
  const histogramValue = macdValue !== null && signalValue !== null ? macdValue - signalValue : null;
  return {
    result: multiOutput("MACD", parameterRecord(context.parameters), [
      { id: "macd", title: "MACD", kind: "line", points: appendIndicatorPoint(macdPoints, point(context.candle.time, macdValue)) },
      { id: "signal", title: "Signal", kind: "line", points: appendIndicatorPoint(signalPoints, point(context.candle.time, signalValue)) },
      { id: "histogram", title: "Histogram", kind: "histogram", points: appendIndicatorPoint(histogramPoints, point(context.candle.time, histogramValue)) },
    ]),
    state: { count: state.count + 1, fast, slow, signal: signalValue, macdCount, macdWindow },
  };
}

function appendEmaValue(input: readonly Candle[], close: number, index: number, period: number, previous: number | null): number | null {
  if (index < period - 1) return null;
  if (index === period - 1) {
    return [...input.slice(Math.max(0, input.length - period + 1)), { close } as Candle]
      .reduce((sum, candle) => sum + candle.close, 0) / period;
  }
  if (previous === null) return null;
  return (close - previous) * (2 / (period + 1)) + previous;
}

function appendIndicatorPoint(points: readonly IndicatorPoint[], next: IndicatorPoint): IndicatorPoint[] {
  const mutable = points as IndicatorPoint[];
  mutable.push(next);
  return mutable;
}

function appendBollinger(context: IndicatorIncrementalContext<BollingerParameters>): IndicatorResult | undefined {
  const middlePoints = context.previousResult.outputs[0]?.points;
  const upperPoints = context.previousResult.outputs[1]?.points;
  const lowerPoints = context.previousResult.outputs[2]?.points;
  if (middlePoints === undefined || upperPoints === undefined || lowerPoints === undefined) return undefined;
  const values = [...context.previousInput.slice(Math.max(0, context.previousInput.length - context.parameters.period + 1)).map((candle) => candle.close), context.candle.close];
  const mean = values.length < context.parameters.period ? null : values.reduce((sum, value) => sum + value, 0) / context.parameters.period;
  const deviation = mean === null ? null : Math.sqrt(values.slice(-context.parameters.period).reduce((sum, value) => sum + (value - mean) ** 2, 0) / context.parameters.period);
  const upper = mean === null || deviation === null ? null : mean + context.parameters.standardDeviations * deviation;
  const lower = mean === null || deviation === null ? null : mean - context.parameters.standardDeviations * deviation;
  return multiOutput("BOLLINGER_BANDS", parameterRecord(context.parameters), [
    { id: "middle", title: "Middle", kind: "line", points: appendIndicatorPoint(middlePoints, point(context.candle.time, mean)) },
    { id: "upper", title: "Upper", kind: "band", points: appendIndicatorPoint(upperPoints, point(context.candle.time, upper)) },
    { id: "lower", title: "Lower", kind: "band", points: appendIndicatorPoint(lowerPoints, point(context.candle.time, lower)) },
  ]);
}

interface AtrState {
  count: number;
  previousClose: number | null;
  rangeSum: number;
  average: number | null;
}

function isAtrState(value: unknown): value is AtrState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.count === "number"
    && (state.previousClose === null || typeof state.previousClose === "number")
    && typeof state.rangeSum === "number"
    && (state.average === null || typeof state.average === "number");
}

function initializeAtrState(input: readonly Candle[], parameters: PeriodParameters): AtrState {
  let state: AtrState = { count: 0, previousClose: null, rangeSum: 0, average: null };
  for (const candle of input) state = advanceAtrState(state, candle, parameters.period);
  return state;
}

function appendAtr(context: IndicatorIncrementalContext<PeriodParameters>): IndicatorIncrementalUpdate | undefined {
  const previousPoints = context.previousResult.outputs[0]?.points;
  if (previousPoints === undefined) return undefined;
  const state = isAtrState(context.previousState)
    ? context.previousState
    : initializeAtrState(context.previousInput, context.parameters);
  const next = advanceAtrState(state, context.candle, context.parameters.period);
  return {
    result: output("ATR", parameterRecord(context.parameters), "value", "ATR", "line", appendIndicatorPoint(previousPoints, point(context.candle.time, next.average))),
    state: next,
  };
}

function advanceAtrState(state: AtrState, candle: Candle, period: number): AtrState {
  const range = state.previousClose === null
    ? candle.high - candle.low
    : Math.max(candle.high - candle.low, Math.abs(candle.high - state.previousClose), Math.abs(candle.low - state.previousClose));
  const index = state.count;
  const next: AtrState = { ...state, count: index + 1, previousClose: candle.close };
  if (index < period - 1) next.rangeSum += range;
  else if (index === period - 1) {
    next.rangeSum += range;
    next.average = next.rangeSum / period;
  } else if (state.average !== null) next.average = (state.average * (period - 1) + range) / period;
  return next;
}

function appendStochastic(context: IndicatorIncrementalContext<StochasticParameters>): IndicatorResult | undefined {
  const kPoints = context.previousResult.outputs[0]?.points;
  const dPoints = context.previousResult.outputs[1]?.points;
  if (kPoints === undefined || dPoints === undefined) return undefined;
  const window = [...context.previousInput.slice(Math.max(0, context.previousInput.length - context.parameters.kPeriod + 1)), context.candle];
  let kValue: number | null = null;
  if (window.length >= context.parameters.kPeriod) {
    const high = Math.max(...window.slice(-context.parameters.kPeriod).map((candle) => candle.high));
    const low = Math.min(...window.slice(-context.parameters.kPeriod).map((candle) => candle.low));
    const range = high - low;
    kValue = range === 0 ? 50 : (context.candle.close - low) / range * 100;
  }
  const priorK = kPoints.slice(-(context.parameters.dPeriod - 1)).map((item) => item.value).filter((value): value is number => value !== null);
  const dWindow = kValue === null ? [] : [...priorK, kValue];
  const dValue = dWindow.length < context.parameters.dPeriod ? null : dWindow.slice(-context.parameters.dPeriod).reduce((sum, value) => sum + value, 0) / context.parameters.dPeriod;
  return multiOutput("STOCHASTIC", parameterRecord(context.parameters), [
    { id: "k", title: "%K", kind: "line", points: appendIndicatorPoint(kPoints, point(context.candle.time, kValue)) },
    { id: "d", title: "%D", kind: "line", points: appendIndicatorPoint(dPoints, point(context.candle.time, dValue)) },
  ]);
}

interface VwapState {
  count: number;
  cumulativePriceVolume: number;
  cumulativeVolume: number;
  sessionKey: number | undefined;
}

function isVwapState(value: unknown): value is VwapState {
  if (typeof value !== "object" || value === null) return false;
  const state = value as Record<string, unknown>;
  return typeof state.count === "number"
    && typeof state.cumulativePriceVolume === "number"
    && typeof state.cumulativeVolume === "number"
    && (state.sessionKey === undefined || typeof state.sessionKey === "number");
}

function initializeVwapState(input: readonly Candle[], parameters: VwapParameters): VwapState {
  let state: VwapState = { count: 0, cumulativePriceVolume: 0, cumulativeVolume: 0, sessionKey: undefined };
  for (const candle of input) state = advanceVwapState(state, candle, parameters.session);
  return state;
}

function appendVwap(context: IndicatorIncrementalContext<VwapParameters>): IndicatorIncrementalUpdate | undefined {
  const previousPoints = context.previousResult.outputs[0]?.points;
  if (previousPoints === undefined) return undefined;
  const state = isVwapState(context.previousState)
    ? context.previousState
    : initializeVwapState(context.previousInput, context.parameters);
  const next = advanceVwapState(state, context.candle, context.parameters.session);
  const value = context.candle.volume === undefined || context.candle.volume <= 0 || next.cumulativeVolume === 0
    ? null
    : next.cumulativePriceVolume / next.cumulativeVolume;
  return {
    result: output("VWAP", parameterRecord(context.parameters), "value", "VWAP", "line", appendIndicatorPoint(previousPoints, point(context.candle.time, value))),
    state: next,
  };
}

function advanceVwapState(state: VwapState, candle: Candle, session: VwapSession): VwapState {
  const sessionKey = session === "utc-day" ? utcDayKey(candle.time) : undefined;
  const next: VwapState = sessionKey !== state.sessionKey
    ? { count: state.count, cumulativePriceVolume: 0, cumulativeVolume: 0, sessionKey }
    : { ...state, sessionKey };
  if (candle.volume !== undefined && candle.volume > 0) {
    next.cumulativePriceVolume += ((candle.high + candle.low + candle.close) / 3) * candle.volume;
    next.cumulativeVolume += candle.volume;
  }
  next.count += 1;
  return next;
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
