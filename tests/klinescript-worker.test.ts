import assert from "node:assert/strict";
import test from "node:test";
import {
  KLINE_SCRIPT_WORKER_PROTOCOL_VERSION,
  KlineScriptWorkerError,
  KlineScriptWorkerRuntime,
  isWorkerRequest,
  isWorkerResponse,
  type KlineScriptWorkerLike,
  type KlineScriptWorkerResponse,
} from "../src/index.js";
import { createKlineScriptWorkerHandler } from "../src/klinescript/worker-handler.js";
import type { Candle } from "../src/types.js";

function candles(closes: readonly number[]): Candle[] {
  return closes.map((close, index) => ({
    time: Date.UTC(2026, 0, 1) + index * 60_000,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 10,
  }));
}

const source = ['indicator("Close")', 'plot(close, title="Close")'].join("\n");

class HandlerWorker implements KlineScriptWorkerLike {
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  public terminated = false;
  private readonly handle: (message: unknown) => void;

  public constructor() {
    this.handle = createKlineScriptWorkerHandler((response: KlineScriptWorkerResponse) => {
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

function workerRuntime(options: ConstructorParameters<typeof KlineScriptWorkerRuntime>[0] = {}): KlineScriptWorkerRuntime {
  return new KlineScriptWorkerRuntime({ factory: () => new HandlerWorker(), ...options });
}

test("Worker protocol rejects malformed messages and accepts versioned requests", () => {
  assert.equal(isWorkerRequest({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "compile", requestId: "r1", generation: 0, source }), true);
  assert.equal(isWorkerRequest({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "execute", requestId: "r2", generation: 0, source }), false);
  assert.equal(isWorkerRequest({ protocol: 999, type: "compile", requestId: "r3", generation: 0, source }), false);
  assert.equal(isWorkerResponse({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "error", requestId: "r4", generation: 0, error: { code: "BAD", message: "bad" } }), true);
  assert.equal(isWorkerResponse({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "error", requestId: "r5", generation: 0, error: { code: "BAD" } }), false);
});

test("Worker runtime compiles serializable metadata and executes scripts", async () => {
  const runtime = workerRuntime();
  const compiled = await runtime.compile(source).promise;
  assert.equal(compiled.success, true);
  assert.equal(compiled.program?.source, source);
  assert.equal("execute" in (compiled.program ?? {}), false);

  const execution = await runtime.execute(source, candles([10, 11, 12])).promise;
  assert.equal(execution.outputs[0]?.points.at(-1)?.value, 12);
  assert.equal(execution.outputs[0]?.points.length, 3);
  assert.ok(execution.operations > 0);
  runtime.dispose();
});

test("Worker sessions update incrementally and preserve the latest source event", async () => {
  const runtime = workerRuntime();
  const initial = candles([10, 11]);
  const first = await runtime.updateInput("session-1", source, initial, undefined).promise;
  assert.equal(first.outputs[0]?.points.length, 2);
  const next = { ...candles([12])[0]!, time: initial[1]!.time + 60_000 };
  const appended = await runtime.updateInput("session-1", source, undefined, next).promise;
  assert.equal(appended.outputs[0]?.points.at(-1)?.value, 12);
  assert.equal(appended.outputs[0]?.points.length, 3);
  runtime.dispose();
});

test("Worker compilation failures return diagnostics without executing untrusted source", async () => {
  const runtime = workerRuntime();
  const result = await runtime.compile('indicator("Broken")\nplot(eval(close))').promise;
  assert.equal(result.success, false);
  assert.ok(result.diagnostics.length > 0);
  await assert.rejects(runtime.execute('indicator("Broken")\nplot(eval(close))', candles([1])).promise, (error: unknown) => error instanceof KlineScriptWorkerError && error.code === "COMPILE_FAILED");
  runtime.dispose();
});

test("Worker cancellation terminates the current worker and allows a clean restart", async () => {
  let created = 0;
  const runtime = new KlineScriptWorkerRuntime({ factory: () => created++ === 0 ? new HangingWorker() : new HandlerWorker(), timeoutMs: 100 });
  const task = runtime.execute(source, candles([1]));
  assert.equal(task.cancel(), true);
  await assert.rejects(task.promise, (error: unknown) => error instanceof KlineScriptWorkerError && error.code === "CANCELLED");
  const recovered = await runtime.execute(source, candles([2])).promise;
  assert.equal(recovered.outputs[0]?.points.at(-1)?.value, 2);
  runtime.dispose();
});

test("Worker timeout rejects the request, terminates the worker, and recovers", async () => {
  let created = 0;
  const runtime = new KlineScriptWorkerRuntime({ factory: () => created++ === 0 ? new HangingWorker() : new HandlerWorker(), timeoutMs: 5 });
  await assert.rejects(runtime.execute(source, candles([1])).promise, (error: unknown) => error instanceof KlineScriptWorkerError && error.code === "TIMEOUT");
  const recovered = await runtime.execute(source, candles([3])).promise;
  assert.equal(recovered.outputs[0]?.points.at(-1)?.value, 3);
  runtime.dispose();
});

test("Worker handler returns a protocol error for an identifiable malformed request", () => {
  const responses: KlineScriptWorkerResponse[] = [];
  const handle = createKlineScriptWorkerHandler((response) => responses.push(response));
  handle({ protocol: KLINE_SCRIPT_WORKER_PROTOCOL_VERSION, type: "execute", requestId: "bad-1", generation: 0, source });
  assert.equal(responses[0]?.type, "error");
  assert.equal(responses[0]?.error.code, "PROTOCOL");
});
