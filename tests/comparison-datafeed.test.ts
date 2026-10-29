import assert from "node:assert/strict";
import test from "node:test";
import { ComparisonDatafeedController } from "../src/index.js";
import type { Candle, Datafeed, GetBarsQuery, SubscribeBarsArgs, SymbolInfo } from "../src/types.js";

const info = (symbol: string): SymbolInfo => ({ symbol, timezone: "UTC", pricePrecision: 2 });

function candle(time: number, close: number, volume = 10): Candle {
  return { time, open: close - 1, high: close + 1, low: close - 2, close, volume };
}

function rounded(value: number): number {
  return Number(value.toFixed(10));
}

class CapturingFeed implements Datafeed {
  public readonly queries: GetBarsQuery[] = [];
  public readonly subscriptions: SubscribeBarsArgs[] = [];
  public unsubscribeCount = 0;
  private readonly active = new Set<SubscribeBarsArgs>();

  public constructor(
    private readonly symbolInfo: SymbolInfo,
    private readonly source: readonly Candle[],
    private readonly failure: Error | null = null,
  ) {}

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
    this.subscriptions.push(args);
    this.active.add(args);
    return () => {
      if (this.active.delete(args)) this.unsubscribeCount += 1;
    };
  }

  public emit(bar: Candle): void {
    for (const subscription of this.active) subscription.onBar({ ...bar });
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
  assert.deepEqual(first.queries.map((query) => [query.from, query.to, query.timeframe]), [[1_000, 3_500, "1m"]]);
  assert.deepEqual(second.queries.map((query) => [query.from, query.to, query.timeframe]), [[1_000, 3_500, "5m"]]);
  assert.deepEqual(controller.getRawCandles("AAA").map((bar) => bar.time), [1_000, 2_000, 3_000]);
  assert.deepEqual(controller.getNormalizedData().map((asset) => asset.data.map((point) => [point.time, rounded(point.value)])), [
    [[1_000, 0], [2_000, 20], [3_000, 50]],
    [[1_000, 0], [2_000, 10]],
  ]);

  controller.setBaseline({ time: 900, maxAgeMs: 100 });
  await controller.setWindow({ from: 1_000, to: 3_500 });
  assert.equal(first.queries.at(-1)?.from, 900, "baseline history is requested before the visible window");
  assert.equal(controller.getAssetStatuses().every((asset) => asset.state === "ready"), true);
  controller.dispose();
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
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => [point.time, rounded(point.value)]), [[1_000, 100], [2_000, 220], [3_000, 300], [4_000, 400]]);
  assert.equal(changes.filter((kind) => kind === "realtime-updated").length, 3);

  controller.setReplayCutoff(2_000);
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => point.time), [1_000, 2_000]);
  controller.setReplayCutoff(1_000);
  assert.deepEqual(controller.getNormalizedData()[0]?.data.map((point) => point.time), [1_000]);
  controller.setReplayCutoff(null);
  assert.equal(controller.getNormalizedData()[0]?.data.length, 4);

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
