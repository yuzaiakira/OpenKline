export { BacktestSession, createBacktest } from "./engine.js";
export { OPENKLINE_BACKTEST_RESULT_VERSION, serializeBacktestResult, serializeTradeLedgerCsv } from "./export.js";
export { calculatePerformanceMetrics, fingerprintCandles } from "./metrics.js";
export { createStrategyMarkers } from "./markers.js";
export { BacktestWorkerError, BacktestWorkerSession, createBacktestWorker, defaultBacktestWorkerFactory } from "./worker-runtime.js";
export { OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, isBacktestWorkerRequest, isBacktestWorkerResponse } from "./worker-protocol.js";
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
export type {
  BacktestWorkerApi,
  BacktestWorkerFactory,
  BacktestWorkerLike,
  BacktestWorkerRuntimeOptions,
  BacktestWorkerStatus,
  BacktestWorkerStatusState,
} from "./worker-runtime.js";
export type {
  BacktestWorkerAckResponse,
  BacktestWorkerCancelRequest,
  BacktestWorkerCompleteResponse,
  BacktestWorkerDisposeRequest,
  BacktestWorkerErrorCode,
  BacktestWorkerErrorPayload,
  BacktestWorkerErrorResponse,
  BacktestWorkerInitializeRequest,
  BacktestWorkerOptions,
  BacktestWorkerProgressResponse,
  BacktestWorkerRequest,
  BacktestWorkerResponse,
  BacktestWorkerRunOptions,
  BacktestWorkerRunRequest,
} from "./worker-protocol.js";
export type { StrategyMarker, StrategyMarkerDirection, StrategyMarkerKind } from "./markers.js";
