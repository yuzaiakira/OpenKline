export { BacktestSession, createBacktest } from "./engine.js";
export { OPENKLINE_BACKTEST_RESULT_VERSION, serializeBacktestResult, serializeTradeLedgerCsv } from "./export.js";
export { calculatePerformanceMetrics, fingerprintCandles } from "./metrics.js";
export {
  BacktestCancellationError,
  BacktestLifecycleError,
  BacktestValidationError,
} from "./types.js";
export type {
  AccountSnapshot,
  BacktestApi,
  BacktestAssumptions,
  BacktestOpenPosition,
  BacktestOptions,
  BacktestOrder,
  BacktestOrderStatus,
  BacktestPositionDirection,
  BacktestProgress,
  BacktestResult,
  BacktestStatus,
  BacktestStatusState,
  BacktestTrade,
  BacktestReversalPolicy,
  PositionSizing,
  ShortSellingOptions,
  TransactionCost,
  PerformanceMetrics,
} from "./types.js";
