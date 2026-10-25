import type { Candle } from "../types.js";
import type { KlineScriptCompileOptions, KlineScriptCompiledProgram } from "./compiler.js";
import type { KlineScriptDiagnostic } from "./diagnostics.js";
import type { KlineScriptExecutionResult, KlineScriptRuntimeLimits } from "./runtime.js";

export const KLINE_SCRIPT_WORKER_PROTOCOL_VERSION = 1 as const;

export type KlineScriptWorkerOperation = "compile" | "execute" | "update-input" | "cancel" | "dispose";

export interface KlineScriptWorkerCompiledProgram {
  readonly language: "KlineScript";
  readonly version: 1;
  readonly id: string;
  readonly source: string;
  readonly metadata: KlineScriptCompiledProgram["metadata"];
}

export interface KlineScriptWorkerCompileRequest {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "compile";
  readonly requestId: string;
  readonly generation: number;
  readonly source: string;
  readonly options?: KlineScriptCompileOptions;
}

export interface KlineScriptWorkerExecuteRequest {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "execute";
  readonly requestId: string;
  readonly generation: number;
  readonly source: string;
  readonly input: readonly Candle[];
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly options?: KlineScriptRuntimeLimits;
}

export interface KlineScriptWorkerUpdateInputRequest {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "update-input";
  readonly requestId: string;
  readonly generation: number;
  readonly sessionId: string;
  readonly source: string;
  readonly input?: readonly Candle[];
  readonly candle?: Candle;
  readonly sourceEvent?: "append" | "correction";
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly options?: KlineScriptRuntimeLimits;
}

export interface KlineScriptWorkerCancelRequest {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "cancel";
  readonly requestId: string;
  readonly generation: number;
  readonly targetRequestId: string;
}

export interface KlineScriptWorkerDisposeRequest {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "dispose";
  readonly requestId: string;
  readonly generation: number;
}

export type KlineScriptWorkerRequest =
  | KlineScriptWorkerCompileRequest
  | KlineScriptWorkerExecuteRequest
  | KlineScriptWorkerUpdateInputRequest
  | KlineScriptWorkerCancelRequest
  | KlineScriptWorkerDisposeRequest;

export interface KlineScriptWorkerCompileResponse {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "compile-result";
  readonly requestId: string;
  readonly generation: number;
  readonly success: boolean;
  readonly program?: KlineScriptWorkerCompiledProgram;
  readonly diagnostics: readonly KlineScriptDiagnostic[];
}

export interface KlineScriptWorkerExecutionResponse {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "execute-result" | "update-input-result";
  readonly requestId: string;
  readonly generation: number;
  readonly result: KlineScriptExecutionResult;
}

export interface KlineScriptWorkerErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly diagnostics?: readonly KlineScriptDiagnostic[];
}

export interface KlineScriptWorkerErrorResponse {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "error";
  readonly requestId: string;
  readonly generation: number;
  readonly error: KlineScriptWorkerErrorPayload;
}

export interface KlineScriptWorkerDiagnosticResponse {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "diagnostic";
  readonly requestId: string;
  readonly generation: number;
  readonly diagnostic: KlineScriptDiagnostic;
}

export interface KlineScriptWorkerAckResponse {
  readonly protocol: typeof KLINE_SCRIPT_WORKER_PROTOCOL_VERSION;
  readonly type: "ack";
  readonly requestId: string;
  readonly generation: number;
  readonly operation: "cancel" | "dispose";
}

export type KlineScriptWorkerResponse =
  | KlineScriptWorkerCompileResponse
  | KlineScriptWorkerExecutionResponse
  | KlineScriptWorkerErrorResponse
  | KlineScriptWorkerDiagnosticResponse
  | KlineScriptWorkerAckResponse;

export function isWorkerRequest(value: unknown): value is KlineScriptWorkerRequest {
  if (!isRecord(value) || value.protocol !== KLINE_SCRIPT_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || typeof value.generation !== "number") return false;
  if (!Number.isInteger(value.generation) || value.generation < 0 || value.requestId.length === 0) return false;
  if (value.type === "compile" || value.type === "execute") return typeof value.source === "string" && (value.type === "compile" || Array.isArray(value.input));
  if (value.type === "update-input") return typeof value.sessionId === "string" && value.sessionId.length > 0 && typeof value.source === "string" && (value.input === undefined || Array.isArray(value.input)) && (value.candle === undefined || isRecord(value.candle));
  if (value.type === "cancel") return typeof value.targetRequestId === "string" && value.targetRequestId.length > 0;
  return value.type === "dispose";
}

export function isWorkerResponse(value: unknown): value is KlineScriptWorkerResponse {
  if (!isRecord(value) || value.protocol !== KLINE_SCRIPT_WORKER_PROTOCOL_VERSION || typeof value.type !== "string" || typeof value.requestId !== "string" || typeof value.generation !== "number") return false;
  if (!Number.isInteger(value.generation) || value.generation < 0 || value.requestId.length === 0) return false;
  if (value.type === "compile-result") return typeof value.success === "boolean" && Array.isArray(value.diagnostics);
  if (value.type === "execute-result" || value.type === "update-input-result") return isRecord(value.result) && typeof value.result.indicatorId === "string" && Array.isArray(value.result.outputs) && typeof value.result.operations === "number";
  if (value.type === "error") return isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string";
  if (value.type === "diagnostic") return isRecord(value.diagnostic) && typeof value.diagnostic.code === "string";
  return value.type === "ack" && (value.operation === "cancel" || value.operation === "dispose");
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
