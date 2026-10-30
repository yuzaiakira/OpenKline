import assert from "node:assert/strict";
import test from "node:test";
import {
  createMarketReplayWorkspace,
  MarketReplayWorkspaceValidationError,
  parseMarketReplayWorkspace,
  serializeMarketReplayWorkspace,
} from "../src/replay/market-replay-workspace.js";

test("market replay workspace persists only canonical source and display configuration", () => {
  const document = createMarketReplayWorkspace({
    tapeId: "fixture-tape",
    source: { id: "fixture-source", version: "2026-01", kind: "offline" },
    instrumentId: "BTC-USD",
    clockPolicy: "receive-time",
    knowledgePolicy: "strict-causal",
    speed: 2,
    display: { depth: false, theme: "dark" },
    panels: [
      { id: "main", instrumentId: "BTC-USD", timeframe: "1m" },
      { id: "comparison", instrumentId: "ETH-USD", timeframe: "5m", visible: false },
    ],
    cursor: { eventId: "trade-2", timestamp: 1_700_000_000_000 },
  });

  assert.equal(document.version, 1);
  assert.equal(document.display.depth, false);
  assert.equal(document.panels[1]?.visible, false);
  assert.equal("events" in document, false);
  assert.equal("checkpoints" in document, false);
  const restored = parseMarketReplayWorkspace(serializeMarketReplayWorkspace(document));
  assert.deepEqual(restored, document);
});

test("market replay workspace parser rejects runtime state, invalid references, and ambiguous panels", () => {
  const document = createMarketReplayWorkspace({
    tapeId: "fixture-tape",
    source: { id: "fixture-source", version: "1" },
    instrumentId: "BTC-USD",
  });
  assert.throws(() => parseMarketReplayWorkspace({ ...document, events: [] }), MarketReplayWorkspaceValidationError);
  assert.throws(() => parseMarketReplayWorkspace({ ...document, source: { id: "", version: "1" } }), MarketReplayWorkspaceValidationError);
  assert.throws(() => parseMarketReplayWorkspace({ ...document, panels: [{ id: "main", instrumentId: "ETH-USD", visible: true }] }), /first replay workspace panel/);
  assert.throws(() => parseMarketReplayWorkspace({ ...document, cursor: { eventId: "", timestamp: null } }), MarketReplayWorkspaceValidationError);
  assert.throws(() => parseMarketReplayWorkspace({ ...document, speed: 0 }), MarketReplayWorkspaceValidationError);
});

