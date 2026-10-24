import type { Candle } from "../types.js";

export type IndicatorValue = number | null;

export interface IndicatorPoint {
  readonly time: number;
  readonly value: IndicatorValue;
}

export type IndicatorOutputKind = "line" | "histogram" | "band";

export interface IndicatorOutputDefinition {
  readonly id: string;
  readonly title: string;
  readonly kind: IndicatorOutputKind;
}

export type IndicatorParameterType = "integer" | "number" | "string" | "enum";

export interface IndicatorParameterDefinition {
  readonly name: string;
  readonly type: IndicatorParameterType;
  readonly required?: boolean;
  readonly defaultValue?: unknown;
  readonly min?: number;
  readonly max?: number;
  readonly values?: readonly string[];
}

export interface IndicatorMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: 1;
  readonly description: string;
  readonly parameters: readonly IndicatorParameterDefinition[];
  readonly outputs: readonly IndicatorOutputDefinition[];
}

export interface IndicatorResult {
  readonly indicatorId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly outputs: readonly IndicatorOutputSeries[];
}

export interface IndicatorOutputSeries {
  readonly id: string;
  readonly title: string;
  readonly kind: IndicatorOutputKind;
  readonly points: readonly IndicatorPoint[];
}

export interface IndicatorIncrementalContext<P extends Record<string, unknown>> {
  readonly previousInput: readonly Candle[];
  readonly previousResult: IndicatorResult;
  readonly candle: Candle;
  readonly parameters: P;
}

export interface IndicatorDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly metadata: IndicatorMetadata;
  validateParameters(parameters: unknown): P;
  calculate(input: readonly Candle[], parameters: P): IndicatorResult;
  /** Optional append-only optimization. Returning undefined requests a full recalculation. */
  calculateIncremental?(context: IndicatorIncrementalContext<P>): IndicatorResult | undefined;
}

export interface IndicatorInstance {
  readonly id: string;
  readonly metadata: IndicatorMetadata;
  setInput(input: readonly Candle[]): void;
  update(candle: Candle): void;
  setParameters(parameters: unknown): void;
  getInput(): Candle[];
  getResult(): IndicatorResult;
  dispose(): void;
}

export class IndicatorValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IndicatorValidationError";
  }
}

export class IndicatorLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "IndicatorLifecycleError";
  }
}
