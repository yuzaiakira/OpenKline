import { performance } from "node:perf_hooks";
import {
  createPortfolioBacktest,
  parsePortfolioBacktestResult,
  serializePortfolioBacktestResult,
  serializePortfolioBacktestResultChunks,
} from "../dist/src/index.js";

const scenarios = [
  { candles: 1_000, instruments: 2 },
  { candles: 10_000, instruments: 3 },
  { candles: 100_000, instruments: 1 },
];
const baseTime = Date.UTC(2025, 0, 1);

function heapMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
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
    })),
    positionSizing: { type: "fixed-notional", amount: 5_000 },
    commission: { type: "percent", value: 0.001 },
    slippage: { type: "percent", value: 0.0005 },
  };
}

function measure(size, instrumentCount) {
  const session = createPortfolioBacktest(options(size, instrumentCount));
  const result = session.run();
  session.dispose();
  const before = heapMb();
  const serializeStartedAt = performance.now();
  const serialized = serializePortfolioBacktestResult(result);
  const serializeMs = performance.now() - serializeStartedAt;
  const parseStartedAt = performance.now();
  const parsed = parsePortfolioBacktestResult(JSON.parse(serialized));
  const parseMs = performance.now() - parseStartedAt;
  const chunkStartedAt = performance.now();
  let chunkCount = 0;
  let chunkBytes = 0;
  for (const chunk of serializePortfolioBacktestResultChunks(result)) {
    chunkCount += 1;
    chunkBytes += chunk.length;
  }
  const chunkMs = performance.now() - chunkStartedAt;
  const after = heapMb();
  if (parsed.inputFingerprint !== result.inputFingerprint || chunkBytes !== serialized.length) throw new Error(`Result serialization mismatch for ${size}`);
  return {
    candles: size,
    instruments: instrumentCount,
    resultBytes: serialized.length,
    serializeMs: Number(serializeMs.toFixed(3)),
    parseMs: Number(parseMs.toFixed(3)),
    chunkMs: Number(chunkMs.toFixed(3)),
    chunkCount,
    heapBeforeMb: before,
    heapAfterMb: after,
    heapDeltaMb: Number((after - before).toFixed(2)),
    signals: result.signals.length,
    orders: result.orders.length,
    trades: result.trades.length,
  };
}

const measurements = scenarios.map(({ candles: size, instruments }) => measure(size, instruments));
console.log(JSON.stringify({
  node: process.version,
  generatedAt: new Date().toISOString(),
  measurements,
  notes: [
    "Serialization/import measurements use the synchronous deterministic reference result and one reproducible Node process.",
    "parseMs includes JSON.parse plus deep financial-document validation and defensive cloning.",
    "Chunk bytes are reconciled with the compatibility serializer; chunk iteration avoids building one extra monolithic string for stream-capable consumers.",
    "Heap values are process observations, not leak-proof limits or browser memory guarantees.",
  ],
}, null, 2));
