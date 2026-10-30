import assert from "node:assert/strict";
import test from "node:test";
import { MarketReplayCoordinator } from "../src/replay/market-replay-coordinator.js";
import { MarketReplayController } from "../src/replay/market-replay-controller.js";
import { createMarketReplayTape } from "../src/replay/market-event-tape.js";
import type { MarketReplayEvent } from "../src/replay/market-event-tape.js";

const source = { id: "multi-fixture", version: "1" } as const;

function candle(id: string, instrumentId: string, time: number): MarketReplayEvent {
  return { id, kind: "candle-complete", instrumentId, time, revision: 0, source, candle: { time, open: 10, high: 12, low: 9, close: 11, volume: 1 }, finality: "completed" } as MarketReplayEvent;
}

test("one replay cursor feeds isolated multi-instrument panels", () => {
  const tape = createMarketReplayTape({ events: [candle("a", "A", 100), candle("b", "B", 100), candle("a2", "A", 200), candle("b2", "B", 200)] });
  const controller = new MarketReplayController({ tape });
  const coordinator = new MarketReplayCoordinator(controller);
  const aSnapshots: number[] = [];
  const bSnapshots: number[] = [];
  const removeA = coordinator.registerPanel({ id: "panel-a", instrumentId: "A" }, (snapshot) => aSnapshots.push(snapshot.completedCandles.length));
  coordinator.registerPanel({ id: "panel-b", instrumentId: "B" }, (snapshot) => bSnapshots.push(snapshot.completedCandles.length));
  controller.start();
  controller.stepNextEvent();
  assert.equal(coordinator.getPanelSnapshot("panel-a").completedCandles.length, 1);
  assert.equal(coordinator.getPanelSnapshot("panel-b").completedCandles.length, 0);
  controller.stepNextEvent();
  assert.equal(coordinator.getPanelSnapshot("panel-b").completedCandles.length, 1);
  removeA();
  const aCount = aSnapshots.length;
  controller.stepNextEvent();
  assert.equal(aSnapshots.length, aCount, "removed panels stop receiving replay updates");
  assert.equal(coordinator.getPanelSnapshot("panel-b").completedCandles.length, 1);
  coordinator.setPanelInstrument("panel-b", "A");
  assert.equal(coordinator.getPanelSnapshot("panel-b").completedCandles.length, 2);
  coordinator.dispose();
  assert.throws(() => coordinator.getRegisteredPanels(), /disposed/);
});
