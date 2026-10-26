import { isScreenerWorkerResponse, OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type ScreenerWorkerErrorCode, type ScreenerWorkerRequest, type ScreenerWorkerResult, type ScreenerWorkerRunOptions } from "./worker-protocol.js";

export interface ScreenerWorkerLike {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onmessageerror: ((event: unknown) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}
export type ScreenerWorkerFactory = () => ScreenerWorkerLike;
export type ScreenerWorkerStatusState = "idle" | "running" | "completed" | "cancelled" | "failed" | "disposed";
export interface ScreenerWorkerStatus { readonly state: ScreenerWorkerStatusState; readonly completed: number; readonly total: number; readonly error: string | undefined; }
export interface ScreenerWorkerRuntimeOptions { readonly factory?: ScreenerWorkerFactory; readonly timeoutMs?: number; }
export interface ScreenerWorkerApi { getStatus(): ScreenerWorkerStatus; subscribe(listener: (status: ScreenerWorkerStatus) => void): () => void; run(): Promise<ScreenerWorkerResult>; cancel(): void; dispose(): void; }
export class ScreenerWorkerError extends Error { public constructor(public readonly code: ScreenerWorkerErrorCode, message: string) { super(message); this.name = "ScreenerWorkerError"; } }

interface Pending { readonly requestId: string; readonly resolve: (value: ScreenerWorkerResult) => void; readonly reject: (error: unknown) => void; readonly timer: ReturnType<typeof setTimeout>; }
interface Active { readonly requestId: string; readonly generation: number; readonly resolve: (result: ScreenerWorkerResult) => void; readonly reject: (error: unknown) => void; }
type StatusUpdate = Partial<Omit<ScreenerWorkerStatus, "error">> & { readonly error?: string | null };

export function createScreenerWorker(options: ScreenerWorkerRunOptions, runtimeOptions: ScreenerWorkerRuntimeOptions = {}): ScreenerWorkerApi { return new ScreenerWorkerSession(options, runtimeOptions); }

export class ScreenerWorkerSession implements ScreenerWorkerApi {
  private readonly factory: ScreenerWorkerFactory;
  private readonly timeoutMs: number;
  private readonly options: ScreenerWorkerRunOptions;
  private readonly listeners = new Set<(status: ScreenerWorkerStatus) => void>();
  private worker: ScreenerWorkerLike | null = null;
  private pending: Pending | null = null;
  private active: Active | null = null;
  private status: ScreenerWorkerStatus = { state: "idle", completed: 0, total: 0, error: undefined };
  private generation = 0;
  private sequence = 0;
  private disposed = false;

  public constructor(options: ScreenerWorkerRunOptions, runtimeOptions: ScreenerWorkerRuntimeOptions = {}) { this.options = cloneOptions(options); this.factory = runtimeOptions.factory ?? defaultScreenerWorkerFactory; this.timeoutMs = runtimeOptions.timeoutMs ?? 30_000; if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1) throw new RangeError("Screener Worker timeout must be a positive integer"); }
  public getStatus(): ScreenerWorkerStatus { return { ...this.status }; }
  public subscribe(listener: (status: ScreenerWorkerStatus) => void): () => void { this.assertAlive(); this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public run(): Promise<ScreenerWorkerResult> {
    this.assertAlive();
    if (this.active !== null) this.active.reject(new ScreenerWorkerError("SUPERSEDED", "Screener Worker execution was superseded"));
    this.clearPending(); this.terminateWorker();
    const activeGeneration = ++this.generation; const requestId = `screener-worker-${++this.sequence}`;
    let resolve!: (result: ScreenerWorkerResult) => void; let reject!: (error: unknown) => void;
    const promise = new Promise<ScreenerWorkerResult>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    this.active = { requestId, generation: activeGeneration, resolve, reject }; this.update({ state: "running", completed: 0, total: this.options.tasks.length, error: null });
    try {
      const worker = this.ensureWorker();
      const request: ScreenerWorkerRequest = { protocol: OPENKLINE_SCREENER_WORKER_PROTOCOL_VERSION, type: "run", requestId, generation: activeGeneration, options: { ...this.options, generation: activeGeneration } };
      this.pending = { requestId, resolve, reject, timer: setTimeout(() => this.fail(new ScreenerWorkerError("TIMEOUT", `Screener Worker request timed out after ${this.timeoutMs}ms`)), this.timeoutMs) };
      worker.postMessage(request);
    } catch (error) { this.fail(new ScreenerWorkerError("WORKER_UNAVAILABLE", error instanceof Error ? error.message : String(error))); }
    return promise;
  }
  public cancel(): void { this.assertAlive(); if (this.active === null) return; const active = this.active; this.active = null; this.clearPending(); this.terminateWorker(); const error = new ScreenerWorkerError("CANCELLED", "Screener Worker execution was cancelled"); this.update({ state: "cancelled", error: error.message }); active.reject(error); }
  public dispose(): void { if (this.disposed) return; const active = this.active; this.active = null; this.clearPending(); this.terminateWorker(); this.disposed = true; this.update({ state: "disposed", error: null }); active?.reject(new ScreenerWorkerError("WORKER_DISPOSED", "Screener Worker runtime was disposed")); this.listeners.clear(); }

  private ensureWorker(): ScreenerWorkerLike {
    if (this.worker !== null) return this.worker;
    this.worker = this.factory(); this.worker.onmessage = (event) => this.handle(event.data); this.worker.onerror = () => this.fail(new ScreenerWorkerError("WORKER_CRASHED", "Screener Worker crashed")); this.worker.onmessageerror = () => this.fail(new ScreenerWorkerError("PROTOCOL", "Screener Worker rejected a message")); return this.worker;
  }
  private handle(value: unknown): void {
    if (!isScreenerWorkerResponse(value) || this.active === null || value.requestId !== this.active.requestId || value.generation !== this.active.generation) return;
    if (value.type === "progress") { this.update({ completed: value.progress.completed, total: value.progress.total }); return; }
    if (value.type === "error") { this.fail(new ScreenerWorkerError(value.error.code, value.error.message)); return; }
    if (value.type === "complete") { const active = this.active; this.active = null; this.clearPending(); this.update({ state: "completed", completed: value.result.results.length, total: this.options.tasks.length, error: null }); active.resolve(value.result); }
  }
  private fail(error: ScreenerWorkerError): void { const active = this.active; this.active = null; this.clearPending(); this.terminateWorker(); if (active !== null) { this.update({ state: error.code === "CANCELLED" ? "cancelled" : "failed", error: error.message }); active.reject(error); } }
  private clearPending(): void { if (this.pending !== null) { clearTimeout(this.pending.timer); this.pending = null; } }
  private terminateWorker(): void { this.worker?.terminate(); this.worker = null; }
  private update(update: StatusUpdate): void {
    const next: ScreenerWorkerStatus = {
      state: update.state ?? this.status.state,
      completed: update.completed ?? this.status.completed,
      total: update.total ?? this.status.total,
      error: update.error === null ? undefined : update.error ?? this.status.error,
    };
    for (const listener of this.listeners) listener(next);
    this.status = next;
  }
  private assertAlive(): void { if (this.disposed) throw new ScreenerWorkerError("WORKER_DISPOSED", "Screener Worker runtime was disposed"); }
}

function cloneOptions(options: ScreenerWorkerRunOptions): ScreenerWorkerRunOptions { return { ...options, ruleSet: structuredCloneSafe(options.ruleSet), tasks: options.tasks.map((task) => ({ instrument: { ...task.instrument }, bars: task.bars.map((bar) => ({ ...bar, candle: { ...bar.candle } })) })) }; }
function structuredCloneSafe<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function defaultScreenerWorkerFactory(): ScreenerWorkerLike { const WorkerConstructor = globalThis.Worker; if (WorkerConstructor === undefined) throw new Error("No Worker implementation is available"); return new WorkerConstructor(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as ScreenerWorkerLike; }

