import type {
  PortfolioAccountSnapshot,
  PortfolioBacktestResult,
  PortfolioInstrumentContribution,
  PortfolioCorporateActionRecord,
  PortfolioDividendReceivable,
  PortfolioOrder,
  PortfolioPerformanceMetrics,
  PortfolioPosition,
  PortfolioTrade,
} from "./types.js";
import type { CorporateAction } from "../corporate-actions.js";

/** A causal presentation of a completed portfolio run at one historical boundary. */
export interface PortfolioBacktestAsOfResult extends PortfolioBacktestResult {
  readonly projection: "causal-as-of";
  readonly asOfTime: number;
  /** The completed run's final account, retained only for explicit comparison. */
  readonly sourceFinalAccount: PortfolioAccountSnapshot;
}

/**
 * Projects a completed run without re-running it and without exposing events that
 * were not available at `asOfTime`. The source result is never mutated.
 */
export function projectPortfolioBacktestAsOf(result: PortfolioBacktestResult, asOfTime: number): PortfolioBacktestAsOfResult {
  if (!Number.isSafeInteger(asOfTime)) throw new RangeError("Portfolio as-of time must be a safe integer timestamp");
  const outcomeTimes = new Map<string, number>();
  for (const event of result.timeline) if (event.orderId !== undefined) outcomeTimes.set(event.orderId, event.time);

  const signals = result.signals.filter((signal) => signal.availableAt <= asOfTime).map((signal) => ({ ...signal }));
  const timeline = result.timeline.filter((event) => event.time <= asOfTime).map((event) => ({ ...event }));
  const orders = result.orders
    .filter((order) => order.submissionTime <= asOfTime)
    .map((order) => projectOrder(order, outcomeTimes.get(order.id), asOfTime));
  const trades = result.trades.filter((trade) => trade.exitFillTime <= asOfTime).map((trade) => ({ ...trade }));
  const equityCurve = result.equityCurve
    .filter((snapshot) => snapshot.time !== null && snapshot.time <= asOfTime)
    .map(cloneSnapshot);
  const finalAccount = cloneSnapshot(equityCurve.at(-1) ?? createInitialSnapshot(result, asOfTime));
  const corporateActions = result.corporateActions?.filter((action) => isActionAvailableAt(action, asOfTime)).map(cloneCorporateAction);
  const visibleActionIds = new Set(corporateActions?.map((action) => action.id) ?? []);
  const corporateActionLedger = result.corporateActionLedger?.filter((record) => record.time <= asOfTime && visibleActionIds.has(record.actionId)).map((record) => ({ ...record }));
  const dividendReceivables = result.dividendReceivables
    ?.filter((receivable) => receivable.entitlementTime <= asOfTime && visibleActionIds.has(receivable.actionId))
    .map((receivable) => ({ ...receivable, status: projectReceivableStatus(receivable.status, receivable.paymentTime, asOfTime) }));
  const positions = projectPositions(result, finalAccount, asOfTime, corporateActions ?? [], result.corporateActions !== undefined);
  const metrics = calculateAsOfMetrics(result, finalAccount, equityCurve, orders, trades, positions, corporateActions ?? [], dividendReceivables ?? [], corporateActionLedger ?? []);

  return {
    ...result,
    projection: "causal-as-of",
    asOfTime,
    sourceFinalAccount: cloneSnapshot(result.finalAccount),
    signals,
    timeline,
    orders,
    trades,
    positions,
    equityCurve,
    finalAccount,
    metrics,
    instruments: result.instruments.map((instrument) => ({ ...instrument, ...(instrument.calendar === null ? {} : { calendar: { ...instrument.calendar } }) })),
    ...(corporateActions === undefined ? {} : { corporateActions }),
    ...(dividendReceivables === undefined ? {} : { dividendReceivables }),
    ...(corporateActionLedger === undefined ? {} : { corporateActionLedger }),
  };
}

function isActionAvailableAt(action: CorporateAction, asOfTime: number): boolean {
  return action.effectiveTime <= asOfTime && (action.knowledgeTime === undefined || action.knowledgeTime <= asOfTime);
}

function cloneCorporateAction(action: CorporateAction): CorporateAction {
  return { ...action, source: { ...action.source } };
}

function projectReceivableStatus(status: PortfolioDividendReceivable["status"], paymentTime: number | null, asOfTime: number): PortfolioDividendReceivable["status"] {
  if (paymentTime !== null && paymentTime <= asOfTime && status === "paid") return "paid";
  return paymentTime === null ? "unsettled" : "accrued";
}

function projectOrder(order: PortfolioOrder, outcomeTime: number | undefined, asOfTime: number): PortfolioOrder {
  const futureOutcome = (order.status === "filled" || order.status === "rejected") && outcomeTime !== undefined && outcomeTime > asOfTime;
  if (!futureOutcome) return { ...order };
  return {
    id: order.id,
    instrumentId: order.instrumentId,
    strategyId: order.strategyId,
    signalId: order.signalId,
    action: order.action,
    status: "pending",
    signalTime: order.signalTime,
    submissionTime: order.submissionTime,
    quantity: 0,
    commission: 0,
    slippage: 0,
    reason: "Pending at as-of cutoff",
  };
}

function createInitialSnapshot(result: PortfolioBacktestResult, asOfTime: number): PortfolioAccountSnapshot {
  return {
    time: asOfTime,
    cash: result.assumptions.initialCapital,
    availableCash: result.assumptions.initialCapital,
    realizedPnl: 0,
    unrealizedPnl: 0,
    equity: result.assumptions.initialCapital,
    peakEquity: result.assumptions.initialCapital,
    drawdown: 0,
    drawdownPercent: 0,
    grossExposure: 0,
    netExposure: 0,
    activePositionCount: 0,
    valuationStatus: "complete",
    marks: result.instruments.map((instrument) => ({ instrumentId: instrument.id, price: null, observedAt: null, quality: "unknown" as const, ageMs: null })),
  };
}

function projectPositions(result: PortfolioBacktestResult, finalAccount: PortfolioAccountSnapshot, asOfTime: number, corporateActions: readonly CorporateAction[], corporateActionAccountingActive: boolean): PortfolioPosition[] {
  const active = new Map<string, PortfolioPosition>();
  const entries = result.orders
    .filter((order) => order.action === "enter-long" && order.status === "filled" && order.fillTime !== undefined && order.fillTime <= asOfTime && order.executionPrice !== undefined)
    .sort((left, right) => (left.fillTime ?? 0) - (right.fillTime ?? 0) || left.id.localeCompare(right.id));
  for (const order of entries) {
    const trade = result.trades.find((candidate) => candidate.instrumentId === order.instrumentId && candidate.entryFillTime === order.fillTime);
    if (trade !== undefined && trade.exitFillTime <= asOfTime) {
      active.delete(order.instrumentId);
      continue;
    }
    const instrument = result.instruments.find((item) => item.id === order.instrumentId);
    if (instrument === undefined) continue;
    let quantity = order.quantity;
    let entryPrice = order.executionPrice!;
    for (const action of corporateActions) {
      if (action.instrumentId !== order.instrumentId || action.effectiveTime <= order.fillTime! || action.effectiveTime > asOfTime) continue;
      if (action.kind === "stock-split" || action.kind === "reverse-stock-split") {
        quantity *= action.newShares / action.oldShares;
        entryPrice *= action.oldShares / action.newShares;
      }
    }
    active.set(order.instrumentId, applyMark({
      instrumentId: order.instrumentId,
      symbol: instrument.symbol,
      direction: "long",
      quantity,
      entrySignalTime: order.signalTime,
      entryFillTime: order.fillTime!,
      entryPrice,
      entryFees: order.commission,
      markPrice: null,
      markTime: null,
      markQuality: "unknown",
      unrealizedPnl: null,
      ...(corporateActionAccountingActive ? { aggregateCostBasis: quantity * entryPrice } : {}),
    }, finalAccount));
  }
  return [...active.values()].sort((left, right) => left.instrumentId.localeCompare(right.instrumentId));
}

function applyMark(position: PortfolioPosition, snapshot: PortfolioAccountSnapshot): PortfolioPosition {
  const mark = snapshot.marks.find((item) => item.instrumentId === position.instrumentId);
  const price = mark?.price ?? null;
  return {
    ...position,
    markPrice: price,
    markTime: mark?.observedAt ?? null,
    markQuality: mark?.quality ?? "unknown",
    unrealizedPnl: price === null ? null : (price - position.entryPrice) * position.quantity,
  };
}

function calculateAsOfMetrics(
  result: PortfolioBacktestResult,
  finalAccount: PortfolioAccountSnapshot,
  equityCurve: readonly PortfolioAccountSnapshot[],
  orders: readonly PortfolioOrder[],
  trades: readonly PortfolioTrade[],
  positions: readonly PortfolioPosition[],
  corporateActions: readonly CorporateAction[],
  dividendReceivables: readonly PortfolioDividendReceivable[],
  corporateActionLedger: readonly PortfolioCorporateActionRecord[],
): PortfolioPerformanceMetrics {
  const winningTradeCount = trades.filter((trade) => trade.netPnl > 0).length;
  const losingTradeCount = trades.filter((trade) => trade.netPnl < 0).length;
  const grossProfit = trades.reduce((sum, trade) => sum + Math.max(0, trade.grossPnl), 0);
  const grossLoss = trades.reduce((sum, trade) => sum + Math.max(0, -trade.grossPnl), 0);
  const netProfit = finalAccount.equity === null ? null : finalAccount.equity - result.assumptions.initialCapital;
  const maxDrawdown = maximum(equityCurve, (point) => point.drawdown);
  const maxDrawdownPercent = maximum(equityCurve, (point) => point.drawdownPercent);
  const grossExposure = maximum(equityCurve, (point) => point.grossExposure);
  const netExposure = maximum(equityCurve, (point) => point.netExposure);
  const dividendIncome = finalAccount.dividendIncome ?? corporateActionLedger.filter((record) => record.kind === "cash-dividend" && record.phase === "payment" && record.status === "applied").reduce((sum, record) => sum + (record.amount ?? 0), 0);
  const dividendReceivable = finalAccount.dividendReceivable ?? dividendReceivables.filter((receivable) => receivable.status !== "paid" && receivable.status !== "unsettled").reduce((sum, receivable) => sum + receivable.amount, 0);
  const perInstrument = result.instruments.map((instrument): PortfolioInstrumentContribution => {
    const instrumentTrades = trades.filter((trade) => trade.instrumentId === instrument.id);
    const instrumentOrders = orders.filter((order) => order.instrumentId === instrument.id);
    const position = positions.find((item) => item.instrumentId === instrument.id);
    const realizedPnl = instrumentTrades.reduce((sum, trade) => sum + trade.netPnl, 0);
    const unrealizedPnl = position?.unrealizedPnl ?? (position === undefined ? 0 : null);
    const instrumentDividendIncome = corporateActionLedger.filter((record) => record.instrumentId === instrument.id && record.kind === "cash-dividend" && record.phase === "payment" && record.status === "applied").reduce((sum, record) => sum + (record.amount ?? 0), 0);
    const allocated = instrumentTrades.reduce((sum, trade) => sum + trade.entryPrice * trade.quantity, 0)
      + instrumentOrders.filter((order) => order.action === "enter-long" && order.status === "filled").reduce((sum, order) => sum + (order.executionPrice ?? 0) * order.quantity, 0);
    return {
      instrumentId: instrument.id,
      realizedPnl,
      unrealizedPnl,
      netPnl: unrealizedPnl === null ? null : realizedPnl + unrealizedPnl,
      fees: instrumentOrders.reduce((sum, order) => sum + order.commission, 0),
      grossExposure: position?.markPrice === null || position === undefined ? 0 : (position.markPrice ?? 0) * position.quantity,
      tradeCount: instrumentTrades.length,
      returnOnAllocatedCapital: allocated <= 0 || unrealizedPnl === null ? null : (realizedPnl + unrealizedPnl) / allocated,
      ...(corporateActions.length === 0 ? {} : { dividendIncome: instrumentDividendIncome, corporateActionIds: corporateActions.filter((action) => action.instrumentId === instrument.id).map((action) => action.id) }),
    };
  });
  return {
    totalReturn: netProfit === null ? null : netProfit / result.assumptions.initialCapital,
    netProfit,
    grossProfit,
    grossLoss,
    maxDrawdown,
    maxDrawdownPercent,
    realizedPnl: finalAccount.realizedPnl,
    unrealizedPnl: finalAccount.unrealizedPnl,
    totalCommissions: orders.reduce((sum, order) => sum + order.commission, 0),
    grossExposure,
    netExposure,
    portfolioTurnover: result.assumptions.initialCapital > 0 ? orders.filter((order) => order.status === "filled" && order.executionPrice !== undefined).reduce((sum, order) => sum + order.executionPrice! * order.quantity, 0) / result.assumptions.initialCapital : null,
    completedTradeCount: trades.length,
    winningTradeCount,
    losingTradeCount,
    winRate: trades.length === 0 ? null : winningTradeCount / trades.length,
    perInstrument,
    ...(corporateActions.length === 0 ? {} : { dividendIncome, priceReturn: result.assumptions.initialCapital > 0 && finalAccount.equity !== null ? (finalAccount.equity - dividendIncome - dividendReceivable - result.assumptions.initialCapital) / result.assumptions.initialCapital : null, corporateActionCount: corporateActions.length }),
  };
}

function maximum(points: readonly PortfolioAccountSnapshot[], select: (point: PortfolioAccountSnapshot) => number | null): number | null {
  let maximumValue: number | null = null;
  for (const point of points) {
    const value = select(point);
    if (value !== null && (maximumValue === null || value > maximumValue)) maximumValue = value;
  }
  return maximumValue;
}

function cloneSnapshot(snapshot: PortfolioAccountSnapshot): PortfolioAccountSnapshot {
  return { ...snapshot, marks: snapshot.marks.map((mark) => ({ ...mark })) };
}
