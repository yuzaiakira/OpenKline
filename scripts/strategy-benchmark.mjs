import { createBacktest, serializeBacktestResult, serializeTradeLedgerCsv } from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const strategies = [
  { id: "EMA_TREND", parameters: { period: 20 } },
  { id: "RSI_REVERSAL", parameters: { period: 14, oversold: 30, overbought: 70 } },
];
const repeatCount = 2;

function makeCandles(size) {
  return Array.from({ length: size }, (_, index) => {
    const close = 100 + Math.sin(index / 23) * 4 + index / size;
    const open = close - 0.35;
    return {
      time: Date.UTC(2026, 0, 1) + index * 60_000,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1_000 + index,
    };
  });
}

function memoryMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
}

function createSession(strategy, candles, onProgress) {
  return createBacktest({
    strategy: strategy.id,
    parameters: strategy.parameters,
    candles,
    initialCapital: 100_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
    commission: { type: "fixed", value: 0 },
    slippage: { type: "fixed", value: 0 },
    onProgress,
  });
}

const measurements = [];
for (const size of sizes) {
  const candles = makeCandles(size);
  for (const strategy of strategies) {
    const beforeMb = memoryMb();
    const session = createSession(strategy, candles);
    const runs = [];
    let firstSerialized = null;
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      const startedAt = performance.now();
      const result = session.run();
      const elapsedMs = performance.now() - startedAt;
      const json = serializeBacktestResult(result);
      const csv = serializeTradeLedgerCsv(result);
      if (firstSerialized === null) firstSerialized = json;
      runs.push({
        repeat: repeat + 1,
        elapsedMs: Number(elapsedMs.toFixed(3)),
        signalCount: result.signals.length,
        orderCount: result.orders.length,
        tradeCount: result.trades.length,
        jsonBytes: json.length,
        csvBytes: csv.length,
        deterministicExport: json === firstSerialized,
        fingerprint: result.inputFingerprint,
      });
    }
    session.dispose();
    const afterMb = memoryMb();
    measurements.push({ size, strategy: strategy.id, beforeMb, afterMb, runs });
  }
}

const cancellationCandles = makeCandles(100_000);
let cancellationProgress = null;
const cancellationSession = createSession(strategies[0], cancellationCandles, (progress) => {
  cancellationProgress = progress;
  if (progress.processedBars >= 1_024) cancellationSession.cancel();
});
const cancellationStartedAt = performance.now();
let cancellationState = "completed";
try {
  cancellationSession.run();
} catch (error) {
  cancellationState = error instanceof Error ? error.name : String(error);
}
const cancellationMs = performance.now() - cancellationStartedAt;
const cancellationStatus = cancellationSession.getStatus();
cancellationSession.dispose();

console.log(JSON.stringify({
  node: process.version,
  generatedAt: new Date().toISOString(),
  sizes,
  strategies: strategies.map((strategy) => strategy.id),
  repeatCount,
  measurements,
  cancellation: {
    size: cancellationCandles.length,
    state: cancellationState,
    elapsedMs: Number(cancellationMs.toFixed(3)),
    progress: cancellationProgress,
    finalState: cancellationStatus.state,
  },
}, null, 2));
