import assert from "node:assert/strict";
import test from "node:test";
import { ReplayEngine } from "../src/replay/engine.js";
import { ReplayLifecycleError, ReplayValidationError, type ReplayScheduler } from "../src/replay/types.js";
import type { Candle } from "../src/types.js";

const source: Candle[] = [
  { time: 10, open: 1, high: 3, low: 0, close: 2, volume: 10 },
  { time: 20, open: 2, high: 4, low: 1, close: 3, volume: 11 },
  { time: 35, open: 3, high: 5, low: 2, close: 4, volume: 12 },
  { time: 80, open: 4, high: 6, low: 3, close: 5, volume: 13 },
];

class FakeScheduler implements ReplayScheduler {
  public readonly delays: number[] = [];
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();

  public setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId++;
    this.delays.push(delayMs);
    this.callbacks.set(id, callback);
    return id;
  }

  public clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  public runNext(): void {
    const entry = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (entry === undefined) throw new Error("No scheduled replay callback");
    this.callbacks.delete(entry[0]);
    entry[1]();
  }

  public get pending(): number {
    return this.callbacks.size;
  }
}

test("ReplayEngine reveals an inclusive historical cursor and preserves its source", () => {
  const original = source.map((candle) => ({ ...candle }));
  const cursors: number[] = [];
  const engine = new ReplayEngine({ source, startAt: 21, onCursorChange: ({ index }) => { if (index !== null) cursors.push(index); } });

  assert.equal(engine.getStatus().state, "idle");
  assert.equal(engine.getStatus().currentIndex, 2, "startAt chooses the first bar at or after the requested timestamp");
  assert.throws(() => engine.stepForward(), ReplayLifecycleError);
  engine.start();
  assert.deepEqual(engine.getStatus(), {
    state: "ready",
    currentIndex: 2,
    currentTimestamp: 35,
    totalBars: 4,
    speed: 1,
  });
  engine.stepBackward();
  assert.equal(engine.getStatus().currentIndex, 1);
  engine.stepForward();
  assert.equal(engine.getStatus().currentIndex, 2);
  assert.deepEqual(source, original, "the caller's source remains unchanged");
  assert.deepEqual(cursors, [2, 1, 2]);
});

test("ReplayEngine supports irregular timestamp seeks, boundaries, and completion", () => {
  const engine = new ReplayEngine({ source });
  engine.start();
  assert.equal(engine.getStatus().currentTimestamp, 10);
  engine.seekToTimestamp(21);
  assert.equal(engine.getStatus().currentTimestamp, 35);
  engine.jumpToLatest();
  assert.equal(engine.getStatus().state, "paused");
  assert.equal(engine.getStatus().currentIndex, 3);
  engine.stepForward();
  assert.equal(engine.getStatus().state, "completed");
  engine.stepBackward();
  assert.deepEqual(engine.getStatus(), {
    state: "paused",
    currentIndex: 2,
    currentTimestamp: 35,
    totalBars: 4,
    speed: 1,
  });
  engine.jumpToStart();
  assert.equal(engine.getStatus().currentIndex, 0);
  assert.throws(() => engine.seekToBar(4), ReplayValidationError);
  assert.throws(() => engine.seekToTimestamp(2.5), ReplayValidationError);
});

test("ReplayEngine playback uses an injectable scheduler and supports speed changes", () => {
  const scheduler = new FakeScheduler();
  const states: string[] = [];
  const engine = new ReplayEngine({ source, speed: 2, scheduler });
  engine.subscribe((status) => states.push(status.state));
  engine.start();
  engine.play();
  assert.equal(scheduler.delays.at(-1), 500);
  assert.equal(scheduler.pending, 1);
  scheduler.runNext();
  assert.equal(engine.getStatus().currentIndex, 1);
  assert.equal(scheduler.pending, 1);
  engine.setSpeed(4);
  assert.equal(scheduler.delays.at(-1), 250);
  scheduler.runNext();
  scheduler.runNext();
  assert.equal(engine.getStatus().state, "completed");
  assert.deepEqual(states, ["ready", "playing", "playing", "playing", "playing", "completed"]);
  assert.equal(scheduler.pending, 0);
  engine.exit();
  assert.equal(engine.getStatus().state, "idle");
  engine.reset();
  assert.equal(engine.getStatus().state, "ready");
});

test("ReplayEngine reports callback failures without leaving a timer", () => {
  const scheduler = new FakeScheduler();
  const engine = new ReplayEngine({
    source,
    scheduler,
    onCursorChange: ({ index }) => {
      if (index === 1) throw new Error("calculation failed");
    },
  });
  engine.start();
  engine.play();
  assert.doesNotThrow(() => scheduler.runNext());
  assert.equal(engine.getStatus().state, "error");
  assert.match(engine.getStatus().error ?? "", /calculation failed/);
  assert.equal(scheduler.pending, 0);
  assert.throws(() => engine.resume(), ReplayLifecycleError);
});

test("ReplayEngine handles empty sources and disposal deterministically", () => {
  const engine = new ReplayEngine({ source: [] });
  engine.start();
  assert.deepEqual(engine.getStatus(), {
    state: "ready",
    currentIndex: null,
    currentTimestamp: null,
    totalBars: 0,
    speed: 1,
  });
  engine.play();
  assert.equal(engine.getStatus().state, "completed");
  engine.dispose();
  assert.equal(engine.getStatus().state, "disposed");
  assert.throws(() => engine.play(), ReplayLifecycleError);
  assert.throws(() => engine.setSpeed(0), ReplayLifecycleError);
  assert.throws(() => new ReplayEngine({ source, speed: 101 }), ReplayValidationError);
});
