import assert from "node:assert/strict";
import test from "node:test";
import { MarketReplayController } from "../src/replay/market-replay-controller.js";
import { createMarketReplayTape } from "../src/replay/market-event-tape.js";
import type { MarketReplayEvent } from "../src/replay/market-event-tape.js";
import type { CorporateAction } from "../src/corporate-actions.js";

const source = { id: "causality-fixture", version: "1" } as const;
const start = 1_800_000_000_000;

function trade(id: string, time: number, quantity: number): MarketReplayEvent {
  return {
    id, kind: "trade", instrumentId: "ACME", time, receiveTime: time + 5, revision: 0, source,
    trade: { id, instrumentId: "ACME", time, receiveTime: time + 5, price: 100, quantity, aggressorSide: "buy", sideQuality: "observed", revision: 0, source },
  };
}

function actionEvent(id: string, kind: "corporate-action-effective" | "corporate-action-payment", action: CorporateAction, time: number): MarketReplayEvent {
  return { id, kind, instrumentId: "ACME", time, receiveTime: time + 5, revision: action.revision, source, action } as MarketReplayEvent;
}

function makeTape(futureQuantity: number): ReturnType<typeof createMarketReplayTape> {
  const firstCandle = { time: start + 100, open: 100, high: 102, low: 99, close: 101, volume: 5 };
  const split: CorporateAction = { id: "split", instrumentId: "ACME", kind: "stock-split", effectiveTime: start + 300, newShares: 2, oldShares: 1, revision: 1, source };
  const dividend: CorporateAction = { id: "dividend", instrumentId: "ACME", kind: "cash-dividend", effectiveTime: start + 400, exDividendTime: start + 400, paymentTime: start + 500, amountPerShare: 1, currency: "USD", revision: 1, source };
  const events: MarketReplayEvent[] = [
    { id: "status", kind: "source-status", instrumentId: "ACME", time: start, receiveTime: start + 1, revision: 0, source, status: "available", coverage: "complete" },
    { id: "session-open", kind: "session-boundary", instrumentId: "ACME", time: start + 50, receiveTime: start + 51, revision: 0, source, boundary: "open", sessionId: "session-1", calendarId: "fixture-calendar", calendarVersion: "1" },
    { id: "candle-open", kind: "candle-open", instrumentId: "ACME", time: start + 100, receiveTime: start + 101, revision: 0, source, candle: firstCandle, finality: "opening", intervalMs: 100 },
    trade("known-trade", start + 150, 2),
    { id: "candle-complete", kind: "candle-complete", instrumentId: "ACME", time: start + 200, receiveTime: start + 201, revision: 0, source, candle: firstCandle, finality: "completed", intervalMs: 100 },
    actionEvent("split-effective", "corporate-action-effective", split, start + 300),
    actionEvent("dividend-effective", "corporate-action-effective", dividend, start + 400),
    trade("future-trade", start + 450, futureQuantity),
    actionEvent("dividend-payment", "corporate-action-payment", dividend, start + 500),
    { id: "session-close", kind: "session-boundary", instrumentId: "ACME", time: start + 600, receiveTime: start + 601, revision: 0, source, boundary: "close", sessionId: "session-1", calendarId: "fixture-calendar", calendarVersion: "1" },
  ];
  return createMarketReplayTape({ id: "causality-fixture", events });
}

test("strict causal replay respects candle, action, session, CVD, and future boundaries", () => {
  const controller = new MarketReplayController({ tape: makeTape(99), knowledgePolicy: "strict-causal" });
  controller.start();
  controller.seekToTimestamp(start + 250);
  const beforeActions = controller.getSnapshot();
  assert.equal(beforeActions.completedCandles.length, 1);
  assert.equal(beforeActions.cvd[0]?.value, 2);
  assert.deepEqual(beforeActions.effectiveCorporateActions, []);
  assert.deepEqual(beforeActions.paymentCorporateActions, []);
  assert.equal(beforeActions.sessions.at(-1)?.boundary, "open");
  assert.equal(beforeActions.trades.some((item) => item.id === "future-trade"), false);
  assert.equal(beforeActions.integrity.complete, true);
  controller.seekToTimestamp(start + 399);
  assert.deepEqual(controller.getSnapshot().effectiveCorporateActions.map((action) => action.id), ["split"]);
  controller.seekToTimestamp(start + 499);
  assert.deepEqual(controller.getSnapshot().effectiveCorporateActions.map((action) => action.id), ["split", "dividend"]);
  assert.deepEqual(controller.getSnapshot().paymentCorporateActions, []);
  controller.seekToTimestamp(start + 500);
  assert.deepEqual(controller.getSnapshot().paymentCorporateActions.map((action) => action.id), ["dividend"]);
  controller.seekToTimestamp(start + 600);
  assert.equal(controller.getSnapshot().sessions.at(-1)?.boundary, "close");
  controller.dispose();
});

test("mutating records after a frontier cannot change an earlier strict snapshot", () => {
  const first = new MarketReplayController({ tape: makeTape(99) });
  const second = new MarketReplayController({ tape: makeTape(9_999) });
  first.start();
  second.start();
  first.seekToTimestamp(start + 250);
  second.seekToTimestamp(start + 250);
  assert.deepEqual(second.getSnapshot(), first.getSnapshot());
  first.dispose();
  second.dispose();
});

test("sequenced clock regressions are reported instead of being presented as complete chronology", () => {
  const events: MarketReplayEvent[] = [
    { id: "snapshot", kind: "order-book-snapshot", instrumentId: "ACME", time: start + 200, revision: 0, sequence: 1, source, snapshot: { version: 1, instrumentId: "ACME", time: start + 200, sequence: 1, bids: [{ price: 99, quantity: 1 }], asks: [{ price: 101, quantity: 1 }], source } },
    { id: "delta", kind: "order-book-delta", instrumentId: "ACME", time: start + 100, revision: 0, sequence: 2, source, delta: { version: 1, id: "delta", instrumentId: "ACME", time: start + 100, sequence: 2, previousSequence: 1, quantityMode: "absolute", bids: [{ price: 99, quantity: 2 }], asks: [], source } },
  ];
  const controller = new MarketReplayController({ tape: createMarketReplayTape({ events }) });
  controller.start();
  controller.seekToTimestamp(start + 150);
  const state = controller.getState();
  assert.equal(state.integrity.complete, false);
  assert.match(state.integrity.notes.join(" "), /not monotonic/);
  assert.equal(state.eventIndex, null);
  controller.dispose();
});
