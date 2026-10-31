import assert from "node:assert/strict";
import test from "node:test";
import { createMarketReplayTape, type MarketReplayEvent } from "../src/replay/market-event-tape.js";
import { createResearchExecutionSession } from "../src/research-execution/index.js";
import type { ResearchExecutionOptions, ResearchScenarioExport, ResearchSnapshot } from "../src/research-execution/types.js";

const instrumentId = "CHECKPOINT";
const venueId = "CHECKPOINT-VENUE";
const source = { id: "checkpoint-source", version: "generation-1" } as const;

function status(id: string, time: number): MarketReplayEvent {
  return { id, kind: "source-status", instrumentId, venueId, time, revision: 0, source, status: "available", coverage: "complete" };
}

function book(id: string, time: number, sequence: number, askQuantity = 10): MarketReplayEvent {
  const snapshot = { version: 1 as const, instrumentId, venueId, time, sequence, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: askQuantity }], tickSize: 1, source };
  return { id, kind: "order-book-snapshot", instrumentId, venueId, time, sequence, revision: 0, source, snapshot };
}

function trade(id: string, time: number): MarketReplayEvent {
  const value = { id, instrumentId, venueId, time, price: 100, quantity: 1, aggressorSide: "buy" as const, sideQuality: "observed" as const, revision: 0, source };
  return { id, kind: "trade", instrumentId, venueId, time, revision: 0, source, trade: value };
}

function gap(id: string, time: number): MarketReplayEvent {
  const delta = { version: 1 as const, id, instrumentId, venueId, time, sequence: 4, previousSequence: 3, quantityMode: "absolute" as const, bids: [{ price: 99, quantity: 10 }], asks: [{ price: 101, quantity: 10 }], source };
  return { id, kind: "order-book-delta", instrumentId, venueId, time, sequence: 4, revision: 0, source, delta };
}

function options(tape: ReturnType<typeof createMarketReplayTape>, checkpoints: ResearchExecutionOptions["checkpoints"]): ResearchExecutionOptions {
  return {
    scenarioId: "checkpoint-scenario",
    tape,
    instrumentId,
    venueId,
    initialCapital: 1_000,
    currency: "USD",
    commission: { type: "fixed", value: 1 },
    slippage: { type: "fixed", value: 0 },
    ...(checkpoints === undefined ? {} : { checkpoints }),
  };
}

function complete(session: ReturnType<typeof createResearchExecutionSession>): ResearchSnapshot {
  session.start();
  while (session.getSnapshot().state !== "completed") session.step();
  return session.getSnapshot();
}

function withoutCheckpointDiagnostics(value: ResearchScenarioExport): unknown {
  return { ...value, diagnostics: { ...value.diagnostics, checkpoints: undefined } };
}

function runTradeScenario(checkpoints: ResearchExecutionOptions["checkpoints"]): ReturnType<typeof createResearchExecutionSession> {
  const tape = createMarketReplayTape({ events: [status("status", 1_000), book("book", 1_000, 1), trade("trade-1", 1_001), trade("trade-2", 1_002), trade("trade-3", 1_003), trade("trade-4", 1_004)] });
  const session = createResearchExecutionSession(options(tape, checkpoints));
  session.start();
  session.step();
  session.step();
  session.submitOrder({ idempotencyKey: "buy", side: "buy", type: "market", quantity: 1 });
  return session;
}

test("bounded research checkpoints preserve exact full-replay financial and causal parity", () => {
  const checkpointed = runTradeScenario({ enabled: true, interval: 2, maxCheckpoints: 8, memoryBudgetBytes: 2_000_000 });
  const fullReplay = runTradeScenario({ enabled: false });
  complete(fullReplay);
  complete(checkpointed);
  const completedExport = checkpointed.exportScenario();
  assert.deepEqual(withoutCheckpointDiagnostics(completedExport), withoutCheckpointDiagnostics(fullReplay.exportScenario()));
  assert.ok(checkpointed.getSnapshot().diagnostics.checkpoints.retainedCheckpoints > 0);
  checkpointed.seekToEvent("trade-1");
  checkpointed.seekToEvent("trade-4");
  assert.deepEqual(withoutCheckpointDiagnostics(checkpointed.exportScenario()), withoutCheckpointDiagnostics(fullReplay.exportScenario()));
  checkpointed.dispose();
  fullReplay.dispose();
});

test("checkpoint decision edits invalidate retained state and preserve same-cursor ordering", () => {
  const session = runTradeScenario({ enabled: true, interval: 1, maxCheckpoints: 8, memoryBudgetBytes: 2_000_000 });
  session.start();
  session.step();
  session.step();
  const before = session.getSnapshot().diagnostics.checkpoints;
  assert.ok(before.retainedCheckpoints > 0);
  const order = session.submitOrder({ idempotencyKey: "same-cursor", side: "buy", type: "limit", quantity: 1, limitPrice: 98 });
  const after = session.getSnapshot().diagnostics.checkpoints;
  assert.equal(after.retainedCheckpoints, 0);
  assert.equal(after.invalidations, before.invalidations + 1);
  session.cancelOrder(order.id);
  assert.deepEqual(session.exportScenario().decisions.map((decision) => decision.decisionType), ["submit-order", "submit-order", "cancel-order"]);
  session.dispose();
});

test("over-budget and gapped order-book checkpoints fail closed with structured fallback diagnostics", () => {
  const overBudget = runTradeScenario({ enabled: true, interval: 1, maxCheckpoints: 8, memoryBudgetBytes: 1 });
  complete(overBudget);
  assert.equal(overBudget.getSnapshot().diagnostics.checkpoints.retainedCheckpoints, 0);
  assert.ok(overBudget.getSnapshot().diagnostics.checkpoints.fallbacks.some((fallback) => fallback.code === "checkpoint-over-budget"));
  overBudget.dispose();

  const tape = createMarketReplayTape({ events: [status("status", 1_000), book("book", 1_000, 1), gap("gap", 1_001), trade("trade", 1_002)] });
  const gapped = createResearchExecutionSession(options(tape, { enabled: true, interval: 1, maxCheckpoints: 8, memoryBudgetBytes: 2_000_000 }));
  complete(gapped);
  assert.ok(gapped.getSnapshot().diagnostics.checkpoints.fallbacks.some((fallback) => fallback.code === "order-book-state-not-restorable"));
  const before = gapped.exportScenario();
  gapped.seekToEvent("book");
  gapped.seekToEvent("trade");
  assert.deepEqual(gapped.exportScenario(), before);
  gapped.dispose();
});

test("checkpoint count and retained estimate remain bounded and disposal clears them", () => {
  const session = runTradeScenario({ enabled: true, interval: 1, maxCheckpoints: 2, memoryBudgetBytes: 2_000_000 });
  complete(session);
  const diagnostics = session.getSnapshot().diagnostics.checkpoints;
  assert.ok(diagnostics.retainedCheckpoints <= 2);
  assert.ok(diagnostics.estimatedRetainedBytes <= diagnostics.memoryBudgetBytes);
  assert.ok(diagnostics.evictions > 0);
  session.dispose();
  assert.equal(session.getSnapshot().state, "disposed");
});
