import type {
  BinaryOperator,
  Expression,
  IdentifierExpression,
  LiteralExpression,
} from "./ast.js";
import type { CheckedProgram } from "./checker.js";
import type { KlineScriptExecutionResult } from "./runtime.js";

/** Internal, deliberately narrow plan for safe append-only execution. */
export interface KlineScriptIncrementalPlan {
  readonly kind: "pointwise-append";
  readonly outputs: readonly KlineScriptIncrementalOutput[];
}

interface KlineScriptIncrementalOutput {
  readonly id: string;
  readonly expression: IncrementalExpression;
}

type IncrementalExpression =
  | { readonly kind: "field"; readonly name: "open" | "high" | "low" | "close" | "volume" | "time" }
  | { readonly kind: "literal"; readonly value: number | string | boolean | null }
  | { readonly kind: "unary"; readonly operator: "+" | "-" | "not"; readonly expression: IncrementalExpression }
  | { readonly kind: "binary"; readonly operator: BinaryOperator; readonly left: IncrementalExpression; readonly right: IncrementalExpression }
  | { readonly kind: "conditional"; readonly condition: IncrementalExpression; readonly whenTrue: IncrementalExpression; readonly whenFalse: IncrementalExpression };

export function classifyKlineScriptIncrementalPlan(program: CheckedProgram): KlineScriptIncrementalPlan | undefined {
  const outputs: KlineScriptIncrementalOutput[] = [];
  for (const statement of program.ast.statements) {
    if (statement.kind === "indicator") continue;
    // Input declarations require parameter validation and are intentionally
    // left on the reference path until retained parameter state is added.
    if (statement.kind === "assignment") return undefined;
    if (statement.kind === "plot") {
      const series = namedArgument(statement.arguments, "series", 0);
      const expression = series === undefined ? undefined : classifyExpression(series.expression, true);
      if (expression === undefined) return undefined;
      outputs.push({ id: `plot-${outputs.length + 1}`, expression });
      continue;
    }
    if (statement.kind === "hline") {
      const value = namedArgument(statement.arguments, "value", 0);
      const expression = value === undefined ? undefined : classifyExpression(value.expression, false);
      if (expression === undefined) return undefined;
      outputs.push({ id: `hline-${outputs.length + 1}`, expression });
      continue;
    }
    return undefined;
  }
  return outputs.length === program.metadata.outputs.length && outputs.length > 0
    ? { kind: "pointwise-append", outputs }
    : undefined;
}

export function executeKlineScriptIncremental(
  plan: KlineScriptIncrementalPlan | undefined,
  input: readonly import("../types.js").Candle[],
  previous: KlineScriptExecutionResult | undefined,
  parameters: Readonly<Record<string, unknown>>,
): KlineScriptExecutionResult | undefined {
  if (plan === undefined || previous === undefined || Object.keys(parameters).length > 0 || input.length === 0) return undefined;
  if (previous.outputs.length !== plan.outputs.length || previous.outputs.some((output) => output.points.length !== input.length - 1)) return undefined;
  const candle = input[input.length - 1];
  if (candle === undefined) return undefined;
  const outputs = plan.outputs.map((planned, index) => {
    const previousOutput = previous.outputs[index];
    if (previousOutput === undefined) return undefined;
    const value = numericValue(evaluateExpression(planned.expression, candle));
    return { ...previousOutput, points: [...previousOutput.points, { time: candle.time, value }] };
  });
  if (outputs.some((output) => output === undefined)) return undefined;
  return {
    indicatorId: previous.indicatorId,
    parameters: { ...previous.parameters },
    outputs: outputs as KlineScriptExecutionResult["outputs"],
    operations: plan.outputs.length,
  };
}

function classifyExpression(expression: Expression, allowSeries: boolean): IncrementalExpression | undefined {
  switch (expression.kind) {
    case "literal": return cloneLiteral(expression);
    case "identifier": return isField(expression) && allowSeries ? { kind: "field", name: expression.name } : undefined;
    case "unary": {
      const child = classifyExpression(expression.expression, allowSeries);
      return child === undefined ? undefined : { kind: "unary", operator: expression.operator, expression: child };
    }
    case "binary": {
      const left = classifyExpression(expression.left, allowSeries);
      const right = classifyExpression(expression.right, allowSeries);
      return left === undefined || right === undefined ? undefined : { kind: "binary", operator: expression.operator, left, right };
    }
    case "conditional": {
      const condition = classifyExpression(expression.condition, allowSeries);
      const whenTrue = classifyExpression(expression.whenTrue, allowSeries);
      const whenFalse = classifyExpression(expression.whenFalse, allowSeries);
      return condition === undefined || whenTrue === undefined || whenFalse === undefined
        ? undefined
        : { kind: "conditional", condition, whenTrue, whenFalse };
    }
    default: return undefined;
  }
}

function cloneLiteral(expression: LiteralExpression): IncrementalExpression {
  return { kind: "literal", value: expression.value };
}

function isField(expression: IdentifierExpression): expression is IdentifierExpression & { readonly name: "open" | "high" | "low" | "close" | "volume" | "time" } {
  return expression.name === "open" || expression.name === "high" || expression.name === "low" || expression.name === "close" || expression.name === "volume" || expression.name === "time";
}

function namedArgument(argumentsList: readonly { readonly name?: string; readonly expression: Expression }[], name: string, position: number): { readonly expression: Expression } | undefined {
  return argumentsList.find((argument) => argument.name === name) ?? argumentsList.filter((argument) => argument.name === undefined)[position];
}

function evaluateExpression(expression: IncrementalExpression, candle: import("../types.js").Candle): number | string | boolean | null {
  if (expression.kind === "literal") return expression.value;
  if (expression.kind === "field") return candle[expression.name] ?? null;
  if (expression.kind === "unary") {
    const value = evaluateExpression(expression.expression, candle);
    if (value === null) return null;
    if (expression.operator === "not") return typeof value === "boolean" ? !value : null;
    return typeof value === "number" ? expression.operator === "-" ? -value : value : null;
  }
  if (expression.kind === "conditional") {
    const condition = evaluateExpression(expression.condition, candle);
    if (typeof condition !== "boolean") return null;
    return evaluateExpression(condition ? expression.whenTrue : expression.whenFalse, candle);
  }
  const left = evaluateExpression(expression.left, candle);
  const right = evaluateExpression(expression.right, candle);
  if (left === null || right === null) return null;
  if (expression.operator === "and" || expression.operator === "or") return typeof left === "boolean" && typeof right === "boolean" ? expression.operator === "and" ? left && right : left || right : null;
  if (["==", "!=", "<", "<=", ">", ">="].includes(expression.operator)) {
    if (expression.operator === "==") return left === right;
    if (expression.operator === "!=") return left !== right;
    if (typeof left !== typeof right) return null;
    if (expression.operator === "<") return left < right;
    if (expression.operator === "<=") return left <= right;
    if (expression.operator === ">") return left > right;
    return left >= right;
  }
  if (typeof left !== "number" || typeof right !== "number") return null;
  if (expression.operator === "+") return left + right;
  if (expression.operator === "-") return left - right;
  if (expression.operator === "*") return left * right;
  if (expression.operator === "/") return right === 0 ? null : left / right;
  return right === 0 ? null : left % right;
}

function numericValue(value: number | string | boolean | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
