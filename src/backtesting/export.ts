import type { BacktestResult } from "./types.js";

export const OPENKLINE_BACKTEST_RESULT_VERSION = 1 as const;

export function serializeBacktestResult(result: BacktestResult): string {
  return JSON.stringify({
    schemaVersion: OPENKLINE_BACKTEST_RESULT_VERSION,
    engineVersion: result.engineVersion,
    strategyId: result.strategyId,
    strategyVersion: result.strategyVersion,
    parameters: result.parameters,
    input: result.input,
    inputFingerprint: result.inputFingerprint,
    assumptions: result.assumptions,
    signals: result.signals,
    orders: result.orders,
    trades: result.trades,
    openPosition: result.openPosition,
    equityCurve: result.equityCurve,
    finalAccount: result.finalAccount,
    metrics: result.metrics,
  });
}

export function serializeTradeLedgerCsv(result: BacktestResult): string {
  const columns = [
    "tradeId", "direction", "entrySignalTime", "entryFillTime", "entryPrice",
    "exitSignalTime", "exitFillTime", "exitPrice", "quantity", "grossPnl",
    "netPnl", "fees", "holdingDurationMs", "exitReason",
  ];
  const rows = result.trades.map((trade) => [
    trade.id, trade.direction, trade.entrySignalTime, trade.entryFillTime,
    trade.entryPrice, trade.exitSignalTime, trade.exitFillTime, trade.exitPrice,
    trade.quantity, trade.grossPnl, trade.netPnl, trade.fees,
    trade.holdingDurationMs, trade.exitReason,
  ].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
