import type { Candle } from "../types.js";
import type { StrategyEvaluationProgress, StrategyEvaluationResult, StrategyRegistry } from "../strategies/index.js";

export type BacktestStatusState = "idle" | "running" | "completed" | "cancelled" | "failed" | "disposed";
export type BacktestOrderStatus = "submitted" | "pending" | "filled" | "rejected" | "cancelled";
export type BacktestPositionDirection = "long" | "short";
export type BacktestReversalPolicy = "reject" | "close-and-reverse";

export interface TransactionCost {
  readonly type: "percent" | "fixed";
  /** Percent is a decimal fraction of notional; fixed is account currency per fill. */
  readonly value: number;
}

export type PositionSizing =
  | { readonly type: "fixed-quantity"; readonly quantity: number }
  | { readonly type: "fixed-notional"; readonly amount: number }
  | { readonly type: "percent-equity"; readonly percent: number };

export interface ShortSellingOptions {
  readonly maxNotional: number;
}

export interface BacktestProgress {
  readonly phase: "signals" | "execution";
  readonly processedBars: number;
  readonly totalBars: number;
  readonly signalCount: number;
  readonly filledOrderCount: number;
}

export interface BacktestStatus {
  readonly state: BacktestStatusState;
  readonly processedBars: number;
  readonly totalBars: number;
  readonly signalCount: number;
  readonly filledOrderCount: number;
  readonly error?: string;
}

export interface BacktestOptions {
  readonly strategy: string;
  readonly parameters: Record<string, unknown>;
  readonly candles: readonly Candle[];
  readonly initialCapital: number;
  readonly positionSizing: PositionSizing;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly strategyRegistry?: StrategyRegistry;
  /** Presence enables short selling and caps aggregate open short notional. */
  readonly shortSelling?: ShortSellingOptions;
  readonly reversal?: BacktestReversalPolicy;
  /** Starts the account/equity/trading boundary after optional indicator warm-up bars. */
  readonly tradingStartIndex?: number;
  /** Fractional quantity is rejected unless this is explicitly true. */
  readonly allowFractionalQuantity?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: BacktestProgress) => void;
}

export interface BacktestAssumptions {
  readonly execution: "next-bar-open";
  readonly endOfData: "mark-to-market-no-liquidation";
  readonly initialCapital: number;
  readonly positionSizing: PositionSizing;
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly shortSelling: ShortSellingOptions | null;
  readonly reversal: BacktestReversalPolicy;
  readonly allowFractionalQuantity: boolean;
  readonly tradingStartIndex: number;
}

export interface BacktestOrder {
  readonly id: string;
  readonly signalId: string;
  readonly action: string;
  readonly status: BacktestOrderStatus;
  readonly signalIndex: number;
  readonly signalTime: number;
  readonly quantity: number;
  readonly referencePrice?: number;
  readonly executionPrice?: number;
  readonly fillTime?: number;
  readonly commission: number;
  readonly slippage: number;
  readonly reason?: string;
}

export interface BacktestTrade {
  readonly id: string;
  readonly direction: BacktestPositionDirection;
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

export interface BacktestOpenPosition {
  readonly id: string;
  readonly direction: BacktestPositionDirection;
  readonly quantity: number;
  readonly entrySignalTime: number;
  readonly entryFillTime: number;
  readonly entryPrice: number;
  readonly entryFees: number;
  readonly unrealizedPnl: number;
}

export interface AccountSnapshot {
  readonly time: number | null;
  readonly markPrice: number | null;
  readonly cash: number;
  readonly positionQuantity: number;
  readonly positionValue: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly equity: number;
  readonly peakEquity: number;
  readonly drawdown: number;
  readonly drawdownPercent: number | null;
}

export interface BacktestResult {
  readonly engineVersion: 1;
  readonly strategyId: string;
  readonly strategyVersion: number;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly input: StrategyEvaluationResult["input"];
  readonly inputFingerprint: string;
  readonly signals: StrategyEvaluationResult["signals"];
  readonly assumptions: BacktestAssumptions;
  readonly orders: readonly BacktestOrder[];
  readonly trades: readonly BacktestTrade[];
  readonly openPosition: BacktestOpenPosition | null;
  readonly equityCurve: readonly AccountSnapshot[];
  readonly finalAccount: AccountSnapshot;
  readonly metrics: PerformanceMetrics;
}

export interface PerformanceMetrics {
  readonly totalReturn: number | null;
  readonly netProfit: number;
  readonly grossProfit: number;
  readonly grossLoss: number;
  readonly maxDrawdown: number;
  readonly maxDrawdownPercent: number;
  readonly closedTradeCount: number;
  readonly winningTradeCount: number;
  readonly losingTradeCount: number;
  readonly winRate: number | null;
  readonly averageProfit: number | null;
  readonly averageLoss: number | null;
  readonly profitFactor: number | null;
  readonly averageTradeDurationMs: number | null;
  readonly totalCommissions: number;
  readonly exposure: number | null;
  readonly openPositionUnrealizedPnl: number;
}

export interface BacktestApi {
  getStatus(): BacktestStatus;
  subscribe(listener: (status: BacktestStatus) => void): () => void;
  run(): BacktestResult;
  cancel(): void;
  getResult(): BacktestResult | null;
  dispose(): void;
}

export class BacktestValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BacktestValidationError";
  }
}

export class BacktestLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "BacktestLifecycleError";
  }
}

export class BacktestCancellationError extends Error {
  public constructor(message = "Backtest was cancelled") {
    super(message);
    this.name = "BacktestCancellationError";
  }
}

export function toBacktestProgress(progress: StrategyEvaluationProgress, filledOrderCount: number): BacktestProgress {
  return {
    phase: "signals",
    processedBars: progress.processedBars,
    totalBars: progress.totalBars,
    signalCount: progress.signalCount,
    filledOrderCount,
  };
}
