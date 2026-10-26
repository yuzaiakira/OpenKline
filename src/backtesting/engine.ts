import { CandleStore } from "../core/candle-store.js";
import { createDefaultStrategyRegistry, type StrategySignal } from "../strategies/index.js";
import { StrategyCancellationError, type StrategyInstance, type StrategyRegistry } from "../strategies/index.js";
import type { Candle } from "../types.js";
import { calculatePerformanceMetrics, fingerprintCandles } from "./metrics.js";
import {
  BacktestCancellationError,
  BacktestLifecycleError,
  BacktestValidationError,
  type AccountSnapshot,
  type BacktestApi,
  type BacktestAssumptions,
  type BacktestOpenPosition,
  type BacktestOptions,
  type BacktestOrder,
  type BacktestOrderStatus,
  type BacktestPositionDirection,
  type BacktestProgress,
  type BacktestResult,
  type BacktestStatus,
  type BacktestStatusState,
  type BacktestTrade,
  type PositionSizing,
  type TransactionCost,
} from "./types.js";

interface PendingOrder {
  readonly order: MutableOrder;
  readonly signal: StrategySignal;
  readonly fillIndex: number;
}

interface MutableOrder {
  readonly id: string;
  readonly signalId: string;
  readonly action: StrategySignal["action"];
  readonly signalIndex: number;
  readonly signalTime: number;
  status: BacktestOrderStatus;
  quantity: number;
  referencePrice?: number;
  executionPrice?: number;
  fillTime?: number;
  commission: number;
  slippage: number;
  reason?: string;
}

interface MutablePosition {
  readonly id: string;
  readonly direction: BacktestPositionDirection;
  quantity: number;
  entrySignalTime: number;
  entryFillTime: number;
  entryPrice: number;
  entryFees: number;
}

interface MutableTrade extends BacktestTrade {}

const DEFAULT_REVERSAL = "reject" as const;

export function createBacktest(options: BacktestOptions): BacktestApi {
  return new BacktestSession(options);
}

export class BacktestSession implements BacktestApi {
  private readonly candles: readonly Candle[];
  private readonly registry: StrategyRegistry;
  private readonly assumptions: BacktestAssumptions;
  private readonly listeners = new Set<(status: BacktestStatus) => void>();
  private readonly externalSignal: AbortSignal | undefined;
  private readonly externalAbortListener = (): void => this.internalController.abort();
  private internalController = new AbortController();
  private state: BacktestStatusState = "idle";
  private processedBars = 0;
  private signalCount = 0;
  private filledOrderCount = 0;
  private error: Error | null = null;
  private result: BacktestResult | null = null;

  public constructor(private readonly options: BacktestOptions) {
    validateOptions(options);
    const store = new CandleStore();
    store.setData(options.candles);
    const source = store.getAll();
    source.forEach((candle, index) => {
      if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) {
        throw new BacktestValidationError(`Backtest prices must be positive at candle ${index}`);
      }
    });
    this.candles = source;
    this.registry = options.strategyRegistry ?? createDefaultStrategyRegistry();
    this.assumptions = {
      execution: "next-bar-open",
      endOfData: "mark-to-market-no-liquidation",
      initialCapital: options.initialCapital,
      positionSizing: cloneSizing(options.positionSizing),
      commission: { ...options.commission },
      slippage: { ...options.slippage },
      shortSelling: options.shortSelling === undefined ? null : { ...options.shortSelling },
      reversal: options.reversal ?? DEFAULT_REVERSAL,
      allowFractionalQuantity: options.allowFractionalQuantity === true,
    };
    this.externalSignal = options.signal;
    this.externalSignal?.addEventListener("abort", this.externalAbortListener);
  }

  public getStatus(): BacktestStatus {
    return {
      state: this.state,
      processedBars: this.processedBars,
      totalBars: this.candles.length,
      signalCount: this.signalCount,
      filledOrderCount: this.filledOrderCount,
      ...(this.error === null ? {} : { error: this.error.message }),
    };
  }

  public subscribe(listener: (status: BacktestStatus) => void): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public run(): BacktestResult {
    this.assertNotDisposed();
    if (this.state === "running") throw new BacktestLifecycleError("Backtest is already running");
    if (this.state === "completed") {
      if (this.result === null) throw new BacktestLifecycleError("Completed backtest has no result");
      this.result = null;
    }
    this.internalController = new AbortController();
    this.throwIfCancelled();
    this.state = "running";
    this.error = null;
    this.processedBars = 0;
    this.signalCount = 0;
    this.filledOrderCount = 0;
    this.emit();
    let strategy: StrategyInstance | null = null;
    try {
      this.throwIfCancelled();
      strategy = this.registry.create(this.options.strategy, this.options.parameters);
      const evaluation = strategy.evaluate(this.candles, {
        signal: this.combinedSignal,
        onProgress: (progress) => {
          this.throwIfCancelled();
          this.processedBars = progress.processedBars;
          this.signalCount = progress.signalCount;
          this.emitProgress({ phase: "signals", processedBars: progress.processedBars, totalBars: progress.totalBars, signalCount: progress.signalCount, filledOrderCount: this.filledOrderCount });
        },
      });
      this.signalCount = evaluation.signals.length;
      const result = this.executeSignals(evaluation);
      this.result = result;
      this.state = "completed";
      this.emit();
      return cloneResult(result);
    } catch (error) {
      if (error instanceof StrategyCancellationError || error instanceof BacktestCancellationError || this.isCancelled()) {
        this.state = "cancelled";
        this.error = new BacktestCancellationError();
        this.emit();
        throw this.error;
      }
      this.state = "failed";
      this.error = error instanceof Error ? error : new Error(String(error));
      this.emit();
      throw error;
    } finally {
      strategy?.dispose();
    }
  }

  public cancel(): void {
    this.assertNotDisposed();
    if (this.state !== "running") return;
    this.internalController.abort();
    this.externalSignal?.removeEventListener("abort", this.externalAbortListener);
  }

  public getResult(): BacktestResult | null {
    this.assertNotDisposed();
    return this.result === null ? null : cloneResult(this.result);
  }

  public dispose(): void {
    if (this.state === "disposed") return;
    this.internalController.abort();
    this.listeners.clear();
    this.result = null;
    this.state = "disposed";
    this.error = null;
  }

  private executeSignals(evaluation: { readonly strategyId: string; readonly strategyVersion: number; readonly parameters: Readonly<Record<string, unknown>>; readonly input: BacktestResult["input"]; readonly signals: readonly StrategySignal[] }): BacktestResult {
    const orders: MutableOrder[] = [];
    const pending: PendingOrder[] = [];
    const trades: MutableTrade[] = [];
    const equityCurve: AccountSnapshot[] = [];
    let position: MutablePosition | null = null;
    let cash = this.options.initialCapital;
    let realizedPnl = 0;
    let peakEquity = cash;
    let orderSequence = 0;
    let tradeSequence = 0;
    let pendingIndex = 0;
    const signalsByIndex = new Map<number, StrategySignal[]>();
    evaluation.signals.forEach((signal) => {
      const list = signalsByIndex.get(signal.index) ?? [];
      list.push(signal);
      signalsByIndex.set(signal.index, list);
    });

    const emitExecutionProgress = (index: number): void => {
      this.processedBars = index + 1;
      this.emitProgress({ phase: "execution", processedBars: index + 1, totalBars: this.candles.length, signalCount: evaluation.signals.length, filledOrderCount: this.filledOrderCount });
    };

    for (let index = 0; index < this.candles.length; index += 1) {
      this.throwIfCancelled();
      const candle = this.candles[index];
      if (candle === undefined) continue;
      while (pendingIndex < pending.length && pending[pendingIndex]?.fillIndex === index) {
        const item = pending[pendingIndex];
        pendingIndex += 1;
        if (item === undefined) continue;
        const account = accountAtPrice(cash, position, candle.open, realizedPnl, peakEquity, candle.time);
        const execution = this.executeOrder(item.order, item.signal, candle, account, position, cash, trades, tradeSequence);
        cash = execution.cash;
        position = execution.position;
        realizedPnl = execution.realizedPnl;
        tradeSequence = execution.tradeSequence;
        if (item.order.status === "filled") this.filledOrderCount += 1;
      }
      const account = accountAtPrice(cash, position, candle.close, realizedPnl, peakEquity, candle.time);
      peakEquity = Math.max(peakEquity, account.equity);
      equityCurve.push(snapshotWithPeak(account, peakEquity));
      const currentSignals = signalsByIndex.get(index) ?? [];
      currentSignals.forEach((signal) => {
        const order: MutableOrder = {
          id: `${evaluation.strategyId}-order-${orderSequence++}`,
          signalId: signal.id,
          action: signal.action,
          status: "submitted",
          signalIndex: signal.index,
          signalTime: signal.time,
          quantity: 0,
          commission: 0,
          slippage: 0,
        };
        transition(order, "pending");
        orders.push(order);
        if (index + 1 < this.candles.length) {
          pending.push({ order, signal, fillIndex: index + 1 });
        } else {
          transition(order, "cancelled");
          order.reason = "No next bar is available; the final signal is not fabricated into a fill";
        }
      });
      emitExecutionProgress(index);
    }

    const lastCandle = this.candles[this.candles.length - 1];
    const finalAccount = equityCurve[equityCurve.length - 1] ?? snapshotWithPeak(accountAtPrice(cash, position, lastCandle?.close ?? null, realizedPnl, peakEquity, lastCandle?.time ?? null), peakEquity);
    const openPosition = position === null ? null : openPositionSnapshot(position, finalAccount.markPrice);
    return {
      engineVersion: 1,
      strategyId: evaluation.strategyId,
      strategyVersion: evaluation.strategyVersion,
      parameters: { ...evaluation.parameters },
      input: { ...evaluation.input },
      inputFingerprint: fingerprintCandles(this.candles),
      signals: evaluation.signals.map((signal) => ({ ...signal })),
      assumptions: this.assumptions,
      orders: orders.map(cloneOrder),
      trades: trades.map((trade) => ({ ...trade })),
      openPosition,
      equityCurve: equityCurve.map((snapshot) => ({ ...snapshot })),
      finalAccount: { ...finalAccount },
      metrics: calculatePerformanceMetrics({
        initialCapital: this.options.initialCapital,
        orders,
        trades,
        openPosition,
        equityCurve,
        finalAccount,
      }),
    };
  }

  private executeOrder(order: MutableOrder, signal: StrategySignal, candle: Candle, account: AccountSnapshot, position: MutablePosition | null, cash: number, trades: MutableTrade[], tradeSequence: number): { cash: number; position: MutablePosition | null; realizedPnl: number; tradeSequence: number } {
    const action = signal.action;
    const targetDirection = action === "enter-long" || action === "exit-long" ? "long" : "short";
    const isEntry = action === "enter-long" || action === "enter-short";
    const existingDirection = position?.direction ?? null;
    const isExit = action === "exit-long" || action === "exit-short";
    if (isExit && existingDirection !== targetDirection) return reject(order, `Cannot ${action} while position is ${existingDirection ?? "flat"}`, cash, position, 0, tradeSequence);
    if (isEntry && existingDirection === targetDirection) return reject(order, "Pyramiding is disabled; an entry in the existing direction is rejected", cash, position, 0, tradeSequence);
    if (isEntry && existingDirection !== null && this.assumptions.reversal === "reject") return reject(order, "Reversal is disabled by the backtest policy", cash, position, 0, tradeSequence);
    if (isEntry && targetDirection === "short" && this.assumptions.shortSelling === null) return reject(order, "Short selling is not enabled", cash, position, 0, tradeSequence);

    const referencePrice = candle.open;
    const buy = action === "enter-long" || action === "exit-short";
    const executionPrice = applySlippage(referencePrice, this.assumptions.slippage, buy);
    const slippage = Math.abs(executionPrice - referencePrice);
    order.referencePrice = referencePrice;
    order.executionPrice = executionPrice;
    order.slippage = slippage;
    order.fillTime = candle.time;

    let nextCash = cash;
    let nextPosition = position;
    let nextRealized = account.realizedPnl;
    let nextTradeSequence = tradeSequence;
    let totalFee = 0;
    const originalTradeCount = trades.length;
    if (isExit || (isEntry && position !== null)) {
      const closed = closePosition(position!, order, signal, executionPrice, this.assumptions.commission, nextCash, trades);
      nextCash = closed.cash;
      nextRealized += closed.netPnl;
      totalFee += closed.fee;
      nextPosition = null;
    }
    if (isEntry) {
      const quantity = quantityForEntry(this.assumptions.positionSizing, account.equity, executionPrice, this.assumptions.allowFractionalQuantity);
      if (quantity <= 0 || !Number.isFinite(quantity)) {
        trades.length = originalTradeCount;
        return reject(order, "Position sizing produced an invalid quantity", cash, position, account.realizedPnl, tradeSequence);
      }
      if (targetDirection === "long") {
        const fee = costFor(this.assumptions.commission, quantity * executionPrice);
        if (quantity * executionPrice + fee > nextCash + 1e-12) {
          trades.length = originalTradeCount;
          return reject(order, "Insufficient cash for the long entry", cash, position, account.realizedPnl, tradeSequence);
        }
        nextCash -= quantity * executionPrice + fee;
        totalFee += fee;
        nextPosition = { id: `${order.id}-position`, direction: "long", quantity, entrySignalTime: signal.time, entryFillTime: candle.time, entryPrice: executionPrice, entryFees: fee };
      } else {
        const maxNotional = this.assumptions.shortSelling?.maxNotional ?? 0;
        if (quantity * executionPrice > maxNotional + 1e-12) {
          trades.length = originalTradeCount;
          return reject(order, "Short entry exceeds the configured maxNotional", cash, position, account.realizedPnl, tradeSequence);
        }
        const fee = costFor(this.assumptions.commission, quantity * executionPrice);
        nextCash += quantity * executionPrice - fee;
        totalFee += fee;
        nextPosition = { id: `${order.id}-position`, direction: "short", quantity, entrySignalTime: signal.time, entryFillTime: candle.time, entryPrice: executionPrice, entryFees: fee };
      }
      nextTradeSequence += 1;
    }
    order.quantity = isExit && position !== null ? position.quantity : nextPosition?.quantity ?? 0;
    order.commission = totalFee;
    transition(order, "filled");
    return { cash: nextCash, position: nextPosition, realizedPnl: nextRealized, tradeSequence: nextTradeSequence };
  }

  private throwIfCancelled(): void {
    if (this.isCancelled()) throw new BacktestCancellationError();
  }

  private isCancelled(): boolean {
    return this.internalController.signal.aborted || this.externalSignal?.aborted === true;
  }

  private emitProgress(progress: BacktestProgress): void {
    this.options.onProgress?.(progress);
    this.emit();
  }

  private emit(): void {
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }

  private assertNotDisposed(): void {
    if (this.state === "disposed") throw new BacktestLifecycleError("Backtest has been disposed");
  }

  private get combinedSignal(): AbortSignal {
    return this.internalController.signal;
  }
}

function validateOptions(options: BacktestOptions): void {
  if (!Number.isFinite(options.initialCapital) || options.initialCapital <= 0) throw new BacktestValidationError("initialCapital must be a positive finite number");
  validateCost(options.commission, "commission");
  validateCost(options.slippage, "slippage");
  validateSizing(options.positionSizing);
  if (options.shortSelling !== undefined && (!Number.isFinite(options.shortSelling.maxNotional) || options.shortSelling.maxNotional <= 0)) throw new BacktestValidationError("shortSelling.maxNotional must be positive when short selling is enabled");
  if (options.reversal !== undefined && options.reversal !== "reject" && options.reversal !== "close-and-reverse") throw new BacktestValidationError("reversal must be reject or close-and-reverse");
}

function validateCost(cost: TransactionCost, name: string): void {
  if ((cost.type !== "percent" && cost.type !== "fixed") || !Number.isFinite(cost.value) || cost.value < 0) throw new BacktestValidationError(`${name} must have a non-negative finite value and a supported type`);
}

function validateSizing(sizing: PositionSizing): void {
  const value = sizing.type === "fixed-quantity" ? sizing.quantity : sizing.type === "fixed-notional" ? sizing.amount : sizing.percent;
  if (!Number.isFinite(value) || value <= 0) throw new BacktestValidationError("position sizing value must be positive and finite");
  if (sizing.type === "percent-equity" && value > 1) throw new BacktestValidationError("percent-equity must be a decimal fraction between 0 and 1");
}

function quantityForEntry(sizing: PositionSizing, equity: number, price: number, allowFractional: boolean): number {
  const raw = sizing.type === "fixed-quantity" ? sizing.quantity : sizing.type === "fixed-notional" ? sizing.amount / price : equity * sizing.percent / price;
  if (allowFractional) return raw;
  return Number.isInteger(raw) ? raw : 0;
}

function costFor(cost: TransactionCost, notional: number): number {
  return cost.type === "percent" ? notional * cost.value : cost.value;
}

function applySlippage(reference: number, slippage: TransactionCost, buy: boolean): number {
  const adverse = buy ? 1 : -1;
  const value = slippage.type === "percent" ? reference * slippage.value : slippage.value;
  const price = reference + adverse * value;
  if (!Number.isFinite(price) || price <= 0) throw new BacktestValidationError("Slippage produced a non-positive execution price");
  return price;
}

function accountAtPrice(cash: number, position: MutablePosition | null, price: number | null, realizedPnl: number, peakEquity: number, time: number | null): AccountSnapshot {
  const positionQuantity = position === null ? 0 : position.direction === "long" ? position.quantity : -position.quantity;
  const positionValue = price === null ? 0 : positionQuantity * price;
  const unrealizedPnl = position === null || price === null ? 0 : position.direction === "long" ? (price - position.entryPrice) * position.quantity : (position.entryPrice - price) * position.quantity;
  const equity = cash + positionValue;
  const currentPeak = Math.max(peakEquity, equity);
  const drawdown = equity - currentPeak;
  return { time, markPrice: price, cash, positionQuantity, positionValue, realizedPnl, unrealizedPnl, equity, peakEquity: currentPeak, drawdown, drawdownPercent: currentPeak > 0 ? drawdown / currentPeak : null };
}

function snapshotWithPeak(snapshot: AccountSnapshot, peakEquity: number): AccountSnapshot {
  const peak = Math.max(peakEquity, snapshot.equity);
  const drawdown = snapshot.equity - peak;
  return { ...snapshot, peakEquity: peak, drawdown, drawdownPercent: peak > 0 ? drawdown / peak : null };
}

function closePosition(position: MutablePosition, order: MutableOrder, signal: StrategySignal, price: number, commission: TransactionCost, cash: number, trades: MutableTrade[]): { cash: number; netPnl: number; fee: number } {
  const notional = position.quantity * price;
  const fee = costFor(commission, notional);
  const grossPnl = position.direction === "long" ? (price - position.entryPrice) * position.quantity : (position.entryPrice - price) * position.quantity;
  const netPnl = grossPnl - position.entryFees - fee;
  const nextCash = position.direction === "long" ? cash + notional - fee : cash - notional - fee;
  trades.push({
    id: position.id.replace("-position", "-trade"),
    direction: position.direction,
    entrySignalTime: position.entrySignalTime,
    entryFillTime: position.entryFillTime,
    entryPrice: position.entryPrice,
    exitSignalTime: signal.time,
    exitFillTime: order.fillTime ?? signal.time,
    exitPrice: price,
    quantity: position.quantity,
    grossPnl,
    netPnl,
    fees: position.entryFees + fee,
    holdingDurationMs: Math.max(0, (order.fillTime ?? signal.time) - position.entryFillTime),
    exitReason: signal.reason,
  });
  return { cash: nextCash, netPnl, fee };
}

function reject(order: MutableOrder, reason: string, cash: number, position: MutablePosition | null, realizedPnl: number, tradeSequence: number): { cash: number; position: MutablePosition | null; realizedPnl: number; tradeSequence: number } {
  transition(order, "rejected");
  order.reason = reason;
  return { cash, position, realizedPnl, tradeSequence };
}

function transition(order: MutableOrder, next: BacktestOrderStatus): void {
  const allowed: Record<BacktestOrderStatus, readonly BacktestOrderStatus[]> = {
    submitted: ["pending", "cancelled"],
    pending: ["filled", "rejected", "cancelled"],
    filled: [],
    rejected: [],
    cancelled: [],
  };
  if (!allowed[order.status].includes(next)) throw new BacktestLifecycleError(`Invalid order transition ${order.status} -> ${next}`);
  order.status = next;
}

function openPositionSnapshot(position: MutablePosition, markPrice: number | null): BacktestOpenPosition {
  const unrealizedPnl = markPrice === null ? 0 : position.direction === "long" ? (markPrice - position.entryPrice) * position.quantity : (position.entryPrice - markPrice) * position.quantity;
  return { ...position, unrealizedPnl };
}

function cloneOrder(order: MutableOrder): BacktestOrder {
  return {
    id: order.id,
    signalId: order.signalId,
    action: order.action,
    status: order.status,
    signalIndex: order.signalIndex,
    signalTime: order.signalTime,
    quantity: order.quantity,
    ...(order.referencePrice === undefined ? {} : { referencePrice: order.referencePrice }),
    ...(order.executionPrice === undefined ? {} : { executionPrice: order.executionPrice }),
    ...(order.fillTime === undefined ? {} : { fillTime: order.fillTime }),
    commission: order.commission,
    slippage: order.slippage,
    ...(order.reason === undefined ? {} : { reason: order.reason }),
  };
}

function cloneSizing(sizing: PositionSizing): PositionSizing {
  return { ...sizing };
}

function cloneResult(result: BacktestResult): BacktestResult {
  return {
    ...result,
    parameters: { ...result.parameters },
    assumptions: {
      ...result.assumptions,
      positionSizing: { ...result.assumptions.positionSizing },
      commission: { ...result.assumptions.commission },
      slippage: { ...result.assumptions.slippage },
      shortSelling: result.assumptions.shortSelling === null ? null : { ...result.assumptions.shortSelling },
    },
    signals: result.signals.map((signal) => ({ ...signal })),
    metrics: { ...result.metrics },
    orders: result.orders.map((order) => ({ ...order })),
    trades: result.trades.map((trade) => ({ ...trade })),
    openPosition: result.openPosition === null ? null : { ...result.openPosition },
    equityCurve: result.equityCurve.map((snapshot) => ({ ...snapshot })),
    finalAccount: { ...result.finalAccount },
  };
}
