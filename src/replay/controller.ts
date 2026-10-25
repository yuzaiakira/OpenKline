import { CandleStore } from "../core/candle-store.js";
import { ReplayEngine, type ReplayEngineOptions } from "./engine.js";
import type { ReplayApi, ReplayCursor, ReplayStatus, ReplayStatusListener } from "./types.js";

export interface ReplayControllerHost {
  beginReplay(source: ReplayEngineOptions["source"]): void;
  applyReplayCursor(cursor: ReplayCursor): void;
  exitReplay(): void;
  disposeReplay(): void;
}

/** Chart-owned lifecycle wrapper around the framework-independent engine. */
export class ReplayController implements ReplayApi {
  private readonly engine: ReplayEngine;
  private readonly source: ReplayEngineOptions["source"];
  private active = false;

  public constructor(
    options: ReplayEngineOptions,
    private readonly host: ReplayControllerHost,
    onStatusChange?: ReplayStatusListener,
  ) {
    const sourceStore = new CandleStore();
    sourceStore.setData(options.source);
    this.source = sourceStore.getAll();
    this.engine = new ReplayEngine({
      ...options,
      source: this.source,
      onCursorChange: (cursor) => host.applyReplayCursor(cursor),
    });
    if (onStatusChange !== undefined) this.engine.subscribe(onStatusChange);
  }

  public getStatus(): ReplayStatus {
    return this.engine.getStatus();
  }

  public subscribe(listener: ReplayStatusListener): () => void {
    return this.engine.subscribe(listener);
  }

  public start(): void {
    if (!this.active) {
      this.host.beginReplay(this.source);
      this.active = true;
    }
    try {
      this.engine.start();
    } catch (error) {
      this.active = false;
      try {
        this.host.exitReplay();
      } catch {
        // Preserve the original engine/host failure for the caller.
      }
      throw error;
    }
  }

  public play(): void {
    this.ensureActive();
    this.engine.play();
  }

  public pause(): void {
    this.ensureActive();
    this.engine.pause();
  }

  public resume(): void {
    this.ensureActive();
    this.engine.resume();
  }

  public stepForward(): void {
    this.ensureActive();
    this.engine.stepForward();
  }

  public stepBackward(): void {
    this.ensureActive();
    this.engine.stepBackward();
  }

  public seekToBar(index: number): void {
    this.ensureActive();
    this.engine.seekToBar(index);
  }

  public seekToTimestamp(timestamp: number): void {
    this.ensureActive();
    this.engine.seekToTimestamp(timestamp);
  }

  public setSpeed(speed: number): void {
    this.engine.setSpeed(speed);
  }

  public jumpToStart(): void {
    this.ensureActive();
    this.engine.jumpToStart();
  }

  public jumpToLatest(): void {
    this.ensureActive();
    this.engine.jumpToLatest();
  }

  public exit(): void {
    if (!this.active) return;
    this.engine.exit();
    this.active = false;
    this.host.exitReplay();
  }

  public reset(): void {
    this.ensureActive();
    this.engine.reset();
  }

  public dispose(): void {
    if (this.active) {
      this.active = false;
      this.host.disposeReplay();
    }
    this.engine.dispose();
  }

  private ensureActive(): void {
    if (!this.active) throw new Error("Replay has not started");
  }
}
