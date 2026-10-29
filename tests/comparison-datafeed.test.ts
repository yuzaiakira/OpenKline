import assert from "node:assert/strict";
import test from "node:test";
import { ComparisonDatafeedController } from "../src/index.js";
import type { Candle, Datafeed, DatafeedRealtimeStatus, DatafeedRealtimeSubscriptionArgs, GetBarsQuery, SubscribeBarsArgs, SymbolInfo } from "../src/types.js";

const info = (symbol: string): SymbolInfo => ({ symbol, timezone: "UTC", pricePrecision: 2 });

function candle(time: number, close: number, volume = 10): Candle {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume };
}

function rounded(value: number): number {
  return Number(value.toFixed(10));
}

class CapturingFeed implements Datafeed {
  public readonly queries: GetBarsQuery[] = [];
  public readonly subscriptions: DatafeedRealtimeSubscriptionArgs[] = [];
  public unsubscribeCount = 0;
  private readonly active = new Set<DatafeedRealtimeSubscriptionArgs>();

  public constructor(
    private readonly symbolInfo: SymbolInfo,
    source: readonly Candle[],
    private readonly failure: Error | null = null,
  ) {
    this.source = [...source];
  }

  private readonly source: Candle[];

  public async resolveSymbol(symbol: string, signal?: AbortSignal): Promise<SymbolInfo> {
    if (signal?.aborted) throw abortError();
    if (symbol !== this.symbolInfo.symbol) throw new Error(`Unknown symbol: ${symbol}`);
    return { ...this.symbolInfo };
  }

  public async getBars(query: GetBarsQuery): Promise<readonly Candle[]> {
    this.queries.push({ ...query });
    if (query.signal?.aborted) throw abortError();
    if (this.failure !== null) throw this.failure;
    return this.source.filter((bar) => bar.time >= query.from && bar.time < query.to).map((bar) => ({ ...bar }));
  }

  public subscribeBars(args: SubscribeBarsArgs): () => void {
    const lifecycleArgs = args as DatafeedRealtimeSubscriptionArgs;
    this.subscriptions.push(lifecycleArgs);
    this.active.add(lifecycleArgs);
    return () => {
      if (this.active.delete(lifecycleArgs)) this.unsubscribeCount += 1;
    };
  }

  public emit(bar: Candle): void {
    for (const subscription of this.active) subscription.onBar({ ...bar });
  }

  public append(...bars: Candle[]): void {
    this.source.push(...bars.map((bar) => ({ ...bar })));
  }

  public emitStatus(status: DatafeedRealtimeStatus): void {
    for (const subscription of this.active) subscription.onStatus?.(status);
  }

  public fail(error: Error): void {
    for (const subscription of this.active) subscription.onError?.(error);
  }
}

test("ComparisonDatafeedController loads different assets and preserves exclusive UTC ranges", async () => {
  const first = new CapturingFeed(info("AAA"), [candle(900, 9), candle(1_000, 10), candle(2_000, 12), candle(3_000, 15)]);
  const second = new CapturingFeed(info("BBB"), [candle(1_000, 20), candle(2_000, 22), candle(3_500, 25)]);
  const controller = new ComparisonDatafeedController({
    window: { from: 1_000, to: 3_500 },
    mode: "percentage",
    baseline: { time: 1_000, maxAgeMs: 200 },
  });
  controller.registerAsset({ id: "AAA", symbol: "AAA", timeframe: "1m", datafeed: first });
  controller.addAsset({ id: "BBB", symbol: "BBB", timeframe: "5m", datafeed: second });

  const result = await controller.load();
  assert.equal(result.status, "ready");
  assert.equal(controller.getState().status, "ready");
  assert.deepEqual(first.queries.map((query) => [query.from, query.to, query.timeframe]), [[800, 3_500, "1m"]]);
  assert.deepEqual(second.queries.map((query) => [query.from, query.to, query.timeframe]), [[800, 3_500, "5m"]]);
  assert.deepEqual(controller.getRawCandles("AAA").map((bar) => bar.time), [900, 1_000, 2_000, 3_000]);
  assert.deepEqual(controller.getNormalizedData().map((asset) => asset.data.map((point) => [point.time, rounded(point.value)])), [
    [[1_000, 0], [2_000, 20], [3_000, 50]],
    [[1_000, 0], [2_000, 10]],
  ]);

  controller.setBaseline({ time: 900, maxAgeMs: 100 });
  await controller.setWindow({ from: 1_000, to: 3_500 });
  assert.equal(first.queries.at(-1)?.from, 800, "baseline freshness history is requested before the visible window");
  assert.equal(controller.getAssetStatuses().every((asset) => asset.state === "ready"), true);
  controller.dispose();
});

test("baseline acquisition includes the complete freshness window while visible output stays in range", async () => {
  const feed = new CapturingFeed(info("AAA"), [candle(650, 6.5), candle(700, 7), candle(999, 9), candle(1_000, 10), candle(1_100, 11), candle(2_000, 20)]);
  const controller = new ComparisonDatafeedController({
    window: { from: 1_000, to: 2_000 },
    baseline: { time: 1_000, maxAgeMs: 300 },
  });
  controller.registerAsset({ id: "AAA", symbol: "AAA", timeframe: "1m", datafeed: feed });
  await controller.load();

  assert.deepEqual(feed.queries[0] && [feed.queries[0].from, feed.queries[0].to], [700, 2_000]);
  assert.deepEqual(controller.getRawCandles("AAA").map((bar) => bar.time), [700, 999, 1_000, 1_100]);
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => point.time), [1_000, 1_100]);

  controller.setBaseline({ time: 600, maxAgeMs: 0 });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(feed.queries.at(-1)?.from, 600, "zero age requests the exact baseline boundary");
  controller.dispose();
});

test("coverage policy distinguishes a confirmed interval gap and bounded backfill repairs it", async () => {
  const feed = new CapturingFeed(info("AAA"), [candle(1_000, 10), candle(1_200, 12)]);
  const controller = new ComparisonDatafeedController({
    window: { from: 1_000, to: 1_300 },
    baseline: { time: 1_000, maxAgeMs: 0 },
  });
  controller.registerAsset({
    id: "AAA",
    symbol: "AAA",
    timeframe: "100ms",
    datafeed: feed,
    coverage: { kind: "continuous", intervalMs: 100 },
  });
  await controller.load();
  assert.deepEqual(controller.getAssetStatuses()[0]?.coverage, {
    requested: { from: 1_000, to: 1_300 },
    observedFrom: 1_000,
    observedTo: 1_200,
    missing: [{ from: 1_100, to: 1_200 }],
    completeness: "incomplete",
    calendarKnown: true,
    backfillNeeded: true,
    backfillAttempted: false,
    recovery: "idle",
    recoveryError: null,
  });
  feed.append(candle(1_100, 11));
  const result = await controller.backfill({ retryBackoffMs: 0, maxAttempts: 2 });
  assert.equal(result.status, "complete");
  assert.deepEqual(controller.getRawCandles("AAA").map((bar) => bar.time), [1_000, 1_100, 1_200]);
  assert.equal(controller.getAssetStatuses()[0]?.coverage.completeness, "complete");
  assert.equal(controller.getAssetStatuses()[0]?.coverage.backfillAttempted, true);
  controller.dispose();
});

test("coverage policies do not classify session closures or sparse schedules as missing candles", async () => {
  const sessionFeed = new CapturingFeed(info("SESSION"), [candle(1_000, 10), candle(1_200, 12), candle(1_300, 13)]);
  const sessionController = new ComparisonDatafeedController({ window: { from: 1_000, to: 1_400 } });
  sessionController.registerAsset({
    id: "session",
    symbol: "SESSION",
    timeframe: "100ms",
    datafeed: sessionFeed,
    coverage: { kind: "sessions", intervalMs: 100, isExpectedTime: (time) => time !== 1_100 },
  });
  await sessionController.load();
  assert.equal(sessionController.getAssetStatuses()[0]?.coverage.completeness, "complete");
  assert.deepEqual(sessionController.getAssetStatuses()[0]?.coverage.missing, []);
  sessionController.dispose();

  const sparseFeed = new CapturingFeed(info("SPARSE"), [candle(1_000, 10), candle(1_200, 12)]);
  const sparseController = new ComparisonDatafeedController({ window: { from: 1_000, to: 1_300 } });
  sparseController.registerAsset({ id: "sparse", symbol: "SPARSE", timeframe: "unknown", datafeed: sparseFeed });
  await sparseController.load();
  assert.equal(sparseController.getAssetStatuses()[0]?.coverage.completeness, "uncertain");
  assert.equal(sparseController.getAssetStatuses()[0]?.coverage.backfillNeeded, false);
  sparseController.dispose();
});

test("backfill keeps live corrections authoritative and cannot resurrect a disposed controller", async () => {
  let subscription: SubscribeBarsArgs | null = null;
  let resolveRecovery: ((bars: readonly Candle[]) => void) | null = null;
  let historicalCalls = 0;
  const feed: Datafeed = {
    resolveSymbol: async () => info("RACE"),
    getBars: async (query) => {
      historicalCalls += 1;
      if (historicalCalls > 1) {
        return new Promise<readonly Candle[]>((resolve) => { resolveRecovery = resolve; });
      }
      return [candle(1_000, 10), candle(1_200, 12)].filter((bar) => bar.time >= query.from && bar.time < query.to);
    },
    subscribeBars: (args) => {
      subscription = args;
      return () => { subscription = null; };
    },
  };
  const controller = new ComparisonDatafeedController({ window: { from: 1_000, to: 1_300 }, baseline: { time: 1_000, maxAgeMs: 0 } });
  controller.registerAsset({ id: "race", symbol: "RACE", timeframe: "100ms", datafeed: feed, coverage: { kind: "continuous", intervalMs: 100 } });
  await controller.load();
  const recovery = controller.backfill({ ranges: { race: [{ from: 1_100, to: 1_200 }] }, retryBackoffMs: 0 });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const activeSubscription = subscription as SubscribeBarsArgs | null;
  const recoveryResolver = resolveRecovery as ((bars: readonly Candle[]) => void) | null;
  if (activeSubscription === null || recoveryResolver === null) throw new Error("recovery subscription did not start");
  activeSubscription.onBar(candle(1_100, 11.5));
  recoveryResolver([candle(1_100, 11)]);
  assert.equal((await recovery).status, "complete");
  assert.equal(controller.getRawCandles("race").find((bar) => bar.time === 1_100)?.close, 11.5);

  const disposedRecovery = controller.backfill({ ranges: { race: [{ from: 1_100, to: 1_200 }] }, retryBackoffMs: 0 });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const disposedResolver = resolveRecovery as ((bars: readonly Candle[]) => void) | null;
  controller.dispose();
  if (disposedResolver === null) throw new Error("disposed recovery did not start");
  disposedResolver([candle(1_100, 99)]);
  assert.equal((await disposedRecovery).status, "cancelled");
});

test("ComparisonDatafeedController isolates provider failures and empty histories", async () => {
  const good = new CapturingFeed(info("GOOD"), [candle(1_000, 100)]);
  const failed = new CapturingFeed(info("FAIL"), [], new Error("provider unavailable"));
  const empty = new CapturingFeed(info("EMPTY"), []);
  const controller = new ComparisonDatafeedController({
    window: { from: 1_000, to: 2_000 },
    baseline: { time: 1_000, maxAgeMs: 0 },
  });
  controller.registerAsset({ id: "good", symbol: "GOOD", timeframe: "1m", datafeed: good });
  controller.registerAsset({ id: "failed", symbol: "FAIL", timeframe: "1m", datafeed: failed });
  controller.registerAsset({ id: "empty", symbol: "EMPTY", timeframe: "1m", datafeed: empty });

  const result = await controller.load();
  assert.equal(result.status, "partial");
  assert.deepEqual(controller.getAssetStatuses().map((asset) => [asset.id, asset.state, asset.error]), [
    ["good", "ready", null],
    ["failed", "error", "provider unavailable"],
    ["empty", "empty", null],
  ]);
  assert.equal(controller.getNormalizedData().find((asset) => asset.id === "good")?.data.length, 1);
  assert.equal(controller.getNormalizedData().find((asset) => asset.id === "failed")?.data.length, 0);
  controller.dispose();
});

test("ComparisonDatafeedController handles corrections, out-of-order updates, stale callbacks, and cleanup", async () => {
  const feed = new CapturingFeed(info("AAA"), [candle(1_000, 10), candle(3_000, 30)]);
  const controller = new ComparisonDatafeedController({
    window: { from: 1_000, to: 4_000 },
    mode: "indexed",
    baseline: { time: 1_000, maxAgeMs: 0 },
  });
  controller.registerAsset({ id: "AAA", symbol: "AAA", timeframe: "1m", datafeed: feed });
  await controller.load();

  const changes: string[] = [];
  const unsubscribeChanges = controller.subscribe((change) => changes.push(change.kind));
  feed.emit(candle(2_000, 20));
  feed.emit(candle(2_000, 20));
  feed.emit(candle(2_000, 22));
  feed.emit(candle(4_000, 40));
  assert.deepEqual(controller.getRawCandles("AAA").map((bar) => [bar.time, bar.close]), [[1_000, 10], [2_000, 22], [3_000, 30], [4_000, 40]]);
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => [point.time, rounded(point.value)]), [[1_000, 100], [2_000, 220], [3_000, 300]]);
  assert.equal(changes.filter((kind) => kind === "realtime-updated").length, 3);

  controller.setReplayCutoff(2_000);
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => point.time), [1_000, 2_000]);
  controller.setReplayCutoff(1_000);
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => point.time), [1_000]);
  controller.setReplayCutoff(null);
  assert.equal(controller.getNormalizedData()[0]?.data.length, 3);

  assert.equal(controller.removeAsset("AAA"), true);
  feed.emit(candle(5_000, 50));
  assert.deepEqual(changes.filter((kind) => kind === "realtime-updated").length, 3, "removed assets cannot be updated by late callbacks");
  assert.equal(feed.unsubscribeCount, 1);
  unsubscribeChanges();
  controller.dispose();
  controller.dispose();
  assert.equal(controller.getState().status, "disposed");
});

test("ComparisonDatafeedController cancellation prevents stale history from replacing newer loads", async () => {
  const pending: Array<{ resolve: (bars: readonly Candle[]) => void; reject: (error: Error) => void }> = [];
  const delayed: Datafeed = {
    resolveSymbol: async () => info("AAA"),
    getBars: async (query) => new Promise<readonly Candle[]>((resolve, reject) => {
      pending.push({ resolve, reject });
      void query;
    }),
  };
  const controller = new ComparisonDatafeedController({ window: { from: 1_000, to: 3_000 }, baseline: { time: 1_000, maxAgeMs: 0 } });
  controller.registerAsset({ id: "AAA", symbol: "AAA", timeframe: "1m", datafeed: delayed });
  const abort = new AbortController();
  const firstLoad = controller.load({ signal: abort.signal });
  abort.abort();
  const cancelled = await firstLoad;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(controller.getState().status, "idle");
  pending[0]?.resolve([candle(1_000, 99)]);

  const secondLoad = controller.load();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  pending.at(-1)?.resolve([candle(1_000, 10), candle(2_000, 12)]);
  assert.equal((await secondLoad).status, "ready");
  assert.deepEqual(controller.getRawCandles("AAA").map((bar) => bar.close), [10, 12]);
  controller.dispose();
});

test("invalid realtime observations fail closed without corrupting raw or normalized data", async () => {
  const feed = new CapturingFeed(info("AAA"), [candle(1_000, 10)]);
  const controller = new ComparisonDatafeedController({ window: { from: 1_000, to: 2_000 }, baseline: { time: 1_000, maxAgeMs: 0 } });
  controller.registerAsset({ id: "AAA", symbol: "AAA", timeframe: "1m", datafeed: feed });
  await controller.load();
  feed.emit({ time: 1_500, open: 10, high: 11, low: -1, close: 0 });
  assert.equal(controller.getRawCandles("AAA").length, 1);
  assert.equal(controller.getAssetStatuses()[0]?.realtime, "error");
  assert.match(controller.getAssetStatuses()[0]?.error ?? "", /positive/);
  controller.dispose();
});

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
