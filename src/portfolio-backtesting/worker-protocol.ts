import type { PortfolioBacktestOptions, PortfolioBacktestProgress, PortfolioBacktestResult } from "./types.js";

export const OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION = 1 as const;
export type PortfolioBacktestWorkerRunOptions = Omit<PortfolioBacktestOptions, "strategyRegistry" | "signal" | "onProgress">;

export interface PortfolioBacktestWorkerRunRequest {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "run";
  readonly requestId: string;
  readonly generation: number;
  readonly options: PortfolioBacktestWorkerRunOptions;
}

export interface PortfolioBacktestWorkerCancelRequest {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "cancel";
  readonly requestId: string;
  readonly generation: number;
  readonly targetRequestId: string;
}

export interface PortfolioBacktestWorkerDisposeRequest {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "dispose";
  readonly requestId: string;
  readonly generation: number;
}

export type PortfolioBacktestWorkerRequest = PortfolioBacktestWorkerRunRequest | PortfolioBacktestWorkerCancelRequest | PortfolioBacktestWorkerDisposeRequest;

export interface PortfolioBacktestWorkerProgressResponse {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "progress";
  readonly requestId: string;
  readonly generation: number;
  readonly progress: PortfolioBacktestProgress;
}

export interface PortfolioBacktestWorkerCompleteResponse {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "complete";
  readonly requestId: string;
  readonly generation: number;
  readonly result: PortfolioBacktestResult;
}

export type PortfolioBacktestWorkerErrorCode = "WORKER_UNAVAILABLE" | "WORKER_CRASHED" | "TIMEOUT" | "CANCELLED" | "SUPERSEDED" | "PROTOCOL" | "WORKER_DISPOSED" | "INVALID_INPUT" | "EXECUTION_FAILED" | string;

export interface PortfolioBacktestWorkerErrorResponse {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "error";
  readonly requestId: string;
  readonly generation: number;
  readonly error: { readonly code: PortfolioBacktestWorkerErrorCode; readonly message: string };
}

export interface PortfolioBacktestWorkerAckResponse {
  readonly protocol: typeof OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "ack";
  readonly requestId: string;
  readonly generation: number;
  readonly operation: "run" | "cancel" | "dispose";
}

export type PortfolioBacktestWorkerResponse = PortfolioBacktestWorkerProgressResponse | PortfolioBacktestWorkerCompleteResponse | PortfolioBacktestWorkerErrorResponse | PortfolioBacktestWorkerAckResponse;

export function isPortfolioBacktestWorkerRequest(value: unknown): value is PortfolioBacktestWorkerRequest {
  if (!isRecord(value) || value.protocol !== OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || value.requestId.length === 0 || !isGeneration(value.generation)) return false;
  if (value.type === "run") return isRecord(value.options) && typeof value.options.accountCurrency === "string" && Array.isArray(value.options.instruments);
  if (value.type === "cancel") return typeof value.targetRequestId === "string" && value.targetRequestId.length > 0;
  return value.type === "dispose";
}

export function isPortfolioBacktestWorkerResponse(value: unknown): value is PortfolioBacktestWorkerResponse {
  if (!isRecord(value) || value.protocol !== OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || value.requestId.length === 0 || !isGeneration(value.generation)) return false;
  if (value.type === "progress") return isRecord(value.progress) && typeof value.progress.phase === "string" && isNonNegativeInteger(value.progress.processed) && isNonNegativeInteger(value.progress.total);
  if (value.type === "complete") return isRecord(value.result) && value.result.engineVersion === 1 && Array.isArray(value.result.orders);
  if (value.type === "error") return isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
  return value.type === "ack" && (value.operation === "run" || value.operation === "cancel" || value.operation === "dispose");
}

function isGeneration(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
