import { CandleStore } from "../core/candle-store.js";
import type { Candle } from "../types.js";
import {
  IndicatorLifecycleError,
  type IndicatorDefinition,
  type IndicatorInstance,
  type IndicatorIncrementalUpdate,
  type IndicatorMetadata,
  type IndicatorResult,
} from "./types.js";

export class IndicatorRegistry {
  private readonly definitions = new Map<string, IndicatorDefinition>();

  public register<P extends Record<string, unknown>>(definition: IndicatorDefinition<P>): void {
    const id = normalizeId(definition.metadata.id);
    if (id !== definition.metadata.id) {
      throw new Error(`Indicator id must be uppercase alphanumeric with hyphens: ${definition.metadata.id}`);
    }
    if (this.definitions.has(id)) {
      throw new Error(`Indicator already registered: ${id}`);
    }
    this.definitions.set(id, definition);
  }

  public unregister(id: string): boolean {
    return this.definitions.delete(normalizeId(id));
  }

  public has(id: string): boolean {
    return this.definitions.has(normalizeId(id));
  }

  public getMetadata(id: string): IndicatorMetadata {
    return this.require(id).metadata;
  }

  public listMetadata(): IndicatorMetadata[] {
    return [...this.definitions.values()].map((definition) => cloneMetadata(definition.metadata));
  }

  public create(id: string, parameters: unknown): IndicatorInstance {
    return new ManagedIndicator(this.require(id), parameters);
  }

  private require(id: string): IndicatorDefinition {
    const definition = this.definitions.get(normalizeId(id));
    if (definition === undefined) {
      throw new Error(`Unknown indicator: ${id}`);
    }
    return definition;
  }
}

class ManagedIndicator implements IndicatorInstance {
  private readonly store = new CandleStore();
  private parameters: Record<string, unknown>;
  private result: IndicatorResult;
  private incrementalState: unknown;
  private disposed = false;

  public constructor(private readonly definition: IndicatorDefinition, parameters: unknown) {
    this.parameters = cloneParameters(definition.validateParameters(parameters));
    this.result = definition.calculate([], this.parameters);
    validateResult(this.result, definition.metadata);
    this.incrementalState = definition.initializeIncrementalState?.([], this.parameters);
  }

  public get id(): string {
    return this.definition.metadata.id;
  }

  public get metadata(): IndicatorMetadata {
    return cloneMetadata(this.definition.metadata);
  }

  public setInput(input: readonly Candle[]): void {
    this.assertAlive();
    this.store.setData(input);
    this.recalculate();
  }

  public update(candle: Candle): void {
    this.assertAlive();
    const previousInputLength = this.store.length;
    const last = previousInputLength === 0 ? undefined : this.store.getRange(previousInputLength - 1, previousInputLength)[0];
    this.store.update(candle);
    const isAppend = last === undefined || candle.time > last.time;
    if (isAppend && this.definition.calculateIncremental !== undefined) {
      const previousOutputLengths = this.result.outputs.map((output) => output.points.length);
      const requestedLength = this.definition.incrementalInputLength?.(this.parameters);
      const previousInput = requestedLength === undefined
        ? this.store.getRange(0, previousInputLength)
        : this.store.getRange(Math.max(0, previousInputLength - Math.max(0, Math.floor(requestedLength))), previousInputLength);
      const incremental = this.definition.calculateIncremental({
        previousInput,
        previousInputLength,
        previousResult: this.result,
        ...(this.incrementalState === undefined ? {} : { previousState: this.incrementalState }),
        candle: { ...candle },
        parameters: this.parameters,
      });
      if (incremental !== undefined) {
        const update = isIncrementalUpdate(incremental) ? incremental : { result: incremental };
        validateIncrementalResult(update.result, this.definition.metadata, previousOutputLengths);
        this.result = update.result;
        if ("state" in update) this.incrementalState = update.state;
        return;
      }
    }
    const nextInput = this.store.getAll();
    this.result = cloneResult(this.definition.calculate(nextInput, this.parameters));
    validateResult(this.result, this.definition.metadata);
    this.incrementalState = this.definition.initializeIncrementalState?.(nextInput, this.parameters);
  }

  public setParameters(parameters: unknown): void {
    this.assertAlive();
    this.parameters = cloneParameters(this.definition.validateParameters(parameters));
    this.recalculate();
  }

  public getInput(): Candle[] {
    this.assertAlive();
    return this.store.getAll();
  }

  public getResult(): IndicatorResult {
    this.assertAlive();
    return cloneResult(this.result);
  }

  public getResultReference(): IndicatorResult {
    this.assertAlive();
    return this.result;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.store.setData([]);
    this.result = emptyResult(this.definition.metadata.id, this.parameters);
    this.incrementalState = undefined;
  }

  private recalculate(): void {
    this.result = cloneResult(this.definition.calculate(this.store.getAll(), this.parameters));
    validateResult(this.result, this.definition.metadata);
    this.incrementalState = this.definition.initializeIncrementalState?.(this.store.getAll(), this.parameters);
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new IndicatorLifecycleError(`Indicator has been disposed: ${this.definition.metadata.id}`);
    }
  }
}

function isIncrementalUpdate(value: IndicatorResult | IndicatorIncrementalUpdate): value is IndicatorIncrementalUpdate {
  return typeof value === "object" && value !== null && "result" in value;
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

function cloneParameters(parameters: Record<string, unknown>): Record<string, unknown> {
  return { ...parameters };
}

function cloneMetadata(metadata: IndicatorMetadata): IndicatorMetadata {
  return {
    ...metadata,
    parameters: metadata.parameters.map((parameter) => ({
      ...parameter,
      ...(parameter.values === undefined ? {} : { values: [...parameter.values] }),
    })),
    outputs: metadata.outputs.map((output) => ({ ...output })),
  };
}

function cloneResult(result: IndicatorResult): IndicatorResult {
  return {
    indicatorId: result.indicatorId,
    parameters: { ...result.parameters },
    outputs: result.outputs.map((output) => ({
      ...output,
      points: output.points.map((point) => ({ ...point })),
    })),
  };
}

function emptyResult(indicatorId: string, parameters: Record<string, unknown>): IndicatorResult {
  return { indicatorId, parameters: { ...parameters }, outputs: [] };
}

function validateResult(result: IndicatorResult, metadata: IndicatorMetadata): void {
  if (result.indicatorId !== metadata.id) {
    throw new Error(`Indicator result id mismatch: expected ${metadata.id}, got ${result.indicatorId}`);
  }
  const outputIds = new Set(metadata.outputs.map((output) => output.id));
  for (const output of result.outputs) {
    if (!outputIds.has(output.id)) throw new Error(`Unknown output for ${metadata.id}: ${output.id}`);
    let previousTime: number | undefined;
    for (const point of output.points) {
      if (!Number.isInteger(point.time) || point.time < 0) throw new Error(`Invalid output timestamp for ${metadata.id}`);
      if (previousTime !== undefined && point.time <= previousTime) throw new Error(`Output timestamps are not ascending for ${metadata.id}`);
      if (point.value !== null && !Number.isFinite(point.value)) throw new Error(`Invalid output value for ${metadata.id}`);
      previousTime = point.time;
    }
  }
}

function validateIncrementalResult(result: IndicatorResult, metadata: IndicatorMetadata, previousOutputLengths: readonly number[]): void {
  if (result.indicatorId !== metadata.id || result.outputs.length !== metadata.outputs.length) {
    throw new Error(`Invalid incremental result for ${metadata.id}`);
  }
  result.outputs.forEach((output, index) => {
    const definition = metadata.outputs[index];
    const previousLength = previousOutputLengths[index];
    const last = output.points[output.points.length - 1];
    const previous = output.points[output.points.length - 2];
    if (definition === undefined || output.id !== definition.id || previousLength === undefined || output.points.length !== previousLength + 1 || last === undefined) {
      throw new Error(`Incremental output length mismatch for ${metadata.id}:${output.id}`);
    }
    if (!Number.isInteger(last.time) || last.time < 0 || (last.value !== null && !Number.isFinite(last.value))) {
      throw new Error(`Invalid incremental output point for ${metadata.id}:${output.id}`);
    }
    if (previous !== undefined && last.time <= previous.time) {
      throw new Error(`Incremental output timestamps are not ascending for ${metadata.id}:${output.id}`);
    }
  });
}
