import type { ScreenerRuleSet } from "./rule-types.js";
import type { ScreenerBar, ScreenerInstrument } from "./types.js";
import type { ScreenerSymbolSnapshot } from "./snapshot.js";

export const OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION = 1 as const;

export interface ScreenerWorkerTask {
  readonly instrument: ScreenerInstrument;
  readonly bars: readonly ScreenerBar[];
}

export interface ScreenerWorkerRunOptions {
  readonly ruleSet: ScreenerRuleSet;
  readonly timeframe: string;
  readonly generation: number;
  readonly tasks: readonly ScreenerWorkerTask[];
}

export interface ScreenerWorkerRunRequest {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "run";
  readonly requestId: string;
  readonly generation: number;
  readonly options: ScreenerWorkerRunOptions;
}

export interface ScreenerWorkerCancelRequest {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "cancel";
  readonly requestId: string;
  readonly generation: number;
  readonly targetRequestId: string;
}

export interface ScreenerWorkerDisposeRequest {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "dispose";
  readonly requestId: string;
  readonly generation: number;
}

export type ScreenerWorkerRequest = ScreenerWorkerRunRequest | ScreenerWorkerCancelRequest | ScreenerWorkerDisposeRequest;

export interface ScreenerWorkerProgress {
  readonly completed: number;
  readonly total: number;
}

export interface ScreenerWorkerProgressResponse {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "progress";
  readonly requestId: string;
  readonly generation: number;
  readonly progress: ScreenerWorkerProgress;
}

export interface ScreenerWorkerResult {
  readonly results: readonly ScreenerSymbolSnapshot[];
  readonly counts: { readonly evaluated: number; readonly matched: number; readonly unmatched: number; readonly unavailable: number };
}

export interface ScreenerWorkerCompleteResponse {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "complete";
  readonly requestId: string;
  readonly generation: number;
  readonly result: ScreenerWorkerResult;
}

export type ScreenerWorkerErrorCode = "WORKER_UNAVAILABLE" | "WORKER_CRASHED" | "TIMEOUT" | "CANCELLED" | "SUPERSEDED" | "PROTOCOL" | "WORKER_DISPOSED" | "EXECUTION_FAILED" | string;

export interface ScreenerWorkerErrorResponse {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "error";
  readonly requestId: string;
  readonly generation: number;
  readonly error: { readonly code: ScreenerWorkerErrorCode; readonly message: string };
}

export interface ScreenerWorkerAckResponse {
  readonly protocol: typeof OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION;
  readonly type: "ack";
  readonly requestId: string;
  readonly generation: number;
  readonly operation: "run" | "cancel" | "dispose";
}

export type ScreenerWorkerResponse = ScreenerWorkerProgressResponse | ScreenerWorkerCompleteResponse | ScreenerWorkerErrorResponse | ScreenerWorkerAckResponse;

export function isScreenerWorkerRequest(value: unknown): value is ScreenerWorkerRequest {
  if (!isRecord(value) || value.protocol !== OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || value.requestId.length === 0 || !isGeneration(value.generation)) return false;
  if (value.type === "run") return isRecord(value.options) && isRecord(value.options.ruleSet) && typeof value.options.timeframe === "string" && isGeneration(value.options.generation) && Array.isArray(value.options.tasks);
  if (value.type === "cancel") return typeof value.targetRequestId === "string" && value.targetRequestId.length > 0;
  return value.type === "dispose";
}

export function isScreenerWorkerResponse(value: unknown): value is ScreenerWorkerResponse {
  if (!isRecord(value) || value.protocol !== OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || value.requestId.length === 0 || !isGeneration(value.generation)) return false;
  if (value.type === "progress") return isRecord(value.progress) && isNonNegativeInteger(value.progress.completed) && isNonNegativeInteger(value.progress.total);
  if (value.type === "complete") return isRecord(value.result) && Array.isArray(value.result.results) && isRecord(value.result.counts);
  if (value.type === "error") return isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
  return value.type === "ack" && (value.operation === "run" || value.operation === "cancel" || value.operation === "dispose");
}

function isGeneration(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isNonNegativeInteger(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value) && value >= 0; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

