import assert from "node:assert/strict";
import test from "node:test";
import {
  createBacktest,
  createDefaultStrategyRegistry,
  createWalkForwardFolds,
  analyzeParameterSensitivity,
  analyzeWalkForwardRobustness,
  runWalkForward,
  runOptimization,
  serializeOptimizationLeaderboardCsv,
  serializeOptimizationReportJson,
  serializeWalkForwardFoldCsv,
  serializeWalkForwardReportJson,
  type Candle,
  type StrategyDefinition,
} from "../src/index.js";

function candles(count = 180): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 3) * 4 + Math.cos(index / 11) * 2 + index * 0.01;
    return { time: Date.UTC(2026, 0, 1) + index * 60_000, open: close - 0.2, high: close + 0.7, low: close - 0.7, close, volume: 100 + index };
  });
}

function walkOptions(input = candles()) {
  return {
    strategy: "EMA_CROSSOVER",
    candles: input,
    searchSpace: [
      { name: "fastPeriod" as const, type: "integer-range" as const, start: 2, end: 3, step: 1 },
      { name: "slowPeriod" as const, type: "integer-range" as const, start: 5, end: 6, step: 1 },
    ],
    objective: "net-profit" as const,
    initialCapital: 10_000,
    positionSizing: { type: "fixed-quantity" as const, quantity: 1 },
    commission: { type: "percent" as const, value: 0 },
    slippage: { type: "percent" as const, value: 0 },
    limits: { maxCandidates: 16 },
    split: { mode: "anchored" as const, trainingWindowLength: 50, testWindowLength: 20, stepSize: 20, warmupBars: 5 },
  };
}

const boundaryStrategy: StrategyDefinition = {
  metadata: { id: "BOUNDARY_PROBE", name: "Boundary Probe", version: 1, description: "Emits deterministic entry and exit signals for boundary fixtures.", parameters: [], requiredInputs: ["ohlcv"] },
  validateParameters: () => ({}),
  createEvaluator: () => ({ evaluateBar: ({ index }) => index === 0 ? [{ action: "enter-long" as const, reason: "warmup entry" }] : index === 2 ? [{ action: "exit-long" as const, reason: "boundary exit" }] : [] }),
};

test("anchored and rolling fold definitions are chronological and bounded", () => {
  const input = candles(120);
  const anchored = createWalkForwardFolds(input, { mode: "anchored", trainingWindowLength: 30, testWindowLength: 10, stepSize: 10, gapBars: 2, validationWindowLength: 3, warmupBars: 4 });
  assert.equal(anchored[0]?.trainingStartIndex, 0);
  assert.equal(anchored[0]?.trainingEndIndex, 30);
  assert.equal(anchored[0]?.validationStartIndex, 32);
  assert.equal(anchored[0]?.testStartIndex, 35);
  assert.equal(anchored[0]?.warmupStartIndex, 31);
  assert.ok(anchored.every((fold, index) => index === 0 || fold.trainingStartIndex === 0));
  const rolling = createWalkForwardFolds(input, { mode: "rolling", trainingWindowLength: 30, testWindowLength: 10, stepSize: 10 });
  assert.equal(rolling[1]?.trainingStartIndex, 10);
  assert.equal(rolling[1]?.trainingEndIndex, 40);
  assert.throws(() => createWalkForwardFolds(input, { mode: "anchored", trainingWindowLength: 100, testWindowLength: 30, stepSize: 1 }), /does not produce/);
});

test("the trading boundary excludes warm-up signals and prevents a prior order from filling at the test start", () => {
  const registry = createDefaultStrategyRegistry();
  registry.register(boundaryStrategy);
  const input = candles(5);
  const result = createBacktest({ strategy: "BOUNDARY_PROBE", parameters: {}, candles: input, initialCapital: 1_000, positionSizing: { type: "fixed-quantity", quantity: 1 }, commission: { type: "percent", value: 0 }, slippage: { type: "percent", value: 0 }, tradingStartIndex: 2, strategyRegistry: registry }).run();
  assert.equal(result.assumptions.tradingStartIndex, 2);
  assert.equal(result.equityCurve.length, 3);
  assert.deepEqual(result.orders.map((order) => order.signalIndex), [2]);
  assert.equal(result.orders[0]?.fillTime, undefined);
  assert.equal(result.orders[0]?.status, "rejected");
  assert.equal(result.trades.length, 0);
});

test("out-of-sample candles cannot change same-fold selection and fold runs are reproducible", () => {
  const input = candles();
  const altered = input.map((candle, index) => index >= 50 ? { ...candle, open: candle.open + 200, high: candle.high + 200, low: candle.low + 200, close: candle.close + 200 } : candle);
  const first = runWalkForward(walkOptions(input));
  const second = runWalkForward(walkOptions(input));
  const changed = runWalkForward(walkOptions(altered));
  assert.ok(first.folds.length > 1);
  assert.deepEqual(first.folds.map((fold) => fold.selectedCandidate?.parameters), second.folds.map((fold) => fold.selectedCandidate?.parameters));
  assert.deepEqual(first.folds[0]?.selectedCandidate?.parameters, changed.folds[0]?.selectedCandidate?.parameters);
  assert.deepEqual(first.folds[0]?.definition, changed.folds[0]?.definition);
  assert.equal(first.analysisId, second.analysisId);
  assert.equal(first.folds[0]?.outOfSampleResult?.assumptions.tradingStartIndex, 5);
  assert.ok(first.folds[0]?.outOfSampleEquityCurve.every((point) => point.time !== null && point.time >= input[50]!.time));
});

test("walk-forward aggregation reports overlap without inventing a continuous equity curve", () => {
  const result = runWalkForward({ ...walkOptions(), split: { mode: "rolling", trainingWindowLength: 40, testWindowLength: 30, stepSize: 10, warmupBars: 3 } });
  assert.equal(result.aggregate.mode, "reset-per-fold");
  assert.equal(result.aggregate.executableEquityCurve, null);
  assert.equal(result.aggregate.overlappingTestWindows, true);
  assert.ok(result.warnings.some((warning) => /overlap/i.test(warning)));
});

test("robustness diagnostics and exports remain descriptive, reproducible, and data-only", () => {
  const input = candles();
  const optimization = runOptimization({ strategy: "EMA_CROSSOVER", candles: input, searchSpace: [{ name: "fastPeriod", type: "integer-range", start: 2, end: 3, step: 1 }, { name: "slowPeriod", type: "integer-range", start: 5, end: 6, step: 1 }], objective: "net-profit", initialCapital: 10_000, positionSizing: { type: "fixed-quantity", quantity: 1 }, commission: { type: "percent", value: 0 }, slippage: { type: "percent", value: 0 }, limits: { maxCandidates: 16 } });
  const selected = optimization.rankedCandidates.find((candidate) => candidate.objective.available)?.candidate.parameters;
  assert.ok(selected);
  const sensitivity = analyzeParameterSensitivity({ strategy: "EMA_CROSSOVER", candles: input, selectedParameters: selected, objective: "net-profit", initialCapital: 10_000, positionSizing: { type: "fixed-quantity", quantity: 1 }, commission: { type: "percent", value: 0 }, slippage: { type: "percent", value: 0 }, limits: { maxCandidates: 16 }, radius: 1 });
  assert.ok(sensitivity.neighborCount > 0);
  assert.equal(sensitivity.scoreDistribution.length, sensitivity.neighborCount);
  assert.match(sensitivity.diagnostic, /stable|varies|available/);
  const walk = runWalkForward(walkOptions(input));
  const robustness = analyzeWalkForwardRobustness(walk);
  assert.equal(robustness.foldComparisons.length, walk.folds.length);
  assert.equal(robustness.outOfSampleConsistency.evaluatedFoldCount, walk.aggregate.evaluatedFoldCount);
  assert.ok(robustness.warnings.length > 0);
  const optimizationJson = serializeOptimizationReportJson(optimization, { analysisCompletedAt: "2026-10-26T00:00:00.000Z", engineVersion: "test" });
  const walkJson = serializeWalkForwardReportJson(walk, { analysisCompletedAt: "2026-10-26T00:00:00.000Z" });
  assert.equal(JSON.parse(optimizationJson).metadata.analysisCompletedAt, "2026-10-26T00:00:00.000Z");
  assert.equal(JSON.parse(walkJson).analysisType, "walk-forward");
  assert.doesNotMatch(optimizationJson, /function\s*\(/u);
  assert.match(serializeOptimizationLeaderboardCsv(optimization), /candidateId,.*objective/u);
  assert.match(serializeWalkForwardFoldCsv(walk), /foldId,.*trainingStartIndex/u);
});

