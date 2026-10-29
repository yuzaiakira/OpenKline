import { performance } from "node:perf_hooks";
import { ComparisonDatafeedController } from "../dist/src/comparison-datafeed.js";

const sizes = [10_000, 100_000];
const assets = ["BTC-USD", "ETH-USD", "AAPL"];
const intervalMs = 60_000;
const startTime = Date.UTC(2026, 0, 1);

function createCandles(size, assetIndex) {
  return Array.from({ length: size }, (_, index) => {
    const close = 100 + assetIndex * 7 + Math.sin(index / 23 + assetIndex) * 4 + index / size;
    return { time: startTime + index * intervalMs, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 100 + index };
  });
}

class BenchmarkFeed {
  constructor(symbol, candles, gapTime) {
    this.symbol = symbol;
    this.candles = candles;
    this.gapTime = gapTime;
    this.partial = true;
    this.subscription = null;
  }

  async resolveSymbol(symbol) {
    if (symbol !== this.symbol) throw new Error(`Unknown symbol: ${symbol}`);
    return { symbol, timezone: "UTC", pricePrecision: 4 };
  }

  async getBars(query) {
    return this.candles
      .filter((candle) => candle.time >= query.from && candle.time < query.to)
      .filter((candle) => !(this.partial && query.from <= this.gapTime && query.to - query.from > intervalMs && candle.time === this.gapTime))
      .map((candle) => ({ ...candle }));
  }

  subscribeBars(args) {
    this.subscription = args;
    return () => { if (this.subscription === args) this.subscription = null; };
  }

  emit(candle) {
    this.subscription?.onBar({ ...candle });
  }
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

const reports = [];
for (const size of sizes) {
  const candles = assets.map((_, index) => createCandles(size, index));
  const gapIndex = Math.floor(size * 0.75);
  const gapTime = startTime + gapIndex * intervalMs;
  const feeds = assets.map((asset, index) => new BenchmarkFeed(asset, candles[index], gapTime));
  const controller = new ComparisonDatafeedController({
    window: { from: startTime, to: startTime + size * intervalMs },
    mode: "percentage",
    baseline: { time: startTime + Math.floor(size / 2) * intervalMs, maxAgeMs: intervalMs },
  });
  assets.forEach((id, index) => controller.registerAsset({ id, symbol: id, timeframe: "1m", datafeed: feeds[index], coverage: { kind: "continuous", intervalMs, maxGapIntervals: size + 1 } }));

  const loadStart = performance.now();
  await controller.load();
  const loadMs = performance.now() - loadStart;
  const normalizeSamples = [];
  for (let index = 0; index < 5; index += 1) {
    const started = performance.now();
    controller.getNormalizedData();
    normalizeSamples.push(performance.now() - started);
  }

  feeds.forEach((feed) => { feed.partial = false; });
  const ranges = Object.fromEntries(assets.map((id) => [id, [{ from: gapTime, to: gapTime + intervalMs }]]));
  const backfillStart = performance.now();
  const recovery = await controller.backfill({ ranges, maxRanges: assets.length, maxAttempts: 1, maxConcurrency: assets.length, retryBackoffMs: 0 });
  const backfillMs = performance.now() - backfillStart;

  const realtimeSamples = [];
  for (let index = 0; index < 10; index += 1) {
    const started = performance.now();
    feeds.forEach((feed, assetIndex) => {
      const last = candles[assetIndex].at(-1);
      feed.emit({ ...last, close: last.close + index / 1000, high: Math.max(last.high, last.close + index / 1000) });
    });
    realtimeSamples.push(performance.now() - started);
  }

  const disposeStart = performance.now();
  controller.dispose();
  const disposeMs = performance.now() - disposeStart;
  reports.push({
    assets: assets.length,
    candlesPerAsset: size,
    historicalLoadMs: Number(loadMs.toFixed(3)),
    normalizeMedianMs: Number(percentile(normalizeSamples, 0.5).toFixed(3)),
    normalizeP95Ms: Number(percentile(normalizeSamples, 0.95).toFixed(3)),
    backfillStatus: recovery.status,
    backfillMs: Number(backfillMs.toFixed(3)),
    realtimeMedianMs: Number(percentile(realtimeSamples, 0.5).toFixed(3)),
    realtimeP95Ms: Number(percentile(realtimeSamples, 0.95).toFixed(3)),
    disposeMs: Number(disposeMs.toFixed(3)),
    disposed: controller.getState().status === "disposed",
  });
}

console.log(JSON.stringify({ node: process.version, intervalMs, reports }, null, 2));
