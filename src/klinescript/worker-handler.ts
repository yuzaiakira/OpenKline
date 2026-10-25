import { CandleStore } from "../core/candle-store.js";
import type { Candle } from "../types.js";
import { compileKlineScript, type KlineScriptCompileOptions, type KlineScriptCompiledProgram } from "./compiler.js";
import { KlineScriptRuntimeError } from "./runtime.js";
import {
  isWorkerRequest,
  KLINE_SCRIPT_WORKER_PROTOCOL_VERSION,
  type KlineScriptWorkerCompiledProgram,
  type KlineScriptWorkerRequest,
  type KlineScriptWorkerResponse,
} from "./worker-protocol.js";

interface CompiledEntry {
  readonly source: string;
  readonly program: KlineScriptCompiledProgram;
}

interface Session {
  readonly store: CandleStore;
  source: string;
  parameters: Record<string, unknown>;
}

export function createKlineScriptWorkerHandler(send: (response: KlineScriptWorkerResponse) => void): (message: unknown) => void {
  const compiled = new Map<string, CompiledEntry>();
  const sessions = new Map<string, Session>();
  const cancellations = new Map<string, AbortController>();
  let disposed = false;

  const fail = (request: Pick<KlineScriptWorkerRequest, "requestId" | "generation">, code: string, message: string, diagnostics?: readonly import("./diagnostics.js").KlineScriptDiagnostic[]): void => {
    send({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "error", requestId: request.requestId, generation: request.generation, error: { code, message, ...(diagnostics === undefined ? {} : { diagnostics }) } });
  };

  const compile = (source: string, options: KlineScriptCompileOptions = {}): CompiledEntry | null => {
    const existing = compiled.get(source);
    if (existing !== undefined) return existing;
    const result = compileKlineScript(source, options ?? {});
    if (!result.success) return null;
    const entry = { source, program: result.program } as CompiledEntry;
    compiled.set(source, entry);
    return entry;
  };

  const execute = (request: Extract<KlineScriptWorkerRequest, { type: "execute" | "update-input" }>, input: readonly Candle[], source: string, parameters: Record<string, unknown>, options: import("./runtime.js").KlineScriptRuntimeLimits | undefined): void => {
    const entry = compile(source);
    if (entry === null) {
      const result = compileKlineScript(source);
      fail(request, "COMPILE_FAILED", "KlineScript compilation failed", result.diagnostics);
      return;
    }
    const controller = new AbortController();
    cancellations.set(request.requestId, controller);
    try {
      const result = entry.program.execute(input, parameters, { ...(options ?? {}), signal: controller.signal });
      send({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: request.type === "execute" ? "execute-result" : "update-input-result", requestId: request.requestId, generation: request.generation, result });
    } catch (error) {
      if (error instanceof KlineScriptRuntimeError) {
        fail(request, error.code, error.message, error.diagnostics);
      } else {
        fail(request, "EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
      }
    } finally {
      cancellations.delete(request.requestId);
    }
  };

  return (message: unknown): void => {
    if (!isWorkerRequest(message)) {
      if (isRequestIdentity(message)) {
        fail(message, "PROTOCOL", "Malformed KlineScript Worker request");
      }
      return;
    }
    if (disposed && message.type !== "dispose") {
      fail(message, "WORKER_DISPOSED", "KlineScript Worker has been disposed");
      return;
    }
    if (message.type === "dispose") {
      disposed = true;
      for (const controller of cancellations.values()) controller.abort();
      cancellations.clear();
      compiled.clear();
      sessions.clear();
      send({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "ack", requestId: message.requestId, generation: message.generation, operation: "dispose" });
      return;
    }
    if (message.type === "cancel") {
      cancellations.get(message.targetRequestId)?.abort();
      send({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "ack", requestId: message.requestId, generation: message.generation, operation: "cancel" });
      return;
    }
    if (message.type === "compile") {
      const result = compileKlineScript(message.source, message.options ?? {});
      if (!result.success) {
        send({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "compile-result", requestId: message.requestId, generation: message.generation, success: false, diagnostics: result.diagnostics });
      } else {
        compiled.set(message.source, { source: message.source, program: result.program });
        const program: KlineScriptWorkerCompiledProgram = { language: "KlineScript", version: 1, id: result.program.id, source: result.program.source, metadata: result.program.metadata };
        send({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "compile-result", requestId: message.requestId, generation: message.generation, success: true, program, diagnostics: result.diagnostics });
      }
      return;
    }
    if (message.type === "execute") {
      execute(message, message.input, message.source, { ...(message.parameters ?? {}) }, message.options);
      return;
    }
    let session = sessions.get(message.sessionId);
    if (session === undefined) {
      session = { store: new CandleStore(), source: message.source, parameters: { ...(message.parameters ?? {}) } };
      sessions.set(message.sessionId, session);
    }
    session.source = message.source;
    if (message.parameters !== undefined) session.parameters = { ...message.parameters };
    if (message.input !== undefined) session.store.setData(message.input);
    else if (message.candle !== undefined) session.store.update(message.candle as Candle);
    else {
      fail(message, "INVALID_INPUT", "update-input requires input or candle");
      return;
    }
    execute(message, session.store.getAll(), session.source, session.parameters, message.options);
  };
}

function isRequestIdentity(value: unknown): value is Pick<KlineScriptWorkerRequest, "requestId" | "generation"> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as { readonly requestId?: unknown; readonly generation?: unknown };
  return typeof candidate.requestId === "string" && candidate.requestId.length > 0 && typeof candidate.generation === "number" && Number.isInteger(candidate.generation) && candidate.generation >= 0;
}
