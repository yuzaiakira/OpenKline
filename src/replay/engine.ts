import { CandleStore } from "../core/candle-store.js";
import type {
  ReplayApi,
  ReplayCursor,
  ReplayOptions,
  ReplayScheduler,
  ReplayState,
  ReplayStatus,
  ReplayStatusListener,
} from "./types.js";
import { ReplayLifecycleError, ReplayValidationError } from "./types.js";

const MIN_SPEED = 0.01;
const MAX_SPEED = 100;

export interface ReplayEngineOptions extends ReplayOptions {
  readonly onCursorChange?: (cursor: ReplayCursor) => void;
}

/** Framework-independent deterministic bar replay state machine. */
export class ReplayEngine implements ReplayApi {
  private readonly source: readonly { readonly time: number }[];
  private readonly candles: ReturnType<CandleStore["getAll"]>;
  private readonly scheduler: ReplayScheduler;
  private readonly onCursorChange: ((cursor: ReplayCursor) => void) | undefined;
  private readonly listeners = new Set<ReplayStatusListener>();
  private state: ReplayState = "idle";
  private currentIndex: number | null;
  private speed: number;
  private error: Error | null = null;
  private timer: unknown = null;

  public constructor(options: ReplayEngineOptions) {
    const store = new CandleStore();
    store.setData(options.source);
    this.candles = store.getAll();
    this.source = this.candles.map((candle) => ({ time: candle.time }));
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.onCursorChange = options.onCursorChange;
    this.speed = normalizeSpeed(options.speed ?? 1);
    this.currentIndex = this.candles.length === 0
      ? null
      : resolveStartIndex(this.source, options.startAt);
  }

  public getStatus(): ReplayStatus {
    const timestamp = this.currentIndex === null ? null : this.source[this.currentIndex]?.time ?? null;
    return {
      state: this.state,
      currentIndex: this.currentIndex,
      currentTimestamp: timestamp,
      totalBars: this.source.length,
      speed: this.speed,
      ...(this.error === null ? {} : { error: this.error.message }),
    };
  }

  public subscribe(listener: ReplayStatusListener): () => void {
    this.assertNotDisposed();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public start(): void {
    this.assertNotDisposed();
    if (this.state !== "idle") return;
    this.error = null;
    this.applyCursor();
    this.state = "ready";
    this.emit();
  }

  public play(): void {
    this.assertNotDisposed();
    if (this.state === "error") throw new ReplayLifecycleError("Replay is in an error state; reset it before playing");
    if (this.state === "idle") {
      this.start();
    }
    if (this.state !== "ready" && this.state !== "paused") return;
    if (this.currentIndex === null) {
      this.state = "completed";
      this.emit();
      return;
    }
    if (this.currentIndex !== null && this.currentIndex >= this.source.length - 1) {
      this.state = "completed";
      this.emit();
      return;
    }
    this.state = "playing";
    this.emit();
    this.scheduleNext();
  }

  public pause(): void {
    this.assertNotDisposed();
    if (this.state !== "playing") return;
    this.clearTimer();
    this.state = "paused";
    this.emit();
  }

  public resume(): void {
    this.play();
  }

  public stepForward(): void {
    this.assertActive();
    this.pause();
    if (this.currentIndex === null) {
      this.state = "completed";
      this.emit();
      return;
    }
    if (this.currentIndex >= this.source.length - 1) {
      this.state = "completed";
      this.emit();
      return;
    }
    this.setCursor(this.currentIndex + 1);
    this.state = this.currentIndex >= this.source.length - 1 ? "completed" : "paused";
    this.emit();
  }

  public stepBackward(): void {
    this.assertActive();
    this.pause();
    if (this.currentIndex === null || this.currentIndex === 0) {
      this.state = "ready";
      this.emit();
      return;
    }
    this.setCursor(this.currentIndex - 1);
    this.state = "paused";
    this.emit();
  }

  public seekToBar(index: number): void {
    this.assertActive();
    if (!Number.isInteger(index) || index < 0 || index >= this.source.length) {
      throw new ReplayValidationError(`Replay bar index must be an integer between 0 and ${Math.max(0, this.source.length - 1)}`);
    }
    const wasPlaying = this.state === "playing";
    this.clearTimer();
    this.setCursor(index);
    if (!wasPlaying) this.state = index === this.source.length - 1 ? "paused" : "paused";
    this.emit();
    if (wasPlaying) this.scheduleNext();
  }

  public seekToTimestamp(timestamp: number): void {
    this.assertActive();
    if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp) || timestamp < 0) {
      throw new ReplayValidationError("Replay timestamp must be a non-negative integer");
    }
    const index = resolveStartIndex(this.source, timestamp);
    this.seekToBar(index);
  }

  public setSpeed(speed: number): void {
    this.assertNotDisposed();
    const next = normalizeSpeed(speed);
    this.speed = next;
    if (this.state === "playing") {
      this.clearTimer();
      this.scheduleNext();
    }
    this.emit();
  }

  public jumpToStart(): void {
    this.assertActive();
    const wasPlaying = this.state === "playing";
    this.clearTimer();
    if (this.source.length > 0) this.setCursor(0);
    this.state = wasPlaying ? "playing" : "paused";
    this.emit();
    if (wasPlaying) this.scheduleNext();
  }

  public jumpToLatest(): void {
    this.assertActive();
    this.clearTimer();
    if (this.source.length > 0) this.setCursor(this.source.length - 1);
    this.state = "paused";
    this.emit();
  }

  public exit(): void {
    this.assertNotDisposed();
    this.clearTimer();
    if (this.state === "idle") return;
    this.state = "idle";
    this.error = null;
    this.emit();
  }

  public reset(): void {
    this.assertNotDisposed();
    this.clearTimer();
    this.error = null;
    if (this.source.length > 0) this.setCursor(resolveStartIndex(this.source, undefined));
    this.state = "ready";
    this.emit();
  }

  public dispose(): void {
    if (this.state === "disposed") return;
    this.clearTimer();
    this.state = "disposed";
    this.listeners.clear();
    this.error = null;
  }

  private scheduleNext(): void {
    this.clearTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      if (this.state !== "playing") return;
      try {
        if (this.currentIndex === null || this.currentIndex >= this.source.length - 1) {
          this.state = "completed";
          this.emit();
          return;
        }
        this.setCursor(this.currentIndex + 1);
        this.state = this.currentIndex >= this.source.length - 1 ? "completed" : "playing";
        this.emit();
        if (this.state === "playing") this.scheduleNext();
      } catch (error) {
        this.fail(error);
      }
    }, 1000 / this.speed);
  }

  private setCursor(index: number): void {
    this.currentIndex = index;
    this.applyCursor();
  }

  private applyCursor(): void {
    const index = this.currentIndex;
    const cursor: ReplayCursor = {
      index,
      timestamp: index === null ? null : this.source[index]?.time ?? null,
    };
    try {
      this.onCursorChange?.(cursor);
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  private fail(error: unknown): void {
    this.clearTimer();
    this.error = error instanceof Error ? error : new Error(String(error));
    this.state = "error";
    this.emit();
  }

  private emit(): void {
    const status = this.getStatus();
    for (const listener of [...this.listeners]) listener(status);
  }

  private assertNotDisposed(): void {
    if (this.state === "disposed") throw new ReplayLifecycleError("Replay engine has been disposed");
  }

  private assertActive(): void {
    this.assertNotDisposed();
    if (this.state === "idle") throw new ReplayLifecycleError("Replay has not started");
    if (this.state === "error") throw new ReplayLifecycleError("Replay is in an error state");
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }
}

const defaultScheduler: ReplayScheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>),
};

function normalizeSpeed(value: number): number {
  if (!Number.isFinite(value) || value < MIN_SPEED || value > MAX_SPEED) {
    throw new ReplayValidationError(`Replay speed must be between ${MIN_SPEED} and ${MAX_SPEED}`);
  }
  return value;
}

function resolveStartIndex(source: readonly { readonly time: number }[], timestamp: number | undefined): number {
  if (source.length === 0) return 0;
  if (timestamp === undefined) return 0;
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp) || timestamp < 0) {
    throw new ReplayValidationError("Replay startAt must be a non-negative integer timestamp");
  }
  let low = 0;
  let high = source.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((source[middle]?.time ?? Number.MAX_SAFE_INTEGER) < timestamp) low = middle + 1;
    else high = middle;
  }
  return low;
}
