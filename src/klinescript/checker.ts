import type {
  AssignmentStatement,
  CallArgument,
  CallExpression,
  Expression,
  HlineStatement,
  IndicatorStatement,
  LiteralExpression,
  ParsedProgram,
  PlotStatement,
  SourceSpan,
  Statement,
} from "./ast.js";
import { diagnostic, type KlineScriptDiagnostic } from "./diagnostics.js";

export type KlineScriptScalarType = "int" | "float" | "bool" | "string" | "color" | "missing";
export interface KlineScriptSeriesType {
  readonly kind: "series";
  readonly element: "int" | "float" | "bool";
}
export interface KlineScriptMacdType {
  readonly kind: "macd";
}
export type KlineScriptType = KlineScriptScalarType | KlineScriptSeriesType | KlineScriptMacdType;

export interface KlineScriptInputMetadata {
  readonly name: string;
  readonly label: string;
  readonly type: "int" | "float" | "bool";
  readonly defaultValue: number | boolean;
  readonly min?: number;
  readonly max?: number;
}

export interface KlineScriptOutputMetadata {
  readonly id: string;
  readonly title: string;
  readonly kind: "line" | "histogram";
  readonly color?: string;
  readonly width?: number;
  readonly visible?: boolean;
}

export interface KlineScriptIndicatorMetadata {
  readonly name: string;
  readonly overlay: boolean;
  readonly inputs: readonly KlineScriptInputMetadata[];
  readonly outputs: readonly KlineScriptOutputMetadata[];
  readonly maxLookback: number;
}

export interface CheckedProgram {
  readonly ast: ParsedProgram;
  readonly metadata: KlineScriptIndicatorMetadata;
  readonly types: ReadonlyMap<number, KlineScriptType>;
  readonly symbols: ReadonlyMap<string, KlineScriptType>;
}

export interface CheckOptions {
  readonly maxAstNodes?: number;
  readonly maxAstDepth?: number;
  readonly maxDeclarations?: number;
  readonly maxLookback?: number;
}

const DEFAULT_MAX_AST_NODES = 20_000;
const DEFAULT_MAX_AST_DEPTH = 128;
const DEFAULT_MAX_DECLARATIONS = 256;
const DEFAULT_MAX_LOOKBACK = 5_000;

const seriesFloat: KlineScriptSeriesType = { kind: "series", element: "float" };
const seriesInt: KlineScriptSeriesType = { kind: "series", element: "int" };
const seriesBool: KlineScriptSeriesType = { kind: "series", element: "bool" };
const macdType: KlineScriptMacdType = { kind: "macd" };

export function checkKlineScript(ast: ParsedProgram, options: CheckOptions = {}): { program: CheckedProgram | null; diagnostics: readonly KlineScriptDiagnostic[] } {
  return new Checker(ast, options).check();
}

class Checker {
  private readonly diagnostics: KlineScriptDiagnostic[] = [];
  private readonly types = new Map<number, KlineScriptType>();
  private readonly symbols = new Map<string, KlineScriptType>([
    ["open", seriesFloat],
    ["high", seriesFloat],
    ["low", seriesFloat],
    ["close", seriesFloat],
    ["volume", seriesFloat],
    ["time", seriesInt],
  ]);
  private readonly inputs: KlineScriptInputMetadata[] = [];
  private readonly outputs: KlineScriptOutputMetadata[] = [];
  private indicatorName = "";
  private overlay = true;
  private maxLookback = 0;
  private nodeCount = 0;

  public constructor(private readonly ast: ParsedProgram, private readonly options: CheckOptions) {}

  public check(): { program: CheckedProgram | null; diagnostics: readonly KlineScriptDiagnostic[] } {
    if (this.ast.statements.length === 0) this.fail("KS3001", "A script must contain an indicator declaration", this.ast.span);
    if (this.ast.statements[0]?.kind !== "indicator") this.fail("KS3002", "The indicator declaration must be the first statement", this.ast.statements[0]?.span ?? this.ast.span);
    const maxDeclarations = this.options.maxDeclarations ?? DEFAULT_MAX_DECLARATIONS;
    if (this.ast.statements.length > maxDeclarations) this.fail("KS3003", `A script may contain at most ${maxDeclarations} statements`, this.ast.span);

    for (const statement of this.ast.statements) {
      this.nodeCount += countNodes(statement);
      if (maxDepth(statement) > (this.options.maxAstDepth ?? DEFAULT_MAX_AST_DEPTH)) {
        this.fail("KS3007", `Expression nesting exceeds the ${(this.options.maxAstDepth ?? DEFAULT_MAX_AST_DEPTH)}-level limit`, statement.span);
      }
      if (this.nodeCount > (this.options.maxAstNodes ?? DEFAULT_MAX_AST_NODES)) {
        this.fail("KS3004", `The AST exceeds the ${(this.options.maxAstNodes ?? DEFAULT_MAX_AST_NODES)}-node limit`, statement.span);
        break;
      }
      this.checkStatement(statement);
    }
    const maxLookback = this.options.maxLookback ?? DEFAULT_MAX_LOOKBACK;
    if (this.maxLookback > maxLookback) this.fail("KS3010", `Historical lookback exceeds the ${maxLookback}-bar limit`, this.ast.span);
    if (this.indicatorName === "") this.fail("KS3005", "Missing indicator declaration", this.ast.span);
    if (this.outputs.length === 0) this.fail("KS3006", "An indicator must declare at least one plot or hline", this.ast.span);
    if (this.diagnostics.some((item) => item.severity === "error")) return { program: null, diagnostics: this.diagnostics };
    const metadata: KlineScriptIndicatorMetadata = {
      name: this.indicatorName,
      overlay: this.overlay,
      inputs: this.inputs.map((input) => ({ ...input })),
      outputs: this.outputs.map((output) => ({ ...output })),
      maxLookback: this.maxLookback,
    };
    return {
      program: { ast: this.ast, metadata, types: this.types, symbols: this.symbols },
      diagnostics: this.diagnostics,
    };
  }

  private checkStatement(statement: Statement): void {
    if (statement.kind === "indicator") {
      this.checkIndicator(statement);
      return;
    }
    if (statement.kind === "assignment") {
      this.checkAssignment(statement);
      return;
    }
    if (statement.kind === "plot") {
      this.checkPlot(statement);
      return;
    }
    this.checkHline(statement);
  }

  private checkIndicator(statement: IndicatorStatement): void {
    if (this.indicatorName !== "") this.fail("KS3011", "Only one indicator declaration is allowed", statement.span);
    const args = this.argumentsFor(statement.arguments, ["name"], ["overlay"], statement.span);
    const name = args.get("name");
    if (name === undefined) return;
    const nameType = this.checkExpression(name.expression);
    if (nameType !== "string" || name.expression.kind !== "literal" || typeof name.expression.value !== "string") {
      this.fail("KS3012", "indicator name must be a string literal", name.expression.span);
    } else {
      this.indicatorName = name.expression.value;
      if (this.indicatorName.length === 0 || this.indicatorName.length > 128) this.fail("KS3013", "indicator name must contain 1-128 characters", name.expression.span);
    }
    const overlay = args.get("overlay");
    if (overlay !== undefined) {
      const overlayType = this.checkExpression(overlay.expression);
      if (overlayType !== "bool" || overlay.expression.kind !== "literal") this.fail("KS3014", "indicator overlay must be a boolean literal", overlay.expression.span);
      else this.overlay = overlay.expression.value === true;
    }
  }

  private checkAssignment(statement: AssignmentStatement): void {
    if (this.symbols.has(statement.name) || isReservedName(statement.name)) {
      this.fail("KS3020", `Identifier '${statement.name}' is reserved or already defined`, statement.nameSpan);
      this.checkExpression(statement.expression);
      return;
    }
    if (this.inputs.some((input) => input.name === statement.name)) {
      this.fail("KS3021", `Input '${statement.name}' is already defined`, statement.nameSpan);
      return;
    }
    const input = statement.expression.kind === "call" && statement.expression.namespace === "input"
      ? this.checkInputCall(statement.name, statement.expression)
      : null;
    const type = input ?? this.checkExpression(statement.expression);
    if (type !== null) this.symbols.set(statement.name, type);
  }

  private checkInputCall(name: string, call: CallExpression): KlineScriptType {
    if (call.name !== "int" && call.name !== "float" && call.name !== "bool") {
      this.fail("KS3030", `Unsupported input type 'input.${call.name}'`, call.span);
      return "missing";
    }
    const kind = call.name;
    const args = this.argumentsFor(call.arguments, ["label", "default"], ["min", "max"], call.span);
    const label = args.get("label");
    const defaultArgument = args.get("default");
    if (label === undefined || defaultArgument === undefined) {
      this.fail("KS3031", `input.${kind} requires label and default arguments`, call.span);
      return kind === "bool" ? "bool" : kind === "int" ? "int" : "float";
    }
    const labelType = this.checkExpression(label.expression);
    if (labelType !== "string" || label.expression.kind !== "literal" || typeof label.expression.value !== "string") {
      this.fail("KS3032", "Input label must be a string literal", label.expression.span);
    }
    const expected: KlineScriptScalarType = kind === "bool" ? "bool" : kind === "int" ? "int" : "float";
    const defaultType = this.checkExpression(defaultArgument.expression);
    if (!isAssignable(defaultType, expected)) this.fail("KS3033", `input.${kind} default has type ${typeName(defaultType)}, expected ${expected}`, defaultArgument.expression.span);
    const min = this.checkInputBound(args.get("min"), kind, "min", expected);
    const max = this.checkInputBound(args.get("max"), kind, "max", expected);
    if (min !== undefined && max !== undefined && min > max) this.fail("KS3034", "Input min must not be greater than max", call.span);
    if (this.inputs.some((input) => input.name === name)) this.fail("KS3035", `Duplicate input '${name}'`, call.span);
    const defaultValue = literalValue(defaultArgument.expression);
    if (kind === "bool" && typeof defaultValue !== "boolean") return expected;
    if (kind !== "bool" && typeof defaultValue !== "number") return expected;
    this.inputs.push({
      name,
      label: typeof label.expression === "object" && label.expression.kind === "literal" && typeof label.expression.value === "string" ? label.expression.value : name,
      type: kind,
      defaultValue: defaultValue as number | boolean,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    });
    return expected;
  }

  private checkInputBound(argument: CallArgument | undefined, kind: string, name: string, expected: KlineScriptScalarType): number | undefined {
    if (argument === undefined) return undefined;
    const type = this.checkExpression(argument.expression);
    if (!isAssignable(type, expected) || expected === "bool") {
      this.fail("KS3036", `${kind}.${name} must be a numeric ${expected} value`, argument.expression.span);
      return undefined;
    }
    const value = literalValue(argument.expression);
    if (typeof value !== "number" || !Number.isFinite(value)) this.fail("KS3037", `${name} must be a finite literal`, argument.expression.span);
    if (kind === "int" && typeof value === "number" && !Number.isInteger(value)) this.fail("KS3038", `${name} must be an integer`, argument.expression.span);
    return typeof value === "number" ? value : undefined;
  }

  private checkPlot(statement: PlotStatement): void {
    if (this.outputs.length >= 64) this.fail("KS3040", "An indicator may declare at most 64 outputs", statement.span);
    const args = this.argumentsFor(statement.arguments, ["series"], ["title", "color", "width", "visible"], statement.span);
    const series = args.get("series");
    if (series === undefined) return;
    const seriesType = this.checkExpression(series.expression);
    if (!isNumericSeries(seriesType)) this.fail("KS3041", `plot expects a numeric series, received ${typeName(seriesType)}`, series.expression.span);
    const title = this.staticString(args.get("title"), "title", statement.span) ?? `Plot ${this.outputs.length + 1}`;
    const color = this.staticString(args.get("color"), "color", statement.span);
    const width = this.staticNumber(args.get("width"), "width", statement.span, true);
    const visible = this.staticBoolean(args.get("visible"), "visible", statement.span);
    this.outputs.push({
      id: `plot-${this.outputs.length + 1}`,
      title,
      kind: "line",
      ...(color === undefined ? {} : { color }),
      ...(width === undefined ? {} : { width }),
      ...(visible === undefined ? {} : { visible }),
    });
  }

  private checkHline(statement: HlineStatement): void {
    if (this.outputs.length >= 64) this.fail("KS3042", "An indicator may declare at most 64 outputs", statement.span);
    const args = this.argumentsFor(statement.arguments, ["value"], ["color"], statement.span);
    const value = args.get("value");
    if (value === undefined) return;
    const valueType = this.checkExpression(value.expression);
    if (!isNumeric(valueType)) this.fail("KS3043", `hline expects a numeric scalar, received ${typeName(valueType)}`, value.expression.span);
    const color = this.staticString(args.get("color"), "color", statement.span);
    this.outputs.push({
      id: `hline-${this.outputs.length + 1}`,
      title: "Reference",
      kind: "line",
      ...(color === undefined ? {} : { color }),
    });
  }

  private checkExpression(expression: Expression): KlineScriptType {
    const existing = this.types.get(expression.nodeId);
    if (existing !== undefined) return existing;
    let type: KlineScriptType;
    switch (expression.kind) {
      case "literal": type = literalType(expression); break;
      case "identifier": {
        const symbol = this.symbols.get(expression.name);
        if (symbol === undefined) {
          this.fail("KS3050", `Unknown identifier '${expression.name}'`, expression.span);
          type = "missing";
        } else type = symbol;
        break;
      }
      case "unary": {
        const operand = this.checkExpression(expression.expression);
        if (expression.operator === "not") {
          if (!isBoolean(operand)) this.fail("KS3051", `not expects bool or series<bool>, received ${typeName(operand)}`, expression.span);
          type = isSeries(operand) ? seriesBool : "bool";
        } else {
          if (!isNumericLike(operand)) this.fail("KS3052", `Unary ${expression.operator} expects a number`, expression.span);
          type = operand;
        }
        break;
      }
      case "binary": type = this.checkBinary(expression.operator, expression.left, expression.right, expression.span); break;
      case "conditional": {
        const condition = this.checkExpression(expression.condition);
        const whenTrue = this.checkExpression(expression.whenTrue);
        const whenFalse = this.checkExpression(expression.whenFalse);
        if (!isBoolean(condition)) this.fail("KS3053", "Conditional expression requires a boolean condition", expression.condition.span);
        const merged = mergeTypes(whenTrue, whenFalse);
        if (merged === null) {
          this.fail("KS3054", `Conditional branches have incompatible types ${typeName(whenTrue)} and ${typeName(whenFalse)}`, expression.span);
          type = "missing";
        } else type = isSeries(condition) && !isSeries(merged) ? toSeries(merged) : merged;
        break;
      }
      case "index": {
        const target = this.checkExpression(expression.target);
        const index = this.checkExpression(expression.index);
        if (!isSeries(target)) this.fail("KS3055", "Historical indexing requires a series", expression.target.span);
        if (index !== "int") this.fail("KS3056", "Historical index must be an int scalar", expression.index.span);
        const literalIndex = literalValue(expression.index);
        if (typeof literalIndex === "number") {
          if (!Number.isInteger(literalIndex) || literalIndex < 0) this.fail("KS3057", "Historical index must be non-negative", expression.index.span);
          this.maxLookback = Math.max(this.maxLookback, literalIndex);
        }
        type = isSeries(target) ? { kind: "series", element: target.element } : "missing";
        break;
      }
      case "member": {
        const target = this.checkExpression(expression.target);
        if (typeof target !== "object" || target.kind !== "macd" || !["macd", "signal", "histogram"].includes(expression.name)) {
          this.fail("KS3058", `Unsupported member '${expression.name}'`, expression.span);
          type = "missing";
        } else type = seriesFloat;
        break;
      }
      case "call": type = this.checkCall(expression); break;
    }
    this.types.set(expression.nodeId, type);
    return type;
  }

  private checkBinary(operator: string, leftExpression: Expression, rightExpression: Expression, span: SourceSpan): KlineScriptType {
    const left = this.checkExpression(leftExpression);
    const right = this.checkExpression(rightExpression);
    if (operator === "and" || operator === "or") {
      if (!isBoolean(left) || !isBoolean(right)) this.fail("KS3059", `${operator} expects boolean operands`, span);
      return isSeries(left) || isSeries(right) ? seriesBool : "bool";
    }
    if (["==", "!=", "<", "<=", ">", ">="].includes(operator)) {
      if (!areComparable(left, right)) this.fail("KS3060", `Cannot compare ${typeName(left)} with ${typeName(right)}`, span);
      return isSeries(left) || isSeries(right) ? seriesBool : "bool";
    }
    if (!isNumericLike(left) || !isNumericLike(right)) this.fail("KS3061", `${operator} expects numeric operands`, span);
    if (isSeries(left) || isSeries(right)) return { kind: "series", element: leftSeriesElement(left, right) };
    return left === "float" || right === "float" || operator === "/" ? "float" : "int";
  }

  private checkCall(expression: CallExpression): KlineScriptType {
    if (expression.namespace === "input") {
      this.fail("KS3062", "input.* calls are only valid as input assignments", expression.span);
      return "missing";
    }
    if (expression.namespace === "ta") return this.checkTaCall(expression);
    const signatures: Record<string, { args: readonly string[]; result: KlineScriptScalarType }> = {
      abs: { args: ["value"], result: "float" },
      min: { args: ["left", "right"], result: "float" },
      max: { args: ["left", "right"], result: "float" },
      sqrt: { args: ["value"], result: "float" },
      pow: { args: ["base", "exponent"], result: "float" },
      round: { args: ["value"], result: "int" },
      floor: { args: ["value"], result: "int" },
      ceil: { args: ["value"], result: "int" },
    };
    const signature = signatures[expression.name];
    if (signature === undefined) {
      this.fail("KS3063", `Unsupported function '${expression.name}'`, expression.span);
      return "missing";
    }
    const args = this.argumentsFor(expression.arguments, signature.args, [], expression.span);
    for (const name of signature.args) {
      const argument = args.get(name);
      if (argument === undefined) continue;
      const type = this.checkExpression(argument.expression);
      if (!isNumeric(type)) this.fail("KS3064", `${expression.name} expects numeric arguments`, argument.expression.span);
      if (isSeries(type)) this.fail("KS3065", `${expression.name} only accepts scalar numbers in v0.1`, argument.expression.span);
    }
    return signature.result;
  }

  private checkTaCall(expression: CallExpression): KlineScriptType {
    const definitions: Record<string, { args: readonly string[]; result: KlineScriptType }> = {
      sma: { args: ["source", "period"], result: seriesFloat },
      ema: { args: ["source", "period"], result: seriesFloat },
      rsi: { args: ["source", "period"], result: seriesFloat },
      stdev: { args: ["source", "period"], result: seriesFloat },
      highest: { args: ["source", "period"], result: seriesFloat },
      lowest: { args: ["source", "period"], result: seriesFloat },
      atr: { args: ["period"], result: seriesFloat },
      macd: { args: ["source", "fastPeriod", "slowPeriod", "signalPeriod"], result: macdType },
    };
    const definition = definitions[expression.name];
    if (definition === undefined) {
      this.fail("KS3066", `Unsupported technical function 'ta.${expression.name}'`, expression.span);
      return "missing";
    }
    const args = this.argumentsFor(expression.arguments, definition.args, [], expression.span);
    definition.args.forEach((name, index) => {
      const argument = args.get(name);
      if (argument === undefined) return;
      const type = this.checkExpression(argument.expression);
      if (index === 0 && ["sma", "ema", "rsi", "stdev", "highest", "lowest", "macd"].includes(expression.name)) {
        if (!isNumericSeries(type)) this.fail("KS3067", `ta.${expression.name} source must be a numeric series`, argument.expression.span);
      } else if (type !== "int") {
        this.fail("KS3068", `ta.${expression.name} length arguments must be int scalars`, argument.expression.span);
      }
      const value = literalValue(argument.expression);
      if (index > 0 || expression.name === "atr") {
        if (typeof value === "number") {
          if (!Number.isInteger(value) || value < 1) this.fail("KS3069", "Periods must be positive integers", argument.expression.span);
          this.maxLookback = Math.max(this.maxLookback, value);
        }
      }
    });
    return definition.result;
  }

  private argumentsFor(
    argumentsList: readonly CallArgument[],
    positionalNames: readonly string[],
    namedNames: readonly string[],
    span: SourceSpan,
  ): Map<string, CallArgument> {
    const result = new Map<string, CallArgument>();
    let positionalIndex = 0;
    let sawNamed = false;
    for (const argument of argumentsList) {
      const name = argument.name;
      if (name === undefined) {
        if (sawNamed) this.fail("KS3070", "Positional arguments cannot follow named arguments", argument.span);
        const positionalName = positionalNames[positionalIndex++];
        if (positionalName === undefined) {
          this.fail("KS3071", "Too many positional arguments", argument.span);
          continue;
        }
        if (result.has(positionalName)) this.fail("KS3072", `Duplicate argument '${positionalName}'`, argument.span);
        else result.set(positionalName, argument);
        continue;
      }
      sawNamed = true;
      if (![...positionalNames, ...namedNames].includes(name)) {
        this.fail("KS3073", `Unknown argument '${name}'`, argument.span);
        continue;
      }
      if (result.has(name)) this.fail("KS3072", `Duplicate argument '${name}'`, argument.span);
      else result.set(name, argument);
    }
    if (result.size === 0 && argumentsList.length > 0 && positionalNames.length === 0) this.fail("KS3074", "This call does not accept positional arguments", span);
    return result;
  }

  private staticString(argument: CallArgument | undefined, name: string, _span: SourceSpan): string | undefined {
    if (argument === undefined) return undefined;
    const type = this.checkExpression(argument.expression);
    const value = literalValue(argument.expression);
    if ((type !== "string" && !(name === "color" && type === "color")) || typeof value !== "string") this.fail("KS3075", `${name} must be a string literal`, argument.expression.span);
    return typeof value === "string" ? value : undefined;
  }

  private staticNumber(argument: CallArgument | undefined, name: string, _span: SourceSpan, integer: boolean): number | undefined {
    if (argument === undefined) return undefined;
    const type = this.checkExpression(argument.expression);
    const value = literalValue(argument.expression);
    if (!isNumeric(type) || isSeries(type) || typeof value !== "number") this.fail("KS3076", `${name} must be a numeric literal`, argument.expression.span);
    if (integer && typeof value === "number" && !Number.isInteger(value)) this.fail("KS3077", `${name} must be an integer`, argument.expression.span);
    return typeof value === "number" ? value : undefined;
  }

  private staticBoolean(argument: CallArgument | undefined, name: string, _span: SourceSpan): boolean | undefined {
    if (argument === undefined) return undefined;
    const type = this.checkExpression(argument.expression);
    const value = literalValue(argument.expression);
    if (type !== "bool" || typeof value !== "boolean") this.fail("KS3078", `${name} must be a boolean literal`, argument.expression.span);
    return typeof value === "boolean" ? value : undefined;
  }

  private fail(code: string, message: string, span: SourceSpan): void {
    this.diagnostics.push(diagnostic(code, message, span));
  }
}

function literalType(expression: LiteralExpression): KlineScriptType {
  if (expression.value === null) return "missing";
  if (typeof expression.value === "boolean") return "bool";
  if (typeof expression.value === "string") return isColor(expression.value) ? "color" : "string";
  return Number.isInteger(expression.value) ? "int" : "float";
}

function literalValue(expression: Expression): number | string | boolean | null | undefined {
  return expression.kind === "literal" ? expression.value : undefined;
}

function isColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value);
}

function isSeries(type: KlineScriptType): type is KlineScriptSeriesType {
  return typeof type === "object" && type.kind === "series";
}

function isNumeric(type: KlineScriptType): boolean {
  return type === "int" || type === "float" || type === "missing";
}

function isNumericLike(type: KlineScriptType): boolean {
  return isNumeric(type) || isNumericSeries(type);
}

function isNumericSeries(type: KlineScriptType): boolean {
  return isSeries(type) && (type.element === "int" || type.element === "float");
}

function isBoolean(type: KlineScriptType): boolean {
  return type === "bool" || (isSeries(type) && type.element === "bool");
}

function isAssignable(actual: KlineScriptType, expected: KlineScriptScalarType): boolean {
  return actual === expected || (expected === "float" && actual === "int") || actual === "missing";
}

function areComparable(left: KlineScriptType, right: KlineScriptType): boolean {
  if (isSeries(left) || isSeries(right)) {
    const leftElement = isSeries(left) ? left.element : left;
    const rightElement = isSeries(right) ? right.element : right;
    return (leftElement === "int" || leftElement === "float") && (rightElement === "int" || rightElement === "float")
      || leftElement === rightElement;
  }
  return left === right || (isNumeric(left) && isNumeric(right));
}

function leftSeriesElement(left: KlineScriptType, right: KlineScriptType): "int" | "float" {
  const leftElement = isSeries(left) ? left.element : left;
  const rightElement = isSeries(right) ? right.element : right;
  return leftElement === "float" || rightElement === "float" || leftElement === "missing" || rightElement === "missing" ? "float" : "int";
}

function mergeTypes(left: KlineScriptType, right: KlineScriptType): KlineScriptType | null {
  if (left === right) return left;
  if (isNumeric(left) && isNumeric(right)) return left === "float" || right === "float" ? "float" : "int";
  if (isSeries(left) && isSeries(right) && left.element === right.element) return left;
  if (isSeries(left) && isNumeric(right)) return { kind: "series", element: left.element === "bool" ? left.element : "float" };
  if (isSeries(right) && isNumeric(left)) return { kind: "series", element: right.element === "bool" ? right.element : "float" };
  return null;
}

function toSeries(type: KlineScriptType): KlineScriptSeriesType {
  if (isSeries(type)) return type;
  return { kind: "series", element: type === "bool" ? "bool" : "float" };
}

function typeName(type: KlineScriptType): string {
  if (typeof type === "string") return type;
  if (type.kind === "macd") return "macd";
  return `series<${type.element}>`;
}

function isReservedName(name: string): boolean {
  return ["indicator", "plot", "hline", "open", "high", "low", "close", "volume", "time", "ta", "input", "true", "false", "na"].includes(name);
}

function countNodes(value: unknown, seen = new Set<object>()): number {
  if (value === null || typeof value !== "object") return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  let count = 1;
  for (const child of Object.values(value)) count += countNodes(child, seen);
  return count;
}

function maxDepth(value: unknown, depth = 0, seen = new Set<object>()): number {
  if (value === null || typeof value !== "object" || seen.has(value)) return depth;
  seen.add(value);
  let result = depth + 1;
  for (const child of Object.values(value)) result = Math.max(result, maxDepth(child, depth + 1, seen));
  return result;
}
