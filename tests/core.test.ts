import assert from "node:assert/strict";
import test from "node:test";
import { CandleStore, CandleValidationError } from "../src/core/candle-store.js";
import { ChartModel } from "../src/core/chart-model.js";
import { PriceScale, TimeScale } from "../src/core/scales.js";
import type { Candle } from "../src/types.js";

const candles: Candle[] = [
  { time: 1_700_000_000_000, open: 100, high: 110, low: 95, close: 105, volume: 10 },
  { time: 1_700_000_060_000, open: 105, high: 112, low: 102, close: 108, volume: 12 },
  { time: 1_700_000_120_000, open: 108, high: 109, low: 99, close: 101, volume: 11 },
];

test("CandleStore validates ordered OHLCV data", () => {
  const store = new CandleStore();
  store.setData(candles);
  assert.equal(store.length, 3);

  assert.throws(
    () => store.setData([{ ...candles[0]!, high: 101 }]),
    (error: unknown) => error instanceof CandleValidationError && error.index === 0,
  );
  assert.throws(
    () => store.setData([candles[1]!, candles[0]!]),
    CandleValidationError,
  );
});

test("CandleStore replaces updates and inserts corrected historical bars", () => {
  const store = new CandleStore();
  store.setData(candles);
  store.update({ time: 1_700_000_180_000, open: 101, high: 104, low: 100, close: 103 });
  store.update({ ...candles[2]!, close: 103 });
  store.update({ time: 1_700_000_090_000, open: 108, high: 111, low: 107, close: 110 });

  const result = store.getAll();
  assert.equal(result.length, 5);
  assert.deepEqual(result.map((candle) => candle.time), [
    1_700_000_000_000,
    1_700_000_060_000,
    1_700_000_090_000,
    1_700_000_120_000,
    1_700_000_180_000,
  ]);
  assert.equal(result[2]?.close, 110);
  assert.equal(result[3]?.close, 103);
});

test("scales map between data and pixels in both directions", () => {
  const timeScale = new TimeScale([0, 100], { start: 10, end: 210 });
  assert.equal(timeScale.xForTime(50), 110);
  assert.equal(timeScale.timeForX(110), 50);

  const priceScale = new PriceScale(100, 200, { start: 0, end: 100 }, 0);
  assert.equal(priceScale.yForPrice(200), 0);
  assert.equal(priceScale.yForPrice(100), 100);
  assert.equal(priceScale.priceForY(50), 150);
  assert.throws(() => new TimeScale([0, 100, 50], { start: 0, end: 100 }), /ascending/);
});

test("ChartModel keeps a single candle visible without inventing a second bar", () => {
  const model = new ChartModel();
  model.resize(1);
  model.setData([{ time: 1, open: 10, high: 12, low: 8, close: 11 }]);
  assert.deepEqual(model.getVisibleData().candles.map((candle) => candle.time), [1]);
  model.zoom(0.5);
  assert.deepEqual(model.getVisibleData().candles.map((candle) => candle.time), [1]);
});

test("ChartModel supports latest data, pan, and zoom", () => {
  const model = new ChartModel();
  model.resize(24);
  model.setData(Array.from({ length: 10 }, (_, index) => ({
    time: index + 1,
    open: 10,
    high: 12,
    low: 8,
    close: 11,
  })));

  assert.deepEqual(model.getVisibleData().candles.map((candle) => candle.time), [8, 9, 10]);
  model.pan(-1);
  assert.deepEqual(model.getVisibleData().candles.map((candle) => candle.time), [7, 8, 9]);
  model.zoom(2, 0.5);
  assert.equal(model.getVisibleData().candles.length, 6);
});
