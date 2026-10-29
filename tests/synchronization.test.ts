import test from "node:test";
import assert from "node:assert/strict";
import {
  ChartSynchronizationController,
  type ChartSynchronizationRange,
  type ChartSynchronizationTarget,
} from "../src/index.js";

type EventName = "crosshairMove" | "viewportChange" | "chartDestroy" | "dataUpdated" | "replayChange";

class FakeChart implements ChartSynchronizationTarget {
  private readonly listeners = new Map<EventName, Set<(event: never) => void>>();
  public readonly crosshair: Array<number | null> = [];
  public readonly ranges: ChartSynchronizationRange[] = [];
  public destroyed = false;
  private visibleRange: { from: number | null; to: number | null };

  public constructor(public readonly times: readonly number[], private readonly echo = false) {
    this.visibleRange = { from: times[0] ?? null, to: times.at(-1) ?? null };
  }

  public subscribe(name: EventName, handler: (event: never) => void): () => void {
    const handlers = this.listeners.get(name) ?? new Set<(event: never) => void>();
    handlers.add(handler);
    this.listeners.set(name, handlers);
    return () => handlers.delete(handler);
  }

  public setCrosshairAtTime(time: number | null): number | null {
    const resolved = time === null || this.times.length === 0 ? time : this.times.reduce((best, candidate) => Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best, this.times[0]!);
    this.crosshair.push(resolved);
    if (this.echo) this.emit("crosshairMove", { time: resolved });
    return resolved;
  }

  public setVisibleTimeRange(range: ChartSynchronizationRange): void {
    this.ranges.push({ ...range });
    this.visibleRange = { from: range.from, to: range.to };
    if (this.echo) this.emit("viewportChange", range);
  }

  public getVisibleTimeRange(): { from: number | null; to: number | null } {
    return { ...this.visibleRange };
  }

  public emit(name: "crosshairMove", event: { time: number | null }): void;
  public emit(name: "viewportChange", event: ChartSynchronizationRange): void;
  public emit(name: "chartDestroy" | "dataUpdated" | "replayChange", event?: unknown): void;
  public emit(name: EventName, event?: unknown): void {
    if (name === "viewportChange") this.visibleRange = { ...(event as ChartSynchronizationRange) };
    for (const listener of this.listeners.get(name) ?? []) listener(event as never);
  }

  public destroy(): void {
    this.destroyed = true;
    this.emit("chartDestroy", { timestamp: Date.now() });
  }
}

test("registers charts and matches crosshairs by UTC time, not indexes", () => {
  const first = new FakeChart([1_000, 2_000, 3_500]);
  const second = new FakeChart([900, 1_800, 3_000, 5_000], true);
  const controller = new ChartSynchronizationController({ crosshair: true });
  controller.addChart("first", first);
  controller.addChart("second", second);

  first.emit("crosshairMove", { time: 3_420 });
  assert.deepEqual(second.crosshair, [3_000]);
  assert.deepEqual(controller.getChartIds(), ["first", "second"]);
  assert.equal(controller.hasChart("first"), true);
  controller.destroy();
  assert.deepEqual(controller.getChartIds(), []);
});

test("sync options can be independently enabled and disabled without affecting chart state", () => {
  const first = new FakeChart([1_000, 2_000]);
  const second = new FakeChart([1_000, 2_000]);
  const controller = new ChartSynchronizationController({ crosshair: true, visibleRange: false });
  controller.addChart("first", first);
  controller.addChart("second", second);

  first.emit("crosshairMove", { time: 1_900 });
  first.emit("viewportChange", { from: 1_000, to: 2_000 });
  assert.equal(second.crosshair.length, 1);
  assert.equal(second.ranges.length, 0);
  controller.setVisibleRangeEnabled(true);
  first.emit("viewportChange", { from: 1_000, to: 2_000 });
  assert.deepEqual(second.ranges, [{ from: 1_000, to: 2_000 }]);
  controller.setEnabled(false);
  first.emit("crosshairMove", { time: 1_000 });
  assert.equal(second.crosshair.length, 1);
  controller.setEnabled(true);
  controller.setCrosshairEnabled(false);
  first.emit("crosshairMove", { time: 1_000 });
  assert.equal(second.crosshair.length, 1);
});

test("deduplicates repeated forwarding and invalidates caches after data or replay changes", () => {
  const first = new FakeChart([1_000, 2_000]);
  const second = new FakeChart([1_000, 2_000]);
  const controller = new ChartSynchronizationController({ crosshair: true, visibleRange: true });
  controller.addChart("first", first);
  controller.addChart("second", second);

  first.emit("crosshairMove", { time: 1_000 });
  first.emit("crosshairMove", { time: 1_000 });
  first.emit("viewportChange", { from: 1_000, to: 2_000 });
  first.emit("viewportChange", { from: 1_000, to: 2_000 });
  assert.equal(second.crosshair.length, 1);
  assert.equal(second.ranges.length, 1);
  second.emit("dataUpdated", { kind: "set" });
  first.emit("crosshairMove", { time: 1_000 });
  second.emit("replayChange", { state: "idle" });
  first.emit("viewportChange", { from: 1_000, to: 2_000 });
  assert.equal(second.crosshair.length, 2);
  assert.equal(second.ranges.length, 2);
});

test("removal, chart destruction, invalid input, and repeated disposal are safe", () => {
  const first = new FakeChart([1_000]);
  const second = new FakeChart([1_000]);
  const controller = new ChartSynchronizationController({ crosshair: true });
  const remove = controller.addChart("first", first);
  controller.addChart("second", second);
  assert.throws(() => controller.addChart("", new FakeChart([])), /non-empty/);
  assert.throws(() => controller.addChart("first", new FakeChart([])), /already registered/);
  assert.throws(() => controller.syncVisibleRange("first", { from: 2, to: 1 }), /ascending/);
  remove();
  assert.equal(controller.removeChart("first"), false);
  second.destroy();
  assert.deepEqual(controller.getChartIds(), []);
  controller.destroy();
  controller.destroy();
  assert.throws(() => controller.addChart("after-destroy", new FakeChart([])), /destroyed/);
});
