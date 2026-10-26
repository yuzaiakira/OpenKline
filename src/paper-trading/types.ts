import type { TransactionCost } from "../backtesting/types.js";

export const OPENKLINE_PAPER_TRADING_VERSION = 1 as const;

export type PaperTradingAccountStatus = "active" | "disposed";
export type PaperTradingMode = "simulated" | "live" | "replay";
export type PaperQuoteStatus = "fresh" | "stale" | "disconnected";
export type PaperOrderSide = "buy" | "sell";
export type PaperOrderType = "market";
export type PaperOrderStatus = "submitted" | "accepted" | "pending" | "filled" | "rejected" | "cancelled";
export type PaperTradingEventType =
  | "account-created"
  | "order-submitted"
  | "order-accepted"
  | "order-pending"
  | "order-filled"
  | "order-rejected"
  | "order-cancelled"
  | "market-event-ignored"
  | "account-reset";

export type PaperJsonPrimitive = string | number | boolean | null;
export type PaperJsonValue = PaperJsonPrimitive | readonly PaperJsonValue[] | { readonly [key: string]: PaperJsonValue };

export interface PaperClock {
  now(): number;
}

export interface PaperMarketEvent {
  readonly id: string;
  readonly symbol: string;
  /** UTC Unix timestamp in milliseconds. */
  readonly time: number;
  readonly price: number;
  readonly source: string;
  readonly quoteStatus: PaperQuoteStatus;
  readonly mode: PaperTradingMode;
  readonly sourceSequence?: number;
}

export interface PaperExecutionConfiguration {
  readonly commission: TransactionCost;
  readonly slippage: TransactionCost;
  readonly maxQuoteAgeMs: number;
  readonly allowFractionalQuantity: boolean;
  readonly minimumQuantity?: number;
}

export interface PaperRiskLimits {
  readonly maxOrderNotional?: number;
  readonly maxPositionExposure?: number;
  readonly maxSessionLoss?: number;
  readonly maxPendingOrders?: number;
}

export interface PaperTradingAccountOptions {
  readonly id: string;
  readonly displayName: string;
  readonly symbol: string;
  readonly currency: string;
  readonly initialBalance: number;
  readonly execution: PaperExecutionConfiguration;
  readonly risk?: PaperRiskLimits;
  readonly clock?: PaperClock;
}

export type PaperOrderSizing =
  | { readonly quantity: number }
  | { readonly notional: number }
  | { readonly percentageOfAvailableCash: number };

export type PaperOrderRequest = PaperOrderSizing & {
  readonly idempotencyKey: string;
  readonly side: PaperOrderSide;
  readonly type: PaperOrderType;
  readonly reason?: string;
};

export interface PaperOrderFill {
  readonly marketEventId: string;
  readonly referencePrice: number;
  readonly executionPrice: number;
  readonly quantity: number;
  readonly fee: number;
  readonly slippage: number;
  readonly time: number;
}

export interface PaperOrder {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly accountId: string;
  readonly symbol: string;
  readonly side: PaperOrderSide;
  readonly type: PaperOrderType;
  readonly requestedSizing: PaperOrderSizing;
  readonly quantity: number;
  /** Virtual cash held aside while a buy order is pending. */
  readonly reservedCash: number;
  readonly status: PaperOrderStatus;
  readonly submittedAt: number;
  readonly acceptedAt?: number;
  readonly fill?: PaperOrderFill;
  readonly rejectedAt?: number;
  readonly cancelledAt?: number;
  readonly rejectionReason?: string;
  readonly cancellationReason?: string;
  readonly reason?: string;
}

export interface PaperPosition {
  readonly symbol: string;
  readonly quantity: number;
  /** Gross acquisition notional, excluding entry fees. */
  readonly costBasis: number;
  readonly averageEntryPrice: number;
  /** Entry fees still allocated to the open quantity. */
  readonly openEntryFees: number;
  readonly markPrice: number | null;
  readonly unrealizedPnl: number;
  readonly marketValue: number;
}

export interface PaperTrade {
  readonly id: string;
  readonly accountId: string;
  readonly symbol: string;
  readonly entryOrderId: string;
  readonly exitOrderId: string;
  readonly entryTime: number;
  readonly exitTime: number;
  readonly entryPrice: number;
  readonly exitPrice: number;
  readonly quantity: number;
  readonly grossPnl: number;
  readonly netPnl: number;
  readonly entryFee: number;
  readonly exitFee: number;
  readonly reason?: string;
}

export interface PaperAccountSnapshot {
  readonly version: typeof OPENKLINE_PAPER_TRADING_VERSION;
  readonly accountId: string;
  readonly displayName: string;
  readonly symbol: string;
  readonly currency: string;
  readonly status: PaperTradingAccountStatus;
  readonly initialBalance: number;
  readonly cash: number;
  readonly reservedCash: number;
  readonly availableCash: number;
  readonly position: PaperPosition | null;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
  readonly equity: number;
  readonly totalFees: number;
  readonly highWaterMark: number;
  readonly drawdown: number;
  readonly drawdownPercent: number | null;
  readonly lastMarketEvent: PaperMarketEvent | null;
  readonly lastDiagnostic: string | null;
}

export interface PaperTradingJournalEvent {
  readonly id: string;
  readonly accountId: string;
  readonly type: PaperTradingEventType;
  readonly time: number;
  readonly source: string;
  readonly orderId?: string;
  readonly marketEventId?: string;
  readonly payload?: PaperJsonValue;
}

export interface PaperTradingDocument {
  readonly version: typeof OPENKLINE_PAPER_TRADING_VERSION;
  readonly revision: number;
  readonly account: PaperTradingAccountOptions & { readonly clock?: never };
  readonly snapshot: PaperAccountSnapshot;
  readonly orders: readonly PaperOrder[];
  readonly trades: readonly PaperTrade[];
  readonly journal: readonly PaperTradingJournalEvent[];
  readonly processedMarketEventIds: readonly string[];
}

export interface PaperMarketProcessResult {
  readonly accepted: boolean;
  readonly event: PaperMarketEvent;
  readonly fills: readonly PaperOrder[];
  readonly ignoredReason?: string;
}

export interface PaperTradingStatus {
  readonly state: PaperTradingAccountStatus;
  readonly lastMarketEvent: PaperMarketEvent | null;
  readonly pendingOrderCount: number;
  readonly diagnostic: string | null;
}

export type PaperTradingListener = (snapshot: PaperAccountSnapshot) => void;

export interface PaperTradingApi {
  getSnapshot(): PaperAccountSnapshot;
  getStatus(): PaperTradingStatus;
  getOrders(): readonly PaperOrder[];
  getTrades(): readonly PaperTrade[];
  getJournal(): readonly PaperTradingJournalEvent[];
  submitOrder(request: PaperOrderRequest): PaperOrder;
  cancelOrder(orderId: string, reason?: string): PaperOrder;
  processMarketEvent(event: PaperMarketEvent): PaperMarketProcessResult;
  subscribe(listener: PaperTradingListener): () => void;
  exportState(): PaperTradingDocument;
  reset(): void;
  dispose(): void;
}

export class PaperTradingValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaperTradingValidationError";
  }
}

export class PaperTradingOrderError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PaperTradingOrderError";
  }
}

export class PaperTradingMarketEventError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "PaperTradingMarketEventError";
  }
}

export class PaperTradingLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaperTradingLifecycleError";
  }
}

export class PaperTradingPersistenceError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PaperTradingPersistenceError";
  }
}
