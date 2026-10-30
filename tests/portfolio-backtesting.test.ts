import assert from "node:assert/strict";
import test from "node:test";
import {
  createPortfolioBacktest,
  createPortfolioBacktestWorker,
  createPortfolioBacktestWorkerHandler,
  parsePortfolioBacktestResult,
  projectPortfolioBacktestAsOf,
  PortfolioBacktestWorkerError,
  serializePortfolioBacktestResult,
  serializePortfolioBacktestResultChunks,
  serializePortfolioEquityCsv,
  serializePortfolioOrdersCsv,
  serializePortfolioTradesCsv,
  StrategyRegistry,
  type Candle,
  type CashDividendAction,
  type StockSplitAction,
  type CorporateActionDataset,
  type PortfolioBacktestWorkerLike,
  type PortfolioBacktestWorkerResponse,
  type StrategyDefinition,
} from "../src/index.js";

function fixtureCandles(open: number, closes: readonly number[], start = 1_800_000_000_000): Candle[] {
  return closes.map((close, index) => ({ time: start + index * 60_000, open: index === 0 ? open : close - 0.5, high: close + 1, low: Math.max(0.01, close - 1), close, volume: 10 }));
}

const enterThenExit: StrategyDefinition = {
  metadata: { id: "PORTFOLIO_FIXTURE", name: "Portfolio fixture", version: 1, description: "Deterministic portfolio accounting fixture.", parameters: [], requiredInputs: ["ohlcv"] },
  validateParameters: () => ({}),
  createEvaluator: () => ({ evaluateBar: ({ index }) => index === 0 ? [{ action: "enter-long", reason: "fixture entry" }] : index === 1 ? [{ action: "exit-long", reason: "fixture exit" }] : [] }),
};

const enterOnly: StrategyDefinition = {
  metadata: { ...enterThenExit.metadata, id: "PORTFOLIO_ENTER_ONLY", name: "Portfolio enter only" },
  validateParameters: () => ({}),
  createEvaluator: () => ({ evaluateBar: ({ index }) => index === 0 ? [{ action: "enter-long", reason: "fixture entry" }] : [] }),
};

function registry(): StrategyRegistry {
  const value = new StrategyRegistry();
  value.register(enterThenExit);
  value.register(enterOnly);
  return value;
}

function options(instruments: readonly { id: string; candles: readonly Candle[]; strategy?: string; timeframe?: string }[]) {
  return {
    accountCurrency: "USD",
    initialCapital: 100,
    instruments: instruments.map((instrument) => ({ id: instrument.id, symbol: instrument.id, quoteCurrency: "USD", timeframe: instrument.timeframe ?? "1m", candles: instrument.candles, strategy: { strategy: instrument.strategy ?? "PORTFOLIO_FIXTURE", parameters: {} } })),
    positionSizing: { type: "fixed-quantity" as const, quantity: 10 },
    commission: { type: "percent" as const, value: 0 },
    slippage: { type: "percent" as const, value: 0 },
    strategyRegistry: registry(),
  };
}

function corporateActionDataset(instrumentId: string, actions: CorporateActionDataset["actions"]): CorporateActionDataset {
  return { version: 1, instrumentId, source: { id: "fixture-actions", version: "2026-01" }, knowledgeCoverage: "known", actions };
}

function splitAction(instrumentId: string, effectiveTime: number): StockSplitAction {
  return { id: "split-2-for-1", instrumentId, kind: "stock-split", effectiveTime, revision: 1, source: { id: "fixture-actions", version: "2026-01" }, newShares: 2, oldShares: 1 };
}

function dividendAction(instrumentId: string, effectiveTime: number): CashDividendAction {
  return { id: "dividend-1", instrumentId, kind: "cash-dividend", effectiveTime, exDividendTime: effectiveTime, paymentTime: effectiveTime + 60_000, revision: 1, source: { id: "fixture-actions", version: "2026-01" }, amountPerShare: 1, currency: "USD" };
}

test("portfolio engine shares cash and gives deterministic priority independent of input order", () => {
  const a = { id: "AAA", candles: fixtureCandles(10, [10, 11, 12]) };
  const b = { id: "BBB", candles: fixtureCandles(20, [20, 21, 22]) };
  const first = createPortfolioBacktest({ ...options([a, b]), initialCapital: 110 }).run();
  const reversed = createPortfolioBacktest({ ...options([b, a]), initialCapital: 110 }).run();
  assert.equal(first.orders.find((order) => order.instrumentId === "AAA")?.status, "filled");
  assert.equal(first.orders.find((order) => order.instrumentId === "BBB")?.status, "rejected");
  assert.match(first.orders.find((order) => order.instrumentId === "BBB")?.reason ?? "", /cash|exposure/i);
  assert.equal(first.finalAccount.cash, 120);
  assert.equal(first.metrics.netProfit, 10);
  assert.equal(serializePortfolioBacktestResult(first), serializePortfolioBacktestResult(reversed));
  assert.ok(first.timeline.some((event) => event.kind === "order-fill"));
});

test("portfolio corporate-action accounting adjusts split positions and preserves aggregate cost basis", () => {
  const start = 1_800_000_000_000;
  const candles = fixtureCandles(10, [10, 11, 6, 7], start);
  const result = createPortfolioBacktest({
    ...options([{ id: "AAA", candles, strategy: "PORTFOLIO_ENTER_ONLY" }]),
    initialCapital: 500,
    positionSizing: { type: "fixed-quantity", quantity: 10 },
    instruments: [{ id: "AAA", symbol: "AAA", quoteCurrency: "USD", timeframe: "1m", candles, strategy: { strategy: "PORTFOLIO_ENTER_ONLY", parameters: {} }, corporateActions: corporateActionDataset("AAA", [splitAction("AAA", start + 120_000)]) }],
  }).run();
  const position = result.positions[0];
  assert.equal(position?.quantity, 20);
  assert.equal(position?.entryPrice, 5.25);
  assert.equal(position?.aggregateCostBasis, 105);
  assert.equal(result.corporateActions?.length, 1);
  assert.equal(result.corporateActionLedger?.find((record) => record.phase === "effective")?.status, "applied");
  assert.equal(result.assumptions.corporateActionPolicy?.pendingOrderPolicy, "cancel");
  assert.equal(result.timeline.some((event) => event.kind === "corporate-action" && event.corporateActionPhase === "effective"), true);
});

test("portfolio dividends accrue as receivables, settle only at payment, and round-trip through the result protocol", () => {
  const start = 1_800_000_000_000;
  const candles = fixtureCandles(10, [10, 11, 11, 11], start);
  const result = createPortfolioBacktest({
    ...options([{ id: "AAA", candles, strategy: "PORTFOLIO_ENTER_ONLY" }]),
    initialCapital: 500,
    positionSizing: { type: "fixed-quantity", quantity: 10 },
    instruments: [{ id: "AAA", symbol: "AAA", quoteCurrency: "USD", timeframe: "1m", candles, strategy: { strategy: "PORTFOLIO_ENTER_ONLY", parameters: {} }, corporateActions: corporateActionDataset("AAA", [dividendAction("AAA", start + 120_000)]) }],
  }).run();
  const receivable = result.dividendReceivables?.[0];
  assert.equal(receivable?.quantity, 10);
  assert.equal(receivable?.amount, 10);
  assert.equal(receivable?.status, "paid");
  assert.equal(result.finalAccount.cash, 405);
  assert.equal(result.finalAccount.dividendIncome, 10);
  assert.equal(result.metrics.dividendIncome, 10);
  assert.equal(result.metrics.priceReturn, 0.01);
  const encoded = serializePortfolioBacktestResult(result);
  assert.equal([...serializePortfolioBacktestResultChunks(result)].join(""), encoded);
  const decoded = parsePortfolioBacktestResult(JSON.parse(encoded));
  assert.deepEqual(decoded.dividendReceivables, result.dividendReceivables);
  assert.deepEqual(decoded.corporateActionLedger, result.corporateActionLedger);
});

test("pending orders crossing a split boundary are cancelled deterministically", () => {
  const start = 1_800_000_000_000;
  const candles = [
    { time: start, open: 10, high: 11, low: 9, close: 10 },
    { time: start + 120_000, open: 11, high: 12, low: 10, close: 11 },
    { time: start + 180_000, open: 12, high: 13, low: 11, close: 12 },
  ];
  const result = createPortfolioBacktest({
    ...options([{ id: "AAA", candles, strategy: "PORTFOLIO_ENTER_ONLY" }]),
    initialCapital: 500,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
    instruments: [{ id: "AAA", symbol: "AAA", quoteCurrency: "USD", timeframe: "1m", candles, strategy: { strategy: "PORTFOLIO_ENTER_ONLY", parameters: {} }, corporateActions: corporateActionDataset("AAA", [splitAction("AAA", start + 90_000)]) }],
  }).run();
  assert.equal(result.orders[0]?.status, "cancelled");
  assert.match(result.orders[0]?.reason ?? "", /corporate-action split boundary/i);
  assert.equal(result.trades.length, 0);
});

test("portfolio signals become available only after completion and fill the next eligible opening", () => {
  const start = 1_800_000_000_000;
  const candles: Candle[] = [
    { time: start, open: 10, high: 11, low: 9, close: 10 },
    { time: start + 30_000, open: 11, high: 12, low: 10, close: 11 },
    { time: start + 120_000, open: 12, high: 13, low: 11, close: 12 },
  ];
  const result = createPortfolioBacktest({ ...options([{ id: "GAP", candles, strategy: "PORTFOLIO_ENTER_ONLY" }]), initialCapital: 200, positionSizing: { type: "fixed-quantity", quantity: 1 } }).run();
  const order = result.orders[0];
  assert.equal(order?.status, "filled");
  assert.equal(order?.submissionTime, start + 60_000);
  assert.equal(order?.fillTime, start + 120_000);
  assert.equal(result.equityCurve[0]?.time, start);
  assert.equal(result.equityCurve[1]?.equity, 200, "the pre-fill snapshot cannot use the future execution price");
  assert.equal(result.equityCurve.some((point) => point.time === start + 30_000 && point.marks.some((mark) => mark.price === 12)), false);
});

test("portfolio timeline remains deterministic across heterogeneous intervals and input order", () => {
  const start = 1_800_000_000_000;
  const fast = fixtureCandles(10, [10, 11, 12], start);
  const slow = [
    { time: start, open: 20, high: 21, low: 19, close: 20 },
    { time: start + 300_000, open: 21, high: 22, low: 20, close: 21 },
    { time: start + 600_000, open: 22, high: 23, low: 21, close: 22 },
  ];
  const first = createPortfolioBacktest({
    ...options([
      { id: "FAST", candles: fast, strategy: "PORTFOLIO_ENTER_ONLY", timeframe: "1m" },
      { id: "SLOW", candles: slow, strategy: "PORTFOLIO_ENTER_ONLY", timeframe: "5m" },
    ]),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
  }).run();
  const reversed = createPortfolioBacktest({
    ...options([
      { id: "SLOW", candles: slow, strategy: "PORTFOLIO_ENTER_ONLY", timeframe: "5m" },
      { id: "FAST", candles: fast, strategy: "PORTFOLIO_ENTER_ONLY", timeframe: "1m" },
    ]),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
  }).run();
  assert.equal(first.orders.find((order) => order.instrumentId === "FAST")?.fillTime, start + 60_000);
  assert.equal(first.orders.find((order) => order.instrumentId === "SLOW")?.fillTime, start + 300_000);
  assert.equal(serializePortfolioBacktestResult(first), serializePortfolioBacktestResult(reversed));
  assert.deepEqual(first.instruments.map((instrument) => instrument.id), ["FAST", "SLOW"]);
});

test("portfolio risk limits, stale valuation, duplicate policy, and exports are explicit", () => {
  const result = createPortfolioBacktest({ ...options([{ id: "AAA", candles: fixtureCandles(10, [10, 11, 12]) }]), initialCapital: 1_000, positionSizing: { type: "fixed-quantity", quantity: 1 }, risk: { maxSingleInstrumentExposure: 5 }, valuation: { policy: "last-known-price", maxAgeMs: 1, incomplete: "allow" } }).run();
  assert.equal(result.orders[0]?.status, "rejected");
  assert.match(result.orders[0]?.reason ?? "", /exposure/i);
  assert.equal(result.metrics.totalReturn, 0);
  assert.match(serializePortfolioOrdersCsv(result), /orderId,instrumentId/);
  assert.match(serializePortfolioTradesCsv(result), /tradeId,instrumentId/);
  assert.match(serializePortfolioEquityCsv(result), /time,cash/);
  assert.equal([...serializePortfolioBacktestResultChunks(result)].join(""), serializePortfolioBacktestResult(result));
  assert.deepEqual(parsePortfolioBacktestResult(JSON.parse(serializePortfolioBacktestResult(result))).finalAccount, result.finalAccount);
  assert.throws(() => createPortfolioBacktest({ ...options([{ id: "AAA", candles: [{ ...fixtureCandles(10, [10])[0]!, time: 3 }, { ...fixtureCandles(10, [10])[0]!, time: 3 }] }]), duplicateTimestampPolicy: "reject" }), /duplicate timestamp/);
  const corrected = createPortfolioBacktest({ ...options([{ id: "AAA", candles: [{ ...fixtureCandles(10, [10])[0]!, time: 3 }, { ...fixtureCandles(10, [11])[0]!, time: 3 }] }]), duplicateTimestampPolicy: "last-write-wins" }).run();
  assert.equal(corrected.instruments[0]?.candleCount, 1);
});

test("portfolio as-of projections keep causal boundaries and are seekable", () => {
  const start = 1_800_000_000_000;
  const result = createPortfolioBacktest({
    ...options([{ id: "AAA", candles: fixtureCandles(10, [10, 11, 12]), strategy: "PORTFOLIO_FIXTURE" }]),
    initialCapital: 1_000,
    positionSizing: { type: "fixed-quantity", quantity: 1 },
  }).run();
  const beforeEntry = projectPortfolioBacktestAsOf(result, start + 30_000);
  const afterEntry = projectPortfolioBacktestAsOf(result, start + 60_000);
  const afterExit = projectPortfolioBacktestAsOf(result, start + 120_000);
  assert.equal(beforeEntry.orders.length, 0);
  assert.equal(beforeEntry.trades.length, 0);
  assert.equal(beforeEntry.finalAccount.equity, 1_000);
  assert.equal(afterEntry.orders.some((order) => order.status === "filled"), true);
  assert.equal(afterEntry.trades.length, 0, "the exit is not available before its fill timestamp");
  assert.equal(afterEntry.positions.length, 1);
  assert.equal(afterEntry.finalAccount.equity, 1_000);
  assert.equal(afterExit.trades.length, 1);
  assert.equal(afterExit.positions.length, 0);
  assert.equal(afterExit.metrics.completedTradeCount, 1);
  assert.equal(afterExit.sourceFinalAccount.equity, result.finalAccount.equity);
  assert.equal(result.trades.length, 1, "projection must not mutate the complete result");
  assert.deepEqual(projectPortfolioBacktestAsOf(result, start + 60_000), afterEntry);
  assert.throws(() => projectPortfolioBacktestAsOf(result, Number.NaN), /safe integer/);
});

test("portfolio result import rejects malformed, duplicate, and oversized documents", () => {
  const result = createPortfolioBacktest({ ...options([{ id: "AAA", candles: fixtureCandles(10, [10, 11, 12]) }]), initialCapital: 1_000, positionSizing: { type: "fixed-quantity", quantity: 1 } }).run();
  const document = JSON.parse(serializePortfolioBacktestResult(result)) as Record<string, unknown>;
  assert.deepEqual(parsePortfolioBacktestResult(document).finalAccount, result.finalAccount);
  const duplicateOrders = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  (duplicateOrders.orders as Array<Record<string, unknown>>).push({ ...(duplicateOrders.orders as Array<Record<string, unknown>>)[0] });
  assert.throws(() => parsePortfolioBacktestResult(duplicateOrders), /Duplicate order id/);
  const invalidMetric = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  (invalidMetric.metrics as Record<string, unknown>).grossProfit = Number.NaN;
  assert.throws(() => parsePortfolioBacktestResult(invalidMetric), /gross profit/);
  assert.throws(() => parsePortfolioBacktestResult({ ...document, schemaVersion: 99 }), /Unsupported portfolio backtest result schema/);
  const oversized = JSON.parse(JSON.stringify(document)) as Record<string, unknown>;
  oversized.signals = new Array(2_000_001);
  assert.throws(() => parsePortfolioBacktestResult(oversized), /import limit/);
});

class HandlerWorker implements PortfolioBacktestWorkerLike {
  public onmessage: ((event: { readonly data: unknown }) => void) | null = null;
  public onerror: ((event: unknown) => void) | null = null;
  public onmessageerror: ((event: unknown) => void) | null = null;
  protected terminated = false;
  private readonly handle = createPortfolioBacktestWorkerHandler((response: PortfolioBacktestWorkerResponse) => queueMicrotask(() => this.onmessage?.({ data: response })));
  public postMessage(message: unknown): void { if (this.terminated) throw new Error("Worker terminated"); queueMicrotask(() => { if (!this.terminated) this.handle(message); }); }
  public terminate(): void { this.terminated = true; }
}

class HangingPortfolioWorker extends HandlerWorker {
  public override postMessage(_message: unknown): void {
    if (this.terminated) throw new Error("Worker is terminated");
  }
}

test("portfolio Worker matches synchronous results and disposes cleanly", async () => {
  const { strategyRegistry: _registry, ...input } = { ...options([{ id: "AAA", candles: fixtureCandles(10, [10, 11, 12]) }]), initialCapital: 1_000, positionSizing: { type: "fixed-quantity" as const, quantity: 1 }, instruments: [{ id: "AAA", symbol: "AAA", quoteCurrency: "USD", timeframe: "1m", candles: fixtureCandles(10, [10, 11, 12]), strategy: { strategy: "EMA_TREND", parameters: { period: 2 } } }] };
  const synchronous = createPortfolioBacktest(input).run();
  const worker = createPortfolioBacktestWorker(input, { factory: () => new HandlerWorker() });
  const asynchronous = await worker.run();
  assert.equal(serializePortfolioBacktestResult(asynchronous), serializePortfolioBacktestResult(synchronous));
  assert.equal(worker.getStatus().state, "completed");
  worker.dispose();
  assert.equal(worker.getStatus().state, "disposed");
});

test("portfolio Worker cancellation, supersession, and disposal reject stale runs", async () => {
  const input = {
    ...options([{ id: "AAA", candles: fixtureCandles(10, [10, 11, 12]), strategy: "EMA_TREND" }]),
    strategyRegistry: undefined,
    instruments: [{ id: "AAA", symbol: "AAA", quoteCurrency: "USD", timeframe: "1m", candles: fixtureCandles(10, [10, 11, 12]), strategy: { strategy: "EMA_TREND", parameters: { period: 2 } } }],
  };
  let created = 0;
  const worker = createPortfolioBacktestWorker(input, { factory: () => created++ === 0 ? new HangingPortfolioWorker() : new HandlerWorker(), timeoutMs: 100 });
  const cancelled = worker.run();
  worker.cancel();
  await assert.rejects(cancelled, (error: unknown) => error instanceof PortfolioBacktestWorkerError && error.code === "CANCELLED");
  const first = worker.run();
  const second = worker.run();
  await assert.rejects(first, (error: unknown) => error instanceof PortfolioBacktestWorkerError && error.code === "SUPERSEDED");
  await second;
  worker.dispose();
  assert.equal(worker.getStatus().state, "disposed");
});
