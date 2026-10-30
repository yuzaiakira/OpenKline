import { performance } from "node:perf_hooks";
import {
  createPortfolioBacktestWorkerHandler,
  serializePortfolioBacktestResult,
} from "../dist/src/index.js";

const protocol = 1;
const baseTime = Date.UTC(2025, 0, 1);
const scenarios = [
  { candles: 1_000, instruments: 2 },
  { candles: 10_000, instruments: 3 },
];

function makeCandles(size, instrumentIndex) {
  const base = 100 + instrumentIndex * 37;
  return Array.from({ length: size }, (_, index) => {
    const close = base + Math.sin((index + instrumentIndex * 11) / 23) * 4 + index * 0.002;
    return { time: baseTime + index * 60_000, open: close - 0.35, high: close + 0.8, low: close - 0.8, close, volume: 1_000 + (index % 97) * 10 };
  });
}

function options(candleCount, instrumentCount) {
  return {
    accountCurrency: "USD",
    initialCapital: 1_000_000,
    instruments: Array.from({ length: instrumentCount }, (_, index) => ({
      id: `asset-${index + 1}`,
      symbol: `ASSET-${index + 1}`,
      quoteCurrency: "USD",
      timeframe: "1m",
      candles: makeCandles(candleCount, index),
      strategy: { strategy: index % 2 === 0 ? "EMA_TREND" : "EMA_CROSSOVER", parameters: index % 2 === 0 ? { period: 20 } : { fastPeriod: 8, slowPeriod: 21 } },
    })),
    positionSizing: { type: "fixed-notional", amount: 5_000 },
    commission: { type: "percent", value: 0.001 },
    slippage: { type: "percent", value: 0.0005 },
  };
}

function measure(input, index) {
  const responses = [];
  const handler = createPortfolioBacktestWorkerHandler((response) => responses.push(response));
  const startedAt = performance.now();
  handler({ protocol, type: "run", requestId: `benchmark-${index}`, generation: 0, options: input });
  const elapsedMs = performance.now() - startedAt;
  const complete = responses.find((response) => response.type === "complete");
  if (complete === undefined) throw new Error(`Worker handler did not complete scenario ${index}`);
  const resultJson = serializePortfolioBacktestResult(complete.result);
  const disposeStartedAt = performance.now();
  handler({ protocol, type: "dispose", requestId: `dispose-${index}`, generation: 1 });
  const responseTypeCounts = responses.reduce((counts, response) => {
    counts[response.type] = (counts[response.type] ?? 0) + 1;
    return counts;
  }, {});
  return {
    candles: input.instruments[0].candles.length,
    instruments: input.instruments.length,
    handlerRunMs: Number(elapsedMs.toFixed(3)),
    resultBytes: resultJson.length,
    progressResponses: responses.filter((response) => response.type === "progress").length,
    disposeAckMs: Number((performance.now() - disposeStartedAt).toFixed(3)),
    responseTypeCounts,
  };
}

const measurements = scenarios.map((scenario, index) => measure(options(scenario.candles, scenario.instruments), index));
console.log(JSON.stringify({
  node: process.version,
  generatedAt: new Date().toISOString(),
  measurements,
  notes: [
    "Measures the deterministic protocol handler path used by the browser Worker; it does not claim browser Worker startup or structured-clone latency.",
    "Browser Worker parity, cancellation, supersession, and disposal remain covered by focused unit tests and the Studio workflow where the environment supports the bundled Worker.",
  ],
}, null, 2));
