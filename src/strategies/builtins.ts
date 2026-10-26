import { createDefaultIndicatorRegistry } from "../indicators/index.js";
import type { IndicatorInstance } from "../indicators/types.js";
import { StrategyRegistry } from "./registry.js";
import { StrategyValidationError, type StrategyDefinition, type StrategyEvaluator } from "./types.js";

export interface EmaCrossoverParameters extends Record<string, unknown> {
  fastPeriod: number;
  slowPeriod: number;
}

export interface RsiReversalParameters extends Record<string, unknown> {
  period: number;
  oversold: number;
  overbought: number;
}

export interface DonchianBreakoutParameters extends Record<string, unknown> {
  period: number;
}

export interface EmaTrendParameters extends Record<string, unknown> {
  period: number;
}

export const emaCrossoverDefinition: StrategyDefinition<EmaCrossoverParameters> = {
  requiresHistory: false,
  metadata: {
    id: "EMA_CROSSOVER",
    name: "EMA Crossover",
    version: 1,
    description: "Enters long on a bullish EMA crossover and exits on a bearish crossover.",
    parameters: [
      { name: "fastPeriod", type: "integer", required: true, min: 1 },
      { name: "slowPeriod", type: "integer", required: true, min: 2 },
    ],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (parameters) => {
    const fastPeriod = readInteger(parameters, "fastPeriod");
    const slowPeriod = readInteger(parameters, "slowPeriod");
    if (fastPeriod >= slowPeriod) throw new StrategyValidationError("EMA crossover fastPeriod must be less than slowPeriod");
    return { fastPeriod, slowPeriod };
  },
  createEvaluator: (parameters, services) => crossoverEvaluator(
    services.createIndicator("EMA", { period: parameters.fastPeriod }),
    services.createIndicator("EMA", { period: parameters.slowPeriod }),
  ),
};

export const rsiReversalDefinition: StrategyDefinition<RsiReversalParameters> = {
  requiresHistory: false,
  metadata: {
    id: "RSI_REVERSAL",
    name: "RSI Threshold Reversal",
    version: 1,
    description: "Enters long when RSI recovers above oversold and exits when RSI reaches overbought.",
    parameters: [
      { name: "period", type: "integer", required: true, min: 1 },
      { name: "oversold", type: "number", required: true, min: 0, max: 100 },
      { name: "overbought", type: "number", required: true, min: 0, max: 100 },
    ],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (parameters) => {
    const period = readInteger(parameters, "period");
    const oversold = readBoundedNumber(parameters, "oversold", 0, 100);
    const overbought = readBoundedNumber(parameters, "overbought", 0, 100);
    if (oversold >= overbought) throw new StrategyValidationError("RSI oversold must be less than overbought");
    return { period, oversold, overbought };
  },
  createEvaluator: (parameters, services) => {
    const rsi = services.createIndicator("RSI", { period: parameters.period });
    let previous: number | null = null;
    return {
      evaluateBar: ({ candle }) => {
        rsi.update({ ...candle });
        const current = latestValue(rsi);
        const signals = current === null || previous === null
          ? []
          : previous <= parameters.oversold && current > parameters.oversold
            ? [{ action: "enter-long" as const, reason: `RSI recovered above ${parameters.oversold}`, value: current }]
            : previous < parameters.overbought && current >= parameters.overbought
              ? [{ action: "exit-long" as const, reason: `RSI reached ${parameters.overbought}`, value: current }]
              : [];
        previous = current;
        return signals;
      },
      dispose: () => rsi.dispose(),
    } satisfies StrategyEvaluator;
  },
};

export const donchianBreakoutDefinition: StrategyDefinition<DonchianBreakoutParameters> = {
  requiresHistory: false,
  metadata: {
    id: "DONCHIAN_BREAKOUT",
    name: "Donchian Breakout",
    version: 1,
    description: "Enters long above the previous Donchian upper level and exits below its previous lower level.",
    parameters: [{ name: "period", type: "integer", required: true, min: 1 }],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  createEvaluator: (parameters, services) => {
    const channel = services.createIndicator("DONCHIAN_CHANNELS", { period: parameters.period });
    return {
      evaluateBar: ({ candle }) => {
        const previousUpper = latestValue(channel, "upper");
        const previousLower = latestValue(channel, "lower");
        channel.update({ ...candle });
        if (previousUpper === null || previousLower === null) return [];
        if (candle.close > previousUpper) {
          return [{ action: "enter-long" as const, reason: `close broke above the previous ${parameters.period}-bar upper channel`, value: candle.close }];
        }
        if (candle.close < previousLower) {
          return [{ action: "exit-long" as const, reason: `close broke below the previous ${parameters.period}-bar lower channel`, value: candle.close }];
        }
        return [];
      },
      dispose: () => channel.dispose(),
    } satisfies StrategyEvaluator;
  },
};

export const emaTrendDefinition: StrategyDefinition<EmaTrendParameters> = {
  requiresHistory: false,
  metadata: {
    id: "EMA_TREND",
    name: "EMA Trend Following",
    version: 1,
    description: "Enters long when a completed close is above EMA and exits when it closes below EMA.",
    parameters: [{ name: "period", type: "integer", required: true, min: 1 }],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: (parameters) => ({ period: readInteger(parameters, "period") }),
  createEvaluator: (parameters, services) => {
    const ema = services.createIndicator("EMA", { period: parameters.period });
    let previousRelation: "above" | "below" | null = null;
    return {
      evaluateBar: ({ candle }) => {
        ema.update({ ...candle });
        const value = latestValue(ema);
        if (value === null) return [];
        const relation = candle.close >= value ? "above" : "below";
        const signal = previousRelation === null || relation === previousRelation
          ? []
          : relation === "above"
            ? [{ action: "enter-long" as const, reason: `close crossed above EMA(${parameters.period})`, value }]
            : [{ action: "exit-long" as const, reason: `close crossed below EMA(${parameters.period})`, value }];
        previousRelation = relation;
        return signal;
      },
      dispose: () => ema.dispose(),
    } satisfies StrategyEvaluator;
  },
};

export const builtInStrategyDefinitions: readonly StrategyDefinition[] = [
  emaCrossoverDefinition,
  rsiReversalDefinition,
  donchianBreakoutDefinition,
  emaTrendDefinition,
];

export function createDefaultStrategyRegistry(): StrategyRegistry {
  const registry = new StrategyRegistry(createDefaultIndicatorRegistry());
  builtInStrategyDefinitions.forEach((definition) => registry.register(definition));
  return registry;
}

function crossoverEvaluator(fast: IndicatorInstance, slow: IndicatorInstance): StrategyEvaluator {
  let previousFast: number | null = null;
  let previousSlow: number | null = null;
  return {
    evaluateBar: ({ candle }) => {
      fast.update({ ...candle });
      slow.update({ ...candle });
      const currentFast = latestValue(fast);
      const currentSlow = latestValue(slow);
      const signal = currentFast === null || currentSlow === null || previousFast === null || previousSlow === null
        ? []
        : previousFast <= previousSlow && currentFast > currentSlow
          ? [{ action: "enter-long" as const, reason: "fast EMA crossed above slow EMA", value: currentFast }]
          : previousFast >= previousSlow && currentFast < currentSlow
            ? [{ action: "exit-long" as const, reason: "fast EMA crossed below slow EMA", value: currentFast }]
            : [];
      previousFast = currentFast;
      previousSlow = currentSlow;
      return signal;
    },
    dispose: () => {
      fast.dispose();
      slow.dispose();
    },
  };
}

function latestValue(indicator: IndicatorInstance, outputId = "value"): number | null {
  const output = indicator.getResultReference?.().outputs.find((candidate) => candidate.id === outputId);
  const point = output?.points[output.points.length - 1];
  return point?.value ?? null;
}

function readInteger(parameters: unknown, name: string): number {
  if (!isRecord(parameters) || !Number.isInteger(parameters[name]) || (parameters[name] as number) < 1) {
    throw new StrategyValidationError(`${name} must be a positive integer`);
  }
  return parameters[name] as number;
}

function readBoundedNumber(parameters: unknown, name: string, min: number, max: number): number {
  if (!isRecord(parameters) || typeof parameters[name] !== "number" || !Number.isFinite(parameters[name]) || (parameters[name] as number) < min || (parameters[name] as number) > max) {
    throw new StrategyValidationError(`${name} must be a finite number between ${min} and ${max}`);
  }
  return parameters[name] as number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
