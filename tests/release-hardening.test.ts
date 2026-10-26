import assert from "node:assert/strict";
import test from "node:test";
import { CandleStore, CandleValidationError, DrawingEngine, InMemoryDatafeed, ReplayEngine } from "../src/index.js";

function candle(time: number, close = 100 + time): { time: number; open: number; high: number; low: number; close: number; volume: number } {
  return { time, open: close - 1, high: close + 2, low: close - 2, close, volume: 10 + time };
}

test("ordered candle storage preserves invariants through deterministic corrections", () => {
  const store = new CandleStore();
  const source = Array.from({ length: 128 }, (_, index) => candle(index * 60_000));
  store.setData(source);
  let state = 17;
  for (let index = 0; index < 64; index += 1) {
    state = (state * 1_103_515_245 + 12_345) >>> 0;
    const target = state % source.length;
    store.update(candle(source[target]!.time, 200 + index));
    const times = store.getAll().map((item) => item.time);
    assert.equal(times.length, source.length);
    assert.equal(times.every((time, position) => position === 0 || time > times[position - 1]!), true);
  }
  assert.throws(() => store.setData([candle(2), candle(1)]), CandleValidationError);
  assert.throws(() => store.update({ ...candle(0), close: Number.NaN }), CandleValidationError);
});

test("concurrent Datafeed subscriptions and duplicate cleanup remain isolated", () => {
  const feed = new InMemoryDatafeed({ symbol: "HARDENING", timezone: "UTC", pricePrecision: 2 }, [candle(1)]);
  const first: number[] = [];
  const second: number[] = [];
  const stopFirst = feed.subscribeBars({ symbol: "HARDENING", timeframe: "1m", onBar: (bar) => first.push(bar.close) });
  const stopSecond = feed.subscribeBars({ symbol: "HARDENING", timeframe: "1m", onBar: (bar) => second.push(bar.close) });
  feed.pushBar(candle(2, 102));
  stopFirst();
  stopFirst();
  feed.pushBar(candle(3, 103));
  stopSecond();
  stopSecond();
  assert.deepEqual(first, [102]);
  assert.deepEqual(second, [102, 103]);
});

test("stateful public resources tolerate repeated disposal", () => {
  const replay = new ReplayEngine({ source: [candle(1), candle(2)] });
  replay.start();
  replay.dispose();
  replay.dispose();

  const drawings = new DrawingEngine();
  drawings.create("horizontal-line", { points: [{ time: 1, price: 100 }] });
  drawings.dispose();
  drawings.dispose();
});
