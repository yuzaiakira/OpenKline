import type { PaperClock, PaperMarketEvent, PaperTradingMode } from "./types.js";

export interface PaperMarketStreamOptions {
  readonly symbol: string;
  readonly initialPrice: number;
  readonly startTime?: number;
  readonly intervalMs?: number;
  readonly stepMs?: number;
  readonly seed?: number;
  readonly source?: string;
  readonly clock?: PaperClock;
  readonly scheduler?: PaperMarketStreamScheduler;
  readonly mode?: Exclude<PaperTradingMode, "replay">;
}

export interface PaperMarketStreamScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type PaperMarketStreamState = "idle" | "running" | "paused" | "disconnected" | "disposed";

export interface PaperMarketStreamStatus {
  readonly state: PaperMarketStreamState;
  readonly sequence: number;
  readonly latestEvent: PaperMarketEvent | null;
  readonly speed: number;
  readonly diagnostic: string | null;
}

export type PaperMarketStreamListener = (event: PaperMarketEvent) => void;

export interface PaperMarketStreamApi {
  getStatus(): PaperMarketStreamStatus;
  subscribe(listener: PaperMarketStreamListener): () => void;
  start(): void;
  pause(): void;
  resume(): void;
  step(): PaperMarketEvent;
  setSpeed(multiplier: number): void;
  disconnect(): void;
  reconnect(): void;
  dispose(): void;
}

const defaultScheduler: PaperMarketStreamScheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const defaultClock: PaperClock = { now: () => Date.now() };

/** A deterministic, credential-free market event source for examples and tests. */
export function createDeterministicPaperMarketStream(options: PaperMarketStreamOptions): PaperMarketStreamApi {
  return new DeterministicPaperMarketStream(options);
}

export class DeterministicPaperMarketStream implements PaperMarketStreamApi {
  private readonly options: Required<Pick<PaperMarketStreamOptions, "symbol" | "initialPrice" | "intervalMs" | "stepMs" | "seed" | "source" | "mode">> & Pick<PaperMarketStreamOptions, "startTime">;
  private readonly clock: PaperClock;
  private readonly scheduler: PaperMarketStreamScheduler;
  private readonly listeners = new Set<PaperMarketStreamListener>();
  private state: PaperMarketStreamState = "idle";
  private sequence = 0;
  private speed = 1;
  private latestEvent: PaperMarketEvent | null = null;
  private diagnostic: string | null = null;
  private timer: unknown;

  public constructor(options: PaperMarketStreamOptions) {
    if (options.symbol.trim().length === 0 || !Number.isFinite(options.initialPrice) || options.initialPrice <= 0) throw new Error("Paper market stream symbol and initialPrice are required");
    const intervalMs = options.intervalMs ?? 1_000;
    const stepMs = options.stepMs ?? intervalMs;
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || !Number.isFinite(stepMs) || stepMs <= 0) throw new Error("Paper market stream intervalMs and stepMs must be positive");
    this.options = { symbol: options.symbol, initialPrice: options.initialPrice, intervalMs, stepMs, seed: options.seed ?? 1, source: options.source ?? "deterministic-demo", mode: options.mode ?? "simulated", ...(options.startTime === undefined ? {} : { startTime: options.startTime }) };
    this.clock = options.clock ?? defaultClock;
    this.scheduler = options.scheduler ?? defaultScheduler;
  }

  public getStatus(): PaperMarketStreamStatus {
    return { state: this.state, sequence: this.sequence, latestEvent: this.latestEvent === null ? null : { ...this.latestEvent }, speed: this.speed, diagnostic: this.diagnostic };
  }

  public subscribe(listener: PaperMarketStreamListener): () => void {
    if (this.state === "disposed") throw new Error("Paper market stream has been disposed");
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public start(): void {
    this.assertUsable();
    if (this.state === "idle" || this.state === "paused") this.state = "running";
    this.schedule();
  }

  public pause(): void {
    this.assertUsable();
    this.clearTimer();
    if (this.state === "running") this.state = "paused";
  }

  public resume(): void {
    this.assertUsable();
    if (this.state === "paused") this.state = "running";
    this.schedule();
  }

  public step(): PaperMarketEvent {
    this.assertUsable();
    if (this.state === "disconnected") throw new Error("Paper market stream is disconnected");
    if (this.state === "idle") this.state = "paused";
    const event = this.createEvent();
    this.latestEvent = event;
    this.diagnostic = null;
    for (const listener of this.listeners) listener({ ...event });
    return { ...event };
  }

  public setSpeed(multiplier: number): void {
    this.assertUsable();
    if (!Number.isFinite(multiplier) || multiplier <= 0) throw new Error("Paper market stream speed must be positive");
    this.speed = multiplier;
    if (this.state === "running") {
      this.clearTimer();
      this.schedule();
    }
  }

  public disconnect(): void {
    this.assertUsable();
    this.clearTimer();
    this.state = "disconnected";
    this.diagnostic = "DISCONNECTED";
  }

  public reconnect(): void {
    this.assertUsable();
    if (this.state !== "disconnected") return;
    this.state = "running";
    this.diagnostic = null;
    this.schedule();
  }

  public dispose(): void {
    if (this.state === "disposed") return;
    this.clearTimer();
    this.listeners.clear();
    this.state = "disposed";
  }

  private createEvent(): PaperMarketEvent {
    this.sequence += 1;
    const time = (this.options.startTime ?? this.clock.now()) + this.sequence * this.options.stepMs;
    const price = this.options.initialPrice * (1 + deterministicDelta(this.options.seed, this.sequence));
    return { id: `${this.options.source}-${this.sequence}`, symbol: this.options.symbol, time, price, source: this.options.source, quoteStatus: "fresh", mode: this.options.mode, sourceSequence: this.sequence };
  }

  private schedule(): void {
    if (this.state !== "running" || this.timer !== undefined) return;
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = undefined;
      if (this.state !== "running") return;
      this.step();
      this.schedule();
    }, this.options.intervalMs / this.speed);
  }

  private clearTimer(): void {
    if (this.timer === undefined) return;
    this.scheduler.clearTimeout(this.timer);
    this.timer = undefined;
  }

  private assertUsable(): void {
    if (this.state === "disposed") throw new Error("Paper market stream has been disposed");
  }
}

function deterministicDelta(seed: number, sequence: number): number {
  let value = (Math.imul(seed | 0, 1_664_525) + Math.imul(sequence, 1_013_904_223)) | 0;
  value ^= value >>> 16;
  return ((value % 2_001) - 1_000) / 1_000_000;
}
