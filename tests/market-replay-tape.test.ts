import assert from "node:assert/strict";
import test from "node:test";
import {
  createMarketReplayTape,
  parseMarketReplayTape,
  replayEventClock,
  serializeMarketReplayTape,
} from "../src/replay/market-event-tape.js";
import type { MarketReplayEvent } from "../src/replay/market-event-tape.js";

const source = { id: "fixture", version: "2026-01" } as const;
const candle = { time: 1_000, open: 10, high: 12, low: 9, close: 11, volume: 5 } as const;

function event(overrides: Partial<MarketReplayEvent> & Pick<MarketReplayEvent, "kind" | "id">): MarketReplayEvent {
  const base = {
    instrumentId: "TEST",
    time: 1_000,
    revision: 0,
    source,
  } as const;
  if (overrides.kind === "candle-open" || overrides.kind === "candle-complete") {
    return { ...base, ...overrides, candle, finality: overrides.kind === "candle-complete" ? "completed" : "opening" } as MarketReplayEvent;
  }
  if (overrides.kind === "trade") {
    return { ...base, ...overrides, trade: { id: "trade-1", instrumentId: "TEST", time: 1_000, price: 10, quantity: 2, aggressorSide: "buy", sideQuality: "observed", revision: 0, source } } as MarketReplayEvent;
  }
  throw new Error(`Unsupported test event kind: ${overrides.kind}`);
}

test("market replay tape validates, orders, and fingerprints event records deterministically", () => {
  const tape = createMarketReplayTape({
    id: "fixture-tape",
    events: [
      event({ id: "complete", kind: "candle-complete" }),
      event({ id: "trade", kind: "trade", receiveTime: 1_005 }),
      event({ id: "open", kind: "candle-open" }),
    ],
  });

  assert.deepEqual(tape.events.map((item) => item.id), ["open", "trade", "complete"]);
  assert.equal(tape.sources[0]?.id, "fixture");
  assert.equal(tape.instrumentIds[0], "TEST");
  assert.match(tape.fingerprint, /^[0-9a-f]{16}$/);
  assert.equal(replayEventClock(tape.events[1]!, "event-time"), 1_000);
  assert.equal(replayEventClock(tape.events[1]!, "receive-time"), 1_005);
  assert.equal(replayEventClock(tape.events[0]!, "receive-time"), null);
});

test("market replay tape round-trips through canonical serialization", () => {
  const tape = createMarketReplayTape({ events: [event({ id: "trade", kind: "trade" })] });
  const serialized = serializeMarketReplayTape(tape);
  const restored = parseMarketReplayTape(serialized);
  assert.deepEqual(restored, tape);
  assert.equal(serializeMarketReplayTape(restored), serialized);
});

test("market replay tape rejects malformed and conflicting records", () => {
  const malformed = { ...event({ id: "bad", kind: "trade" }), trade: { id: "bad" } as never } as MarketReplayEvent;
  assert.throws(() => createMarketReplayTape({ events: [malformed] }), /instrumentId/);
  assert.throws(() => createMarketReplayTape({ events: [event({ id: "same", kind: "trade" }), event({ id: "same", kind: "trade" })] }), /Duplicate market replay event id/);
  assert.throws(() => createMarketReplayTape({ events: [
    event({ id: "candle-a", kind: "candle-complete" }),
    event({ id: "candle-b", kind: "candle-complete" }),
  ] }), /Duplicate revision/);
  const tape = createMarketReplayTape({ events: [event({ id: "trade", kind: "trade" })] });
  const tampered = JSON.parse(serializeMarketReplayTape(tape)) as { fingerprint: string };
  tampered.fingerprint = "0000000000000000";
  assert.throws(() => parseMarketReplayTape(JSON.stringify(tampered)), /fingerprint/);
});

test("market replay tape keeps identical source trade IDs isolated by logical stream", () => {
  const sourceA = { id: "venue-feed", version: "2026-01" } as const;
  const sourceB = { id: "venue-feed", version: "2026-02" } as const;
  const makeTrade = (instrumentId: string, source: { readonly id: string; readonly version: string }, eventId: string, venueId = "primary", revision = 0, time = 2_000): MarketReplayEvent => ({
    id: eventId,
    kind: "trade",
    instrumentId,
    venueId,
    time,
    revision,
    source,
    trade: {
      id: "same-provider-trade-id",
      instrumentId,
      venueId,
      time,
      price: 100,
      quantity: 1,
      aggressorSide: "buy",
      sideQuality: "observed",
      revision,
      source,
    },
  });

  const tape = createMarketReplayTape({ events: [
    makeTrade("ASSET-A", sourceA, "trade-a"),
    makeTrade("ASSET-B", sourceB, "trade-b"),
    makeTrade("ASSET-A", sourceA, "trade-a-venue", "secondary"),
    makeTrade("ASSET-A", { id: "other-feed", version: "2026-01" }, "trade-a-source"),
    makeTrade("ASSET-A", sourceA, "trade-a-generation", "primary", 1, 2_001),
  ] });

  assert.equal(tape.events.length, 5);
  assert.deepEqual(tape.events.map((item) => item.instrumentId).sort(), ["ASSET-A", "ASSET-A", "ASSET-A", "ASSET-A", "ASSET-B"]);
});
