import { validateCandles } from "../core/candle-store.js";
import type { Candle } from "../types.js";
import type {
  CallArgument,
  CallExpression,
  Expression,
} from "./ast.js";
import type { CheckedProgram, KlineScriptInputMetadata } from "./checker.js";
import type { KlineScriptDiagnostic } from "./diagnostics.js";
import type {
  IndicatorDefinition,
  IndicatorMetadata,
  IndicatorOutputSeries,
  IndicatorResult,
} from "../indicators/types.js";

export interface KlineScriptRuntimeLimits {
  readonly maxDatasetLength?: number;
  readonly maxLookback?: number;
  readonly maxOperations?: number;
  readonly maxOperationsPerBar?: number;
  readonly maxOutputPoints?: number;
}

export interface KlineScriptRuntimeOptions extends KlineScriptRuntimeLimits {
  readonly signal?: AbortSignal;
}

export class KlineScriptRuntimeError extends Error {
  public readonly code: "RUNTIME_INPUT" | "RUNTIME_BUDGET" | "RUNTIME_CANCELLED" | "RUNTIME_CALCULATION" | "RUNTIME_DISPOSED";
  public readonly diagnostics: readonly KlineScriptDiagnostic[];

  public constructor(
    code: KlineScriptRuntimeError["code"],
    message: string,
    diagnostics: readonly KlineScriptDiagnostic[] = [],
  ) {
    super(message);
    this.name = "KlineScriptRuntimeError";
    this.code = code;
    this.diagnostics = diagnostics;
  }
}

const DEFAULT_LIMITS: Required<KlineScriptRuntimeLimits> = {
  maxDatasetLength: 100_000,
  maxLookback: 5_000,
  maxOperations: 50_000_000,
  maxOperationsPerBar: 50_000,
  maxOutputPoints: 2_000_000,
};

type Scalar = number | string | boolean | null;
type Series = Scalar[];
interface MacdValue {
  readonly kind: "macd";
  readonly macd: Series;
  readonly signal: Series;
  readonly histogram: Series;
}
type RuntimeValue = Scalar | Series | MacdValue;

export interface KlineScriptExecutionResult extends IndicatorResult {
  readonly operations: number;
}

export function createKlineScriptDefinition(
  program: CheckedProgram,
  indicatorId: string,
  limits: KlineScriptRuntimeLimits = {},
): IndicatorDefinition {
  const metadata: IndicatorMetadata = {
    id: indicatorId,
    name: program.metadata.name,
    version: 1,
    description: "KlineScript indicator",
    overlay: program.metadata.overlay,
    parameters: program.metadata.inputs.map((input) => parameterDefinition(input)),
    outputs: program.metadata.outputs.map((output) => ({ id: output.id, title: output.title, kind: output.kind })),
  };
  return {
    metadata,
    validateParameters: (parameters) => validateParameters(program.metadata.inputs, parameters),
    calculate: (input, parameters) => executeKlineScript(program, input, parameters, limits, indicatorId),
  };
}

export function executeKlineScript(
  program: CheckedProgram,
  input: readonly Candle[],
  parameters: Record<string, unknown>,
  options: KlineScriptRuntimeOptions = {},
  indicatorId = "KLINESCRIPT",
): KlineScriptExecutionResult {
  const limits = { ...DEFAULT_LIMITS, ...options };
  const validatedParameters = validateParameters(program.metadata.inputs, parameters);
  if (input.length > limits.maxDatasetLength) throw runtimeInput(`Dataset exceeds the ${limits.maxDatasetLength}-bar runtime limit`);
  try {
    validateCandles(input);
  } catch (error) {
    throw runtimeInput(error instanceof Error ? error.message : "Input candles are invalid");
  }
  const budget = new Budget(limits, options.signal);
  const environment = new Map<string, RuntimeValue>();
  environment.set("open", input.map((candle) => candle.open));
  environment.set("high", input.map((candle) => candle.high));
  environment.set("low", input.map((candle) => candle.low));
  environment.set("close", input.map((candle) => candle.close));
  environment.set("volume", input.map((candle) => candle.volume ?? null));
  environment.set("time", input.map((candle) => candle.time));
  const cache = new Map<number, RuntimeValue>();
  const outputs: IndicatorOutputSeries[] = [];
  for (const statement of program.ast.statements) {
    budget.check();
    if (statement.kind === "assignment") {
      if (statement.expression.kind === "call" && statement.expression.namespace === "input") {
        const value = validatedParameters[statement.name];
        if (value === undefined) throw runtimeInput(`Missing input parameter '${statement.name}'`);
        environment.set(statement.name, value as Scalar);
      } else {
        environment.set(statement.name, evaluate(statement.expression, environment, cache, input, budget));
      }
    } else if (statement.kind === "plot") {
      const args = namedArguments(statement.arguments, ["series", "title", "color", "width", "visible"]);
      const series = args.get("series");
      if (series === undefined) throw runtimeCalculation("Plot is missing its series expression");
      const value = evaluate(series.expression, environment, cache, input, budget);
      const points = toPoints(value, input, budget);
      outputs.push({
        id: outputId(program, outputs.length),
        title: scalarString(args.get("title"), environment, cache, input, budget) ?? `Plot ${outputs.length + 1}`,
        kind: "line",
        points,
      });
    } else if (statement.kind === "hline") {
      const args = namedArguments(statement.arguments, ["value", "color"]);
      const valueArgument = args.get("value");
      if (valueArgument === undefined) throw runtimeCalculation("hline is missing its value expression");
      const value = evaluateScalar(valueArgument.expression, environment, cache, input, budget);
      const line = typeof value === "number" && Number.isFinite(value) ? input.map((candle) => ({ time: candle.time, value })) : input.map((candle) => ({ time: candle.time, value: null }));
      budget.addOutput(line.length);
      outputs.push({ id: outputId(program, outputs.length), title: "Reference", kind: "line", points: line });
    }
  }
  return {
    indicatorId,
    parameters: { ...validatedParameters },
    outputs,
    operations: budget.operations,
  };
}

function evaluate(
  expression: Expression,
  environment: ReadonlyMap<string, RuntimeValue>,
  cache: Map<number, RuntimeValue>,
  input: readonly Candle[],
  budget: Budget,
): RuntimeValue {
  const cached = cache.get(expression.nodeId);
  if (cached !== undefined || cache.has(expression.nodeId)) return cached ?? null;
  budget.tick();
  let result: RuntimeValue;
  switch (expression.kind) {
    case "literal": result = expression.value; break;
    case "identifier": result = environment.get(expression.name) ?? null; break;
    case "unary": result = unary(expression.operator, evaluate(expression.expression, environment, cache, input, budget)); break;
    case "binary": result = binary(expression.operator, evaluate(expression.left, environment, cache, input, budget), evaluate(expression.right, environment, cache, input, budget)); break;
    case "conditional": result = conditional(
      evaluate(expression.condition, environment, cache, input, budget),
      evaluate(expression.whenTrue, environment, cache, input, budget),
      evaluate(expression.whenFalse, environment, cache, input, budget),
    ); break;
    case "index": {
      const target = evaluate(expression.target, environment, cache, input, budget);
      const index = evaluateScalar(expression.index, environment, cache, input, budget);
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) throw runtimeInput("Historical index must be a non-negative integer");
      budget.checkLookback(index);
      if (!Array.isArray(target)) throw runtimeCalculation("Historical indexing requires a series");
      result = target.map((_, bar) => bar < index ? null : target[bar - index] ?? null);
      break;
    }
    case "member": {
      const target = evaluate(expression.target, environment, cache, input, budget);
      if (typeof target !== "object" || target === null || !isMacd(target)) throw runtimeCalculation("Only MACD results have selectable outputs");
      result = target[expression.name as "macd" | "signal" | "histogram"];
      break;
    }
    case "call": result = evaluateCall(expression, environment, cache, input, budget); break;
  }
  if (Array.isArray(result)) budget.accountVector(result.length);
  cache.set(expression.nodeId, result);
  return result;
}

function evaluateCall(
  expression: CallExpression,
  environment: ReadonlyMap<string, RuntimeValue>,
  cache: Map<number, RuntimeValue>,
  input: readonly Candle[],
  budget: Budget,
): RuntimeValue {
  if (expression.namespace === "input") throw runtimeCalculation("Input calls are only evaluated as declarations");
  const names = expression.namespace === "ta"
    ? expression.name === "atr" ? ["period"] : expression.name === "macd" ? ["source", "fastPeriod", "slowPeriod", "signalPeriod"] : ["source", "period"]
    : mathArgumentNames(expression.name);
  const args = namedArguments(expression.arguments, names);
  if (expression.namespace === "ta") {
    const sourceArgument = args.get("source");
    const source = sourceArgument === undefined ? undefined : evaluate(sourceArgument.expression, environment, cache, input, budget);
    const period = expression.name === "macd" ? undefined : scalarInteger(args.get("period"), environment, cache, input, budget);
    if (expression.name === "atr") return atrValues(input, period!, budget);
    if (expression.name === "macd") {
      if (source === undefined) throw runtimeCalculation("ta.macd requires a source");
      const fast = scalarInteger(args.get("fastPeriod"), environment, cache, input, budget);
      const slow = scalarInteger(args.get("slowPeriod"), environment, cache, input, budget);
      const signal = scalarInteger(args.get("signalPeriod"), environment, cache, input, budget);
      const values = toNumberSeries(source);
      const fastValues = emaValues(values, fast, budget);
      const slowValues = emaValues(values, slow, budget);
      const macd = values.map((_, index) => numberOrNull(fastValues[index] ?? null) !== null && numberOrNull(slowValues[index] ?? null) !== null ? (fastValues[index] as number) - (slowValues[index] as number) : null);
      const signalValues = emaValues(macd, signal, budget);
      return {
        kind: "macd",
        macd,
        signal: signalValues,
        histogram: macd.map((value, index) => value !== null && signalValues[index] !== null ? value - (signalValues[index] as number) : null),
      };
    }
    if (source === undefined) throw runtimeCalculation(`ta.${expression.name} requires a source`);
    const values = toNumberSeries(source);
    switch (expression.name) {
      case "sma": return smaValues(values, period!, budget);
      case "ema": return emaValues(values, period!, budget);
      case "rsi": return rsiValues(values, period!, budget);
      case "stdev": return stdevValues(values, period!, budget);
      case "highest": return extremeValues(values, period!, "max", budget);
      case "lowest": return extremeValues(values, period!, "min", budget);
      default: throw runtimeCalculation(`Unsupported technical function ta.${expression.name}`);
    }
  }
  const argumentsList = names.map((name) => args.get(name));
  const values = argumentsList.map((argument) => argument === undefined ? null : evaluateScalar(argument.expression, environment, cache, input, budget));
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) return null;
  const numbers = values as number[];
  let result: number;
  switch (expression.name) {
    case "abs": result = Math.abs(numbers[0]!); break;
    case "min": result = Math.min(...numbers); break;
    case "max": result = Math.max(...numbers); break;
    case "sqrt": result = numbers[0]! < 0 ? Number.NaN : Math.sqrt(numbers[0]!); break;
    case "pow": result = Math.pow(numbers[0]!, numbers[1]!); break;
    case "round": result = Math.round(numbers[0]!); break;
    case "floor": result = Math.floor(numbers[0]!); break;
    case "ceil": result = Math.ceil(numbers[0]!); break;
    default: throw runtimeCalculation(`Unsupported function ${expression.name}`);
  }
  return Number.isFinite(result) ? result : null;
}

function evaluateScalar(
  expression: Expression,
  environment: ReadonlyMap<string, RuntimeValue>,
  cache: Map<number, RuntimeValue>,
  input: readonly Candle[],
  budget: Budget,
): Scalar {
  const value = evaluate(expression, environment, cache, input, budget);
  if (Array.isArray(value) || isMacd(value)) throw runtimeCalculation("Expected a scalar value");
  return value;
}

function unary(operator: "+" | "-" | "not", value: RuntimeValue): RuntimeValue {
  if (Array.isArray(value)) return value.map((item) => unary(operator, item) as Scalar) as Series;
  if (value === null) return null;
  if (operator === "not") return typeof value === "boolean" ? !value : null;
  if (typeof value !== "number") return null;
  return operator === "-" ? -value : value;
}

function binary(operator: string, left: RuntimeValue, right: RuntimeValue): RuntimeValue {
  if (Array.isArray(left) || Array.isArray(right)) {
    const length = Array.isArray(left) ? left.length : Array.isArray(right) ? right.length : 0;
    return Array.from({ length }, (_, index) => binary(operator, Array.isArray(left) ? left[index] ?? null : left, Array.isArray(right) ? right[index] ?? null : right) as Scalar) as Series;
  }
  if (left === null || right === null) return null;
  if (operator === "and" || operator === "or") return typeof left === "boolean" && typeof right === "boolean" ? operator === "and" ? left && right : left || right : null;
  if (["==", "!=", "<", "<=", ">", ">="].includes(operator)) {
    if (operator === "==") return left === right;
    if (operator === "!=") return left !== right;
    if (typeof left !== typeof right) return null;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }
  if (typeof left !== "number" || typeof right !== "number") return null;
  if (operator === "+") return left + right;
  if (operator === "-") return left - right;
  if (operator === "*") return left * right;
  if (operator === "/") return right === 0 ? null : left / right;
  return right === 0 ? null : left % right;
}

function conditional(condition: RuntimeValue, whenTrue: RuntimeValue, whenFalse: RuntimeValue): RuntimeValue {
  if (Array.isArray(condition)) {
    const length = condition.length;
    return Array.from({ length }, (_, index) => conditional(condition[index] ?? null, valueAt(whenTrue, index), valueAt(whenFalse, index)) as Scalar) as Series;
  }
  if (condition === null || typeof condition !== "boolean") return null;
  return condition ? whenTrue : whenFalse;
}

function valueAt(value: RuntimeValue, index: number): RuntimeValue {
  return Array.isArray(value) ? value[index] ?? null : value;
}

function toNumberSeries(value: RuntimeValue): (number | null)[] {
  if (!Array.isArray(value)) throw runtimeCalculation("Expected a numeric series");
  return value.map((item) => typeof item === "number" && Number.isFinite(item) ? item : null);
}

function toPoints(value: RuntimeValue, input: readonly Candle[], budget: Budget): Array<{ time: number; value: number | null }> {
  const values = toNumberSeries(value);
  if (values.length !== input.length) throw runtimeCalculation("Series length does not match input data");
  budget.addOutput(values.length);
  return values.map((item, index) => ({ time: input[index]!.time, value: item }));
}

function scalarString(argument: CallArgument | undefined, environment: ReadonlyMap<string, RuntimeValue>, cache: Map<number, RuntimeValue>, input: readonly Candle[], budget: Budget): string | null {
  if (argument === undefined) return null;
  const value = evaluateScalar(argument.expression, environment, cache, input, budget);
  return typeof value === "string" ? value : null;
}

function scalarInteger(argument: CallArgument | undefined, environment: ReadonlyMap<string, RuntimeValue>, cache: Map<number, RuntimeValue>, input: readonly Candle[], budget: Budget): number {
  if (argument === undefined) throw runtimeInput("Missing period argument");
  const value = evaluateScalar(argument.expression, environment, cache, input, budget);
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw runtimeInput("Period must be a positive integer");
  budget.checkLookback(value);
  return value;
}

function namedArguments(argumentsList: readonly CallArgument[], positionalNames: readonly string[]): Map<string, CallArgument> {
  const result = new Map<string, CallArgument>();
  let position = 0;
  for (const argument of argumentsList) {
    const name = argument.name ?? positionalNames[position++];
    if (name !== undefined) result.set(name, argument);
  }
  return result;
}

function mathArgumentNames(name: string): readonly string[] {
  return name === "min" || name === "max" || name === "pow" ? ["left", "right"] : ["value"];
}

function outputId(program: CheckedProgram, index: number): string {
  return program.metadata.outputs[index]?.id ?? `plot-${index + 1}`;
}

function parameterDefinition(input: KlineScriptInputMetadata): IndicatorMetadata["parameters"][number] {
  return {
    name: input.name,
    type: input.type === "int" ? "integer" : input.type === "float" ? "number" : "boolean",
    defaultValue: input.defaultValue,
    ...(input.min === undefined ? {} : { min: input.min }),
    ...(input.max === undefined ? {} : { max: input.max }),
  };
}

function validateParameters(inputs: readonly KlineScriptInputMetadata[], parameters: unknown): Record<string, unknown> {
  const supplied = typeof parameters === "object" && parameters !== null ? parameters as Record<string, unknown> : {};
  const known = new Set(inputs.map((input) => input.name));
  for (const name of Object.keys(supplied)) if (!known.has(name)) throw runtimeInput(`Unknown input parameter '${name}'`);
  const result: Record<string, unknown> = {};
  for (const input of inputs) {
    const value = Object.prototype.hasOwnProperty.call(supplied, input.name) ? supplied[input.name] : input.defaultValue;
    if (input.type === "int" && (typeof value !== "number" || !Number.isInteger(value))) throw runtimeInput(`Input '${input.name}' must be an integer`);
    if (input.type === "float" && (typeof value !== "number" || !Number.isFinite(value))) throw runtimeInput(`Input '${input.name}' must be finite`);
    if (input.type === "bool" && typeof value !== "boolean") throw runtimeInput(`Input '${input.name}' must be boolean`);
    if (typeof value === "number") {
      if (input.min !== undefined && value < input.min) throw runtimeInput(`Input '${input.name}' is below its minimum`);
      if (input.max !== undefined && value > input.max) throw runtimeInput(`Input '${input.name}' is above its maximum`);
    }
    result[input.name] = value;
  }
  return result;
}

function smaValues(values: readonly (number | null)[], period: number, budget: Budget): (number | null)[] {
  const result: (number | null)[] = [];
  for (let index = 0; index < values.length; index += 1) {
    budget.tickAtBar(1, index);
    const window = values.slice(Math.max(0, index - period + 1), index + 1);
    result.push(window.length === period && window.every((item) => item !== null) ? (window as number[]).reduce((sum, item) => sum + item, 0) / period : null);
  }
  return result;
}

function emaValues(values: readonly (number | null)[], period: number, budget: Budget): (number | null)[] {
  const result: (number | null)[] = [];
  let previous: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    budget.tickAtBar(1, index);
    const window = values.slice(Math.max(0, index - period + 1), index + 1);
    if (window.length < period || window.some((item) => item === null)) {
      result.push(null);
      continue;
    }
    const value = values[index]!;
    previous = previous === null ? (window as number[]).reduce((sum, item) => sum + item, 0) / period : (value as number - previous) * (2 / (period + 1)) + previous;
    result.push(previous);
  }
  return result;
}

function rsiValues(values: readonly (number | null)[], period: number, budget: Budget): (number | null)[] {
  const result: (number | null)[] = values.map(() => null);
  let gainSum = 0;
  let lossSum = 0;
  let averageGain: number | null = null;
  let averageLoss: number | null = null;
  for (let index = 1; index < values.length; index += 1) {
    budget.tickAtBar(1, index);
    const previous = values[index - 1] ?? null;
    const current = values[index] ?? null;
    if (previous === null || current === null) {
      gainSum = 0;
      lossSum = 0;
      averageGain = null;
      averageLoss = null;
      continue;
    }
    const change = current - previous;
    if (index <= period) {
      gainSum += Math.max(change, 0);
      lossSum += Math.max(-change, 0);
      if (index === period) {
        averageGain = gainSum / period;
        averageLoss = lossSum / period;
      }
    } else {
      if (averageGain === null || averageLoss === null) continue;
      averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
      averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    }
    if (averageGain !== null && averageLoss !== null) result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

function stdevValues(values: readonly (number | null)[], period: number, budget: Budget): (number | null)[] {
  const means = smaValues(values, period, budget);
  return means.map((mean, index) => {
    budget.tickAtBar(1, index);
    const window = values.slice(index - period + 1, index + 1);
    if (mean === null || window.length !== period || window.some((item) => item === null)) return null;
    const numericWindow = window as number[];
    return Math.sqrt(numericWindow.reduce((sum, item) => sum + (item - mean) ** 2, 0) / period);
  });
}

function extremeValues(values: readonly (number | null)[], period: number, mode: "min" | "max", budget: Budget): (number | null)[] {
  return values.map((_, index) => {
    budget.tickAtBar(1, index);
    const window = values.slice(index - period + 1, index + 1);
    if (window.length !== period || window.some((item) => item === null)) return null;
    return mode === "min" ? Math.min(...window as number[]) : Math.max(...window as number[]);
  });
}

function atrValues(input: readonly Candle[], period: number, budget: Budget): (number | null)[] {
  const trueRanges: number[] = [];
  input.forEach((candle, index) => {
    budget.tickAtBar(1, index);
    const previous = input[index - 1]?.close;
    trueRanges.push(previous === undefined ? candle.high - candle.low : Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous)));
  });
  return emaLikeWilder(trueRanges, period, budget);
}

function emaLikeWilder(values: readonly number[], period: number, budget: Budget): (number | null)[] {
  let previous: number | null = null;
  return values.map((value, index) => {
    budget.tickAtBar(1, index);
    if (index < period - 1) return null;
    previous = previous === null ? values.slice(index - period + 1, index + 1).reduce((sum, item) => sum + item, 0) / period : (previous * (period - 1) + value) / period;
    return previous;
  });
}

function numberOrNull(value: Scalar): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isMacd(value: RuntimeValue): value is MacdValue {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "kind" in value && value.kind === "macd";
}

class Budget {
  public operations = 0;
  private outputPoints = 0;
  private currentBar = -1;
  private operationsAtBar = 0;

  public constructor(private readonly limits: Required<KlineScriptRuntimeLimits>, private readonly signal?: AbortSignal) {}

  public tick(units = 1, enforcePerBar = true): void {
    this.operations += units;
    if (this.operations > this.limits.maxOperations) throw runtimeBudget("KlineScript operation budget exhausted");
    if (enforcePerBar && units > this.limits.maxOperationsPerBar) throw runtimeBudget("KlineScript per-bar operation budget exhausted");
    this.check();
  }

  public tickAtBar(units: number, bar: number): void {
    if (this.currentBar !== bar) {
      this.currentBar = bar;
      this.operationsAtBar = 0;
    }
    this.operationsAtBar += units;
    if (this.operationsAtBar > this.limits.maxOperationsPerBar) throw runtimeBudget("KlineScript per-bar operation budget exhausted");
    this.tick(units, false);
  }

  public accountVector(length: number): void {
    this.tick(length, false);
  }

  public checkLookback(value: number): void {
    if (value > this.limits.maxLookback) throw runtimeBudget("Historical lookback exceeds the runtime limit");
  }

  public addOutput(points: number): void {
    this.tick(points, false);
    this.outputPoints += points;
    if (this.outputPoints > this.limits.maxOutputPoints) throw runtimeBudget("KlineScript output allocation exceeds the limit");
  }

  public check(): void {
    if (this.signal?.aborted) throw new KlineScriptRuntimeError("RUNTIME_CANCELLED", "KlineScript execution was cancelled");
  }
}

function runtimeInput(message: string): KlineScriptRuntimeError {
  return new KlineScriptRuntimeError("RUNTIME_INPUT", message);
}

function runtimeBudget(message: string): KlineScriptRuntimeError {
  return new KlineScriptRuntimeError("RUNTIME_BUDGET", message);
}

function runtimeCalculation(message: string): KlineScriptRuntimeError {
  return new KlineScriptRuntimeError("RUNTIME_CALCULATION", message);
}
