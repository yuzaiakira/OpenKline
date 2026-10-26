import type { Candle } from "../types.js";
import type { AccountSnapshot, BacktestOpenPosition, BacktestOrder, BacktestTrade, PerformanceMetrics } from "./types.js";

export interface PerformanceMetricsInput {
  readonly initialCapital: number;
  readonly orders: readonly BacktestOrder[];
  readonly trades: readonly BacktestTrade[];
  readonly openPosition: BacktestOpenPosition | null;
  readonly equityCurve: readonly AccountSnapshot[];
  readonly finalAccount: AccountSnapshot;
}

export function calculatePerformanceMetrics(input: PerformanceMetricsInput): PerformanceMetrics {
  const winning = input.trades.filter((trade) => trade.netPnl > 0);
  const losing = input.trades.filter((trade) => trade.netPnl < 0);
  const grossProfit = input.trades.reduce((sum, trade) => sum + Math.max(0, trade.grossPnl), 0);
  const grossLoss = input.trades.reduce((sum, trade) => sum + Math.max(0, -trade.grossPnl), 0);
  const netProfit = input.finalAccount.equity - input.initialCapital;
  const maxDrawdown = input.equityCurve.reduce((minimum, point) => Math.min(minimum, point.drawdown), 0);
  const maxDrawdownPercent = input.equityCurve.reduce((minimum, point) => Math.min(minimum, point.drawdownPercent ?? 0), 0);
  const averageTradeDurationMs = input.trades.length === 0
    ? null
    : input.trades.reduce((sum, trade) => sum + trade.holdingDurationMs, 0) / input.trades.length;
  const exposureBars = input.equityCurve.filter((point) => point.positionQuantity !== 0).length;
  return {
    totalReturn: input.initialCapital > 0 ? netProfit / input.initialCapital : null,
    netProfit,
    grossProfit,
    grossLoss,
    maxDrawdown: Math.abs(maxDrawdown),
    maxDrawdownPercent: Math.abs(maxDrawdownPercent),
    closedTradeCount: input.trades.length,
    winningTradeCount: winning.length,
    losingTradeCount: losing.length,
    winRate: input.trades.length === 0 ? null : winning.length / input.trades.length,
    averageProfit: winning.length === 0 ? null : winning.reduce((sum, trade) => sum + trade.netPnl, 0) / winning.length,
    averageLoss: losing.length === 0 ? null : losing.reduce((sum, trade) => sum + trade.netPnl, 0) / losing.length,
    profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
    averageTradeDurationMs,
    totalCommissions: input.orders.reduce((sum, order) => sum + order.commission, 0),
    exposure: input.equityCurve.length === 0 ? null : exposureBars / input.equityCurve.length,
    openPositionUnrealizedPnl: input.openPosition?.unrealizedPnl ?? 0,
  };
}

/** Deterministic, platform-independent fingerprint for reproducibility metadata. */
export function fingerprintCandles(candles: readonly Candle[]): string {
  let hash = 2_166_136_261;
  for (const candle of candles) {
    const value = `${candle.time}|${candle.open}|${candle.high}|${candle.low}|${candle.close}|${candle.volume ?? ""};`;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `fnv1a32-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
