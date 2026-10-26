import assert from "node:assert/strict";
import test from "node:test";
import {
  BacktestWorkerError,
  OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION,
  createBacktest,
  createBacktestWorker,
  isBacktestWorkerRequest,
  isBacktestWorkerResponse,
  serializeBacktestResult,
  type BacktestWorkerLike,
  type BacktestWorkerOptions,
  type BacktestWorkerResponse,
} from "../src/index.js";
import { createBacktestWorkerHandler } from "../src/backtesting/worker-handler.js";
import type { Candle } from "../src/types.js";

function candles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 7) * 4 + index * 0.01;
    return {
      time: Date.UTC(2026, 0, 1) + index * 60_000,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 100 + index,
    };
  });
}

function options(input = candles(96)): BacktestWorkerOptions {
  return {
    strategy: "EMA_TREND",
    parameters: { period: 10 },
    candles: input,
    initialCapital: 10_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
    commission: { type: "percent", value: 0.001 },
    slippage: { type: "percent", value: 0.0005 },
  };
}

class HandlerWorker implements BacktestWorkerLike {
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  public terminated = false;
  private readonly handle: (message: unknown) => void;

  public constructor() {
    this.handle = createBacktestWorkerHandler((response: BacktestWorkerResponse) => {
      queueMicrotask(() => this.onmessage?.({ data: response }));
    });
  }

  public postMessage(message: unknown): void {
    if (this.terminated) throw new Error("Worker is terminated");
    queueMicrotask(() => {
      if (!this.terminated) this.handle(message);
    });
  }

  public terminate(): void {
    this.terminated = true;
  }
}

class HangingWorker extends HandlerWorker {
  public override postMessage(_message: unknown): void {
    if (this.terminated) throw new Error("Worker is terminated");
  }
}

test("Backtest Worker protocol is versioned and rejects malformed requests", () => {
  assert.equal(isBacktestWorkerRequest({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "initialize", requestId: "i1", generation: 0, datasetId: "d1", candles: [] }), true);
  assert.equal(isBacktestWorkerRequest({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "run", requestId: "r1", generation: 0, options: { strategy: "EMA_TREND", parameters: [] } }), false);
  assert.equal(isBacktestWorkerRequest({ protocol: 99, type: "dispose", requestId: "d1", generation: 0 }), false);
  assert.equal(isBacktestWorkerResponse({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "error", requestId: "e1", generation: 0, error: { code: "INVALID_INPUT", message: "bad" } }), true);
  assert.equal(isBacktestWorkerResponse({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "complete", requestId: "c1", generation: 0, result: null }), false);
});

test("Worker result is byte-for-byte equal to the synchronous reference result", async () => {
  const input = candles(160);
  const workerOptions = options(input);
  const synchronous = createBacktest(workerOptions).run();
  const runtime = createBacktestWorker(workerOptions, { factory: () => new HandlerWorker() });
  const workerResult = await runtime.run();
  assert.equal(serializeBacktestResult(workerResult), serializeBacktestResult(synchronous));
  assert.deepEqual(workerResult.signals, synchronous.signals);
  assert.deepEqual(workerResult.orders, synchronous.orders);
  assert.deepEqual(workerResult.trades, synchronous.trades);
  assert.deepEqual(workerResult.metrics, synchronous.metrics);
  runtime.dispose();
});

test("Worker initializes one defensive dataset, reports progress, and supports repeat runs", async () => {
  const workers: HandlerWorker[] = [];
  const statuses: string[] = [];
  const runtime = createBacktestWorker(options(candles(512)), { factory: () => { const worker = new HandlerWorker(); workers.push(worker); return worker; } });
  runtime.subscribe((status) => statuses.push(status.state));
  const first = await runtime.run();
  const second = await runtime.run();
  assert.equal(workers.length, 1);
  assert.deepEqual(second.signals, first.signals);
  assert.ok(statuses.includes("initializing"));
  assert.ok(statuses.includes("running"));
  assert.equal(runtime.getStatus().state, "completed");
  runtime.dispose();
});

test("Worker cancellation terminates a busy worker and recovers with a fresh worker", async () => {
  let created = 0;
  const runtime = createBacktestWorker(options(), { factory: () => created++ === 0 ? new HangingWorker() : new HandlerWorker(), timeoutMs: 100 });
  const pending = runtime.run();
  runtime.cancel();
  await assert.rejects(pending, (error: unknown) => error instanceof BacktestWorkerError && error.code === "CANCELLED");
  assert.equal(runtime.getStatus().state, "cancelled");
  const recovered = await runtime.run();
  assert.equal(recovered.input.barCount, 96);
  runtime.dispose();
});

test("Worker timeout, supersession, invalid data, and disposal have stable outcomes", async () => {
  let created = 0;
  const runtime = createBacktestWorker(options(), { factory: () => created++ === 0 ? new HangingWorker() : new HandlerWorker(), timeoutMs: 5 });
  const timedOut = runtime.run();
  await assert.rejects(timedOut, (error: unknown) => error instanceof BacktestWorkerError && error.code === "TIMEOUT");
  const recovered = await runtime.run();
  assert.equal(recovered.input.barCount, 96);

  const superseded = runtime.run();
  const replacement = runtime.run();
  await assert.rejects(superseded, (error: unknown) => error instanceof BacktestWorkerError && error.code === "SUPERSEDED");
  await replacement;

  const invalid = createBacktestWorker(options([{ ...candles(2)[0]!, time: -1 }, candles(2)[1]!]), { factory: () => new HandlerWorker() });
  await assert.rejects(invalid.run(), (error: unknown) => error instanceof BacktestWorkerError && error.code === "INVALID_INPUT");
  invalid.dispose();

  runtime.dispose();
  assert.throws(() => runtime.run(), (error: unknown) => error instanceof BacktestWorkerError && error.code === "WORKER_DISPOSED");
});

test("Worker handler returns protocol and initialization errors without executing", () => {
  const responses: BacktestWorkerResponse[] = [];
  const handle = createBacktestWorkerHandler((response) => responses.push(response));
  const { candles: _candles, ...runOptions } = options();
  handle({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "run", requestId: "run-before-init", generation: 0, options: runOptions });
  const first = responses[0];
  assert.ok(first?.type === "error");
  assert.equal(first.error.code, "INITIALIZE_REQUIRED");
  handle({ protocol: OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION, type: "initialize", requestId: "bad-init", generation: 0, datasetId: "bad", candles: [{ time: -1, open: 1, high: 1, low: 1, close: 1 }] });
  const second = responses[1];
  assert.ok(second?.type === "error");
  assert.equal(second.error.code, "INVALID_INPUT");
});
