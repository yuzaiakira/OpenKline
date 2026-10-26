import { performance } from "node:perf_hooks";
import { createPaperTradingAccount } from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const baseTime = 1_700_000_000_000;

function heapMb() {
  globalThis.gc?.();
  return Number((process.memoryUsage().heapUsed / 1_048_576).toFixed(2));
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return Number(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))].toFixed(4));
}

function runScenario(size) {
  let now = baseTime;
  const account = createPaperTradingAccount({
    id: `benchmark-${size}`,
    displayName: "Paper benchmark",
    symbol: "TESTUSD",
    currency: "USD",
    initialBalance: 1_000_000_000,
    execution: { commission: { type: "fixed", value: 0 }, slippage: { type: "fixed", value: 0 }, maxQuoteAgeMs: 120_000, allowFractionalQuantity: true },
    clock: { now: () => now },
  });
  const eventTimes = [];
  const orderTimes = [];
  const orderEvery = Math.max(1, Math.floor(size / 100));
  const firstEvent = { id: "benchmark-event-0", symbol: "TESTUSD", time: baseTime, price: 100, source: "benchmark", quoteStatus: "fresh", mode: "simulated", sourceSequence: 0 };
  account.processMarketEvent(firstEvent);
  for (let index = 1; index < size; index += 1) {
    now = baseTime + index * 60_000;
    if (index % orderEvery === 0) {
      const submitStartedAt = performance.now();
      account.submitOrder({ idempotencyKey: `benchmark-order-${index}`, side: "buy", type: "market", quantity: 1 });
      orderTimes.push(performance.now() - submitStartedAt);
    }
    const startedAt = performance.now();
    account.processMarketEvent({ id: `benchmark-event-${index}`, symbol: "TESTUSD", time: now, price: 100 + Math.sin(index / 97), source: "benchmark", quoteStatus: "fresh", mode: "simulated", sourceSequence: index });
    eventTimes.push(performance.now() - startedAt);
  }
  const snapshot = account.getSnapshot();
  const orders = account.getOrders();
  const trades = account.getTrades();
  account.dispose();
  return {
    candles: size,
    eventCount: size,
    orderCount: orders.length,
    filledOrderCount: orders.filter((order) => order.status === "filled").length,
    tradeCount: trades.length,
    finalEquity: Number(snapshot.equity.toFixed(4)),
    appendMedianMs: percentile(eventTimes, 0.5),
    appendP95Ms: percentile(eventTimes, 0.95),
    submitMedianMs: percentile(orderTimes, 0.5),
    submitP95Ms: percentile(orderTimes, 0.95),
    maxAppendMs: Number(Math.max(...eventTimes).toFixed(4)),
  };
}

const results = [];
for (const size of sizes) {
  const beforeMb = heapMb();
  const startedAt = performance.now();
  const scenario = runScenario(size);
  const elapsedMs = performance.now() - startedAt;
  const afterRunMb = heapMb();
  const postDestroyMb = heapMb();
  results.push({ ...scenario, elapsedMs: Number(elapsedMs.toFixed(3)), beforeMb, afterRunMb, postDestroyMb, retainedHeapDeltaMb: Number((postDestroyMb - beforeMb).toFixed(2)) });
}

console.log(JSON.stringify({
  node: process.version,
  gcAvailable: typeof globalThis.gc === "function",
  generatedAt: new Date().toISOString(),
  clock: "deterministic UTC millisecond fixture",
  semantics: "market events, next-event fills, long-only spot, no leverage",
  sizes,
  results,
}, null, 2));
