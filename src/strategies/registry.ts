import { CandleStore } from "../core/candle-store.js";
import { IndicatorRegistry } from "../indicators/engine.js";
import type { Candle } from "../types.js";
import {
  StrategyCancellationError,
  StrategyLifecycleError,
  StrategyValidationError,
  type StrategyDefinition,
  type StrategyEvaluationOptions,
  type StrategyEvaluationResult,
  type StrategyEvaluator,
  type StrategyEvaluatorServices,
  type StrategyInstance,
  type StrategyMetadata,
  type StrategySignal,
  type StrategySignalDraft,
} from "./types.js";

const EMPTY_HISTORY: readonly Readonly<Candle>[] = Object.freeze([]);

export class StrategyRegistry {
  private readonly definitions = new Map<string, StrategyDefinition>();

  public constructor(private readonly indicatorRegistry?: IndicatorRegistry) {}

  public register<P extends Record<string, unknown>>(definition: StrategyDefinition<P>): void {
    const id = normalizeId(definition.metadata.id);
    if (id !== definition.metadata.id) {
      throw new StrategyValidationError(`Strategy id must be uppercase alphanumeric with hyphens: ${definition.metadata.id}`);
    }
    if (definition.metadata.version !== 1) {
      throw new StrategyValidationError(`Unsupported strategy metadata version: ${definition.metadata.version}`);
    }
    if (this.definitions.has(id)) {
      throw new StrategyValidationError(`Strategy already registered: ${id}`);
    }
    this.definitions.set(id, definition);
  }

  public unregister(id: string): boolean {
    return this.definitions.delete(normalizeId(id));
  }

  public has(id: string): boolean {
    return this.definitions.has(normalizeId(id));
  }

  public getMetadata(id: string): StrategyMetadata {
    return cloneMetadata(this.require(id).metadata);
  }

  public listMetadata(): StrategyMetadata[] {
    return [...this.definitions.values()].map((definition) => cloneMetadata(definition.metadata));
  }

  public create(id: string, parameters: unknown): StrategyInstance {
    return new ManagedStrategy(this.require(id), parameters, this.indicatorRegistry ?? new IndicatorRegistry());
  }

  private require(id: string): StrategyDefinition {
    const definition = this.definitions.get(normalizeId(id));
    if (definition === undefined) throw new StrategyValidationError(`Unknown strategy: ${id}`);
    return definition;
  }
}

class ManagedStrategy implements StrategyInstance {
  private readonly validatedParameters: Record<string, unknown>;
  private disposed = false;

  public constructor(
    private readonly definition: StrategyDefinition,
    parameters: unknown,
    private readonly indicatorRegistry: IndicatorRegistry,
  ) {
    this.validatedParameters = { ...definition.validateParameters(parameters) };
  }

  public get id(): string {
    return this.definition.metadata.id;
  }

  public get metadata(): StrategyMetadata {
    return cloneMetadata(this.definition.metadata);
  }

  public get parameters(): Readonly<Record<string, unknown>> {
    return { ...this.validatedParameters };
  }

  public evaluate(candles: readonly Candle[], options: StrategyEvaluationOptions = {}): StrategyEvaluationResult {
    this.assertAlive();
    const store = new CandleStore();
    store.setData(candles);
    const source = store.getAll().map((candle) => Object.freeze({ ...candle }));
    const evaluator = this.createEvaluator();
    const signals: StrategySignal[] = [];
    const progressInterval = normalizeProgressInterval(options.progressInterval);
    try {
      for (let index = 0; index < source.length; index += 1) {
        if (options.signal?.aborted === true) throw new Error("__STRATEGY_CANCELLED__");
        const candle = source[index];
        if (candle === undefined) continue;
        const history = this.definition.requiresHistory === false ? EMPTY_HISTORY : createCausalHistoryView(source, index + 1);
        const previousCandle = index === 0 ? null : source[index - 1] ?? null;
        const drafts = evaluator.evaluateBar({
          index,
          candle,
          history,
          previousCandle,
          parameters: this.validatedParameters,
        });
        drafts.forEach((draft, sequence) => signals.push(normalizeSignal(draft, this.id, index, candle.time, sequence)));
        if (options.onProgress !== undefined && (index + 1 === source.length || (index + 1) % progressInterval === 0)) {
          options.onProgress({ processedBars: index + 1, totalBars: source.length, signalCount: signals.length });
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === "__STRATEGY_CANCELLED__") {
        throw new StrategyCancellationError();
      }
      throw error;
    } finally {
      evaluator.dispose?.();
    }
    return {
      strategyId: this.id,
      strategyVersion: this.definition.metadata.version,
      parameters: { ...this.validatedParameters },
      input: {
        barCount: source.length,
        firstTime: source[0]?.time ?? null,
        lastTime: source[source.length - 1]?.time ?? null,
      },
      signals,
    };
  }

  public dispose(): void {
    this.disposed = true;
  }

  private createEvaluator(): StrategyEvaluator {
    const services: StrategyEvaluatorServices = {
      createIndicator: (id, parameters) => this.indicatorRegistry.create(id, parameters),
    };
    return this.definition.createEvaluator(this.validatedParameters, services);
  }

  private assertAlive(): void {
    if (this.disposed) throw new StrategyLifecycleError(`Strategy has been disposed: ${this.id}`);
  }
}

/**
 * Presents one immutable, causal prefix without copying the growing source on
 * every bar. The proxy target is still an Array, so native array methods and
 * Array.isArray retain their legacy behavior. Each view closes over its own
 * end boundary; retaining a view cannot reveal bars evaluated later.
 */
function createCausalHistoryView(source: readonly Readonly<Candle>[], length: number): readonly Readonly<Candle>[] {
  const target: Readonly<Candle>[] = [];
  target.length = length;
  return new Proxy(target, {
    get: (current, property, receiver) => {
      const index = arrayIndex(property);
      if (index !== null) return index < length ? source[index] : undefined;
      return Reflect.get(current, property, receiver);
    },
    has: (current, property) => {
      const index = arrayIndex(property);
      return index === null ? Reflect.has(current, property) : index < length;
    },
    ownKeys: () => ["length", ...Array.from({ length }, (_, index) => String(index))],
    getOwnPropertyDescriptor: (current, property) => {
      const index = arrayIndex(property);
      if (index === null) return Reflect.getOwnPropertyDescriptor(current, property);
      if (index >= length) return undefined;
      return { configurable: true, enumerable: true, value: source[index], writable: false };
    },
    set: () => false,
    defineProperty: () => false,
    deleteProperty: () => false,
  });
}

function arrayIndex(property: PropertyKey): number | null {
  if (typeof property !== "string" || property.length === 0 || !/^\d+$/.test(property)) return null;
  const index = Number(property);
  return Number.isSafeInteger(index) && String(index) === property ? index : null;
}

function normalizeId(id: string): string {
  return id.trim().toUpperCase();
}

function normalizeProgressInterval(value: number | undefined): number {
  if (value === undefined) return 256;
  if (!Number.isInteger(value) || value < 1) throw new StrategyValidationError("progressInterval must be a positive integer");
  return value;
}

function normalizeSignal(draft: StrategySignalDraft, strategyId: string, index: number, time: number, sequence: number): StrategySignal {
  if (!isSignalAction(draft.action)) throw new StrategyValidationError(`Unknown strategy signal action: ${String(draft.action)}`);
  if (typeof draft.reason !== "string" || draft.reason.trim().length === 0) throw new StrategyValidationError("Strategy signal reason must not be empty");
  if (draft.value !== undefined && !Number.isFinite(draft.value)) throw new StrategyValidationError("Strategy signal value must be finite");
  return {
    id: `${strategyId}:${index}:${sequence}`,
    strategyId,
    index,
    time,
    action: draft.action,
    reason: draft.reason,
    ...(draft.value === undefined ? {} : { value: draft.value }),
  };
}

function isSignalAction(value: unknown): value is StrategySignal["action"] {
  return value === "enter-long" || value === "exit-long" || value === "enter-short" || value === "exit-short";
}

function cloneMetadata(metadata: StrategyMetadata): StrategyMetadata {
  return {
    ...metadata,
    parameters: metadata.parameters.map((parameter) => ({
      ...parameter,
      ...(parameter.values === undefined ? {} : { values: [...parameter.values] }),
    })),
    requiredInputs: [...metadata.requiredInputs],
  };
}
