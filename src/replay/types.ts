import type { Candle } from "../types.js";

export type ReplayState = "idle" | "ready" | "playing" | "paused" | "completed" | "error" | "disposed";

export interface ReplayStatus {
  readonly state: ReplayState;
  /** Inclusive index of the last revealed source bar, or null for an empty source. */
  readonly currentIndex: number | null;
  readonly currentTimestamp: number | null;
  readonly totalBars: number;
  /** Playback multiplier. One means one replay bar per second. */
  readonly speed: number;
  readonly error?: string;
}

export interface ReplayCursor {
  readonly index: number | null;
  readonly timestamp: number | null;
}

export interface ReplayScheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ReplayOptions {
  /** Complete ordered historical source. The engine clones and never mutates it. */
  readonly source: readonly Candle[];
  /** UTC millisecond timestamp. The first bar at or after this point is revealed. */
  readonly startAt?: number;
  readonly speed?: number;
  /** Injectable clock for deterministic tests; omitted uses the host timer API. */
  readonly scheduler?: ReplayScheduler;
}

export type ReplayStatusListener = (status: ReplayStatus) => void;

export interface ReplayApi {
  getStatus(): ReplayStatus;
  subscribe(listener: ReplayStatusListener): () => void;
  start(): void;
  play(): void;
  pause(): void;
  resume(): void;
  stepForward(): void;
  stepBackward(): void;
  seekToBar(index: number): void;
  seekToTimestamp(timestamp: number): void;
  setSpeed(speed: number): void;
  jumpToStart(): void;
  jumpToLatest(): void;
  exit(): void;
  reset(): void;
  dispose(): void;
}

export class ReplayLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReplayLifecycleError";
  }
}

export class ReplayValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ReplayValidationError";
  }
}
