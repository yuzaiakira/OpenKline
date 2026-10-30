import type { Candle } from "../types.js";
import type { StrategyEvaluationResult, StrategyRegistry, StrategySignal } from "../strategies/index.js";
import type { TransactionCost } from "../backtesting/types.js";

export const OPENKLINE_PORTFOLIO_BACKTEST_VERSION = 1 as const;

export type PortfolioBacktestStatusState = "idle" | "running" | "completed" | "cancelled" | "failed" | "disposed";
export type PortfolioBacktestPhase = "validation" | "signals" | "execution" | "metrics";
export type PortfolioOrderStatus = "submitted" | "pending" | "filled" | "rejected" | "cancelled";
export type PortfolioPositionDirection = "long";
export type PortfolioEventKind = "market-open" | "order-fill" | "bar-complete" | "valuation";
export type PortfolioValuationStatus = "complete" | "partial" | "unknown";
export type PortfolioPriceQuality = "fresh" | "stale" | "unknown" | "execution";
export type PortfolioDuplicateTimestampPolicy = "reject" | "last-write-wins";

export type PortfolioPositionSizing =
  | { readonly type: "fixed-quantity"; readonly quantity: number }
  | { readonly type: "fixed-notional"; readonly amount: number }
  | { readonly type: "percent-equity"; readonly percent: number }
  | { readonly type: "target-weight"; readonly weight: number };

export interface PortfolioStrategyAssignment {
  readonly strategy: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface PortfolioCalendarIdentity {
  readonly id: string;
  readonly version: string;
}

export interface PortfolioInstrumentExecutionOptions {
  readonly positionSizing?: PortfolioPositionSizing;
  readonly allowFractionalQuantity?: boolean;
  readonly enabled?: boolean;
}

export interface PortfolioInstrumentInput {
  readonly id: string;
  readonly symbol: string;
  readonly quoteCurrency: string;
  readonly timeframe: string;
  readonly candles: readonly Candle[];
  readonly strategy: PortfolioStrategyAssignment;
  readonly calendar?: PortfolioCalendarIdentity;
  readonly execution?: PortfolioInstrumentExecutionOptions;
}

export interface PortfolioRiskOptions {
  /** Currency-denominated maximum gross exposure across all open positions. */
  readonly maxTotalGrossExposure?: number;
  /** Currency-denominated maximum gross exposure for one instrument. */
  readonly maxSingleInstrumentExposure?: number;
  /** Fraction of equity allocated to one instrument, from 0 through 1. */
  readonly maxAllocationPerInstrument?: number;
  readonly maxActivePositions?: number;
  /** Cash that must remain available after an entry and its commission. */
  readonly minimumAvailableCash?: number;
  /** Currency-denominated drawdown threshold. */
  readonly maxDrawdown?: number;
  /** Fractional drawdown threshold, from 0 through 1. */
  readonly maxDrawdownPercent?: number;
  /** Risk rejection stops new entries; existing positions are not liquidated. */
  readonly stopNewOrdersOnDrawdown?: boolean;
}

export interface PortfolioValuationOptions {
  readonly policy: "last-known-price";
  /** Maximum age of a completed close used for mark-to-market. */
  readonly maxAgeMs: number;
  /** Unknown/stale marks either make equity incomplete or reject the run. */
  readonly incomplete: "allow" | "reject";
}

export interface PortfolioBacktestProgress {
  readonly phase: PortfolioBacktestPhase;
  readonly processed: number;
  readonly total: number;
  readonly signalCount: number;
  readonly filledOrderCount: number;
}

export interface PortfolioBacktestStatus {
  readonly state: PortfolioBacktestStatusState;
  readonly phase: PortfolioBacktestPhase;
  readonly processed: number;
  readonly total: number;
  readonly signalCount: number;
  readonly filledOrderCount: number;
  readonly error?: string;
}

export interface PortfolioBacktestOptions {
  readonly accountCurrency: string;
  readonly initialCapital: number;
  readonly instruments: readonly PortfolioInstrumentInput[];
  readonly positionSizing: PortfolioPositionSizing;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly risk?: PortfolioRiskOptions;
  readonly valuation?: PortfolioValuationOptions;
  readonly duplicateTimestampPolicy?: PortfolioDuplicateTimestampPolicy;
  readonly allowFractionalQuantity?: boolean;
  readonly strategyRegistry?: StrategyRegistry;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: PortfolioBacktestProgress) => void;
}

export interface PortfolioBacktestAssumptions {
  readonly execution: "next-eligible-bar-open";
  readonly eventPriority: readonly ["market-open", "bar-complete", "order-fill", "valuation"];
  readonly endOfData: "cancel-unfilled-no-next-eligible-bar";
  readonly accountCurrency: string;
  readonly initialCapital: number;
  readonly positionSizing: PortfolioPositionSizing;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly risk: PortfolioRiskOptions;
  readonly valuation: PortfolioValuationOptions;
  readonly duplicateTimestampPolicy: PortfolioDuplicateTimestampPolicy;
  readonly allowFractionalQuantity: boolean;
  readonly longOnly: true;
  readonly leverage: "none";
}

export interface PortfolioTimelineEvent {
  readonly id: string;
  readonly time: number;
  readonly kind: PortfolioEventKind;
  readonly priority: 0 | 1 | 2 | 3;
  readonly instrumentId?: string;
  readonly candleIndex?: number;
  readonly orderId?: string;
  readonly availableAt?: number;
}

export interface PortfolioSignal extends StrategySignal {
  readonly instrumentId: string;
  readonly availableAt: number;
}

export interface PortfolioOrder {
  readonly id: string;
  readonly instrumentId: string;
  readonly strategyId: string;
  readonly signalId: string;
  readonly action: StrategySignal["action"];
  readonly status: PortfolioOrderStatus;
  readonly signalTime: number;
  readonly submissionTime: number;
  readonly fillTime?: number;
  readonly quantity: number;
  readonly referencePrice?: number;
  readonly executionPrice?: number;
  readonly commission: number;
  readonly slippage: number;
  readonly reason?: string;
}

export interface PortfolioTrade {
  readonly id: string;
  readonly instrumentId: string;
  readonly direction: PortfolioPositionDirection;
  readonly entrySignalTime: number;
  readonly entryFillTime: number;
  readonly entryPrice: number;
  readonly exitSignalTime: number;
  readonly exitFillTime: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly grossPnl: number;
  readonly netPnl: number;
  readonly fees: number;
  readonly holdingDurationMs: number;
  readonly exitReason: string;
}

export interface PortfolioPosition {
  readonly instrumentId: string;
  readonly symbol: string;
  readonly direction: PortfolioPositionDirection;
  readonly quantity: number;
  readonly entrySignalTime: number;
  readonly entryFillTime: number;
  readonly entryPrice: number;
  readonly entryFees: number;
  readonly markPrice: number | null;
  readonly markTime: number | null;
  readonly markQuality: PortfolioPriceQuality;
  readonly unrealizedPnl: number | null;
}

export interface PortfolioMark {
  readonly instrumentId: string;
  readonly price: number | null;
  readonly observedAt: number | null;
  readonly quality: PortfolioPriceQuality;
  readonly ageMs: number | null;
}

export interface PortfolioAccountSnapshot {
  readonly time: number | null;
  readonly cash: number;
  readonly availableCash: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number | null;
  readonly equity: number | null;
  readonly peakEquity: number | null;
  readonly drawdown: number | null;
  readonly drawdownPercent: number | null;
  readonly grossExposure: number;
  readonly netExposure: number;
  readonly activePositionCount: number;
  readonly valuationStatus: PortfolioValuationStatus;
  readonly marks: readonly PortfolioMark[];
}

export interface PortfolioInstrumentSummary {
  readonly id: string;
  readonly symbol: string;
  readonly quoteCurrency: string;
  readonly timeframe: string;
  readonly candleCount: number;
  readonly firstTime: number | null;
  readonly lastTime: number | null;
  readonly calendar: PortfolioCalendarIdentity | null;
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly inputFingerprint: string;
}

export interface PortfolioInstrumentContribution {
  readonly instrumentId: string;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number | null;
  readonly netPnl: number | null;
  readonly fees: number;
  readonly grossExposure: number;
  readonly tradeCount: number;
  readonly returnOnAllocatedCapital: number | null;
}

export interface PortfolioPerformanceMetrics {
  readonly totalReturn: number | null;
  readonly netProfit: number | null;
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly maxDrawdown: number | null;
  readonly maxDrawdownPercent: number | null;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number | null;
  readonly totalCommissions: number;
  readonly grossExposure: number | null;
  readonly netExposure: number | null;
  readonly portfolioTurnover: number | null;
  readonly completedTradeCount: number;
  readonly winningTradeCount: number;
  readonly losingTradeCount: number;
  readonly winRate: number | null;
  readonly perInstrument: readonly PortfolioInstrumentContribution[];
}

export interface PortfolioBacktestResult {
  readonly engineVersion: typeof OPENKLINE_PORTFOLIO_BACKTEST_VERSION;
  readonly accountCurrency: string;
  readonly assumptions: PortfolioBacktestAssumptions;
  readonly instruments: readonly PortfolioInstrumentSummary[];
  readonly strategyInputs: readonly StrategyEvaluationResult["input"][];
  readonly signals: readonly PortfolioSignal[];
  readonly timeline: readonly PortfolioTimelineEvent[];
  readonly orders: readonly PortfolioOrder[];
  readonly trades: readonly PortfolioTrade[];
  readonly positions: readonly PortfolioPosition[];
  readonly equityCurve: readonly PortfolioAccountSnapshot[];
  readonly finalAccount: PortfolioAccountSnapshot;
  readonly metrics: PortfolioPerformanceMetrics;
  readonly inputFingerprint: string;
}

export interface PortfolioBacktestApi {
  getStatus(): PortfolioBacktestStatus;
  subscribe(listener: (status: PortfolioBacktestStatus) => void): () => void;
  run(): PortfolioBacktestResult;
  cancel(): void;
  getResult(): PortfolioBacktestResult | null;
  dispose(): void;
}

export class PortfolioBacktestValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PortfolioBacktestValidationError";
  }
}

export class PortfolioBacktestLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PortfolioBacktestLifecycleError";
  }
}

export class PortfolioBacktestCancellationError extends Error {
  public constructor(message = "Portfolio backtest was cancelled") {
    super(message);
    this.name = "PortfolioBacktestCancellationError";
  }
}

export function clonePortfolioPositionSizing(value: PortfolioPositionSizing): PortfolioPositionSizing {
  return { ...value } as PortfolioPositionSizing;
}
