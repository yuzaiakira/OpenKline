import { isPortfolioBacktestWorkerResponse, OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type PortfolioBacktestWorkerErrorCode, type PortfolioBacktestWorkerRequest, type PortfolioBacktestWorkerRunOptions } from "./worker-protocol.js";
import type { PortfolioBacktestProgress, PortfolioBacktestResult } from "./types.js";
export type { PortfolioBacktestWorkerRunOptions } from "./worker-protocol.js";

export interface PortfolioBacktestWorkerLike { onmessage: ((event: { readonly data: unknown }) => void) | null; onerror: ((event: unknown) => void) | null; onmessageerror: ((event: unknown) => void) | null; postMessage(message: unknown): void; terminate(): void; }
export type PortfolioBacktestWorkerFactory = () => PortfolioBacktestWorkerLike;
export type PortfolioBacktestWorkerStatusState = "idle" | "running" | "completed" | "cancelled" | "failed" | "disposed";
export interface PortfolioBacktestWorkerStatus { readonly state: PortfolioBacktestWorkerStatusState; readonly processed: number; readonly total: number; readonly signalCount: number; readonly filledOrderCount: number; readonly progress?: PortfolioBacktestProgress; readonly error?: string; }
export interface PortfolioBacktestWorkerRuntimeOptions { readonly factory?: PortfolioBacktestWorkerFactory; readonly timeoutMs?: number; }
export interface PortfolioBacktestWorkerApi { getStatus(): PortfolioBacktestWorkerStatus; subscribe(listener: (status: PortfolioBacktestWorkerStatus) => void): () => void; run(): Promise<PortfolioBacktestResult>; cancel(): void; dispose(): void; }
export class PortfolioBacktestWorkerError extends Error { public constructor(public readonly code: PortfolioBacktestWorkerErrorCode, message: string) { super(message); this.name = "PortfolioBacktestWorkerError"; } }

interface Pending { readonly requestId: string; readonly generation: number; readonly resolve: (value: PortfolioBacktestResult) => void; readonly reject: (error: unknown) => void; readonly timer: ReturnType<typeof setTimeout>; }
interface Active { readonly requestId: string; readonly generation: number; readonly resolve: (result: PortfolioBacktestResult) => void; readonly reject: (error: unknown) => void; }

export function createPortfolioBacktestWorker(options: PortfolioBacktestWorkerRunOptions, runtimeOptions: PortfolioBacktestWorkerRuntimeOptions = {}): PortfolioBacktestWorkerApi { return new PortfolioBacktestWorkerSession(options, runtimeOptions); }

export class PortfolioBacktestWorkerSession implements PortfolioBacktestWorkerApi {
  private readonly options: PortfolioBacktestWorkerRunOptions;
  private readonly factory: PortfolioBacktestWorkerFactory;
  private readonly timeoutMs: number;
  private readonly listeners = new Set<(status: PortfolioBacktestWorkerStatus) => void>();
  private worker: PortfolioBacktestWorkerLike | null = null;
  private pending: Pending | null = null;
  private active: Active | null = null;
  private generation = 0;
  private sequence = 0;
  private disposed = false;
  private status: PortfolioBacktestWorkerStatus = { state: "idle", processed: 0, total: 0, signalCount: 0, filledOrderCount: 0 };

  public constructor(options: PortfolioBacktestWorkerRunOptions, runtimeOptions: PortfolioBacktestWorkerRuntimeOptions = {}) { this.options = cloneOptions(options); this.factory = runtimeOptions.factory ?? defaultPortfolioBacktestWorkerFactory; this.timeoutMs = runtimeOptions.timeoutMs ?? 30_000; if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) throw new RangeError("Portfolio backtest Worker timeout must be a positive integer"); }
  public getStatus(): PortfolioBacktestWorkerStatus { return { ...this.status }; }
  public subscribe(listener: (status: PortfolioBacktestWorkerStatus) => void): () => void { this.assertAlive(); this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public run(): Promise<PortfolioBacktestResult> {
    this.assertAlive();
    if (this.active !== null) { this.active.reject(new PortfolioBacktestWorkerError("SUPERSEDED", "Portfolio backtest Worker execution was superseded")); this.active = null; }
    this.clearPending(); this.terminateWorker();
    const generation = ++this.generation; const requestId = `pbt-worker-${++this.sequence}`;
    let resolve!: (result: PortfolioBacktestResult) => void; let reject!: (error: unknown) => void;
    const promise = new Promise<PortfolioBacktestResult>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    this.active = { requestId, generation, resolve, reject }; this.update({ state: "running", processed: 0, total: this.options.instruments.reduce((sum, item) => sum + item.candles.length, 0), signalCount: 0, filledOrderCount: 0, error: null });
    try {
      const worker = this.ensureWorker();
      const request: PortfolioBacktestWorkerRequest = { protocol: OPENKLINE_PORTFOLIO_BACKTEST_WORKER_PROTOCOL_VERSION, type: "run", requestId, generation, options: this.options };
      this.pending = { requestId, generation, resolve, reject, timer: setTimeout(() => this.fail(new PortfolioBacktestWorkerError("TIMEOUT", `Portfolio backtest Worker request timed out after ${this.timeoutMs}ms`)), this.timeoutMs) };
      worker.postMessage(request);
    } catch (error) { this.fail(new PortfolioBacktestWorkerError("WORKER_UNAVAILABLE", error instanceof Error ? error.message : String(error))); }
    return promise;
  }
  public cancel(): void { this.assertAlive(); if (this.active === null) return; const active = this.active; this.active = null; this.clearPending(); this.terminateWorker(); const error = new PortfolioBacktestWorkerError("CANCELLED", "Portfolio backtest Worker execution was cancelled"); this.update({ state: "cancelled", error: error.message }); active.reject(error); }
  public dispose(): void { if (this.disposed) return; const active = this.active; this.active = null; this.clearPending(); this.terminateWorker(); this.disposed = true; this.update({ state: "disposed", error: null }); active?.reject(new PortfolioBacktestWorkerError("WORKER_DISPOSED", "Portfolio backtest Worker runtime was disposed")); this.listeners.clear(); }
  private ensureWorker(): PortfolioBacktestWorkerLike { if (this.worker !== null) return this.worker; this.worker = this.factory(); this.worker.onmessage = (event) => this.handle(event.data); this.worker.onerror = () => this.fail(new PortfolioBacktestWorkerError("WORKER_CRASHED", "Portfolio backtest Worker crashed")); this.worker.onmessageerror = () => this.fail(new PortfolioBacktestWorkerError("PROTOCOL", "Portfolio backtest Worker rejected a message")); return this.worker; }
  private handle(value: unknown): void {
    const active = this.active;
    if (active === null || !isPortfolioBacktestWorkerResponse(value) || value.requestId !== active.requestId || value.generation !== active.generation) return;
    if (value.type === "progress") { this.update({ processed: value.progress.processed, total: value.progress.total, signalCount: value.progress.signalCount, filledOrderCount: value.progress.filledOrderCount, progress: value.progress }); return; }
    if (value.type === "error") { this.fail(new PortfolioBacktestWorkerError(value.error.code, value.error.message)); return; }
    if (value.type === "complete") { this.active = null; this.clearPending(); this.update({ state: "completed", processed: this.status.total, error: null }); active.resolve(value.result); }
  }
  private fail(error: PortfolioBacktestWorkerError): void { const active = this.active; this.active = null; this.clearPending(); this.terminateWorker(); if (active !== null) { this.update({ state: error.code === "CANCELLED" ? "cancelled" : "failed", error: error.message }); active.reject(error); } }
  private clearPending(): void { if (this.pending !== null) { clearTimeout(this.pending.timer); this.pending = null; } }
  private terminateWorker(): void { this.worker?.terminate(); this.worker = null; }
  private update(update: Omit<Partial<PortfolioBacktestWorkerStatus>, "error"> & { readonly error?: string | null }): void {
    const base = { state: update.state ?? this.status.state, processed: update.processed ?? this.status.processed, total: update.total ?? this.status.total, signalCount: update.signalCount ?? this.status.signalCount, filledOrderCount: update.filledOrderCount ?? this.status.filledOrderCount, ...(update.progress === undefined ? {} : { progress: update.progress }) };
    this.status = update.error === null ? base : update.error !== undefined ? { ...base, error: update.error } : this.status.error === undefined ? base : { ...base, error: this.status.error };
    for (const listener of this.listeners) listener(this.getStatus());
  }
  private assertAlive(): void { if (this.disposed) throw new PortfolioBacktestWorkerError("WORKER_DISPOSED", "Portfolio backtest Worker runtime was disposed"); }
}

export function defaultPortfolioBacktestWorkerFactory(): PortfolioBacktestWorkerLike { const WorkerConstructor = globalThis.Worker; if (WorkerConstructor === undefined) throw new Error("No Worker implementation is available"); return new WorkerConstructor(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as PortfolioBacktestWorkerLike; }
function cloneOptions(options: PortfolioBacktestWorkerRunOptions): PortfolioBacktestWorkerRunOptions { return JSON.parse(JSON.stringify(options)) as PortfolioBacktestWorkerRunOptions; }
