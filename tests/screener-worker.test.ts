import assert from "node:assert/strict";
import test from "node:test";
import {
  createDeterministicScreenerUniverse,
  createScreenerWorker,
  createScreenerWorkerHandler,
  DeterministicScreenerMarketDataProvider,
  isScreenerWorkerRequest,
  isScreenerWorkerResponse,
  ScreenerWorkerError,
  type ScreenerWorkerLike,
  type ScreenerWorkerResponse,
} from "../src/index.js";

class HandlerWorker implements ScreenerWorkerLike {
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  public terminated = false;
  private readonly handle: (message: unknown) => void;
  public constructor() { this.handle = createScreenerWorkerHandler((response) => queueMicrotask(() => this.onmessage?.({ data: response }))); }
  public postMessage(message: unknown): void { if (this.terminated) throw new Error("terminated"); queueMicrotask(() => { if (!this.terminated) this.handle(message); }); }
  public terminate(): void { this.terminated = true; }
}
class HangingWorker extends HandlerWorker { public override postMessage(_message: unknown): void { if (this.terminated) throw new Error("terminated"); } }

async function options() {
  const provider = new DeterministicScreenerMarketDataProvider({ symbolCount: 2, barsPerInstrument: 20, pageSize: 20 });
  const instruments = provider.getUniverse().instruments;
  const tasks = await Promise.all(instruments.map(async (instrument) => ({ instrument, bars: (await provider.getHistory({ instrument, timeframe: "1h", limit: 20 })).bars })));
  return { ruleSet: { version: 1 as const, id: "worker-rule", name: "Worker rule", root: { type: "price-threshold" as const, field: "close" as const, operator: ">" as const, value: 0 } }, timeframe: "1h", generation: 0, tasks };
}

test("screener Worker protocol is versioned and reference evaluation runs in a dedicated handler", async () => {
  assert.equal(isScreenerWorkerRequest({ protocol: 1, type: "run", requestId: "r", generation: 1, options: { ruleSet: {}, timeframe: "1h", generation: 1, tasks: [] } }), true);
  assert.equal(isScreenerWorkerRequest({ protocol: 99, type: "run" }), false);
  const responses: ScreenerWorkerResponse[] = [];
  const handler = createScreenerWorkerHandler((response) => responses.push(response));
  handler({ protocol: 1, type: "nonsense", requestId: "x", generation: 1 });
  assert.equal(responses[0]?.type, "error");
  assert.equal(isScreenerWorkerResponse(responses[0]), true);
  const runtime = createScreenerWorker(await options(), { factory: () => new HandlerWorker() });
  const result = await runtime.run();
  assert.equal(result.results.length, 2);
  assert.equal(result.counts.matched, 2);
  assert.equal(runtime.getStatus().state, "completed");
  runtime.dispose();
});

test("screener Worker cancellation, timeout, supersession, and disposal are explicit", async () => {
  const config = await options();
  const hanging = createScreenerWorker(config, { factory: () => new HangingWorker(), timeoutMs: 1_000 });
  const cancelled = hanging.run(); hanging.cancel();
  await assert.rejects(cancelled, (error: unknown) => error instanceof ScreenerWorkerError && error.code === "CANCELLED");
  hanging.dispose();

  const superseded = createScreenerWorker(config, { factory: () => new HandlerWorker() });
  const first = superseded.run(); const second = superseded.run();
  await assert.rejects(first, (error: unknown) => error instanceof ScreenerWorkerError && error.code === "SUPERSEDED");
  await second; superseded.dispose();

  const timed = createScreenerWorker(config, { factory: () => new HangingWorker(), timeoutMs: 1 });
  await assert.rejects(timed.run(), (error: unknown) => error instanceof ScreenerWorkerError && error.code === "TIMEOUT");
  timed.dispose();
});

test("screener Worker rejects stale responses and cleans up after disposal", async () => {
  const config = await options();
  const runtime = createScreenerWorker(config, { factory: () => new HandlerWorker() });
  await runtime.run();
  runtime.dispose();
  assert.throws(() => runtime.run(), (error: unknown) => error instanceof ScreenerWorkerError && error.code === "WORKER_DISPOSED");
  assert.equal(createDeterministicScreenerUniverse(1).instruments.length, 1);
});

