import assert from "node:assert/strict";
import test from "node:test";
import { CandleStore, CandleValidationError } from "../src/core/candle-store.js";
import { ChartModel } from "../src/core/chart-model.js";
import { formatTimeTick, PriceScale, TimeScale } from "../src/core/scales.js";
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
  const rtlTimeScale = new TimeScale([0, 100], { start: 10, end: 210 }, "rtl");
  assert.equal(rtlTimeScale.xForTime(0), 210);
  assert.equal(rtlTimeScale.timeForX(210), 0);

  const priceScale = new PriceScale(100, 200, { start: 0, end: 100 }, 0);
  assert.equal(priceScale.yForPrice(200), 0);
  assert.equal(priceScale.yForPrice(100), 100);
  assert.equal(priceScale.priceForY(50), 150);
  const singleValueScale = new PriceScale(100, 100, { start: 0, end: 100 }, 0.08);
  assert.equal(singleValueScale.min, 92);
  assert.equal(singleValueScale.max, 108);
  assert.throws(() => new TimeScale([0, 100, 50], { start: 0, end: 100 }), /ascending/);
});

test("PriceScale preserves raw values across display modes and reports invalid domains", () => {
  const pixels = { start: 0, end: 200 };
  for (const mode of ["linear", "logarithmic", "percentage", "indexed"] as const) {
    const scale = new PriceScale(100, 200, pixels, {
      mode,
      referencePrice: 100,
      marginTop: 0,
      marginBottom: 0,
    });
    for (const price of [100, 125, 200]) {
      assert.ok(Math.abs(scale.priceForY(scale.yForPrice(price)) - price) < 0.000_000_1, `${mode} round trip for ${price}`);
    }
  }

  const percentage = new PriceScale(100, 200, pixels, { mode: "percentage", referencePrice: 100, marginTop: 0, marginBottom: 0 });
  assert.equal(percentage.formatPrice(125, 2), "25.00%");
  const indexed = new PriceScale(100, 200, pixels, { mode: "indexed", referencePrice: 100, marginTop: 0, marginBottom: 0 });
  assert.equal(indexed.formatPrice(125, 2), "125.00");

  const invalidLog = new PriceScale(-5, 5, pixels, { mode: "logarithmic" });
  assert.equal(invalidLog.mode, "linear");
  assert.equal(invalidLog.diagnostic?.code, "LOGARITHMIC_REQUIRES_POSITIVE_VALUES");
  const missingReference = new PriceScale(10, 20, pixels, { mode: "percentage" });
  assert.equal(missingReference.mode, "linear");
  assert.equal(missingReference.diagnostic?.code, "REFERENCE_REQUIRES_POSITIVE_VALUE");
});

test("TimeScale produces adaptive UTC ticks with timezone-aware labels", () => {
  const start = Date.UTC(2024, 0, 1, 9, 30, 0, 0);
  const shortScale = new TimeScale([start, start + 1_000], { start: 0, end: 500 });
  const shortTicks = shortScale.getTicks({ locale: "en-US", timeZone: "UTC" });
  assert.ok(shortTicks.length >= 3);
  assert.equal(shortTicks[0]?.time, start);
  assert.equal(shortTicks.at(-1)?.time, start + 1_000);
  assert.ok(shortTicks.some((tick) => tick.label.includes(".")), "sub-second labels remain distinguishable");

  const yearlyScale = new TimeScale([start, Date.UTC(2027, 0, 1)], { start: 0, end: 800 });
  const yearlyTicks = yearlyScale.getTicks({ locale: "en-US", timeZone: "UTC" });
  assert.ok(yearlyTicks.length >= 3 && yearlyTicks.length <= 12);
  assert.ok(yearlyTicks.every((tick, index) => index === 0 || tick.time > yearlyTicks[index - 1]!.time));

  const narrow = new TimeScale([start, start + 14 * 24 * 60 * 60 * 1_000], { start: 0, end: 70 })
    .getTicks({ locale: "en-US", timeZone: "UTC" });
  assert.ok(narrow.length <= 3, "narrow view avoids a dense label candidate set");

  const beforeDst = Date.UTC(2024, 2, 10, 6, 30);
  const afterDst = Date.UTC(2024, 2, 10, 7, 30);
  const newYork = { locale: "en-US", timeZone: "America/New_York" } as const;
  const beforeLabel = formatTimeTick(beforeDst, { unit: "minute", step: 30 }, newYork);
  const afterLabel = formatTimeTick(afterDst, { unit: "minute", step: 30 }, newYork);
  assert.match(beforeLabel, /1:30/);
  assert.match(afterLabel, /3:30/);
  assert.notEqual(beforeLabel, afterLabel, "named timezone formatting observes the DST jump without changing UTC timestamps");
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

test("ChartModel preserves a zoomed historical viewport through resize and correction", () => {
  const model = new ChartModel();
  model.resize(80);
  model.setData(Array.from({ length: 40 }, (_, index) => ({
    time: index + 1,
    open: 10,
    high: 12,
    low: 8,
    close: 11,
  })));
  model.zoom(0.5);
  model.pan(-9);
  const beforeResize = model.getViewportState();
  model.resize(640);
  assert.deepEqual(model.getViewportState(), beforeResize, "ordinary resize must not reset the user zoom");

  model.update({ time: 15, open: 10, high: 13, low: 8, close: 12 });
  assert.deepEqual(model.getViewportState(), beforeResize, "historical correction must not jump the viewport");
});

test("ChartModel keeps a live right edge anchored and exposes fit/reset navigation", () => {
  const model = new ChartModel();
  model.resize(32);
  model.setData(Array.from({ length: 10 }, (_, index) => ({
    time: index + 1,
    open: 10,
    high: 12,
    low: 8,
    close: 11,
  })));
  const beforeAppend = model.getViewportState();
  model.update({ time: 11, open: 11, high: 13, low: 9, close: 12 });
  assert.equal(model.getViewportState().rangeStart, beforeAppend.rangeStart + 1);
  assert.equal(model.getVisibleData().times.at(-1), 11);

  model.fitContent();
  assert.deepEqual(model.getViewportState(), { rangeStart: 0, visibleCount: 11 });
  model.resetView();
  assert.deepEqual(model.getViewportState(), { rangeStart: 7, visibleCount: 4 });
});
