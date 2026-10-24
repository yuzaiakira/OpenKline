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
  /** Full history unless the definition supplies incrementalInputLength. */
  readonly previousInput: readonly Candle[];
  readonly previousInputLength: number;
  readonly previousResult: IndicatorResult;
  readonly previousState?: unknown;
  readonly candle: Candle;
  readonly parameters: P;
}

export interface IndicatorIncrementalUpdate {
  readonly result: IndicatorResult;
  readonly state?: unknown;
}

export interface IndicatorDefinition<P extends Record<string, unknown> = Record<string, unknown>> {
  readonly metadata: IndicatorMetadata;
  validateParameters(parameters: unknown): P;
  calculate(input: readonly Candle[], parameters: P): IndicatorResult;
  /** Optional append-only optimization. Returning undefined requests a full recalculation. */
  calculateIncremental?(context: IndicatorIncrementalContext<P>): IndicatorResult | IndicatorIncrementalUpdate | undefined;
  /** If provided, only this trailing window is copied into incremental context. */
  incrementalInputLength?(parameters: P): number;
  /** Optional opaque state used only by the append-only optimization. */
  initializeIncrementalState?(input: readonly Candle[], parameters: P): unknown;
}

export interface IndicatorInstance {
  readonly id: string;
  readonly metadata: IndicatorMetadata;
  setInput(input: readonly Candle[]): void;
  update(candle: Candle): void;
  setParameters(parameters: unknown): void;
  getInput(): Candle[];
  getResult(): IndicatorResult;
  /** @internal Renderer-side read-only reference; callers must not mutate it. */
  getResultReference?(): IndicatorResult;
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
