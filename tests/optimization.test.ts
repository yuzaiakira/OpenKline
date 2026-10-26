import assert from "node:assert/strict";
import test from "node:test";
import {
  OptimizationCancellationError,
  OptimizationResourceLimitError,
  OptimizationValidationError,
  canonicalParameterSerialization,
  createBacktest,
  createOptimizationWorker,
  generateOptimizationCandidates,
  runOptimization,
  scoreBacktestResult,
  serializeBacktestResult,
  type BacktestWorkerLike,
  type BacktestWorkerResponse,
  type Candle,
  type OptimizationOptions,
} from "../src/index.js";
import { createBacktestWorkerHandler } from "../src/backtesting/worker-handler.js";

class HandlerWorker implements BacktestWorkerLike {
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  public terminated = false;
  private readonly handle: (message: unknown) => void;

  public constructor() {
    this.handle = createBacktestWorkerHandler((response: BacktestWorkerResponse) => queueMicrotask(() => this.onmessage?.({ data: response })));
  }

  public postMessage(message: unknown): void { if (this.terminated) throw new Error("Worker is terminated"); queueMicrotask(() => { if (!this.terminated) this.handle(message); }); }
  public terminate(): void { this.terminated = true; }
}

class HangingWorker extends HandlerWorker { public override postMessage(_message: unknown): void { if (this.terminated) throw new Error("Worker is terminated"); } }

function candles(count = 240): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 9) * 5 + Math.cos(index / 31) * 2 + index * 0.03;
    return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.3, high: close + 0.8, low: close - 0.8, close, volume: 100 + index };
  });
}

function options(overrides: Partial<OptimizationOptions> = {}): OptimizationOptions {
  return {
    strategy: "EMA_CROSSOVER",
    candles: candles(),
    searchSpace: [
      { name: "fastPeriod", type: "integer-range", start: 2, end: 4, step: 1 },
      { name: "slowPeriod", type: "integer-range", start: 6, end: 8, step: 1 },
    ],
    objective: "net-profit",
    initialCapital: 10_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
    commission: { type: "percent", value: 0 },
    slippage: { type: "percent", value: 0 },
    limits: { maxCandidates: 32 },
    ...overrides,
  };
}

test("parameter grids are deterministic, precise, and reject invalid strategy combinations", () => {
  const space = [
    { name: "slowPeriod", type: "integer-range" as const, start: 3, end: 5, step: 1 },
    { name: "fastPeriod", type: "integer-range" as const, start: 2, end: 4, step: 1 },
  ];
  const first = generateOptimizationCandidates("EMA_CROSSOVER", space, 32);
  const second = generateOptimizationCandidates("EMA_CROSSOVER", [...space].reverse(), 32);
  assert.equal(first.generatedCount, 9);
  assert.equal(first.candidates.length, 6);
  assert.equal(first.invalidCandidates.length, 3);
  assert.deepEqual(first.candidates, second.candidates);
  assert.equal(first.candidates[0]?.parameters.fastPeriod, 2);
  assert.equal(first.candidates[0]?.parameters.slowPeriod, 3);
  assert.equal(canonicalParameterSerialization({ value: 0.3 }), canonicalParameterSerialization({ value: 0.3 }));
  const precise = generateOptimizationCandidates("RSI_REVERSAL", [
    { name: "period", type: "fixed", value: 3 },
    { name: "oversold", type: "number-range", start: 20.1, end: 20.3, step: 0.1 },
    { name: "overbought", type: "fixed", value: 70 },
  ], 8);
  assert.deepEqual(precise.candidates.map((candidate) => candidate.parameters.oversold), [20.1, 20.2, 20.3]);
  const duplicates = generateOptimizationCandidates("EMA_TREND", [{ name: "period", type: "values", values: [2, 2, 3] }], 8);
  assert.equal(duplicates.candidates.length, 2);
  assert.equal(duplicates.duplicateCount, 1);
});

test("parameter validation and resource limits are explicit", () => {
  assert.throws(() => generateOptimizationCandidates("EMA_TREND", [{ name: "period", type: "integer-range", start: 1, end: 20, step: 1 }], 4), OptimizationResourceLimitError);
  assert.throws(() => generateOptimizationCandidates("EMA_TREND", [{ name: "unknown", type: "fixed", value: 1 }], 4), OptimizationValidationError);
});

test("objectives handle empty histories and undefined financial ratios safely", () => {
  const result = createBacktest({ strategy: "EMA_TREND", parameters: { period: 20 }, candles: candles(2), initialCapital: 10_000, positionSizing: { type: "fixed-quantity", quantity: 1 }, commission: { type: "percent", value: 0 }, slippage: { type: "percent", value: 0 } }).run();
  const emptyScore = scoreBacktestResult(result, "net-profit");
  assert.equal(emptyScore.available, false);
  assert.match(emptyScore.unavailableReason ?? "", /zero-trade/i);
  assert.equal(scoreBacktestResult(result, "profit-factor").value, null);
  assert.throws(() => scoreBacktestResult(result, "not-an-objective" as never), /Unsupported optimization objective/);
});

test("optimization reuses the financial reference, ranks deterministically, and records diagnostics", () => {
  const progress: string[] = [];
  const result = runOptimization(options({ retainBacktestResults: true, onProgress: (value) => progress.push(value.phase) }));
  const repeated = runOptimization(options({ retainBacktestResults: true }));
  assert.deepEqual(result.rankedCandidates.map((candidate) => candidate.candidate.candidateId), repeated.rankedCandidates.map((candidate) => candidate.candidate.candidateId));
  assert.equal(result.counts.generated, 9);
  assert.equal(result.counts.valid, 9);
  assert.equal(result.counts.evaluated, 9);
  assert.equal(result.counts.failed, 0);
  assert.deepEqual(progress, ["evaluating", "evaluating", "evaluating", "evaluating", "evaluating", "evaluating", "evaluating", "evaluating", "evaluating", "evaluating", "ranking"]);
  const retained = result.rankedCandidates.find((candidate) => candidate.backtestResult !== null);
  assert.ok(retained);
  const reference = createBacktest({ strategy: "EMA_CROSSOVER", parameters: retained.candidate.parameters, candles: candles(), initialCapital: 10_000, positionSizing: { type: "fixed-quantity", quantity: 1 }, commission: { type: "percent", value: 0 }, slippage: { type: "percent", value: 0 } }).run();
  assert.equal(serializeBacktestResult(retained.backtestResult!), serializeBacktestResult(reference));
  assert.equal(result.datasetFingerprint, reference.inputFingerprint);
});

test("cancellation never returns a partial completed result", () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => runOptimization(options({ signal: controller.signal })), (error: unknown) => error instanceof OptimizationCancellationError && error.progress?.evaluatedCandidates === 0);
});

test("bounded Worker orchestration preserves ranking, progress, and crash recovery", async () => {
  let maximumActiveWorkers = 0;
  const runtime = createOptimizationWorker(options({ retainBacktestResults: true }), { workerCount: 2, factory: () => new HandlerWorker() });
  runtime.subscribe((status) => { maximumActiveWorkers = Math.max(maximumActiveWorkers, status.activeWorkers); });
  const result = await runtime.run();
  assert.equal(result.jobId, "optimization-worker-1");
  assert.equal(result.counts.evaluated, 9);
  assert.equal(result.counts.failed, 0);
  assert.ok(maximumActiveWorkers <= 2);
  assert.equal(runtime.getStatus().state, "completed");
  runtime.dispose();

  let factoryCalls = 0;
  const recovering = createOptimizationWorker(options(), { workerCount: 1, factory: () => { factoryCalls += 1; if (factoryCalls === 1) throw new Error("simulated worker startup crash"); return new HandlerWorker(); } });
  const recovered = await recovering.run();
  assert.equal(recovered.counts.evaluated, 9);
  assert.ok(factoryCalls > 9);
  recovering.dispose();
});

test("Worker cancellation, supersession, and cleanup reject stale jobs", async () => {
  const hanging = createOptimizationWorker(options(), { workerCount: 2, candidateTimeoutMs: 1_000, factory: () => new HangingWorker() });
  const cancelled = hanging.run();
  hanging.cancel();
  await assert.rejects(cancelled, (error: unknown) => error instanceof Error && "code" in error && error.code === "CANCELLED");
  assert.equal(hanging.getStatus().state, "cancelled");
  hanging.dispose();

  const supersededRuntime = createOptimizationWorker(options(), { factory: () => new HandlerWorker() });
  const first = supersededRuntime.run();
  const second = supersededRuntime.run();
  await assert.rejects(first, (error: unknown) => error instanceof Error && "code" in error && error.code === "SUPERSEDED");
  await second;
  supersededRuntime.dispose();
});
