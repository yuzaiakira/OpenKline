import type { Candle } from "../types.js";
import type { BacktestProgress, BacktestResult } from "./types.js";
import {
  isBacktestWorkerResponse,
  OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION,
  type BacktestWorkerErrorCode,
  type BacktestWorkerOptions,
  type BacktestWorkerRequest,
} from "./worker-protocol.js";

export interface BacktestWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export type BacktestWorkerFactory = () => BacktestWorkerLike;

export type BacktestWorkerStatusState = "idle" | "initializing" | "running" | "completed" | "cancelled" | "failed" | "disposed";

export interface BacktestWorkerStatus {
  readonly state: BacktestWorkerStatusState;
  readonly processedBars: number;
  readonly totalBars: number;
  readonly signalCount: number;
  readonly filledOrderCount: number;
  readonly progress?: BacktestProgress;
  readonly error?: string;
}

export interface BacktestWorkerRuntimeOptions {
  readonly factory?: BacktestWorkerFactory;
  readonly timeoutMs?: number;
}

export interface BacktestWorkerApi {
  getStatus(): BacktestWorkerStatus;
  subscribe(listener: (status: BacktestWorkerStatus) => void): () => void;
  /** Runs built-in strategies in a dedicated Worker and resolves with the same result as createBacktest(). */
  run(): Promise<BacktestResult>;
  /** Terminates the active Worker so cancellation remains effective during synchronous engine work. */
  cancel(): void;
  dispose(): void;
}

export class BacktestWorkerError extends Error {
  public constructor(public readonly code: BacktestWorkerErrorCode, message: string) {
    super(message);
    this.name = "BacktestWorkerError";
  }
}

interface Pending {
  readonly requestId: string;
  readonly generation: number;
  readonly kind: "initialize" | "run";
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: unknown) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface ActiveRun {
  readonly requestId: string;
  readonly generation: number;
  readonly resolve: (result: BacktestResult) => void;
  readonly reject: (error: unknown) => void;
}

type BacktestWorkerStatusUpdate = Omit<Partial<BacktestWorkerStatus>, "error"> & { readonly error?: string | undefined };

export function createBacktestWorker(options: BacktestWorkerOptions, runtimeOptions: BacktestWorkerRuntimeOptions = {}): BacktestWorkerApi {
  return new BacktestWorkerSession(options, runtimeOptions);
}

export class BacktestWorkerSession implements BacktestWorkerApi {
  private readonly factory: BacktestWorkerFactory;
  private readonly timeoutMs: number;
  private readonly options: BacktestWorkerOptions;
  private readonly candles: readonly Candle[];
  private readonly datasetId: string;
  private readonly listeners = new Set<(status: BacktestWorkerStatus) => void>();
  private readonly pending = new Map<string, Pending>();
  private worker: BacktestWorkerLike | null = null;
  private active: ActiveRun | null = null;
  private initialized = false;
  private disposed = false;
  private generation = 0;
  private nextRequestId = 1;
  private status: BacktestWorkerStatus;

  public constructor(options: BacktestWorkerOptions, runtimeOptions: BacktestWorkerRuntimeOptions = {}) {
    this.factory = runtimeOptions.factory ?? defaultBacktestWorkerFactory;
    this.timeoutMs = runtimeOptions.timeoutMs ?? 30_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) throw new RangeError("Backtest Worker timeout must be a positive integer");
    this.options = { ...options, parameters: { ...options.parameters } };
    this.candles = options.candles.map((candle) => ({ ...candle }));
    const first = this.candles[0];
    const last = this.candles[this.candles.length - 1];
    this.datasetId = `candles-${this.candles.length}-${first?.time ?? "empty"}-${last?.time ?? "empty"}`;
    this.status = {
      state: "idle",
      processedBars: 0,
      totalBars: this.candles.length,
      signalCount: 0,
      filledOrderCount: 0,
    };
  }

  public getStatus(): BacktestWorkerStatus {
    return { ...this.status };
  }

  public subscribe(listener: (status: BacktestWorkerStatus) => void): () => void {
    if (this.disposed) throw new BacktestWorkerError("WORKER_DISPOSED", "Backtest Worker runtime was disposed");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public run(): Promise<BacktestResult> {
    this.assertAlive();
    this.supersedeActiveRun();
    const generation = ++this.generation;
    const requestId = this.nextId("run");
    let resolve!: (result: BacktestResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<BacktestResult>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    this.active = { requestId, generation, resolve, reject };
    this.updateStatus({ state: "initializing", error: undefined, processedBars: 0, signalCount: 0, filledOrderCount: 0 });
    void this.execute(this.active);
    return promise;
  }

  public cancel(): void {
    this.assertAlive();
    const active = this.active;
    if (active === null) return;
    const error = new BacktestWorkerError("CANCELLED", "Backtest Worker execution was cancelled");
    this.active = null;
    this.rejectPending(error);
    this.terminateWorker();
    this.updateStatus({ state: "cancelled", error: error.message });
    active.reject(error);
  }

  public dispose(): void {
    if (this.disposed) return;
    const error = new BacktestWorkerError("WORKER_DISPOSED", "Backtest Worker runtime was disposed");
    const active = this.active;
    this.active = null;
    this.rejectPending(error);
    if (this.worker !== null) {
      try {
        this.worker.postMessage({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "dispose", requestId: this.nextId("dispose"), generation: this.generation });
      } catch {
        // Termination below is the authoritative cleanup path.
      }
    }
    this.terminateWorker();
    this.disposed = true;
    this.updateStatus({ state: "disposed", error: undefined });
    active?.reject(error);
    this.listeners.clear();
  }

  private async execute(active: ActiveRun): Promise<void> {
    try {
      this.ensureWorker();
      if (!this.initialized) {
        const initializeId = this.nextId("initialize");
        await this.request("initialize", {
          protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION,
          type: "initialize",
          requestId: initializeId,
          generation: active.generation,
          datasetId: this.datasetId,
          candles: this.candles.map((candle) => ({ ...candle })),
        });
        if (this.active !== active) return;
        this.initialized = true;
      }
      if (this.active !== active) return;
      this.updateStatus({ state: "running", error: undefined });
      const { candles: _candles, ...runOptions } = this.options;
      const runRequest: BacktestWorkerRequest = {
        protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION,
        type: "run",
        requestId: active.requestId,
        generation: active.generation,
        options: runOptions,
      };
      const result = await this.request<BacktestResult>("run", runRequest);
      if (this.active !== active) return;
      this.active = null;
      this.updateStatus({ state: "completed", processedBars: this.candles.length, error: undefined });
      active.resolve(result);
    } catch (error) {
      if (this.active !== active) return;
      this.active = null;
      const normalized = toWorkerError(error);
      if (normalized.code !== "CANCELLED" && normalized.code !== "SUPERSEDED" && normalized.code !== "WORKER_DISPOSED") this.terminateWorker();
      this.updateStatus({ state: normalized.code === "CANCELLED" ? "cancelled" : "failed", error: normalized.message });
      active.reject(normalized);
    }
  }

  private request<T = unknown>(kind: Pending["kind"], request: BacktestWorkerRequest): Promise<T> {
    const worker = this.worker;
    if (worker === null) return Promise.reject(new BacktestWorkerError("WORKER_UNAVAILABLE", "Backtest Worker is unavailable"));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new BacktestWorkerError("TIMEOUT", `Backtest Worker request timed out after ${this.timeoutMs}ms`);
        this.rejectPending(error);
        this.failActive(error);
        this.terminateWorker();
      }, this.timeoutMs);
      this.pending.set(request.requestId, { requestId: request.requestId, generation: request.generation, kind, resolve: resolve as (value: unknown) => void, reject, timer });
      try {
        worker.postMessage(request);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(request.requestId);
        reject(new BacktestWorkerError("WORKER_CRASHED", error instanceof Error ? error.message : String(error)));
      }
    });
  }

  private ensureWorker(): BacktestWorkerLike {
    if (this.worker !== null) return this.worker;
    try {
      this.worker = this.factory();
    } catch (error) {
      throw new BacktestWorkerError("WORKER_UNAVAILABLE", error instanceof Error ? error.message : String(error));
    }
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = () => {
      this.failActive(new BacktestWorkerError("WORKER_CRASHED", "Backtest Worker crashed"));
      this.terminateWorker();
    };
    this.worker.onmessageerror = () => {
      this.failActive(new BacktestWorkerError("PROTOCOL", "Backtest Worker rejected a message"));
      this.terminateWorker();
    };
    return this.worker;
  }

  private handleMessage(value: unknown): void {
    if (!isBacktestWorkerResponse(value)) {
      this.failActive(new BacktestWorkerError("PROTOCOL", "Malformed Backtest Worker response"));
      this.terminateWorker();
      return;
    }
    if (value.type === "progress") {
      const pending = this.pending.get(value.requestId);
      if (pending === undefined || pending.generation !== value.generation || pending.kind !== "run") return;
      this.updateStatusFromProgress(value.progress);
      return;
    }
    const pending = this.pending.get(value.requestId);
    if (pending === undefined) return;
    if (pending.generation !== value.generation) {
      this.rejectOne(pending.requestId, new BacktestWorkerError("SUPERSEDED", "Backtest Worker returned a stale generation"));
      return;
    }
    if (value.type === "error") {
      this.rejectOne(pending.requestId, new BacktestWorkerError(value.error.code, value.error.message));
      return;
    }
    if (value.type === "ack") {
      if (pending.kind !== "initialize" || value.operation !== "initialize") {
        this.rejectOne(pending.requestId, new BacktestWorkerError("PROTOCOL", `Unexpected Backtest Worker acknowledgement: ${value.operation}`));
        return;
      }
      this.resolveOne(pending.requestId, undefined);
      return;
    }
    if (value.type !== "complete" || pending.kind !== "run") {
      this.rejectOne(pending.requestId, new BacktestWorkerError("PROTOCOL", "Unexpected Backtest Worker response"));
      return;
    }
    this.resolveOne(pending.requestId, value.result);
  }

  private updateStatusFromProgress(progress: BacktestProgress): void {
    this.updateStatus({ state: "running", processedBars: progress.processedBars, totalBars: progress.totalBars, signalCount: progress.signalCount, filledOrderCount: progress.filledOrderCount, progress, error: undefined });
  }

  private resolveOne(requestId: string, value: unknown): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.resolve(value);
  }

  private rejectOne(requestId: string, error: BacktestWorkerError): void {
    const pending = this.pending.get(requestId);
    if (pending === undefined) return;
    clearTimeout(pending.timer);
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private rejectPending(error: BacktestWorkerError): void {
    for (const requestId of [...this.pending.keys()]) this.rejectOne(requestId, error);
  }

  private failActive(error: BacktestWorkerError): void {
    const active = this.active;
    this.active = null;
    this.rejectPending(error);
    if (active !== null) {
      this.updateStatus({ state: error.code === "CANCELLED" ? "cancelled" : "failed", error: error.message });
      active.reject(error);
    }
  }

  private supersedeActiveRun(): void {
    const active = this.active;
    if (active === null) return;
    const error = new BacktestWorkerError("SUPERSEDED", "Backtest Worker execution was superseded by a newer generation");
    this.active = null;
    this.rejectPending(error);
    this.terminateWorker();
    active.reject(error);
  }

  private terminateWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.initialized = false;
  }

  private updateStatus(update: BacktestWorkerStatusUpdate): void {
    const next = { ...this.status, ...update };
    this.status = {
      state: next.state,
      processedBars: next.processedBars,
      totalBars: next.totalBars,
      signalCount: next.signalCount,
      filledOrderCount: next.filledOrderCount,
      ...(next.progress === undefined ? {} : { progress: next.progress }),
      ...(next.error === undefined ? {} : { error: next.error }),
    };
    const status = this.getStatus();
    this.listeners.forEach((listener) => listener(status));
  }

  private nextId(prefix: string): string {
    return `btw-${prefix}-${this.nextRequestId++}`;
  }

  private assertAlive(): void {
    if (this.disposed) throw new BacktestWorkerError("WORKER_DISPOSED", "Backtest Worker runtime was disposed");
  }
}

export function defaultBacktestWorkerFactory(): BacktestWorkerLike {
  if (typeof Worker === "undefined") throw new Error("Browser Workers are unavailable in this environment");
  return new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as BacktestWorkerLike;
}

function toWorkerError(error: unknown): BacktestWorkerError {
  if (error instanceof BacktestWorkerError) return error;
  return new BacktestWorkerError("EXECUTION_FAILED", error instanceof Error ? error.message : String(error));
}
