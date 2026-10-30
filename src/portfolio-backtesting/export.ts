import type { PortfolioBacktestResult } from "./types.js";

export const OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION = 1 as const;

export function serializePortfolioBacktestResult(result: PortfolioBacktestResult): string {
  return JSON.stringify({ schemaVersion: OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION, ...result });
}

export function parsePortfolioBacktestResult(value: unknown): PortfolioBacktestResult {
  if (!isRecord(value) || value.schemaVersion !== OPENKLINE_PORTFOLIO_BACKTEST_RESULT_VERSION || value.engineVersion !== 1 || typeof value.accountCurrency !== "string" || !Array.isArray(value.instruments) || !Array.isArray(value.timeline) || !Array.isArray(value.orders) || !Array.isArray(value.trades) || !Array.isArray(value.positions) || !Array.isArray(value.equityCurve) || !isRecord(value.finalAccount) || !isRecord(value.metrics)) {
    throw new TypeError("Invalid portfolio backtest result document");
  }
  if (value.accountCurrency.trim().length === 0 || typeof value.inputFingerprint !== "string") throw new TypeError("Invalid portfolio backtest result metadata");
  return stripSchemaVersion(value as unknown as PortfolioBacktestResult);
}

export function serializePortfolioOrdersCsv(result: PortfolioBacktestResult): string {
  const columns = ["orderId", "instrumentId", "strategyId", "action", "status", "signalTime", "submissionTime", "fillTime", "quantity", "referencePrice", "executionPrice", "commission", "slippage", "reason"];
  const rows = result.orders.map((order) => [order.id, order.instrumentId, order.strategyId, order.action, order.status, order.signalTime, order.submissionTime, order.fillTime ?? "", order.quantity, order.referencePrice ?? "", order.executionPrice ?? "", order.commission, order.slippage, order.reason ?? ""].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

export function serializePortfolioTradesCsv(result: PortfolioBacktestResult): string {
  const columns = ["tradeId", "instrumentId", "direction", "entrySignalTime", "entryFillTime", "entryPrice", "exitSignalTime", "exitFillTime", "exitPrice", "quantity", "grossPnl", "netPnl", "fees", "holdingDurationMs", "exitReason"];
  const rows = result.trades.map((trade) => [trade.id, trade.instrumentId, trade.direction, trade.entrySignalTime, trade.entryFillTime, trade.entryPrice, trade.exitSignalTime, trade.exitFillTime, trade.exitPrice, trade.quantity, trade.grossPnl, trade.netPnl, trade.fees, trade.holdingDurationMs, trade.exitReason].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

export function serializePortfolioEquityCsv(result: PortfolioBacktestResult): string {
  const columns = ["time", "cash", "availableCash", "realizedPnl", "unrealizedPnl", "equity", "peakEquity", "drawdown", "drawdownPercent", "grossExposure", "netExposure", "activePositionCount", "valuationStatus"];
  const rows = result.equityCurve.map((point) => [point.time ?? "", point.cash, point.availableCash, point.realizedPnl, point.unrealizedPnl ?? "", point.equity ?? "", point.peakEquity ?? "", point.drawdown ?? "", point.drawdownPercent ?? "", point.grossExposure, point.netExposure, point.activePositionCount, point.valuationStatus].map(csvCell).join(","));
  return [columns.join(","), ...rows].join("\n");
}

function stripSchemaVersion(result: PortfolioBacktestResult): PortfolioBacktestResult {
  return JSON.parse(JSON.stringify(result)) as PortfolioBacktestResult;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
