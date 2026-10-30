import assert from "node:assert/strict";
import test from "node:test";
import {
  OrderBookController,
  OrderBookHeatmapStore,
  calculateOrderBookDepthMetrics,
  type OrderBookDelta,
  type OrderBookSnapshot,
} from "../src/index.js";

const source = { id: "fixture-book", version: "1.0.0", kind: "offline" };
const snapshot = (time = 1_000, sequence = 10): OrderBookSnapshot => ({
  version: 1,
  instrumentId: "TEST/USD",
  venueId: "fixture",
  time,
  sequence,
  tickSize: 0.5,
  bids: [{ price: 99.5, quantity: 4 }, { price: 99, quantity: 3 }],
  asks: [{ price: 100.5, quantity: 2 }, { price: 101, quantity: 5 }],
  source,
});
const delta = (sequence: number, time: number, levels: Pick<OrderBookDelta, "bids" | "asks">): OrderBookDelta => ({
  version: 1,
  id: `d${sequence}`,
  instrumentId: "TEST/USD",
  venueId: "fixture",
  time,
  sequence,
  previousSequence: sequence - 1,
  quantityMode: "absolute",
  ...levels,
  source,
});

test("order-book snapshot and absolute deltas reconstruct best prices and deletions", () => {
  const controller = new OrderBookController({ tickPolicy: "reject" });
  assert.equal(controller.applySnapshot(snapshot()).kind, "applied");
  assert.equal(controller.applyDelta(delta(11, 1_100, { bids: [{ price: 99.5, quantity: 0 }], asks: [{ price: 100.5, quantity: 4 }] })).kind, "applied");
  const state = controller.getState();
  assert.deepEqual(state.bids, [{ price: 99, quantity: 3 }]);
  assert.deepEqual(state.asks, [{ price: 100.5, quantity: 4 }, { price: 101, quantity: 5 }]);
  const metrics = calculateOrderBookDepthMetrics(state, { topN: 2 });
  assert.equal(metrics.quality, "available");
  assert.equal(metrics.bestBid, 99);
  assert.equal(metrics.bestAsk, 100.5);
  assert.equal(metrics.spread, 1.5);
  assert.equal(metrics.bidDepth, 3);
  assert.equal(metrics.askDepth, 9);
  assert.equal(metrics.imbalance, -0.5);
});

test("sequence gaps quarantine the book and replacement snapshots recover it", () => {
  const controller = new OrderBookController();
  controller.applySnapshot(snapshot());
  const gap = controller.applyDelta(delta(13, 1_300, { bids: [{ price: 99.5, quantity: 8 }], asks: [] }));
  assert.equal(gap.kind, "stale");
  assert.equal(controller.getState().status, "stale");
  assert.equal(calculateOrderBookDepthMetrics(controller.getState()).quality, "stale");
  assert.equal(controller.applyDelta(delta(12, 1_200, { bids: [], asks: [] })).kind, "stale");
  assert.equal(controller.applySnapshot({ ...snapshot(1_400, 20), bids: [{ price: 99.5, quantity: 9 }] }).kind, "applied");
  assert.equal(controller.getState().status, "live");
  assert.equal(controller.getState().lastSequence, 20);
});

test("sequenced deltas buffer before a snapshot, duplicate IDs are idempotent, and delayed snapshots do not regress state", () => {
  const controller = new OrderBookController({ maxPendingDeltas: 2 });
  assert.equal(controller.applyDelta(delta(11, 1_100, { bids: [], asks: [] })).kind, "buffered");
  assert.equal(controller.getState().pendingDeltaCount, 1);
  controller.applySnapshot(snapshot());
  assert.equal(controller.getState().lastSequence, 11);
  assert.equal(controller.applyDelta(delta(11, 1_100, { bids: [], asks: [] })).kind, "duplicate");
  assert.equal(controller.applySnapshot(snapshot(900, 9)).kind, "duplicate");
});

test("delta quantity mode rejects negative resulting depth and tick policy is explicit", () => {
  const controller = new OrderBookController({ tickPolicy: "reject" });
  controller.applySnapshot(snapshot());
  assert.equal(controller.applyDelta({ ...delta(11, 1_100, { bids: [{ price: 99.5, quantity: -5 }], asks: [] }), quantityMode: "delta" }).kind, "rejected");
  assert.equal(controller.applySnapshot({ ...snapshot(), bids: [{ price: 99.6, quantity: 1 }] }).kind, "rejected");
  const rounded = new OrderBookController({ tickPolicy: "round" });
  rounded.applySnapshot({ ...snapshot(), bids: [{ price: 99.6, quantity: 1 }] });
  assert.equal(rounded.getState().bids[0]?.price, 99.5);
});

test("order-book as-of reconstruction and heatmap retention never invent intermediate liquidity", () => {
  const controller = new OrderBookController({ maxHistory: 10 });
  controller.applySnapshot(snapshot());
  controller.applyDelta(delta(11, 1_100, { bids: [{ price: 99.5, quantity: 8 }], asks: [] }));
  controller.applyDelta(delta(12, 1_200, { bids: [{ price: 99, quantity: 0 }], asks: [{ price: 100.5, quantity: 1 }] }));
  assert.equal(controller.getStateAt(1_050).lastSequence, 10);
  assert.equal(controller.getStateAt(1_050).bids[0]?.quantity, 4);
  assert.equal(controller.getStateAt(1_150).bids[0]?.quantity, 8);
  assert.equal(controller.getStateAt(1_150).asks[0]?.quantity, 2);
  const heatmap = new OrderBookHeatmapStore({ maxObservations: 4 });
  heatmap.add(controller.getStateAt(1_000), 1_000);
  heatmap.add(controller.getStateAt(1_100), 1_100);
  assert.equal(heatmap.getAll().length, 4);
  assert.deepEqual(heatmap.getAll().map((item) => item.time), [1_000, 1_000, 1_100, 1_100]);
  heatmap.dispose();
  controller.dispose();
});

