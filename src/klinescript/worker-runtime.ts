import type { Candle } from "../types.js";
import type { KlineScriptCompileOptions } from "./compiler.js";
import type { KlineScriptDiagnostic } from "./diagnostics.js";
import type { KlineScriptExecutionResult, KlineScriptRuntimeLimits } from "./runtime.js";
import {
  isWorkerResponse,
  KLINE_SCRIPT_WORKER_PROTOCOL_VERSION,
  type KlineScriptWorkerRequest,
  type KlineScriptWorkerResponse,
  type KlineScriptWorkerCompiledProgram,
} from "./worker-protocol.js";

export interface KlineScriptWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type KlineScriptWorkerFactory = () => KlineScriptWorkerLike;

export type KlineScriptWorkerErrorCode = "WORKER_UNAVAILABLE" | "WORKER_CRASHED" | "TIMEOUT" | "CANCELLED" | "SUPERSEDED" | "PROTOCOL" | "WORKER_DISPOSED" | "COMPILE_FAILED" | "EXECUTION_FAILED" | string;

export class KlineScriptWorkerError extends Error {
  public constructor(public readonly code: KlineScriptWorkerErrorCode, message: string, public readonly diagnostics: readonly KlineScriptDiagnostic[] = []) {
    super(message);
    this.name = "KlineScriptWorkerError";
  }
}

export interface KlineScriptWorkerTask<T> {
  readonly requestId: string;
  readonly generation: number;
  readonly promise: Promise<T>;
  cancel(): void;
}

export interface KlineScriptWorkerRuntimeOptions {
  readonly factory?: KlineScriptWorkerFactory;
  readonly timeoutMs?: number;
}

interface Pending {
  readonly requestId: string;
  readonly generation: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  readonly type: KlineScriptWorkerRequest["type"];
}

export class KlineScriptWorkerRuntime {
  private readonly factory: KlineScriptWorkerFactory;
  private readonly defaultTimeoutMs: number;
  private readonly pending = new Map<string, Pending>();
  private readonly diagnosticListeners = new Set<(diagnostic: KlineScriptDiagnostic) => void>();
  private worker: KlineScriptWorkerLike | null = null;
  private nextRequestId = 1;
  private generation = 0;
  private disposed = false;

  public constructor(options: KlineScriptWorkerRuntimeOptions = {}) {
    this.factory = options.factory ?? defaultWorkerFactory;
    this.defaultTimeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isInteger(this.defaultTimeoutMs) || this.defaultTimeoutMs < 1) throw new RangeError("Worker timeout must be a positive integer");
  }

  public subscribeDiagnostics(listener: (diagnostic: KlineScriptDiagnostic) => void): () => void {
    this.diagnosticListeners.add(listener);
    return () => this.diagnosticListeners.delete(listener);
  }

  public nextGeneration(): number {
    this.assertAlive();
    this.generation += 1;
    for (const pending of [...this.pending.values()]) {
      if (pending.generation < this.generation) this.rejectPending(pending.requestId, new KlineScriptWorkerError("SUPERSEDED", "KlineScript execution was superseded by a newer generation"));
    }
    return this.generation;
  }

  public compile(source: string, options: KlineScriptCompileOptions = {}, generation = this.generation): KlineScriptWorkerTask<{ readonly success: boolean; readonly program?: KlineScriptWorkerCompiledProgram; readonly diagnostics: readonly KlineScriptDiagnostic[] }> {
    return this.request({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "compile", requestId: "", generation, source, options });
  }

  public execute(source: string, input: readonly Candle[], parameters: Readonly<Record<string, unknown>> = {}, options: KlineScriptRuntimeLimits = {}, generation = this.generation): KlineScriptWorkerTask<KlineScriptExecutionResult> {
    return this.request({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "execute", requestId: "", generation, source, input: input.map((candle) => ({ ...candle })), parameters: { ...parameters }, options });
  }

  public updateInput(sessionId: string, source: string, input: readonly Candle[] | undefined, candle: Candle | undefined, parameters: Readonly<Record<string, unknown>> = {}, options: KlineScriptRuntimeLimits = {}, generation = this.generation): KlineScriptWorkerTask<KlineScriptExecutionResult> {
    return this.request({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "update-input", requestId: "", generation, sessionId, source, ...(input === undefined ? {} : { input: input.map((item) => ({ ...item })) }), ...(candle === undefined ? {} : { candle: { ...candle } }), parameters: { ...parameters }, options });
  }

  public cancel(requestId: string): boolean {
    const pending = this.pending.get(requestId);
    if (pending === undefined) return false;
    this.rejectPending(requestId, new KlineScriptWorkerError("CANCELLED", "KlineScript execution was cancelled"));
    this.restart(new KlineScriptWorkerError("CANCELLED", "KlineScript Worker was terminated after cancellation"));
    return true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const requestId of [...this.pending.keys()]) this.rejectPending(requestId, new KlineScriptWorkerError("WORKER_DISPOSED", "KlineScript Worker runtime was disposed"));
    this.worker?.terminate();
    this.worker = null;
    this.diagnosticListeners.clear();
  }

  private request<T>(template: KlineScriptWorkerRequest): KlineScriptWorkerTask<T> {
    this.assertAlive();
    const requestId = `ksw-${this.nextRequestId++}`;
    const request = { ...template, requestId } as KlineScriptWorkerRequest;
    const worker = this.ensureWorker();
    let resolvePromise!: (value: T) => void;
    let rejectPromise!: (error: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
    const timer = setTimeout(() => {
      if (!this.pending.has(requestId)) return;
      const error = new KlineScriptWorkerError("TIMEOUT", `KlineScript Worker request timed out after ${this.defaultTimeoutMs}ms`);
      this.rejectPending(requestId, error);
      this.restart(error);
    }, this.defaultTimeoutMs);
    this.pending.set(requestId, { requestId, generation: request.generation, resolve: resolvePromise as (value: unknown) => void, reject: rejectPromise, timer, type: request.type });
    worker.postMessage(request);
    return { requestId, generation: request.generation, promise, cancel: () => this.cancel(requestId) };
  }

  private ensureWorker(): KlineScriptWorkerLike {
    if (this.worker !== null) return this.worker;
    try {
      this.worker = this.factory();
    } catch (error) {
      throw new KlineScriptWorkerError("WORKER_UNAVAILABLE", error instanceof Error ? error.message : String(error));
    }
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = () => this.restart(new KlineScriptWorkerError("WORKER_CRASHED", "KlineScript Worker crashed"));
    this.worker.onmessageerror = () => this.restart(new KlineScriptWorkerError("PROTOCOL", "KlineScript Worker rejected a message"));
    return this.worker;
  }

  private handleMessage(value: unknown): void {
    if (!isWorkerResponse(value)) {
      this.restart(new KlineScriptWorkerError("PROTOCOL", "Malformed KlineScript Worker response"));
      return;
    }
    if (value.type === "diagnostic") {
      for (const listener of this.diagnosticListeners) listener(value.diagnostic);
      return;
    }
    const pending = this.pending.get(value.requestId);
    if (pending === undefined) return;
    if (pending.generation !== value.generation) {
      this.rejectPending(value.requestId, new KlineScriptWorkerError("SUPERSEDED", "KlineScript Worker returned a stale generation"));
      return;
    }
    if (value.type === "error") {
      this.rejectPending(value.requestId, new KlineScriptWorkerError(value.error.code, value.error.message, value.error.diagnostics ?? []));
      return;
    }
    try {
      this.resolvePending(value.requestId, pending, value);
    } catch (error) {
      this.rejectPending(value.requestId, error);
    }
  }

  private resolvePending(requestId: string, pending: Pending, value: KlineScriptWorkerResponse): void {
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    if (value.type === "ack" || value.type === "diagnostic") {
      pending.reject(new KlineScriptWorkerError("PROTOCOL", `Unexpected Worker response: ${value.type}`));
      return;
    }
    pending.resolve(this.mapperFor(pending.type)(value));
  }

  private mapperFor(type: KlineScriptWorkerRequest["type"]): (response: KlineScriptWorkerResponse) => unknown {
    if (type === "compile") return (response) => {
      if (response.type !== "compile-result") throw new KlineScriptWorkerError("PROTOCOL", `Unexpected Worker response: ${response.type}`);
    return { success: response.success, diagnostics: response.diagnostics, ...(response.program === undefined ? {} : { program: response.program }) };
    };
    return (response) => {
      if (response.type !== "execute-result" && response.type !== "update-input-result") throw new KlineScriptWorkerError("PROTOCOL", `Unexpected Worker response: ${response.type}`);
      return response.result;
    };
  }

  private rejectPending(requestId: string, error: unknown): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private restart(error: KlineScriptWorkerError): void {
    const current = this.worker;
    this.worker = null;
    current?.terminate();
    for (const requestId of [...this.pending.keys()]) this.rejectPending(requestId, error);
  }

  private assertAlive(): void {
    if (this.disposed) throw new KlineScriptWorkerError("WORKER_DISPOSED", "KlineScript Worker runtime was disposed");
  }
}

export function defaultWorkerFactory(): KlineScriptWorkerLike {
  if (typeof Worker === "undefined") throw new Error("Browser Workers are unavailable in this environment");
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as KlineScriptWorkerLike;
}
