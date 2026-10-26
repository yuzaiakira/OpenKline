import { validateCandles } from "../core/candle-store.js";
import { createDefaultIndicatorRegistry, type IndicatorRegistry, type IndicatorResult } from "../indicators/index.js";
import type { Candle } from "../types.js";
import {
  DEFAULT_SCREENER_RULE_LIMITS,
  OPENKLINE_SCREENER_RULE_VERSION,
  type ScreenerComparisonOperator,
  type ScreenerEvaluationOptions,
  type ScreenerIndicatorReference,
  type ScreenerRuleDiagnostic,
  type ScreenerRuleEvaluation,
  type ScreenerRuleGroup,
  type ScreenerRuleNode,
  type ScreenerRuleSet,
  type ScreenerRuleValidationOptions,
  type ScreenerSeriesReference,
  type ScreenerUnavailableReason,
} from "./rule-types.js";
import { ScreenerValidationError } from "./types.js";

export class ScreenerRuleValidationError extends ScreenerValidationError {
  public constructor(message: string) {
    super(message);
    this.name = "ScreenerRuleValidationError";
  }
}

export function validateScreenerRuleSet(
  ruleSet: ScreenerRuleSet,
  options: ScreenerRuleValidationOptions = {},
): ScreenerRuleSet {
  if (!isRecord(ruleSet) || ruleSet.version !== OPENKLINE_SCREENER_RULE_VERSION) throw new ScreenerRuleValidationError("Unsupported screener rule-set version");
  requireText(ruleSet.id, "rule-set id");
  requireText(ruleSet.name, "rule-set name");
  const limits = resolveLimits(options.limits);
  const registry = options.registry ?? createDefaultIndicatorRegistry();
  let nodeCount = 0;
  const root = validateNode(ruleSet.root, registry, limits, 1, () => { nodeCount += 1; if (nodeCount > limits.maxNodes) throw new ScreenerRuleValidationError(`Screener rule-set exceeds maxNodes=${limits.maxNodes}`); });
  return { version: OPENKLINE_SCREENER_RULE_VERSION, id: ruleSet.id.trim(), name: ruleSet.name.trim(), root };
}

export function evaluateScreenerRuleSet(
  ruleSet: ScreenerRuleSet,
  candles: readonly Candle[],
  options: ScreenerEvaluationOptions = {},
): ScreenerRuleEvaluation {
  const validated = validateScreenerRuleSet(ruleSet, { ...(options.registry === undefined ? {} : { registry: options.registry }) });
  if (candles.length === 0) return unavailable("empty-history", "No bars are available");
  const index = options.index ?? candles.length - 1;
  if (!Number.isInteger(index) || index < 0 || index >= candles.length) return unavailable("empty-history", "Evaluation index is outside the history");
  const prefix = candles.slice(0, index + 1);
  try {
    validateCandles(prefix);
  } catch (error) {
    return unavailable("invalid-candle", error instanceof Error ? error.message : String(error));
  }
  if ((options.latestFinality ?? "confirmed") !== "confirmed") return unavailable("no-eligible-confirmed-bar", "Developing bars are not eligible for the default completed-bar evaluation");
  const registry = options.registry ?? createDefaultIndicatorRegistry();
  const context = new EvaluationContext(prefix, index, registry);
  return context.evaluate(validated.root);
}

class EvaluationContext {
  private readonly indicatorCache = new Map<string, IndicatorResult>();

  public constructor(
    private readonly candles: readonly Candle[],
    private readonly index: number,
    private readonly registry: IndicatorRegistry,
  ) {}

  public evaluate(node: ScreenerRuleNode): ScreenerRuleEvaluation {
    switch (node.type) {
      case "group": return this.evaluateGroup(node);
      case "not": {
        const child = this.evaluate(node.child);
        return child.state === "unavailable" ? child : { ...child, state: child.state === "matched" ? "not-matched" : "matched" };
      }
      case "price-threshold": return this.compare(this.price(node.field, this.index), node.value, node.operator);
      case "price-cross": return this.cross(this.price(node.field, this.index - 1), this.price(node.field, this.index), node.value, node.value, node.direction);
      case "price-change": return this.priceChange(node.lookback, node.operator, node.value);
      case "price-relative": return this.compare(this.price(node.field, this.index), this.referencePrice(node.reference), node.operator);
      case "volume": return this.volume(node.mode, node.lookback ?? 1, node.operator, node.value);
      case "indicator-threshold": return this.indicatorThreshold(node.reference, node.operator, node.value);
      case "indicator-cross": return this.seriesCross(node.left, node.right, node.direction);
      case "indicator-breakout": return this.breakout(node.field, node.channel, node.direction);
    }
  }

  private evaluateGroup(node: ScreenerRuleGroup): ScreenerRuleEvaluation {
    const results = node.children.map((child) => this.evaluate(child));
    const diagnostics = results.flatMap((result) => result.diagnostics);
    if (node.operator === "and") {
      if (results.some((result) => result.state === "not-matched")) return { state: "not-matched", value: null, previousValue: null, diagnostics };
      if (results.every((result) => result.state === "matched")) return { state: "matched", value: null, previousValue: null, diagnostics };
      return { state: "unavailable", value: null, previousValue: null, diagnostics };
    }
    if (results.some((result) => result.state === "matched")) return { state: "matched", value: null, previousValue: null, diagnostics };
    if (results.every((result) => result.state === "not-matched")) return { state: "not-matched", value: null, previousValue: null, diagnostics };
    return { state: "unavailable", value: null, previousValue: null, diagnostics };
  }

  private priceChange(lookback: number, operator: ScreenerComparisonOperator, value: number): ScreenerRuleEvaluation {
    const previous = this.price("close", this.index - lookback);
    const current = this.price("close", this.index);
    if (previous === null || current === null || previous === 0) return unavailable("insufficient-warmup", "Price-change lookback is unavailable");
    return this.compare((current - previous) / previous * 100, value, operator);
  }

  private volume(mode: "threshold" | "average" | "relative", lookback: number, operator: ScreenerComparisonOperator, value: number): ScreenerRuleEvaluation {
    const current = this.candles[this.index]?.volume;
    if (current === undefined) return unavailable("missing-volume", "Volume is missing for the evaluated bar");
    if (mode === "threshold") return this.compare(current, value, operator);
    const start = mode === "average" ? this.index - lookback + 1 : this.index - lookback;
    const end = mode === "average" ? this.index + 1 : this.index;
    const values = this.candles.slice(Math.max(0, start), end).map((candle) => candle.volume);
    if (values.length < lookback || values.some((volume) => volume === undefined)) return unavailable("missing-volume", "Volume average requires a complete lookback");
    const completeValues = values as number[];
    const average = completeValues.reduce((sum, volume) => sum + volume, 0) / completeValues.length;
    if (mode === "average") return this.compare(average, value, operator);
    if (average === 0) return unavailable("non-finite-value", "Relative volume average is zero");
    return this.compare(current / average, value, operator);
  }

  private indicatorThreshold(reference: ScreenerIndicatorReference, operator: ScreenerComparisonOperator, value: number): ScreenerRuleEvaluation {
    const series = this.indicatorSeries(reference);
    return this.compare(series.current, value, operator, series.previous);
  }

  private seriesCross(left: ScreenerSeriesReference, right: ScreenerSeriesReference | { readonly kind: "threshold"; readonly value: number }, direction: "above" | "below"): ScreenerRuleEvaluation {
    const leftValues = this.series(left);
    const rightValues = right.kind === "threshold" ? { current: right.value, previous: right.value } : this.series(right);
    return this.cross(leftValues.previous, leftValues.current, rightValues.previous, rightValues.current, direction);
  }

  private breakout(field: "open" | "high" | "low" | "close", channel: ScreenerIndicatorReference, direction: "above" | "below"): ScreenerRuleEvaluation {
    const values = this.indicatorSeries(channel);
    const current = this.price(field, this.index);
    const previousPrice = this.price(field, this.index - 1);
    return this.cross(previousPrice, current, values.previous, values.previous, direction);
  }

  private series(reference: ScreenerSeriesReference): { current: number | null; previous: number | null } {
    return reference.kind === "price" ? { current: this.price(reference.field, this.index), previous: this.price(reference.field, this.index - 1) } : this.indicatorSeries(reference.reference);
  }

  private indicatorSeries(reference: ScreenerIndicatorReference): { current: number | null; previous: number | null } {
    const result = this.getIndicator(reference);
    const output = result?.outputs.find((candidate) => candidate.id === reference.output);
    if (output === undefined) return { current: null, previous: null };
    return { current: output.points[this.index]?.value ?? null, previous: output.points[this.index - 1]?.value ?? null };
  }

  private getIndicator(reference: ScreenerIndicatorReference): IndicatorResult | null {
    const key = `${reference.indicatorId}:${JSON.stringify(reference.parameters)}`;
    const cached = this.indicatorCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const instance = this.registry.create(reference.indicatorId, reference.parameters);
      instance.setInput(this.candles);
      const result = instance.getResult();
      instance.dispose();
      this.indicatorCache.set(key, result);
      return result;
    } catch {
      return null;
    }
  }

  private referencePrice(reference: "previous-high" | "previous-low"): number | null {
    const previous = this.candles[this.index - 1];
    if (previous === undefined) return null;
    return reference === "previous-high" ? previous.high : previous.low;
  }

  private price(field: "open" | "high" | "low" | "close", index: number): number | null {
    const candle = this.candles[index];
    return candle === undefined ? null : candle[field];
  }

  private compare(left: number | null, right: number | null, operator: ScreenerComparisonOperator, previousValue: number | null = null): ScreenerRuleEvaluation {
    if (left === null || right === null) return unavailable("insufficient-warmup", "A comparison value is unavailable");
    if (!Number.isFinite(left) || !Number.isFinite(right)) return unavailable("non-finite-value", "A comparison value is not finite");
    return { state: compareValues(left, right, operator) ? "matched" : "not-matched", value: left, previousValue, diagnostics: [] };
  }

  private cross(previousLeft: number | null, currentLeft: number | null, previousRight: number | null, currentRight: number | null, direction: "above" | "below"): ScreenerRuleEvaluation {
    if (previousLeft === null || currentLeft === null || previousRight === null || currentRight === null) return unavailable("insufficient-warmup", "A crossing requires two comparable observations");
    const matched = direction === "above" ? previousLeft <= previousRight && currentLeft > currentRight : previousLeft >= previousRight && currentLeft < currentRight;
    return { state: matched ? "matched" : "not-matched", value: currentLeft, previousValue: previousLeft, diagnostics: [] };
  }
}

function validateNode(node: ScreenerRuleNode, registry: IndicatorRegistry, limits: { maxDepth: number; maxNodes: number }, depth: number, count: () => void): ScreenerRuleNode {
  count();
  if (!isRecord(node)) throw new ScreenerRuleValidationError("Rule node must be an object");
  if (depth > limits.maxDepth) throw new ScreenerRuleValidationError(`Screener rule-set exceeds maxDepth=${limits.maxDepth}`);
  if (node.type === "group") {
    if (node.operator !== "and" && node.operator !== "or") throw new ScreenerRuleValidationError("Rule group operator must be 'and' or 'or'");
    if (!Array.isArray(node.children) || node.children.length === 0) throw new ScreenerRuleValidationError("Rule groups must contain at least one child");
    return { ...node, children: node.children.map((child) => validateNode(child, registry, limits, depth + 1, count)) };
  }
  if (node.type === "not") return { ...node, child: validateNode(node.child, registry, limits, depth + 1, count) };
  switch (node.type) {
    case "price-threshold": requirePriceField(node.field); requireOperator(node.operator); requireFinite(node.value, "price threshold"); return { ...node };
    case "price-cross": requirePriceField(node.field); requireDirection(node.direction); requireFinite(node.value, "price crossing threshold"); return { ...node };
    case "price-change": requirePositiveInteger(node.lookback, "price-change lookback"); requireOperator(node.operator); requireFinite(node.value, "price change"); return { ...node };
    case "price-relative": requirePriceField(node.field); requireOperator(node.operator); if (node.reference !== "previous-high" && node.reference !== "previous-low") throw new ScreenerRuleValidationError("Unsupported prior price reference"); return { ...node };
    case "volume":
      if (node.mode !== "threshold" && node.mode !== "average" && node.mode !== "relative") throw new ScreenerRuleValidationError("Unsupported volume rule mode");
      requireOperator(node.operator); requireFinite(node.value, "volume threshold");
      if (node.mode !== "threshold") requirePositiveInteger(node.lookback, "volume lookback");
      return { ...node };
    case "indicator-threshold": validateReference(node.reference, registry); requireOperator(node.operator); requireFinite(node.value, "indicator threshold"); return { ...node, reference: normalizeReference(node.reference) };
    case "indicator-cross": validateSeriesReference(node.left, registry); if (node.right.kind === "threshold") requireFinite(node.right.value, "crossing threshold"); else validateSeriesReference(node.right, registry); requireDirection(node.direction); return { ...node };
    case "indicator-breakout": requirePriceField(node.field); validateReference(node.channel, registry); requireDirection(node.direction); return { ...node, channel: normalizeReference(node.channel) };
    default: throw new ScreenerRuleValidationError(`Unsupported rule type: ${(node as { type?: unknown }).type ?? "unknown"}`);
  }
}

function validateSeriesReference(reference: ScreenerSeriesReference, registry: IndicatorRegistry): void {
  if (reference.kind === "price") { requirePriceField(reference.field); return; }
  validateReference(reference.reference, registry);
}

function validateReference(reference: ScreenerIndicatorReference, registry: IndicatorRegistry): void {
  requireText(reference.indicatorId, "indicator id");
  requireText(reference.output, "indicator output");
  try {
    const instance = registry.create(reference.indicatorId, reference.parameters);
    if (!instance.metadata.outputs.some((output) => output.id === reference.output)) throw new ScreenerRuleValidationError(`Unknown output ${reference.output} for indicator ${reference.indicatorId}`);
    instance.dispose();
  } catch (error) {
    if (error instanceof ScreenerRuleValidationError) throw error;
    throw new ScreenerRuleValidationError(`Invalid indicator reference ${reference.indicatorId}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function normalizeReference(reference: ScreenerIndicatorReference): ScreenerIndicatorReference {
  return { indicatorId: reference.indicatorId.trim().toUpperCase(), parameters: { ...reference.parameters }, output: reference.output.trim() };
}

function resolveLimits(overrides: ScreenerRuleValidationOptions["limits"]): { maxDepth: number; maxNodes: number } {
  const limits = { ...DEFAULT_SCREENER_RULE_LIMITS, ...(overrides ?? {}) };
  if (!Number.isInteger(limits.maxDepth) || limits.maxDepth < 1 || !Number.isInteger(limits.maxNodes) || limits.maxNodes < 1) throw new ScreenerRuleValidationError("Rule limits must be positive integers");
  return limits;
}

function compareValues(left: number, right: number, operator: ScreenerComparisonOperator): boolean {
  switch (operator) {
    case ">": return left > right;
    case ">=": return left >= right;
    case "<": return left < right;
    case "<=": return left <= right;
    case "==": return left === right;
    case "!=": return left !== right;
  }
}

function unavailable(code: ScreenerUnavailableReason, message: string): ScreenerRuleEvaluation {
  const diagnostic: ScreenerRuleDiagnostic = { code, message };
  return { state: "unavailable", value: null, previousValue: null, diagnostics: [diagnostic] };
}

function requirePriceField(value: unknown): asserts value is "open" | "high" | "low" | "close" { if (value !== "open" && value !== "high" && value !== "low" && value !== "close") throw new ScreenerRuleValidationError(`Unsupported price field: ${String(value)}`); }
function requireDirection(value: unknown): asserts value is "above" | "below" { if (value !== "above" && value !== "below") throw new ScreenerRuleValidationError(`Unsupported crossing direction: ${String(value)}`); }
function requireOperator(value: unknown): asserts value is ScreenerComparisonOperator { if (value !== ">" && value !== ">=" && value !== "<" && value !== "<=" && value !== "==" && value !== "!=") throw new ScreenerRuleValidationError(`Unsupported comparison operator: ${String(value)}`); }
function requireFinite(value: unknown, label: string): asserts value is number { if (typeof value !== "number" || !Number.isFinite(value)) throw new ScreenerRuleValidationError(`${label} must be finite`); }
function requirePositiveInteger(value: unknown, label: string): asserts value is number { if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new ScreenerRuleValidationError(`${label} must be a positive integer`); }
function requireText(value: unknown, label: string): asserts value is string { if (typeof value !== "string" || value.trim().length === 0) throw new ScreenerRuleValidationError(`${label} must not be empty`); }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

