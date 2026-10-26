import { applyAdverseSlippage, calculateLongGrossPnl, calculateTransactionCost } from "../financial.js";
import {
  OPENKLINE_PAPER_TRADING_VERSION,
  type PaperAccountSnapshot,
  type PaperClock,
  type PaperExecutionConfiguration,
  type PaperJsonValue,
  type PaperMarketEvent,
  type PaperMarketProcessResult,
  type PaperOrder,
  type PaperOrderFill,
  type PaperOrderRequest,
  type PaperOrderSizing,
  type PaperPosition,
  type PaperRiskLimits,
  type PaperTrade,
  type PaperTradingAccountOptions,
  type PaperTradingApi,
  type PaperTradingDocument,
  type PaperTradingEventType,
  type PaperTradingJournalEvent,
  type PaperTradingListener,
  type PaperTradingStatus,
  PaperTradingLifecycleError,
  PaperTradingMarketEventError,
  PaperTradingOrderError,
  PaperTradingValidationError,
} from "./types.js";

interface MutablePosition {
  quantity: number;
  costBasis: number;
  openEntryFees: number;
  averageEntryPrice: number;
  markPrice: number | null;
  entryOrderId: string;
  entryTime: number;
}

interface PendingOrderState {
  readonly id: string;
  readonly eligibleAfterEventOrdinal: number;
  readonly reserve: number;
}

const defaultClock: PaperClock = { now: () => Date.now() };

export function createPaperTradingAccount(options: PaperTradingAccountOptions): PaperTradingApi {
  return new PaperTradingSession(options);
}

export function restorePaperTradingAccount(options: PaperTradingAccountOptions, document: PaperTradingDocument): PaperTradingApi {
  const session = new PaperTradingSession(options);
  session.restore(document);
  return session;
}

export class PaperTradingSession implements PaperTradingApi {
  private readonly clock: PaperClock;
  private readonly listeners = new Set<PaperTradingListener>();
  private readonly orders = new Map<string, PaperOrder>();
  private readonly trades: PaperTrade[] = [];
  private readonly journal: PaperTradingJournalEvent[] = [];
  private readonly processedMarketEventIds = new Set<string>();
  private readonly idempotency = new Map<string, string>();
  private readonly pending = new Map<string, PendingOrderState>();
  private readonly options: PaperTradingAccountOptions;
  private status: "active" | "disposed" = "active";
  private cash: number;
  private reservedCash = 0;
  private realizedPnl = 0;
  private totalFees = 0;
  private highWaterMark: number;
  private position: MutablePosition | null = null;
  private lastMarketEvent: PaperMarketEvent | null = null;
  private lastFreshMarketEvent: PaperMarketEvent | null = null;
  private lastSourceSequence: number | null = null;
  private eventOrdinal = 0;
  private revision = 0;
  private diagnostic: string | null = null;
  private nextOrderNumber = 1;
  private nextTradeNumber = 1;
  private nextEventNumber = 1;

  public constructor(options: PaperTradingAccountOptions) {
    validateAccountOptions(options);
    this.options = cloneAccountOptions(options);
    this.clock = options.clock ?? defaultClock;
    this.cash = options.initialBalance;
    this.highWaterMark = options.initialBalance;
    this.record("account-created", "account", { initialBalance: options.initialBalance });
  }

  public getSnapshot(): PaperAccountSnapshot {
    this.assertAliveForRead();
    return cloneSnapshot(this.snapshot());
  }

  public getStatus(): PaperTradingStatus {
    return {
      state: this.status,
      lastMarketEvent: this.lastMarketEvent === null ? null : { ...this.lastMarketEvent },
      pendingOrderCount: this.pending.size,
      diagnostic: this.diagnostic,
    };
  }

  public getOrders(): readonly PaperOrder[] {
    return [...this.orders.values()].map(cloneOrder);
  }

  public getTrades(): readonly PaperTrade[] {
    return this.trades.map((trade) => ({ ...trade }));
  }

  public getJournal(): readonly PaperTradingJournalEvent[] {
    return this.journal.map((event) => ({ ...event, ...(event.payload === undefined ? {} : { payload: cloneJson(event.payload) }) }));
  }

  public submitOrder(request: PaperOrderRequest): PaperOrder {
    this.assertActive();
    validateOrderRequest(request);
    const existingId = this.idempotency.get(request.idempotencyKey);
    if (existingId !== undefined) {
      const existing = this.orders.get(existingId);
      if (existing === undefined) throw new PaperTradingOrderError("IDEMPOTENCY_CORRUPTION", "Idempotency index refers to a missing order");
      if (!sameOrderRequest(existing, request)) throw new PaperTradingOrderError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used with different order parameters");
      return cloneOrder(existing);
    }
    if (this.pending.size >= (this.options.risk?.maxPendingOrders ?? Number.POSITIVE_INFINITY)) throw new PaperTradingOrderError("MAX_PENDING_ORDERS", "The pending-order limit has been reached");
    const market = this.requireFreshMarket("A fresh market event is required before submitting an order");
    const quantity = this.quantityForRequest(request, market.price);
    const estimatedExecution = applyAdverseSlippage(market.price, this.options.execution.slippage, request.side === "buy");
    const estimatedNotional = quantity * estimatedExecution;
    const estimatedFee = calculateTransactionCost(this.options.execution.commission, estimatedNotional);
    if (this.options.risk?.maxOrderNotional !== undefined && estimatedNotional > this.options.risk.maxOrderNotional + 1e-12) throw new PaperTradingOrderError("MAX_ORDER_NOTIONAL", "Order exceeds the configured maximum notional");
    if (this.options.risk?.maxPositionExposure !== undefined && request.side === "buy" && (this.position?.quantity ?? 0) * market.price + estimatedNotional > this.options.risk.maxPositionExposure + 1e-12) throw new PaperTradingOrderError("MAX_POSITION_EXPOSURE", "Order exceeds the configured maximum position exposure");
    if (this.options.risk?.maxSessionLoss !== undefined && this.snapshot().equity <= this.options.initialBalance - this.options.risk.maxSessionLoss) throw new PaperTradingOrderError("MAX_SESSION_LOSS", "The maximum virtual session loss has been reached");
    if (request.side === "sell") this.validateSellQuantity(quantity);
    const reserve = request.side === "buy" ? estimatedNotional + estimatedFee : 0;
    if (this.availableCash() + 1e-12 < reserve) throw new PaperTradingOrderError("INSUFFICIENT_FUNDS", "Insufficient available virtual cash");
    const id = `${this.options.id}-order-${this.nextOrderNumber++}`;
    const submittedAt = this.clock.now();
    let order: PaperOrder = {
      id,
      idempotencyKey: request.idempotencyKey,
      accountId: this.options.id,
      symbol: this.options.symbol,
      side: request.side,
      type: "market",
      requestedSizing: sizingFromRequest(request),
      quantity,
      reservedCash: reserve,
      status: "submitted",
      submittedAt,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    };
    this.orders.set(id, order);
    this.idempotency.set(request.idempotencyKey, id);
    this.pending.set(id, { id, eligibleAfterEventOrdinal: this.eventOrdinal, reserve });
    this.reservedCash += reserve;
    this.record("order-submitted", "paper-ticket", { quantity, side: request.side }, id);
    order = { ...order, status: "accepted", acceptedAt: submittedAt };
    this.orders.set(id, order);
    this.record("order-accepted", "paper-engine", undefined, id);
    order = { ...order, status: "pending" };
    this.orders.set(id, order);
    this.record("order-pending", "paper-engine", { eligibleAfterEventOrdinal: this.eventOrdinal }, id);
    this.publish();
    return cloneOrder(order);
  }

  public cancelOrder(orderId: string, reason = "Cancelled by user"): PaperOrder {
    this.assertActive();
    const order = this.orders.get(orderId);
    if (order === undefined) throw new PaperTradingOrderError("UNKNOWN_ORDER", `Unknown paper order: ${orderId}`);
    if (order.status !== "pending") throw new PaperTradingOrderError("TERMINAL_ORDER", `Order ${orderId} is already ${order.status}`);
    this.releasePending(orderId);
    const cancelled: PaperOrder = { ...order, status: "cancelled", reservedCash: 0, cancelledAt: this.clock.now(), cancellationReason: reason };
    this.orders.set(orderId, cancelled);
    this.record("order-cancelled", "paper-ticket", { reason }, orderId);
    this.publish();
    return cloneOrder(cancelled);
  }

  public processMarketEvent(event: PaperMarketEvent): PaperMarketProcessResult {
    this.assertActive();
    validateMarketEvent(event);
    if (event.symbol !== this.options.symbol) return this.ignoreMarketEvent(event, "SYMBOL_MISMATCH");
    if (event.mode === "replay") return this.ignoreMarketEvent(event, "REPLAY_ISOLATION");
    if (this.processedMarketEventIds.has(event.id)) return this.ignoreMarketEvent(event, "DUPLICATE_EVENT");
    this.processedMarketEventIds.add(event.id);
    this.eventOrdinal += 1;
    if (this.lastMarketEvent !== null && event.time < this.lastMarketEvent.time) return this.ignoreMarketEvent(event, "OUT_OF_ORDER_TIMESTAMP");
    if (event.sourceSequence !== undefined && this.lastSourceSequence !== null && event.sourceSequence <= this.lastSourceSequence) return this.ignoreMarketEvent(event, "OUT_OF_ORDER_SEQUENCE");
    this.lastMarketEvent = { ...event };
    if (event.sourceSequence !== undefined) this.lastSourceSequence = event.sourceSequence;
    const stale = event.quoteStatus !== "fresh" || this.clock.now() - event.time > this.options.execution.maxQuoteAgeMs;
    if (stale) return this.ignoreMarketEvent(event, "STALE_QUOTE");
    this.lastFreshMarketEvent = { ...event };
    this.diagnostic = null;
    const filled: PaperOrder[] = [];
    for (const order of [...this.orders.values()]) {
      const pending = this.pending.get(order.id);
      if (order.status !== "pending" || pending === undefined || pending.eligibleAfterEventOrdinal >= this.eventOrdinal) continue;
      const next = this.executePendingOrder(order, event);
      this.orders.set(order.id, next);
      if (next.status === "filled") filled.push(cloneOrder(next));
    }
    this.updateMarkToMarket(event.price);
    this.publish();
    return { accepted: true, event: { ...event }, fills: filled };
  }

  public subscribe(listener: PaperTradingListener): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public exportState(): PaperTradingDocument {
    this.assertAliveForRead();
    return {
      version: OPENKLINE_PAPER_TRADING_VERSION,
      revision: this.revision,
      account: serializableAccountOptions(this.options),
      snapshot: cloneSnapshot(this.snapshot()),
      orders: this.getOrders(),
      trades: this.getTrades(),
      journal: this.getJournal(),
      processedMarketEventIds: [...this.processedMarketEventIds],
    };
  }

  public reset(): void {
    this.assertActive();
    this.orders.clear();
    this.trades.length = 0;
    this.journal.length = 0;
    this.processedMarketEventIds.clear();
    this.idempotency.clear();
    this.pending.clear();
    this.cash = this.options.initialBalance;
    this.reservedCash = 0;
    this.realizedPnl = 0;
    this.totalFees = 0;
    this.highWaterMark = this.options.initialBalance;
    this.position = null;
    this.lastMarketEvent = null;
    this.lastFreshMarketEvent = null;
    this.lastSourceSequence = null;
    this.eventOrdinal = 0;
    this.nextOrderNumber = 1;
    this.nextTradeNumber = 1;
    this.diagnostic = null;
    this.record("account-reset", "account", { initialBalance: this.options.initialBalance });
    this.publish();
  }

  public dispose(): void {
    if (this.status === "disposed") return;
    this.status = "disposed";
    this.listeners.clear();
    this.pending.clear();
  }

  public restore(document: PaperTradingDocument): void {
    this.assertActive();
    validateDocumentIdentity(this.options, document);
    this.orders.clear();
    this.trades.length = 0;
    this.journal.length = 0;
    this.pending.clear();
    this.idempotency.clear();
    this.processedMarketEventIds.clear();
    this.revision = document.revision;
    this.cash = document.snapshot.cash;
    this.reservedCash = document.snapshot.reservedCash;
    this.realizedPnl = document.snapshot.realizedPnl;
    this.totalFees = document.snapshot.totalFees;
    this.highWaterMark = document.snapshot.highWaterMark;
    this.lastMarketEvent = document.snapshot.lastMarketEvent === null ? null : { ...document.snapshot.lastMarketEvent };
    this.lastFreshMarketEvent = this.lastMarketEvent?.quoteStatus === "fresh" ? { ...this.lastMarketEvent } : null;
    this.position = document.snapshot.position === null ? null : {
      quantity: document.snapshot.position.quantity,
      costBasis: document.snapshot.position.costBasis,
      openEntryFees: document.snapshot.position.openEntryFees,
      averageEntryPrice: document.snapshot.position.averageEntryPrice,
      markPrice: document.snapshot.position.markPrice,
      entryOrderId: [...document.orders].reverse().find((order) => order.status === "filled" && order.side === "buy")?.id ?? "unknown-entry",
      entryTime: [...document.orders].reverse().find((order) => order.status === "filled" && order.side === "buy")?.fill?.time ?? document.snapshot.lastMarketEvent?.time ?? this.clock.now(),
    };
    document.orders.forEach((order) => {
      this.orders.set(order.id, cloneOrder(order));
      this.idempotency.set(order.idempotencyKey, order.id);
      if (order.status === "pending") this.pending.set(order.id, { id: order.id, eligibleAfterEventOrdinal: document.processedMarketEventIds.length, reserve: order.reservedCash });
    });
    document.trades.forEach((trade) => this.trades.push({ ...trade }));
    document.journal.forEach((event) => this.journal.push({ ...event }));
    document.processedMarketEventIds.forEach((id) => this.processedMarketEventIds.add(id));
    this.eventOrdinal = document.processedMarketEventIds.length;
    this.nextOrderNumber = nextNumericSuffix(this.orders.keys(), "order") + 1;
    this.nextTradeNumber = this.trades.length + 1;
    this.nextEventNumber = this.journal.length + 1;
    this.diagnostic = null;
    this.publish();
  }

  private executePendingOrder(order: PaperOrder, event: PaperMarketEvent): PaperOrder {
    this.releasePending(order.id);
    try {
      const executionPrice = applyAdverseSlippage(event.price, this.options.execution.slippage, order.side === "buy");
      const notional = executionPrice * order.quantity;
      const fee = calculateTransactionCost(this.options.execution.commission, notional);
      if (order.side === "buy") {
        if (this.availableCash() + 1e-12 < notional + fee) return this.rejectAtEvent(order, event, "INSUFFICIENT_FUNDS_AT_EXECUTION");
        this.cash -= notional + fee;
        this.totalFees += fee;
        this.addPosition(order, notional, fee, event.price, event.time);
      } else {
        if (this.position === null || order.quantity > this.position.quantity + 1e-12) return this.rejectAtEvent(order, event, "POSITION_NOT_AVAILABLE_AT_EXECUTION");
        const closed = this.reducePosition(order, executionPrice, fee, event);
        this.cash += notional - fee;
        this.realizedPnl += closed.netPnl;
        this.totalFees += fee;
        this.trades.push(closed.trade);
      }
      const fill: PaperOrderFill = {
        marketEventId: event.id,
        referencePrice: event.price,
        executionPrice,
        quantity: order.quantity,
        fee,
        slippage: Math.abs(executionPrice - event.price),
        time: event.time,
      };
      const filled: PaperOrder = { ...order, status: "filled", reservedCash: 0, fill };
      this.record("order-filled", event.source, { executionPrice, fee, quantity: order.quantity }, order.id, event.id);
      return filled;
    } catch (error) {
      return this.rejectAtEvent(order, event, error instanceof Error ? error.message : String(error));
    }
  }

  private addPosition(order: PaperOrder, notional: number, fee: number, markPrice: number, time: number): void {
    const quantity = order.quantity;
    if (this.position === null) {
      this.position = { quantity, costBasis: notional, openEntryFees: fee, averageEntryPrice: notional / quantity, markPrice, entryOrderId: order.id, entryTime: time };
      return;
    }
    const nextQuantity = this.position.quantity + quantity;
    const nextCostBasis = this.position.costBasis + notional;
    this.position = { quantity: nextQuantity, costBasis: nextCostBasis, openEntryFees: this.position.openEntryFees + fee, averageEntryPrice: nextCostBasis / nextQuantity, markPrice, entryOrderId: order.id, entryTime: time };
  }

  private reducePosition(order: PaperOrder, executionPrice: number, exitFee: number, event: PaperMarketEvent): { netPnl: number; trade: PaperTrade } {
    if (this.position === null) throw new PaperTradingOrderError("POSITION_NOT_AVAILABLE_AT_EXECUTION", "No position is available for the sell order");
    const entryFee = this.position.openEntryFees * order.quantity / this.position.quantity;
    const grossPnl = calculateLongGrossPnl(this.position.averageEntryPrice, executionPrice, order.quantity);
    const netPnl = grossPnl - entryFee - exitFee;
    const trade: PaperTrade = {
      id: `${this.options.id}-trade-${this.nextTradeNumber++}`,
      accountId: this.options.id,
      symbol: this.options.symbol,
      entryOrderId: this.position.entryOrderId,
      exitOrderId: order.id,
      entryTime: this.position.entryTime,
      exitTime: event.time,
      entryPrice: this.position.averageEntryPrice,
      exitPrice: executionPrice,
      quantity: order.quantity,
      grossPnl,
      netPnl,
      entryFee,
      exitFee,
      ...(order.reason === undefined ? {} : { reason: order.reason }),
    };
    const remaining = this.position.quantity - order.quantity;
    this.position = remaining <= 1e-12 ? null : {
      quantity: remaining,
      costBasis: this.position.costBasis * remaining / this.position.quantity,
      openEntryFees: this.position.openEntryFees - entryFee,
      averageEntryPrice: this.position.averageEntryPrice,
      markPrice: event.price,
      entryOrderId: this.position.entryOrderId,
      entryTime: this.position.entryTime,
    };
    return { netPnl, trade };
  }

  private rejectAtEvent(order: PaperOrder, event: PaperMarketEvent, reason: string): PaperOrder {
    const rejected: PaperOrder = { ...order, status: "rejected", reservedCash: 0, rejectedAt: event.time, rejectionReason: reason };
    this.record("order-rejected", event.source, { reason }, order.id, event.id);
    return rejected;
  }

  private quantityForRequest(request: PaperOrderRequest, price: number): number {
    const quantity = "quantity" in request ? request.quantity : "notional" in request ? request.notional / price : this.availableCash() * request.percentageOfAvailableCash / price;
    if (!Number.isFinite(quantity) || quantity <= 0) throw new PaperTradingOrderError("INVALID_QUANTITY", "Order quantity must be positive and finite");
    if (this.options.execution.minimumQuantity !== undefined && quantity < this.options.execution.minimumQuantity) throw new PaperTradingOrderError("MINIMUM_QUANTITY", "Order quantity is below the configured minimum");
    if (!this.options.execution.allowFractionalQuantity && !Number.isInteger(quantity)) throw new PaperTradingOrderError("FRACTIONAL_QUANTITY", "Fractional quantity is disabled");
    return quantity;
  }

  private validateSellQuantity(quantity: number): void {
    const held = this.position?.quantity ?? 0;
    const reservedSell = [...this.pending.values()].reduce((total, pending) => {
      const order = this.orders.get(pending.id);
      return total + (order?.side === "sell" ? order.quantity : 0);
    }, 0);
    if (quantity > held - reservedSell + 1e-12) throw new PaperTradingOrderError("INSUFFICIENT_POSITION", "Cannot sell more than the available virtual position");
  }

  private requireFreshMarket(message: string): PaperMarketEvent {
    const market = this.lastFreshMarketEvent;
    if (market === null || this.clock.now() - market.time > this.options.execution.maxQuoteAgeMs) throw new PaperTradingOrderError("STALE_QUOTE", message);
    return market;
  }

  private updateMarkToMarket(price: number): void {
    if (this.position !== null) this.position.markPrice = price;
    const equity = this.cash + (this.position === null ? 0 : this.position.quantity * price);
    this.highWaterMark = Math.max(this.highWaterMark, equity);
  }

  private availableCash(): number {
    return this.cash - this.reservedCash;
  }

  private releasePending(orderId: string): void {
    const pending = this.pending.get(orderId);
    if (pending === undefined) return;
    this.reservedCash -= pending.reserve;
    this.pending.delete(orderId);
  }

  private ignoreMarketEvent(event: PaperMarketEvent, reason: string): PaperMarketProcessResult {
    this.diagnostic = reason;
    this.record("market-event-ignored", event.source, { reason }, undefined, event.id);
    return { accepted: false, event: { ...event }, fills: [], ignoredReason: reason };
  }

  private snapshot(): PaperAccountSnapshot {
    const markPrice = this.position === null ? null : this.lastFreshMarketEvent?.price ?? this.position.markPrice;
    const position = this.position === null ? null : this.positionSnapshot(markPrice);
    const equity = this.cash + (position?.marketValue ?? 0);
    const highWaterMark = Math.max(this.highWaterMark, equity);
    this.highWaterMark = highWaterMark;
    const drawdown = equity - highWaterMark;
    return {
      version: OPENKLINE_PAPER_TRADING_VERSION,
      accountId: this.options.id,
      displayName: this.options.displayName,
      symbol: this.options.symbol,
      currency: this.options.currency,
      status: this.status,
      initialBalance: this.options.initialBalance,
      cash: this.cash,
      reservedCash: this.reservedCash,
      availableCash: this.availableCash(),
      position,
      realizedPnl: this.realizedPnl,
      unrealizedPnl: position?.unrealizedPnl ?? 0,
      equity,
      totalFees: this.totalFees,
      highWaterMark,
      drawdown,
      drawdownPercent: highWaterMark > 0 ? drawdown / highWaterMark : null,
      lastMarketEvent: this.lastMarketEvent === null ? null : { ...this.lastMarketEvent },
      lastDiagnostic: this.diagnostic,
    };
  }

  private positionSnapshot(markPrice: number | null): PaperPosition {
    if (this.position === null) throw new PaperTradingLifecycleError("Position is unavailable");
    const marketValue = markPrice === null ? 0 : this.position.quantity * markPrice;
    const unrealizedPnl = markPrice === null ? 0 : calculateLongGrossPnl(this.position.averageEntryPrice, markPrice, this.position.quantity);
    return { symbol: this.options.symbol, quantity: this.position.quantity, costBasis: this.position.costBasis, averageEntryPrice: this.position.averageEntryPrice, openEntryFees: this.position.openEntryFees, markPrice, unrealizedPnl, marketValue };
  }

  private record(type: PaperTradingEventType, source: string, payload?: PaperJsonValue, orderId?: string, marketEventId?: string): void {
    this.revision += 1;
    this.journal.push({ id: `${this.options.id}-event-${this.nextEventNumber++}`, accountId: this.options.id, type, time: this.clock.now(), source, ...(orderId === undefined ? {} : { orderId }), ...(marketEventId === undefined ? {} : { marketEventId }), ...(payload === undefined ? {} : { payload: cloneJson(payload) }) });
  }

  private publish(): void {
    const snapshot = cloneSnapshot(this.snapshot());
    for (const listener of this.listeners) listener(snapshot);
  }

  private assertActive(): void {
    if (this.status === "disposed") throw new PaperTradingLifecycleError("Paper Trading account has been disposed");
  }

  private assertAliveForRead(): void {
    if (this.status === "disposed") throw new PaperTradingLifecycleError("Paper Trading account has been disposed");
  }
}

function validateAccountOptions(options: PaperTradingAccountOptions): void {
  if (options.id.trim().length === 0 || options.displayName.trim().length === 0 || options.symbol.trim().length === 0 || options.currency.trim().length === 0) throw new PaperTradingValidationError("Account id, name, symbol, and currency are required");
  if (!Number.isFinite(options.initialBalance) || options.initialBalance <= 0) throw new PaperTradingValidationError("Initial virtual balance must be positive and finite");
  validateExecution(options.execution);
  validateLimits(options.risk);
}

function validateExecution(execution: PaperExecutionConfiguration): void {
  if (!Number.isInteger(execution.maxQuoteAgeMs) || execution.maxQuoteAgeMs < 0) throw new PaperTradingValidationError("maxQuoteAgeMs must be a non-negative integer");
  for (const [name, cost] of [["commission", execution.commission], ["slippage", execution.slippage]] as const) {
    if ((cost.type !== "percent" && cost.type !== "fixed") || !Number.isFinite(cost.value) || cost.value < 0) throw new PaperTradingValidationError(`${name} must be non-negative and finite`);
  }
  if (execution.minimumQuantity !== undefined && (!Number.isFinite(execution.minimumQuantity) || execution.minimumQuantity <= 0)) throw new PaperTradingValidationError("minimumQuantity must be positive when configured");
}

function validateLimits(limits: PaperRiskLimits | undefined): void {
  if (limits === undefined) return;
  for (const value of [limits.maxOrderNotional, limits.maxPositionExposure, limits.maxSessionLoss, limits.maxPendingOrders]) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new PaperTradingValidationError("Risk limits must be positive and finite");
  }
  if (limits.maxPendingOrders !== undefined && !Number.isInteger(limits.maxPendingOrders)) throw new PaperTradingValidationError("maxPendingOrders must be an integer");
}

function validateOrderRequest(request: PaperOrderRequest): void {
  if (request.idempotencyKey.trim().length === 0) throw new PaperTradingOrderError("INVALID_IDEMPOTENCY_KEY", "idempotencyKey is required");
  if (request.type !== "market" || (request.side !== "buy" && request.side !== "sell")) throw new PaperTradingOrderError("UNSUPPORTED_ORDER", "Only market buy and sell orders are supported");
  const sizingFields = ["quantity" in request, "notional" in request, "percentageOfAvailableCash" in request].filter(Boolean).length;
  if (sizingFields !== 1) throw new PaperTradingOrderError("INVALID_SIZING", "Exactly one order sizing field is required");
  const size = "quantity" in request ? request.quantity : "notional" in request ? request.notional : request.percentageOfAvailableCash;
  if (!Number.isFinite(size) || size <= 0) throw new PaperTradingOrderError("INVALID_SIZING", "Order sizing must be positive and finite");
  if ("percentageOfAvailableCash" in request && request.percentageOfAvailableCash > 1) throw new PaperTradingOrderError("INVALID_SIZING", "percentageOfAvailableCash must be at most 1");
}

function validateMarketEvent(event: PaperMarketEvent): void {
  if (event.id.trim().length === 0 || event.symbol.trim().length === 0 || event.source.trim().length === 0) throw new PaperTradingMarketEventError("INVALID_EVENT", "Market event id, symbol, and source are required");
  if (!Number.isInteger(event.time) || event.time < 0 || !Number.isFinite(event.price) || event.price <= 0) throw new PaperTradingMarketEventError("INVALID_EVENT", "Market event time and price are invalid");
  if (event.sourceSequence !== undefined && (!Number.isInteger(event.sourceSequence) || event.sourceSequence < 0)) throw new PaperTradingMarketEventError("INVALID_EVENT", "sourceSequence must be a non-negative integer");
}

function sameOrderRequest(order: PaperOrder, request: PaperOrderRequest): boolean {
  return order.side === request.side && order.type === request.type && JSON.stringify(order.requestedSizing) === JSON.stringify(sizingFromRequest(request));
}

function sizingFromRequest(request: PaperOrderRequest): PaperOrderSizing {
  if ("quantity" in request) return { quantity: request.quantity };
  if ("notional" in request) return { notional: request.notional };
  return { percentageOfAvailableCash: request.percentageOfAvailableCash };
}

function cloneAccountOptions(options: PaperTradingAccountOptions): PaperTradingAccountOptions {
  return { ...options, execution: { ...options.execution, commission: { ...options.execution.commission }, slippage: { ...options.execution.slippage } }, ...(options.risk === undefined ? {} : { risk: { ...options.risk } }), ...(options.clock === undefined ? {} : { clock: options.clock }) };
}

function serializableAccountOptions(options: PaperTradingAccountOptions): PaperTradingDocument["account"] {
  return { id: options.id, displayName: options.displayName, symbol: options.symbol, currency: options.currency, initialBalance: options.initialBalance, execution: { ...options.execution, commission: { ...options.execution.commission }, slippage: { ...options.execution.slippage } }, ...(options.risk === undefined ? {} : { risk: { ...options.risk } }) };
}

function validateDocumentIdentity(options: PaperTradingAccountOptions, document: PaperTradingDocument): void {
  if (document.version !== OPENKLINE_PAPER_TRADING_VERSION || JSON.stringify(document.account) !== JSON.stringify(serializableAccountOptions(options))) throw new PaperTradingValidationError("Paper Trading document does not match the selected account configuration");
}

function nextNumericSuffix(ids: Iterable<string>, token: string): number {
  let max = 0;
  for (const id of ids) {
    const match = id.match(new RegExp(`-${token}-(\\d+)$`));
    if (match !== null) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function cloneOrder(order: PaperOrder): PaperOrder {
  return { ...order, ...(order.fill === undefined ? {} : { fill: { ...order.fill } }) };
}

function cloneSnapshot(snapshot: PaperAccountSnapshot): PaperAccountSnapshot {
  return { ...snapshot, ...(snapshot.position === null ? { position: null } : { position: { ...snapshot.position } }), ...(snapshot.lastMarketEvent === null ? { lastMarketEvent: null } : { lastMarketEvent: { ...snapshot.lastMarketEvent } }) };
}

function cloneJson(value: PaperJsonValue): PaperJsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneJson);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item)]));
}
