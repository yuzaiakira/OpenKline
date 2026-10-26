/** Shared pure transaction-cost mathematics used by Backtesting and Paper Trading. */
export interface TransactionCostLike {
  readonly type: "percent" | "fixed";
  readonly value: number;
}

export function calculateTransactionCost(cost: TransactionCostLike, notional: number): number {
  return cost.type === "percent" ? notional * cost.value : cost.value;
}

/** Applies adverse slippage and rejects non-positive execution prices. */
export function applyAdverseSlippage(referencePrice: number, slippage: TransactionCostLike, buy: boolean): number {
  const adverseDirection = buy ? 1 : -1;
  const amount = slippage.type === "percent" ? referencePrice * slippage.value : slippage.value;
  const executionPrice = referencePrice + adverseDirection * amount;
  if (!Number.isFinite(executionPrice) || executionPrice <= 0) throw new Error("Slippage produced a non-positive execution price");
  return executionPrice;
}

export function calculateLongGrossPnl(entryPrice: number, exitPrice: number, quantity: number): number {
  return (exitPrice - entryPrice) * quantity;
}
