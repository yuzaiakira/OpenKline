import assert from "node:assert/strict";
import test from "node:test";
import {
  createScreenerUniverse,
  ScreenerWatchLifecycleError,
  ScreenerWatchSession,
  type ScreenerBar,
  type ScreenerHistoryPage,
  type ScreenerHistoryRequest,
  type ScreenerInstrument,
  type ScreenerMarketDataProvider,
} from "../src/index.js";

class MutableProvider implements ScreenerMarketDataProvider {
  public readonly id = "TEST-WATCH";
  public readonly instrument: ScreenerInstrument = { symbol: "WATCH", provider: this.id, exchange: "TEST", assetClass: "EQUITY", quoteCurrency: "USD", instrumentId: "watch" };
  private readonly bars: ScreenerBar[] = [1, 2, 3, 4].map((time) => ({ candle: { time, open: time, high: time + 1, low: time - 1, close: time, volume: 10 }, finality: "confirmed", revision: 0, source: this.id, receivedAt: time }));
  private listener: ((bar: ScreenerBar) => void) | null = null;
  public subscriptions = 0;

  public async resolveInstrument(instrument: ScreenerInstrument): Promise<ScreenerInstrument> { return { ...instrument }; }
  public async getHistory(_request: ScreenerHistoryRequest): Promise<ScreenerHistoryPage> { return { bars: this.bars.map((bar) => ({ ...bar, candle: { ...bar.candle } })), nextCursor: null, complete: true }; }
  public subscribeBars(_request: { readonly instrument: ScreenerInstrument; readonly timeframe: string }, onBar: (bar: ScreenerBar) => void): () => void {
    this.listener = onBar; this.subscriptions += 1;
    return () => { this.listener = null; };
  }
  public emit(bar: ScreenerBar): void { this.listener?.(bar); }
}

function universe(provider: MutableProvider) { return createScreenerUniverse([provider.instrument]); }

test("watch session uses incremental append, suppresses duplicates, and recalculates corrections", async () => {
  const provider = new MutableProvider();
  const updates: string[] = [];
  const session = new ScreenerWatchSession({
    provider,
    universe: universe(provider),
    ruleSet: { version: 1, id: "sma", name: "SMA", root: { type: "indicator-threshold", reference: { indicatorId: "SMA", parameters: { period: 3 }, output: "value" }, operator: ">", value: 3 } },
    timeframe: "1m",
    onUpdate: (update) => updates.push(update.event),
  });
  const initial = await session.start();
  assert.equal(session.getStatus(), "watching");
  assert.equal(initial.results[0]?.match, "unmatched");
  provider.emit({ candle: { time: 5, open: 5, high: 21, low: 4, close: 20, volume: 10 }, finality: "developing", revision: 0, source: provider.id, receivedAt: 5 });
  assert.deepEqual(updates, []);
  provider.emit({ candle: { time: 5, open: 5, high: 21, low: 4, close: 20, volume: 10 }, finality: "confirmed", revision: 0, source: provider.id, receivedAt: 5 });
  assert.deepEqual(updates, ["append"]);
  assert.equal(session.getResults()[0]?.match, "matched");
  provider.emit({ candle: { time: 5, open: 5, high: 21, low: 4, close: 20, volume: 10 }, finality: "confirmed", revision: 0, source: provider.id, receivedAt: 5 });
  assert.deepEqual(updates, ["append"]);
  provider.emit({ candle: { time: 3, open: 3, high: 4, low: 0, close: 0.5, volume: 10 }, finality: "confirmed", revision: 1, source: provider.id, receivedAt: 6 });
  assert.deepEqual(updates, ["append", "correction"]);
  session.pause();
  provider.emit({ candle: { time: 6, open: 6, high: 30, low: 5, close: 30, volume: 10 }, finality: "confirmed", revision: 0, source: provider.id, receivedAt: 7 });
  assert.deepEqual(updates, ["append", "correction"]);
  session.resume();
  assert.equal(provider.subscriptions, 2);
  session.dispose();
  assert.equal(session.getStatus(), "disposed");
  assert.throws(() => session.getResults(), ScreenerWatchLifecycleError);
});

test("watch session surfaces provider errors without inventing market events", async () => {
  const provider = new MutableProvider();
  let received: Error | null = null;
  const session = new ScreenerWatchSession({ provider, universe: universe(provider), ruleSet: { version: 1, id: "close", name: "Close", root: { type: "price-threshold", field: "close", operator: ">", value: 0 } }, timeframe: "1m", onError: (_instrument, error) => { received = error; } });
  await session.start();
  provider.emit({ candle: { time: 6, open: 6, high: 5, low: 4, close: 6, volume: 10 }, finality: "confirmed", revision: 0, source: provider.id, receivedAt: 6 });
  assert.equal(session.getStatus(), "error");
  assert.match(String(received), /Invalid candle/);
  session.dispose();
});

