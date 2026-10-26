import type { Candle } from "../types.js";
import type { BacktestOptions, BacktestProgress, BacktestResult } from "./types.js";

/** Increment when the structured-clone contract changes incompatibly. */
export const OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION = 1 as const;

export type BacktestWorkerOperation = "initialize" | "run" | "cancel" | "dispose";

/** The Worker boundary deliberately excludes registries, callbacks, and signals. */
export type BacktestWorkerRunOptions = Omit<BacktestOptions, "candles" | "strategyRegistry" | "signal" | "onProgress">;
export type BacktestWorkerOptions = BacktestWorkerRunOptions & { readonly candles: readonly Candle[] };

export interface BacktestWorkerInitializeRequest {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "initialize";
  readonly requestId: string;
  readonly generation: number;
  readonly datasetId: string;
  readonly candles: readonly Candle[];
}

export interface BacktestWorkerRunRequest {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "run";
  readonly requestId: string;
  readonly generation: number;
  readonly options: BacktestWorkerRunOptions;
}

export interface BacktestWorkerCancelRequest {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "cancel";
  readonly requestId: string;
  readonly generation: number;
  readonly targetRequestId: string;
}

export interface BacktestWorkerDisposeRequest {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "dispose";
  readonly requestId: string;
  readonly generation: number;
}

export type BacktestWorkerRequest =
  | BacktestWorkerInitializeRequest
  | BacktestWorkerRunRequest
  | BacktestWorkerCancelRequest
  | BacktestWorkerDisposeRequest;

export interface BacktestWorkerProgressResponse {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "progress";
  readonly requestId: string;
  readonly generation: number;
  readonly progress: BacktestProgress;
}

export interface BacktestWorkerCompleteResponse {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "complete";
  readonly requestId: string;
  readonly generation: number;
  readonly result: BacktestResult;
}

export interface BacktestWorkerErrorPayload {
  readonly code: BacktestWorkerErrorCode;
  readonly message: string;
}

export interface BacktestWorkerErrorResponse {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "error";
  readonly requestId: string;
  readonly generation: number;
  readonly error: BacktestWorkerErrorPayload;
}

export interface BacktestWorkerAckResponse {
  readonly protocol: typeof OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION;
  readonly type: "ack";
  readonly requestId: string;
  readonly generation: number;
  readonly operation: BacktestWorkerOperation;
}

export type BacktestWorkerResponse =
  | BacktestWorkerProgressResponse
  | BacktestWorkerCompleteResponse
  | BacktestWorkerErrorResponse
  | BacktestWorkerAckResponse;

export type BacktestWorkerErrorCode =
  | "WORKER_UNAVAILABLE"
  | "WORKER_CRASHED"
  | "TIMEOUT"
  | "CANCELLED"
  | "SUPERSEDED"
  | "PROTOCOL"
  | "WORKER_DISPOSED"
  | "INITIALIZE_FAILED"
  | "INITIALIZE_REQUIRED"
  | "INVALID_INPUT"
  | "EXECUTION_FAILED"
  | string;

export function isBacktestWorkerRequest(value: unknown): value is BacktestWorkerRequest {
  if (!isRecord(value) || value.protocol !== OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || value.requestId.length === 0 || !isGeneration(value.generation)) return false;
  if (value.type === "initialize") return typeof value.datasetId === "string" && value.datasetId.length > 0 && Array.isArray(value.candles);
  if (value.type === "run") return isRecord(value.options) && typeof value.options.strategy === "string" && isRecord(value.options.parameters);
  if (value.type === "cancel") return typeof value.targetRequestId === "string" && value.targetRequestId.length > 0;
  return value.type === "dispose";
}

export function isBacktestWorkerResponse(value: unknown): value is BacktestWorkerResponse {
  if (!isRecord(value) || value.protocol !== OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || value.requestId.length === 0 || !isGeneration(value.generation)) return false;
  if (value.type === "progress") return isProgress(value.progress);
  if (value.type === "complete") return isRecord(value.result);
  if (value.type === "error") return isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
  return value.type === "ack" && (value.operation === "initialize" || value.operation === "run" || value.operation === "cancel" || value.operation === "dispose");
}

function isGeneration(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isProgress(value: unknown): value is BacktestProgress {
  if (!isRecord(value) || (value.phase !== "signals" && value.phase !== "execution")) return false;
  return isNonNegativeInteger(value.processedBars) && isNonNegativeInteger(value.totalBars) && isNonNegativeInteger(value.signalCount) && isNonNegativeInteger(value.filledOrderCount);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
