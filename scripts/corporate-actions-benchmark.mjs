import { performance } from "node:perf_hooks";
import {
  ComparisonEngine,
  CorporateActionStore,
  StrategyRegistry,
  adjustCorporateActionData,
  calculateTotalReturnIndex,
  createPortfolioBacktest,
  normalizeCorporateActionDataset,
  serializePortfolioBacktestResult,
} from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const baseTime = Date.UTC(2025, 0, 1);
const interval = 60_000;

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) return 0;
  const position = Math.min(ordered.length - 1, Math.max(0, (ordered.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const value = (ordered[lower] ?? 0) + ((ordered[upper] ?? ordered[lower] ?? 0) - (ordered[lower] ?? 0)) * (position - lower);
  return Number(value.toFixed(3));
}

function heapMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
}

function candles(size, offset = 0) {
  return Array.from({ length: size }, (_, index) => {
    const close = 100 + offset + Math.sin((index + offset) / 19) * 3 + Math.cos(index / 73) * 1.5 + index * 0.0005;
    return { time: baseTime + index * interval, open: close - 0.25, high: close + 0.75, low: close - 0.75, close, volume: 1_000 + (index % 97) * 10 };
  });
}

function dataset(instrumentId, size) {
  const source = { id: "corporate-actions-benchmark", version: "1.0.0" };
  const timeAt = (fraction) => baseTime + Math.floor((size - 1) * fraction) * interval;
  const actions = [
    { id: `${instrumentId}:split:2-for-1`, instrumentId, kind: "stock-split", effectiveTime: timeAt(0.22), revision: 1, source, newShares: 2, oldShares: 1 },
    { id: `${instrumentId}:dividend:1`, instrumentId, kind: "cash-dividend", effectiveTime: timeAt(0.31), exDividendTime: timeAt(0.31), revision: 1, source, amountPerShare: 0.25, currency: "USD" },
    { id: `${instrumentId}:split:3-for-2`, instrumentId, kind: "stock-split", effectiveTime: timeAt(0.52), revision: 1, source, newShares: 3, oldShares: 2 },
    { id: `${instrumentId}:dividend:2`, instrumentId, kind: "cash-dividend", effectiveTime: timeAt(0.71), exDividendTime: timeAt(0.71), revision: 1, source, amountPerShare: 0.5, currency: "USD" },
    { id: `${instrumentId}:reverse:1-for-2`, instrumentId, kind: "reverse-stock-split", effectiveTime: timeAt(0.84), revision: 1, source, newShares: 1, oldShares: 2 },
  ];
  return { version: 1, instrumentId, source, knowledgeCoverage: "known", actions };
}

function timed(fn) {
  const startedAt = performance.now();
  const value = fn();
  return { value, elapsedMs: Number((performance.now() - startedAt).toFixed(3)) };
}

function noSignalRegistry() {
  const registry = new StrategyRegistry();
  registry.register({
    metadata: { id: "CORPORATE-ACTION-BENCHMARK", name: "Corporate action benchmark", version: 1, description: "No-signal lifecycle benchmark.", parameters: [], requiredInputs: ["ohlcv"] },
    requiresHistory: false,
    validateParameters: () => ({}),
    createEvaluator: () => ({ evaluateBar: () => [] }),
  });
  return registry;
}

function runScenario(size) {
  const source = candles(size);
  const actions = dataset("BENCHMARK", size);
  const repeats = size === 100_000 ? 2 : 3;
  const measurements = [];
  for (let iteration = 0; iteration < repeats; iteration += 1) {
    const validation = timed(() => normalizeCorporateActionDataset(actions));
    const split = timed(() => adjustCorporateActionData(source, actions, { mode: "split-adjusted", context: "retrospective" }));
    const totalReturn = timed(() => calculateTotalReturnIndex(source, actions.actions));
    const asOf = timed(() => adjustCorporateActionData(source, actions, { mode: "split-adjusted", context: "causal-as-of", asOfTime: baseTime + Math.floor(size * 0.6) * interval }));
    const correctionStore = new CorporateActionStore({ instrumentId: "BENCHMARK", source: actions.source, actions: actions.actions });
    const correction = timed(() => correctionStore.upsert({ ...actions.actions[1], revision: 2, amountPerShare: 0.75 }));
    correctionStore.dispose();
    const comparison = timed(() => {
      const engine = new ComparisonEngine({ mode: "percentage", baseline: { time: source[0].time, maxAgeMs: 0 } });
      engine.addCorporateActionAsset({ id: "BENCHMARK", candles: source, corporateActions: actions, mode: "total-return" });
      const output = engine.getNormalizedData();
      engine.dispose();
      return output;
    });
    const portfolio = timed(() => {
      const session = createPortfolioBacktest({
        accountCurrency: "USD",
        initialCapital: 100_000,
        instruments: [{ id: "BENCHMARK", symbol: "BENCHMARK", quoteCurrency: "USD", timeframe: "1m", candles: source, strategy: { strategy: "CORPORATE-ACTION-BENCHMARK", parameters: {} }, corporateActions: actions }],
        positionSizing: { type: "fixed-quantity", quantity: 1 },
        commission: { type: "percent", value: 0 },
        slippage: { type: "percent", value: 0 },
        strategyRegistry: noSignalRegistry(),
      });
      const result = session.run();
      session.dispose();
      return result;
    });
    const exported = timed(() => serializePortfolioBacktestResult(portfolio.value));
    measurements.push({ validationMs: validation.elapsedMs, splitAdjustmentMs: split.elapsedMs, totalReturnMs: totalReturn.elapsedMs, asOfMs: asOf.elapsedMs, correctionMs: correction.elapsedMs, comparisonMs: comparison.elapsedMs, portfolioMs: portfolio.elapsedMs, exportMs: exported.elapsedMs, resultBytes: exported.value.length, adjustedPoints: split.value.candles?.length ?? 0, totalReturnPoints: totalReturn.value.length });
  }
  return { size, repeats, median: Object.fromEntries(Object.keys(measurements[0] ?? {}).filter((key) => key.endsWith("Ms")).map((key) => [key, percentile(measurements.map((item) => item[key]), 0.5)])), p95: Object.fromEntries(Object.keys(measurements[0] ?? {}).filter((key) => key.endsWith("Ms")).map((key) => [key, percentile(measurements.map((item) => item[key]), 0.95)])), runs: measurements };
}

const scenarios = [];
for (const size of sizes) {
  const beforeMb = heapMb();
  const result = runScenario(size);
  const afterMb = heapMb();
  scenarios.push({ ...result, beforeMb, afterMb, heapDeltaMb: Number((afterMb - beforeMb).toFixed(2)) });
}

console.log(JSON.stringify({
  node: process.version,
  generatedAt: new Date().toISOString(),
  sizes,
  scenarios,
  notes: [
    "Node-only deterministic measurements; no Canvas2D FPS or universal device claim.",
    "Corporate-action adjustment uses indexed split boundaries and a monotonic dividend cursor.",
    "Portfolio measurement uses a no-signal strategy to isolate timeline/action lifecycle overhead; worker startup/clone overhead remains in benchmark:portfolio-worker.",
    "Heap values are process observations, not leak-proof limits; run with --expose-gc for comparable samples.",
  ],
}, null, 2));

