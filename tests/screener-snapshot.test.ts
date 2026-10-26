import assert from "node:assert/strict";
import test from "node:test";
import {
  createScreenerUniverse,
  DeterministicScreenerMarketDataProvider,
  runScreenerSnapshot,
  ScreenerSnapshotCancellationError,
  type ScreenerBar,
  type ScreenerMarketDataProvider,
  type ScreenerRuleSet,
} from "../src/index.js";

function rule(value: number): ScreenerRuleSet {
  return { version: 1, id: "close-rule", name: "Close rule", root: { type: "price-threshold", field: "close", operator: ">", value } };
}

test("snapshot scans paginated demo data with stable ordering, counts, and source bars", async () => {
  const provider = new DeterministicScreenerMarketDataProvider({ symbolCount: 3, barsPerInstrument: 12, pageSize: 4 });
  const progress: number[] = [];
  const first = await runScreenerSnapshot({ provider, universe: provider.getUniverse(), ruleSet: rule(0), timeframe: "1h", generation: 2, jobId: "snapshot-test", evaluationTime: 123, limits: { maxConcurrency: 2, maxPageSize: 4 }, onProgress: (event) => progress.push(event.completed) });
  const second = await runScreenerSnapshot({ provider, universe: provider.getUniverse(), ruleSet: rule(0), timeframe: "1h", generation: 2, jobId: "snapshot-test", evaluationTime: 123, limits: { maxConcurrency: 2, maxPageSize: 4 } });
  assert.deepEqual(first, second);
  assert.deepEqual(first.results.map((result) => result.instrument.symbol), ["DEMO-001", "DEMO-002", "DEMO-003"]);
  assert.equal(first.counts.matched, 3);
  assert.equal(first.counts.unavailable, 0);
  assert.equal(first.results[0]?.sourceBarRevision, 0);
  assert.equal(first.results[0]?.barsEvaluated, 12);
  assert.deepEqual(progress, [1, 2, 3]);
});

test("snapshot isolates provider failure, rejects developing-only data, and merges higher revisions", async () => {
  const good = createScreenerUniverse([
    { symbol: "GOOD", provider: "TEST", exchange: "X", assetClass: "EQUITY", quoteCurrency: "USD", instrumentId: "good" },
    { symbol: "BAD", provider: "TEST", exchange: "X", assetClass: "EQUITY", quoteCurrency: "USD", instrumentId: "bad" },
    { symbol: "OPEN", provider: "TEST", exchange: "X", assetClass: "EQUITY", quoteCurrency: "USD", instrumentId: "open" },
  ]);
  const bars = (instrumentId: string): ScreenerBar[] => {
    const normalizedId = instrumentId.toLowerCase();
    const base = normalizedId === "good" ? 20 : 10;
    const candle = { time: 2_000, open: base, high: base + 1, low: base - 1, close: base, volume: 10 };
    return [{ candle, finality: normalizedId === "open" ? "developing" : "confirmed", revision: 0, source: "test", receivedAt: 2_001 }, ...(normalizedId === "good" ? [{ candle: { ...candle, close: 30, high: 31 }, finality: "confirmed" as const, revision: 1, source: "test", receivedAt: 2_002 }] : [])];
  };
  const provider: ScreenerMarketDataProvider = {
    id: "test",
    async resolveInstrument(instrument) { return { ...instrument }; },
    async getHistory(request) {
      if (request.instrument.instrumentId.toLowerCase() === "bad") throw new Error("temporary provider failure");
      return { bars: bars(request.instrument.instrumentId), nextCursor: null, complete: true };
    },
  };
  const result = await runScreenerSnapshot({ provider, universe: good, ruleSet: rule(25), timeframe: "1m", evaluationTime: 2_100 });
  assert.equal(result.results[0]?.match, "matched");
  assert.equal(result.results[0]?.sourceBarRevision, 1);
  assert.equal(result.results[1]?.match, "unavailable");
  assert.match(result.results[1]?.diagnostics[0] ?? "", /provider-error/);
  assert.equal(result.results[2]?.match, "unavailable");
  assert.match(result.results[2]?.diagnostics[0] ?? "", /no-eligible-confirmed-bar/);
});

test("snapshot validates before acquisition and cancellation never returns partial results", async () => {
  let acquisitions = 0;
  const provider = new DeterministicScreenerMarketDataProvider({ symbolCount: 1, barsPerInstrument: 2 });
  const counting: ScreenerMarketDataProvider = {
    id: provider.id,
    resolveInstrument: async (...args) => provider.resolveInstrument(...args),
    getHistory: async (...args) => { acquisitions += 1; return provider.getHistory(...args); },
  };
  await assert.rejects(runScreenerSnapshot({ provider: counting, universe: provider.getUniverse(), ruleSet: rule(0), timeframe: "", limits: { maxConcurrency: 1 } }));
  assert.equal(acquisitions, 0);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runScreenerSnapshot({ provider: counting, universe: provider.getUniverse(), ruleSet: rule(0), timeframe: "1h", signal: controller.signal }), ScreenerSnapshotCancellationError);
});

