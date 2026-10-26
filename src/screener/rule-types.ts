import type { IndicatorRegistry, IndicatorResult } from "../indicators/index.js";

export const OPENKLINE_SCREENER_RULE_VERSION = 1 as const;

export type ScreenerComparisonOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";
export type ScreenerCrossDirection = "above" | "below";
export type ScreenerPriceField = "open" | "high" | "low" | "close";

export interface ScreenerRuleSet {
  readonly version: typeof OPENKLINE_SCREENER_RULE_VERSION;
  readonly id: string;
  readonly name: string;
  readonly root: ScreenerRuleNode;
}

export type ScreenerRuleNode = ScreenerRuleGroup | ScreenerRuleNot | ScreenerRulePredicate;

export interface ScreenerRuleGroup {
  readonly type: "group";
  readonly operator: "and" | "or";
  readonly children: readonly ScreenerRuleNode[];
}

export interface ScreenerRuleNot {
  readonly type: "not";
  readonly child: ScreenerRuleNode;
}

export type ScreenerRulePredicate =
  | ScreenerPriceThresholdRule
  | ScreenerPriceCrossRule
  | ScreenerPriceChangeRule
  | ScreenerRelativePriceRule
  | ScreenerVolumeRule
  | ScreenerIndicatorThresholdRule
  | ScreenerIndicatorCrossRule
  | ScreenerIndicatorBreakoutRule;

export interface ScreenerPriceThresholdRule {
  readonly type: "price-threshold";
  readonly field: ScreenerPriceField;
  readonly operator: ScreenerComparisonOperator;
  readonly value: number;
}

export interface ScreenerPriceCrossRule {
  readonly type: "price-cross";
  readonly field: ScreenerPriceField;
  readonly direction: ScreenerCrossDirection;
  readonly value: number;
}

export interface ScreenerPriceChangeRule {
  readonly type: "price-change";
  readonly lookback: number;
  readonly operator: ScreenerComparisonOperator;
  readonly value: number;
}

export interface ScreenerRelativePriceRule {
  readonly type: "price-relative";
  readonly field: ScreenerPriceField;
  readonly reference: "previous-high" | "previous-low";
  readonly operator: ScreenerComparisonOperator;
}

export interface ScreenerVolumeRule {
  readonly type: "volume";
  readonly mode: "threshold" | "average" | "relative";
  readonly operator: ScreenerComparisonOperator;
  readonly value: number;
  readonly lookback?: number;
}

export interface ScreenerIndicatorReference {
  readonly indicatorId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly output: string;
}

export type ScreenerSeriesReference =
  | { readonly kind: "price"; readonly field: ScreenerPriceField }
  | { readonly kind: "indicator"; readonly reference: ScreenerIndicatorReference };

export interface ScreenerIndicatorThresholdRule {
  readonly type: "indicator-threshold";
  readonly reference: ScreenerIndicatorReference;
  readonly operator: ScreenerComparisonOperator;
  readonly value: number;
}

export interface ScreenerIndicatorCrossRule {
  readonly type: "indicator-cross";
  readonly left: ScreenerSeriesReference;
  readonly right: ScreenerSeriesReference | { readonly kind: "threshold"; readonly value: number };
  readonly direction: ScreenerCrossDirection;
}

/** Compares the current price to the prior completed channel boundary (no lookahead). */
export interface ScreenerIndicatorBreakoutRule {
  readonly type: "indicator-breakout";
  readonly field: ScreenerPriceField;
  readonly channel: ScreenerIndicatorReference;
  readonly direction: ScreenerCrossDirection;
}

export interface ScreenerRuleValidationLimits {
  readonly maxDepth: number;
  readonly maxNodes: number;
}

export const DEFAULT_SCREENER_RULE_LIMITS: ScreenerRuleValidationLimits = { maxDepth: 16, maxNodes: 128 };

export interface ScreenerRuleValidationOptions {
  readonly registry?: IndicatorRegistry;
  readonly limits?: Partial<ScreenerRuleValidationLimits>;
}

export type ScreenerEvaluationState = "matched" | "not-matched" | "unavailable";

export type ScreenerUnavailableReason =
  | "empty-history"
  | "no-eligible-confirmed-bar"
  | "invalid-candle"
  | "insufficient-warmup"
  | "missing-volume"
  | "invalid-indicator"
  | "invalid-parameters"
  | "non-finite-value";

export interface ScreenerRuleDiagnostic {
  readonly code: ScreenerUnavailableReason | "rule-error";
  readonly message: string;
  readonly path?: string;
}

export interface ScreenerRuleEvaluation {
  readonly state: ScreenerEvaluationState;
  readonly value: number | null;
  readonly previousValue: number | null;
  readonly diagnostics: readonly ScreenerRuleDiagnostic[];
}

export interface ScreenerEvaluationOptions {
  readonly index?: number;
  readonly latestFinality?: "confirmed" | "developing";
  readonly registry?: IndicatorRegistry;
  /** Internal/runtime cache populated by incremental sessions; keys use screenerIndicatorReferenceKey. */
  readonly indicatorResults?: ReadonlyMap<string, IndicatorResult>;
}

