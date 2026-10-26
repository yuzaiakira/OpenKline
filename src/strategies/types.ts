import type { IndicatorInstance, IndicatorParameterDefinition } from "../indicators/types.js";
import type { Candle } from "../types.js";

export const OPENKLINE_STRATEGY_VERSION = 1 as const;

export type StrategyDataInput = "ohlcv";
export type StrategySignalAction = "enter-long" | "exit-long" | "enter-short" | "exit-short";
export type StrategyDirection = "long" | "short";

export interface StrategyMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: typeof OPENKLINE_STRATEGY_VERSION;
  readonly description: string;
  readonly parameters: readonly IndicatorParameterDefinition[];
  readonly requiredInputs: readonly StrategyDataInput[];
}

export interface StrategySignalDraft {
  readonly action: StrategySignalAction;
  readonly reason: string;
  readonly value?: number;
}

export interface StrategySignal extends StrategySignalDraft {
  readonly id: string;
  readonly strategyId: string;
  readonly index: number;
  readonly time: number;
}

export interface StrategyBarContext<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Index of the completed bar currently being evaluated. */
  readonly index: number;
  /** The current completed candle. No later candle is available. */
  readonly candle: Readonly<Candle>;
  /** Defensive historical prefix ending at `candle`, inclusive. */
  readonly history: readonly Readonly<Candle>[];
  readonly previousCandle: Readonly<Candle> | null;
  readonly parameters: Readonly<P>;
}

export interface StrategyEvaluatorServices {
  /** Creates an independent indicator instance owned by this evaluator. */
  createIndicator(id: string, parameters: unknown): IndicatorInstance;
}

export interface StrategyEvaluator {
  evaluateBar(context: StrategyBarContext): readonly StrategySignalDraft[];
  dispose?(): void;
}

export interface StrategyDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly metadata: StrategyMetadata;
  validateParameters(parameters: unknown): P;
  /** Creates a stateful evaluator for one isolated historical run. */
  createEvaluator(parameters: P, services: StrategyEvaluatorServices): StrategyEvaluator;
}

export interface StrategyEvaluationProgress {
  readonly processedBars: number;
  readonly totalBars: number;
  readonly signalCount: number;
}

export interface StrategyEvaluationOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: StrategyEvaluationProgress) => void;
  /** Progress callback cadence. Defaults to 256 bars and always emits at completion. */
  readonly progressInterval?: number;
}

export interface StrategyEvaluationInputSummary {
  readonly barCount: number;
  readonly firstTime: number | null;
  readonly lastTime: number | null;
}

export interface StrategyEvaluationResult {
  readonly strategyId: string;
  readonly strategyVersion: typeof OPENKLINE_STRATEGY_VERSION;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly input: StrategyEvaluationInputSummary;
  readonly signals: readonly StrategySignal[];
}

export interface StrategyInstance {
  readonly id: string;
  readonly metadata: StrategyMetadata;
  readonly parameters: Readonly<Record<string, unknown>>;
  evaluate(candles: readonly Candle[], options?: StrategyEvaluationOptions): StrategyEvaluationResult;
  dispose(): void;
}

export class StrategyValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StrategyValidationError";
  }
}

export class StrategyLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "StrategyLifecycleError";
  }
}

export class StrategyCancellationError extends Error {
  public constructor(message = "Strategy evaluation was cancelled") {
    super(message);
    this.name = "StrategyCancellationError";
  }
}
