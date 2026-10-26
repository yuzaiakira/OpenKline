import assert from "node:assert/strict";
import test from "node:test";
import {
  BacktestCancellationError,
  BacktestLifecycleError,
  BacktestValidationError,
  calculatePerformanceMetrics,
  serializeBacktestResult,
  serializeTradeLedgerCsv,
  StrategyRegistry,
  type Candle,
  type StrategyDefinition,
} from "../src/index.js";
import { createBacktest } from "../src/backtesting/index.js";

function candles(): Candle[] {
  return [
    { time: 1_800_000_000_000, open: 10, high: 12, low: 9, close: 10, volume: 10 },
    { time: 1_800_000_060_000, open: 20, high: 22, low: 9, close: 11, volume: 10 },
    { time: 1_800_000_120_000, open: 30, high: 32, low: 9, close: 12, volume: 10 },
    { time: 1_800_000_180_000, open: 40, high: 42, low: 9, close: 11, volume: 10 },
  ];
}

const longRoundTrip: StrategyDefinition = {
  metadata: {
    id: "TEST_LONG_ROUND_TRIP",
    name: "Test Long Round Trip",
    version: 1,
    description: "Independent accounting fixture.",
    parameters: [],
    requiredInputs: ["ohlcv"],
  },
  validateParameters: () => ({}),
  createEvaluator: () => ({
    evaluateBar: ({ index }) => index === 0
      ? [{ action: "enter-long", reason: "fixture entry" }]
      : index === 2
        ? [{ action: "exit-long", reason: "fixture exit" }]
        : [],
  }),
};

const finalEntry: StrategyDefinition = {
  metadata: { ...longRoundTrip.metadata, id: "TEST_FINAL_ENTRY", name: "Test Final Entry" },
  validateParameters: () => ({}),
  createEvaluator: () => ({ evaluateBar: ({ index }) => index === 3 ? [{ action: "enter-long", reason: "final bar" }] : [] }),
};

const shortRoundTrip: StrategyDefinition = {
  metadata: { ...longRoundTrip.metadata, id: "TEST_SHORT_ROUND_TRIP", name: "Test Short Round Trip" },
  validateParameters: () => ({}),
  createEvaluator: () => ({
    evaluateBar: ({ index }) => index === 0
      ? [{ action: "enter-short", reason: "short fixture entry" }]
      : index === 2
        ? [{ action: "exit-short", reason: "short fixture exit" }]
        : [],
  }),
};

const reversal: StrategyDefinition = {
  metadata: { ...longRoundTrip.metadata, id: "TEST_REVERSAL", name: "Test Reversal" },
  validateParameters: () => ({}),
  createEvaluator: () => ({
    evaluateBar: ({ index }) => index === 0
      ? [{ action: "enter-long", reason: "reversal long entry" }]
      : index === 2
        ? [{ action: "enter-short", reason: "reversal short entry" }]
        : [],
  }),
};

function registry(): StrategyRegistry {
  const value = new StrategyRegistry();
  value.register(longRoundTrip);
  value.register(finalEntry);
  value.register(shortRoundTrip);
  value.register(reversal);
  return value;
}

test("Backtest executes signals at the next bar open and keeps accounting identities", () => {
  const result = createBacktest({
    strategy: "TEST_LONG_ROUND_TRIP",
    parameters: {},
    candles: candles(),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 10 },
    commission: { type: "percent", value: 0.01 },
    slippage: { type: "percent", value: 0 },
    strategyRegistry: registry(),
  }).run();

  assert.deepEqual(result.signals.map((signal) => ({ index: signal.index, time: signal.time })), [
    { index: 0, time: candles()[0]!.time },
    { index: 2, time: candles()[2]!.time },
  ]);
  assert.deepEqual(result.orders.map((order) => ({ status: order.status, signalIndex: order.signalIndex, fillTime: order.fillTime, executionPrice: order.executionPrice })), [
    { status: "filled", signalIndex: 0, fillTime: candles()[1]!.time, executionPrice: 20 },
    { status: "filled", signalIndex: 2, fillTime: candles()[3]!.time, executionPrice: 40 },
  ]);
  assert.equal(result.trades.length, 1);
  assert.deepEqual(result.trades[0], {
    id: "TEST_LONG_ROUND_TRIP-order-0-trade",
    direction: "long",
    entrySignalTime: candles()[0]!.time,
    entryFillTime: candles()[1]!.time,
    entryPrice: 20,
    exitSignalTime: candles()[2]!.time,
    exitFillTime: candles()[3]!.time,
    exitPrice: 40,
    quantity: 10,
    grossPnl: 200,
    netPnl: 194,
    fees: 6,
    holdingDurationMs: 120_000,
    exitReason: "fixture exit",
  });
  assert.equal(result.openPosition, null);
  assert.equal(result.finalAccount.cash, 1_194);
  assert.equal(result.finalAccount.equity, 1_194);
  assert.equal(result.finalAccount.realizedPnl, 194);
  assert.equal(result.metrics.netProfit, 194);
  assert.equal(result.metrics.totalReturn, 0.194);
  assert.equal(result.metrics.grossProfit, 200);
  assert.equal(result.metrics.grossLoss, 0);
  assert.equal(result.metrics.maxDrawdown, 92);
  assert.equal(result.metrics.maxDrawdownPercent, 0.092);
  assert.equal(result.metrics.totalCommissions, 6);
  assert.equal(result.metrics.averageTradeDurationMs, 120_000);
  assert.equal(result.metrics.exposure, 0.5);
  assert.equal(result.metrics.winRate, 1);
  assert.equal(result.metrics.profitFactor, null, "zero gross loss has no finite profit factor");
  assert.match(result.inputFingerprint, /^fnv1a32-/);
  assert.match(serializeBacktestResult(result), /"inputFingerprint":"fnv1a32-/);
  assert.match(serializeTradeLedgerCsv(result), /tradeId,direction/);
  assert.deepEqual(result.equityCurve.map((point) => point.time), candles().map((candle) => candle.time));
});

test("Backtest applies adverse slippage, short limits, and explicit end-of-data behavior", () => {
  const slippage = createBacktest({
    strategy: "TEST_LONG_ROUND_TRIP",
    parameters: {},
    candles: candles(),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 2 },
    commission: { type: "fixed", value: 2 },
    slippage: { type: "percent", value: 0.1 },
    strategyRegistry: registry(),
  }).run();
  assert.equal(slippage.orders[0]?.executionPrice, 22);
  assert.equal(slippage.orders[1]?.executionPrice, 36);
  assert.equal(slippage.trades[0]?.grossPnl, 28);
  assert.equal(slippage.trades[0]?.netPnl, 24);

  const short = createBacktest({
    strategy: "TEST_SHORT_ROUND_TRIP",
    parameters: {},
    candles: candles(),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 2 },
    commission: { type: "percent", value: 0 },
    slippage: { type: "percent", value: 0 },
    shortSelling: { maxNotional: 100 },
    strategyRegistry: registry(),
  }).run();
  assert.equal(short.trades[0]?.direction, "short");
  assert.equal(short.trades[0]?.grossPnl, -40, "short fixture uses a rising next-bar open and must lose money");
  assert.equal(short.openPosition, null);

  const noFutureFill = createBacktest({
    strategy: "TEST_FINAL_ENTRY",
    parameters: {},
    candles: candles(),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
    commission: { type: "percent", value: 0 },
    slippage: { type: "percent", value: 0 },
    strategyRegistry: registry(),
  }).run();
  assert.equal(noFutureFill.orders[0]?.status, "cancelled");
  assert.match(noFutureFill.orders[0]?.reason ?? "", /No next bar/);
  assert.equal(noFutureFill.trades.length, 0);
});

test("Backtest rejects invalid execution assumptions and supports cancellation/lifecycle cleanup", () => {
  const base = {
    strategy: "TEST_LONG_ROUND_TRIP",
    parameters: {},
    candles: candles(),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 } as const,
    commission: { type: "percent", value: 0 } as const,
    slippage: { type: "percent", value: 0 } as const,
    strategyRegistry: registry(),
  };
  assert.throws(() => createBacktest({ ...base, initialCapital: 0 }), BacktestValidationError);
  assert.throws(() => createBacktest({ ...base, candles: [{ ...candles()[0]!, close: 0, low: 0 }] }), BacktestValidationError);
  assert.throws(() => createBacktest({ ...base, positionSizing: { type: "percent-equity", percent: 2 } }), BacktestValidationError);

  let session: ReturnType<typeof createBacktest>;
  session = createBacktest({
    ...base,
    onProgress: (progress) => {
      if (progress.phase === "signals" && progress.processedBars === candles().length) session.cancel();
    },
  });
  assert.throws(() => session.run(), BacktestCancellationError);
  assert.equal(session.getStatus().state, "cancelled");
  session.dispose();
  assert.throws(() => session.run(), BacktestLifecycleError);
});

test("reversal policy is explicit and close-and-reverse keeps the prior trade separate", () => {
  const options = {
    strategy: "TEST_REVERSAL",
    parameters: {},
    candles: candles(),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 2 } as const,
    commission: { type: "percent", value: 0 } as const,
    slippage: { type: "percent", value: 0 } as const,
    shortSelling: { maxNotional: 100 } as const,
    strategyRegistry: registry(),
  };
  const rejected = createBacktest(options).run();
  assert.equal(rejected.orders[1]?.status, "rejected");
  assert.equal(rejected.trades.length, 0);
  const reversed = createBacktest({ ...options, reversal: "close-and-reverse" }).run();
  assert.equal(reversed.orders[1]?.status, "filled");
  assert.equal(reversed.trades.length, 1);
  assert.equal(reversed.trades[0]?.exitReason, "reversal short entry");
  assert.equal(reversed.openPosition?.direction, "short");
});

test("performance metrics use explicit unavailable values for empty ledgers", () => {
  const empty = calculatePerformanceMetrics({
    initialCapital: 100,
    orders: [],
    trades: [],
    openPosition: null,
    equityCurve: [],
    finalAccount: { time: null, markPrice: null, cash: 100, positionQuantity: 0, positionValue: 0, realizedPnl: 0, unrealizedPnl: 0, equity: 100, peakEquity: 100, drawdown: 0, drawdownPercent: 0 },
  });
  assert.equal(empty.totalReturn, 0);
  assert.equal(empty.winRate, null);
  assert.equal(empty.averageProfit, null);
  assert.equal(empty.profitFactor, null);
  assert.equal(empty.exposure, null);
});
