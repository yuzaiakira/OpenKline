import { calculateLongGrossPnl, calculateTransactionCost } from "../financial.js";
import type { TransactionCost } from "../backtesting/types.js";
import type { ResearchOrderSide } from "./types.js";

/**
 * Small independent ledger used by Phase 16 parity fixtures. It consumes only
 * simulated fills and deliberately has no replay or order-book dependencies.
 */
export interface ReferenceLedgerFill {
  readonly side: ResearchOrderSide;
  readonly price: number;
  readonly quantity: number;
  readonly fee: number;
}

export interface ReferenceLedgerSnapshot {
  readonly cash: number;
  readonly quantity: number;
  readonly costBasis: number;
  readonly realizedPnl: number;
  readonly totalFees: number;
}

export class ReferenceExecutionLedger {
  private cash: number;
  private quantity = 0;
  private costBasis = 0;
  private openEntryFees = 0;
  private realizedPnl = 0;
  private totalFees = 0;

  public constructor(initialCapital: number) {
    if (!Number.isFinite(initialCapital) || initialCapital < 0) throw new Error("Reference ledger initialCapital must be non-negative");
    this.cash = initialCapital;
  }

  public apply(fill: ReferenceLedgerFill): void {
    if (!Number.isFinite(fill.price) || fill.price <= 0 || !Number.isFinite(fill.quantity) || fill.quantity <= 0 || !Number.isFinite(fill.fee) || fill.fee < 0) throw new Error("Reference ledger fill is invalid");
    const notional = fill.price * fill.quantity;
    if (fill.side === "buy") {
      if (this.cash + 1e-10 < notional + fill.fee) throw new Error("Reference ledger insufficient cash");
      this.cash -= notional + fill.fee;
      this.costBasis += notional;
      this.quantity += fill.quantity;
      this.openEntryFees += fill.fee;
    } else {
      if (fill.quantity > this.quantity + 1e-10) throw new Error("Reference ledger insufficient position");
      const average = this.costBasis / this.quantity;
      const entryFee = this.openEntryFees * fill.quantity / this.quantity;
      this.realizedPnl += calculateLongGrossPnl(average, fill.price, fill.quantity) - entryFee - fill.fee;
      this.cash += notional - fill.fee;
      this.costBasis *= (this.quantity - fill.quantity) / this.quantity;
      this.openEntryFees -= entryFee;
      this.quantity -= fill.quantity;
      this.totalFees += fill.fee;
      if (this.quantity <= 1e-10) {
        this.quantity = 0;
        this.costBasis = 0;
        this.openEntryFees = 0;
      }
      return;
    }
    this.totalFees += fill.fee;
  }

  public snapshot(): ReferenceLedgerSnapshot {
    return {
      cash: normalize(this.cash),
      quantity: normalize(this.quantity),
      costBasis: normalize(this.costBasis),
      realizedPnl: normalize(this.realizedPnl),
      totalFees: normalize(this.totalFees),
    };
  }
}

export function referenceCosts(cost: TransactionCost, notional: number): number {
  return calculateTransactionCost(cost, notional);
}

function normalize(value: number): number {
  return Math.abs(value) <= 1e-10 ? 0 : Number(value.toPrecision(15));
}
