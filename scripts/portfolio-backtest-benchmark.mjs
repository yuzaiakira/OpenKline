import { performance } from "node:perf_hooks";
import {
  createPortfolioBacktest,
  serializePortfolioBacktestResult,
} from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const instrumentCounts = new Map([[1_000, 2], [10_000, 3], [100_000, 5]]);
const repeatCount = 2;
const baseTime = Date.UTC(2025, 0, 1);

function heapMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
}

function percentile(values, fraction) {
  const ordered = [...values].sort((left, right) => left - right);
  if (ordered.length === 0) return 0;
  const position = Math.min(ordered.length - 1, Math.max(0, (ordered.length - 1) * fraction));
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const lowerValue = ordered[lower] ?? 0;
  const upperValue = ordered[upper] ?? lowerValue;
  const value = lowerValue + (upperValue - lowerValue) * (position - lower);
  return Number(value.toFixed(3));
}

function candles(size, instrumentIndex) {
  const base = 100 + instrumentIndex * 37;
  return Array.from({ length: size }, (_, index) => {
    const close = base + Math.sin((index + instrumentIndex * 11) / 23) * 4 + Math.cos(index / 71) * 2 + index * 0.002;
    return { time: baseTime + index * 60_000, open: close - 0.35, high: close + 0.8, low: close - 0.8, close, volume: 1_000 + (index % 97) * 10 };
  });
}

function options(size, instrumentCount) {
  return {
    accountCurrency: "USD",
    initialCapital: 1_000_000,
    instruments: Array.from({ length: instrumentCount }, (_, index) => ({
      id: `asset-${index + 1}`,
      symbol: `ASSET-${index + 1}`,
      quoteCurrency: "USD",
      timeframe: "1m",
      candles: candles(size, index),
      strategy: { strategy: index % 2 === 0 ? "EMA_TREND" : "EMA_CROSSOVER", parameters: index % 2 === 0 ? { period: 20 } : { fastPeriod: 8, slowPeriod: 21 } },
      calendar: { id: "UTC-24x7", version: "1" },
    })),
    positionSizing: { type: "fixed-notional", amount: 5_000 },
    commission: { type: "percent", value: 0.001 },
    slippage: { type: "percent", value: 0.0005 },
    risk: { maxTotalGrossExposure: 100_000, maxActivePositions: instrumentCount, minimumAvailableCash: 100_000 },
    valuation: { policy: "last-known-price", maxAgeMs: 86_400_000, incomplete: "allow" },
  };
}

function runOnce(input) {
  const validationStartedAt = performance.now();
  const session = createPortfolioBacktest(input);
  const validationMs = performance.now() - validationStartedAt;
  const runStartedAt = performance.now();
  const result = session.run();
  const runMs = performance.now() - runStartedAt;
  const exportStartedAt = performance.now();
  const exported = serializePortfolioBacktestResult(result);
  const exportMs = performance.now() - exportStartedAt;
  const statusBeforeDispose = session.getStatus().state;
  session.dispose();
  return { validationMs, runMs, exportMs, resultBytes: exported.length, statusBeforeDispose, statusAfterDispose: session.getStatus().state, signals: result.signals.length, orders: result.orders.length, trades: result.trades.length, fingerprint: result.inputFingerprint };
}

const measurements = [];
for (const size of sizes) {
  const instrumentCount = instrumentCounts.get(size);
  const input = options(size, instrumentCount);
  const beforeMb = heapMb();
  const runs = Array.from({ length: repeatCount }, () => runOnce(input));
  const afterMb = heapMb();
  measurements.push({ size, instrumentCount, beforeMb, afterMb, heapDeltaMb: Number((afterMb - beforeMb).toFixed(2)), runs, medianRunMs: percentile(runs.map((run) => run.runMs), 0.5), p95RunMs: percentile(runs.map((run) => run.runMs), 0.95), medianValidationMs: percentile(runs.map((run) => run.validationMs), 0.5), medianExportMs: percentile(runs.map((run) => run.exportMs), 0.5) });
}

console.log(JSON.stringify({ node: process.version, generatedAt: new Date().toISOString(), repeatCount, sizes, instrumentCounts: Object.fromEntries(instrumentCounts), measurements, notes: ["Node synchronous reference-engine measurements; not Canvas2D FPS or universal device claims", "Each scenario reuses deterministic candle inputs and canonical instrument ordering", "Heap values are process observations, not leak-proof limits", "Worker startup/structured-clone overhead is covered by parity tests and browser workflow separately"] }, null, 2));
