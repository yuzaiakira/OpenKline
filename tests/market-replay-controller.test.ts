import assert from "node:assert/strict";
import test from "node:test";
import { MarketReplayController } from "../src/replay/market-replay-controller.js";
import type { ReplayScheduler } from "../src/replay/types.js";
import { createMarketReplayTape } from "../src/replay/market-event-tape.js";
import type { MarketReplayEvent } from "../src/replay/market-event-tape.js";

const source = { id: "replay-fixture", version: "1" } as const;

function candleEvent(id: string, kind: "candle-open" | "candle-complete", time: number, receiveTime?: number, candleTime = time): MarketReplayEvent {
  const candle = { time: candleTime, open: 100, high: 105, low: 95, close: 103, volume: 10 };
  return {
    id,
    kind,
    instrumentId: "TEST",
    time,
    ...(receiveTime === undefined ? {} : { receiveTime }),
    revision: 0,
    source,
    candle,
    finality: kind === "candle-complete" ? "completed" : "opening",
  } as MarketReplayEvent;
}

function tradeEvent(id: string, time: number, quantity: number, revision = 0, receiveTime?: number): MarketReplayEvent {
  const trade = { id: "trade-1", instrumentId: "TEST", time, ...(receiveTime === undefined ? {} : { receiveTime }), price: 101, quantity, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision, source };
  return { id, kind: "trade", instrumentId: "TEST", time, ...(receiveTime === undefined ? {} : { receiveTime }), revision, source, trade };
}

function bookSnapshot(id: string, time: number, sequence: number, receiveTime?: number): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId: "TEST", time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, bids: [{ price: 100, quantity: 5 }], asks: [{ price: 102, quantity: 6 }], source };
  return { id, kind: "order-book-snapshot", instrumentId: "TEST", time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, revision: 0, source, snapshot };
}

function bookDelta(id: string, time: number, sequence: number, previousSequence: number | undefined, receiveTime?: number): MarketReplayEvent {
  const delta = { version: 1 as const, id, instrumentId: "TEST", time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, ...(previousSequence === undefined ? {} : { previousSequence }), quantityMode: "absolute" as const, bids: [{ price: 100, quantity: sequence === 2 ? 7 : 8 }], asks: [], source };
  return { id, kind: "order-book-delta", instrumentId: "TEST", time, ...(receiveTime === undefined ? {} : { receiveTime }), sequence, revision: 0, source, delta };
}

function createFixtureTape() {
  return createMarketReplayTape({
    id: "timeline-fixture",
    events: [
      candleEvent("open", "candle-open", 100),
      tradeEvent("trade-r0", 101, 2),
      bookSnapshot("book-snapshot", 100, 1),
      bookDelta("book-delta-2", 102, 2, 1),
      bookDelta("book-gap-4", 103, 4, 2),
      bookSnapshot("book-recovery", 104, 4),
      candleEvent("complete", "candle-complete", 110, undefined, 100),
      tradeEvent("trade-r1", 111, 5, 1),
    ],
  });
}

test("historical timeline is causal and reconstructs CVD, footprint, and L2 recovery", () => {
  const controller = new MarketReplayController({ tape: createFixtureTape(), checkpointInterval: 2 });
  controller.start();
  controller.seekToTimestamp(105);
  const beforeCompletion = controller.getSnapshot();
  assert.equal(beforeCompletion.completedCandles.length, 0);
  assert.deepEqual(beforeCompletion.formingCandles, [{ instrumentId: "TEST", time: 100, open: 100, status: "opening" }]);
  assert.equal(beforeCompletion.tradeSummary[0]?.totalVolume, 2);
  assert.equal(beforeCompletion.cvd[0]?.value, 2);
  assert.equal(beforeCompletion.footprint[0]?.buyVolume, 2);
  assert.equal(beforeCompletion.orderBooks[0]?.state.status, "live", "the valid recovery snapshot restores the book after the sequence gap");
  assert.equal(beforeCompletion.orderBooks[0]?.state.lastSequence, 4);
  assert.equal(beforeCompletion.integrity.sequenceGaps.length, 1, "the tape retains the fact that a gap occurred");
  assert.equal(beforeCompletion.integrity.staleOrderBooks.length, 0);

  controller.stepNextCompletedCandle();
  const completed = controller.getSnapshot();
  assert.equal(completed.completedCandles.length, 1);
  assert.equal(completed.formingCandles.length, 0);
  assert.equal(completed.completedCandles[0]?.close, 103);
  assert.equal(completed.tradeSummary[0]?.totalVolume, 2);
  assert.equal(completed.cvd[0]?.value, 2);
  assert.equal(completed.cvd[0]?.knownVolume, 2);
  assert.equal(controller.getState().currentEvent?.id, "complete");
});

test("receive-time replay excludes records without genuine receipt timestamps", () => {
  const tape = createMarketReplayTape({
    events: [
      candleEvent("missing-receive", "candle-complete", 100),
      tradeEvent("received", 101, 2, 0, 200),
      candleEvent("received-candle", "candle-complete", 150, 250),
    ],
  });
  const controller = new MarketReplayController({ tape, clockPolicy: "receive-time" });
  controller.start();
  controller.seekToTimestamp(225);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.trades.length, 1);
  assert.equal(snapshot.completedCandles.length, 0);
  assert.equal(snapshot.integrity.unknownReceiveTime, true);
  assert.equal(snapshot.integrity.complete, false);
  assert.throws(() => controller.seekToEvent("missing-receive"), /not eligible/);
});

test("checkpoint restoration matches full reconstruction and revisions do not expose future values", () => {
  const tape = createFixtureTape();
  const controller = new MarketReplayController({ tape, checkpointInterval: 2 });
  controller.start();
  controller.seekToTimestamp(200);
  assert.equal(controller.getSnapshot().tradeSummary[0]?.totalVolume, 5);
  const checkpoints = controller.getCheckpoints();
  assert.ok(checkpoints.length > 0);
  controller.seekToTimestamp(105);
  const restored = controller.getSnapshot();
  const reference = new MarketReplayController({ tape, checkpointInterval: 2 });
  reference.start();
  reference.seekToTimestamp(105);
  assert.deepEqual(restored, reference.getSnapshot());
  assert.equal(restored.tradeSummary[0]?.totalVolume, 2);
  assert.equal(restored.cvd[0]?.value, 2);
  assert.ok(checkpoints.every((checkpoint) => checkpoint.datasetFingerprint === tape.fingerprint));
});

test("replay corrections remain isolated by instrument and source generation", () => {
  const sourceA = { id: "feed", version: "generation-a" } as const;
  const sourceB = { id: "feed", version: "generation-b" } as const;
  const tradeEvent = (eventId: string, instrumentId: string, source: { readonly id: string; readonly version: string }, quantity: number, side: "buy" | "sell", revision: number, time: number): MarketReplayEvent => ({
    id: eventId,
    kind: "trade",
    instrumentId,
    time,
    revision,
    source,
    trade: { id: "provider-trade-1", instrumentId, time, price: 100, quantity, aggressorSide: side, sideQuality: "observed", revision, source },
  });
  const tape = createMarketReplayTape({ events: [
    tradeEvent("a-r0", "ASSET-A", sourceA, 2, "buy", 0, 1_000),
    tradeEvent("b-r0", "ASSET-A", sourceB, 3, "buy", 0, 1_100),
    tradeEvent("a-r1", "ASSET-A", sourceA, 5, "sell", 1, 1_200),
    tradeEvent("other-instrument", "ASSET-B", sourceA, 7, "buy", 0, 1_300),
  ] });
  const controller = new MarketReplayController({ tape, checkpointInterval: 1 });
  controller.start();
  controller.seekToTimestamp(2_000);

  const all = controller.getSnapshot();
  assert.equal(all.tradeMaterialization.complete, true);
  assert.equal(all.tradeSummary.find((item) => item.instrumentId === "ASSET-A")?.tradeCount, 2);
  assert.equal(all.tradeSummary.find((item) => item.instrumentId === "ASSET-A")?.totalVolume, 8);
  assert.deepEqual(all.cvd.filter((item) => item.instrumentId === "ASSET-A").map((item) => [item.source.version, item.value]), [["generation-a", -5], ["generation-b", 3]]);
  assert.deepEqual(all.footprint.filter((item) => item.instrumentId === "ASSET-A").map((item): [string, number, number] => [item.source.version, item.buyVolume, item.sellVolume]).sort((left, right) => left[0].localeCompare(right[0])), [["generation-a", 0, 5], ["generation-b", 3, 0]]);
  assert.equal(controller.getSnapshot({ instrumentId: "ASSET-A" }).trades.length, 2);
  assert.equal(controller.getSnapshot({ instrumentId: "ASSET-B" }).trades.length, 1);
});

test("candle timeframes and corporate-action streams do not silently merge", () => {
  const sourceA = { id: "calendar-feed", version: "1" } as const;
  const sourceB = { id: "calendar-feed", version: "2" } as const;
  const split = (id: string, instrumentId: string, source: { readonly id: string; readonly version: string }): MarketReplayEvent => ({
    id,
    kind: "corporate-action-effective",
    instrumentId,
    time: 3_000,
    revision: 1,
    source,
    action: { id: "same-action-id", instrumentId, kind: "stock-split", effectiveTime: 3_000, newShares: 2, oldShares: 1, revision: 1, source },
  });
  const tape = createMarketReplayTape({ events: [
    { id: "candle-1m", kind: "candle-complete", instrumentId: "ASSET-A", time: 2_000, revision: 0, source: sourceA, intervalMs: 60_000, candle: { time: 1_000, open: 10, high: 11, low: 9, close: 10.5, volume: 1 }, finality: "completed" },
    { id: "candle-5m", kind: "candle-complete", instrumentId: "ASSET-A", time: 2_000, revision: 0, source: sourceA, intervalMs: 300_000, candle: { time: 1_000, open: 10, high: 12, low: 8, close: 11, volume: 5 }, finality: "completed" },
    { id: "candle-source-generation", kind: "candle-complete", instrumentId: "ASSET-A", time: 2_000, revision: 0, source: sourceB, intervalMs: 60_000, candle: { time: 1_000, open: 10, high: 13, low: 7, close: 12, volume: 2 }, finality: "completed" },
    split("split-a", "ASSET-A", sourceA),
    split("split-b", "ASSET-B", sourceA),
  ] });
  const controller = new MarketReplayController({ tape });
  controller.start();
  controller.seekToTimestamp(3_000);
  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.completedCandles.length, 3);
  assert.equal(snapshot.effectiveCorporateActions.length, 2);
  assert.deepEqual(snapshot.effectiveCorporateActions.map((action) => action.instrumentId).sort(), ["ASSET-A", "ASSET-B"]);
});

test("checkpoint retention is bounded and checkpoint identity includes replay policy", () => {
  const events = Array.from({ length: 40 }, (_, index) => {
    const base = tradeEvent(`bounded-${index}`, index + 1, 1);
    return { ...base, trade: { ...(base as Extract<MarketReplayEvent, { kind: "trade" }>).trade, id: `bounded-trade-${index}` } } as MarketReplayEvent;
  });
  const tape = createMarketReplayTape({ events });
  const controller = new MarketReplayController({ tape, checkpointInterval: 1, maxCheckpoints: 3, checkpointMemoryBudgetBytes: 20_000_000 });
  controller.start();
  controller.seekToTimestamp(10_000);
  const diagnostics = controller.getCheckpointDiagnostics();
  assert.ok(diagnostics.retainedCheckpoints <= 3);
  assert.ok(diagnostics.estimatedRetainedBytes <= diagnostics.memoryBudgetBytes);
  assert.ok(diagnostics.evictions > 0);
  assert.ok(controller.getCheckpoints().every((checkpoint) => checkpoint.knowledgePolicy === "strict-causal" && checkpoint.id.includes(":strict-causal:")));
});

class FakeScheduler implements ReplayScheduler {
  private nextId = 1;
  private readonly callbacks = new Map<number, () => void>();
  public setTimeout(callback: () => void): number {
    const id = this.nextId++;
    this.callbacks.set(id, callback);
    return id;
  }
  public clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }
  public runNext(): void {
    const next = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (next === undefined) throw new Error("No callback scheduled");
    this.callbacks.delete(next[0]);
    next[1]();
  }
  public get pending(): number { return this.callbacks.size; }
}

test("timeline playback is cursor-driven and disposes its scheduler deterministically", () => {
  const scheduler = new FakeScheduler();
  const controller = new MarketReplayController({ tape: createFixtureTape(), scheduler, speed: 2 });
  controller.start();
  controller.play();
  assert.equal(controller.getState().state, "playing");
  assert.equal(scheduler.pending, 1);
  scheduler.runNext();
  assert.equal(controller.getState().processedEvents, 1);
  controller.pause();
  assert.equal(scheduler.pending, 0);
  controller.dispose();
  assert.equal(controller.getState().state, "disposed");
  assert.throws(() => controller.play(), /disposed/);
});
