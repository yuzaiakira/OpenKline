import assert from "node:assert/strict";
import test from "node:test";
import { ChartModel } from "../src/core/chart-model.js";
import { toHeikinAshi } from "../src/core/candle-series.js";
import { PointStore, PointValidationError } from "../src/core/point-store.js";
import { getPaneBounds, getPaneScaleRange } from "../src/renderer/canvas-renderer.js";
import { prepareCandleRenderPoints } from "../src/renderer/candle-lod.js";
import { TimeScale } from "../src/core/scales.js";

test("ChartModel shares one viewport across candle, line, area, and volume series", () => {
  const model = new ChartModel();
  model.resize(24);
  const candles = model.addSeries("candlestick", { id: "price", title: "Price" });
  const line = model.addSeries("line", { id: "average", title: "Average" });
  const area = model.addSeries("area", { id: "range", title: "Range" });
  const volume = model.addSeries("volume", { id: "volume", title: "Volume" });
  const times = [1, 2, 3, 4];

  model.setSeriesData(candles, times.map((time, index) => ({
    time,
    open: 10 + index,
    high: 12 + index,
    low: 9 + index,
    close: 11 + index,
  })));
  model.setSeriesData(line, times.map((time, index) => ({ time, value: 10.5 + index })));
  model.setSeriesData(area, times.map((time, index) => ({ time, value: 9.5 + index })));
  model.setSeriesData(volume, times.map((time, index) => ({ time, value: 100 + index * 10 })));

  const visible = model.getVisibleData();
  assert.deepEqual(visible.times, [2, 3, 4]);
  assert.deepEqual(visible.series.map((series) => series.type), ["candlestick", "line", "area", "volume"]);
  assert.equal(visible.series.find((series) => series.id === "average")?.data.length, 3);

  model.pan(-2);
  model.updateSeries(line, { time: 5, value: 15 });
  assert.equal(model.getVisibleData().times.includes(5), false, "panning keeps the non-latest viewport anchored");
  model.removeSeries(area);
  assert.deepEqual(model.getSeriesIds(), [candles, line, volume]);
});

test("professional candle types retain raw data while deriving visible Heikin-Ashi candles", () => {
  const raw = [
    { time: 1, open: 10, high: 14, low: 8, close: 12, volume: 5 },
    { time: 2, open: 12, high: 15, low: 11, close: 14, volume: 6 },
    { time: 3, open: 14, high: 16, low: 10, close: 11, volume: 7 },
  ];
  const derived = toHeikinAshi(raw);
  assert.deepEqual(derived, [
    { time: 1, open: 11, high: 14, low: 8, close: 11, volume: 5 },
    { time: 2, open: 11, high: 15, low: 11, close: 13, volume: 6 },
    { time: 3, open: 12, high: 16, low: 10, close: 12.75, volume: 7 },
  ]);
  assert.deepEqual(raw[1], { time: 2, open: 12, high: 15, low: 11, close: 14, volume: 6 }, "transform must not mutate market data");

  const model = new ChartModel();
  model.resize(800);
  const heikinAshi = model.addSeries("heikin-ashi", { id: "ha" });
  const ohlc = model.addSeries("ohlc", { id: "ohlc" });
  const hollow = model.addSeries("hollow-candlestick", { id: "hollow" });
  const baseline = model.addSeries("baseline", { id: "baseline" });
  model.setSeriesData(heikinAshi, raw);
  model.setSeriesData(ohlc, raw);
  model.setSeriesData(hollow, raw);
  model.setSeriesData(baseline, raw.map((candle) => ({ time: candle.time, value: candle.close - 12 })));

  assert.deepEqual(model.allCandles, raw, "primary indicator input remains raw OHLCV");
  assert.deepEqual(model.getSeries(heikinAshi).data, raw, "public series snapshots retain raw OHLCV");
  assert.deepEqual(model.getVisibleData().series.find((series) => series.id === heikinAshi)?.data, derived, "renderer snapshot derives Heikin-Ashi from the full raw history");
  assert.deepEqual(model.getVisibleData().series.map((series) => series.type), ["heikin-ashi", "ohlc", "hollow-candlestick", "baseline"]);

  model.updateSeries(heikinAshi, { time: 2, open: 12, high: 18, low: 11, close: 16, volume: 6 });
  const corrected = model.getVisibleData().series.find((series) => series.id === heikinAshi)?.data;
  assert.deepEqual(corrected, toHeikinAshi(model.allCandles), "historical corrections recompute subsequent display candles without replacing raw input");

  const baselineRange = getPaneScaleRange([{ id: "baseline", type: "baseline", paneId: "main", style: { baseline: 0 }, data: [{ time: 1, value: 100 }] }]);
  assert.deepEqual(baselineRange, { min: 0, max: 100 }, "baseline value participates in autoscale");
});

test("dense candle display aggregation preserves extrema and exact source detail returns", () => {
  const candles = Array.from({ length: 1_000 }, (_, index) => ({
    time: index,
    open: index,
    high: 1_000 + index,
    low: -index,
    close: index + 0.25,
    volume: index + 1,
  }));
  const denseScale = new TimeScale(candles.map((candle) => candle.time), { start: 0, end: 100 });
  const dense = prepareCandleRenderPoints(candles, denseScale, { left: 0, right: 100 });
  assert.ok(dense.length <= 100);
  assert.deepEqual(dense[0]?.candle, { time: 0, open: 0, high: 1_009, low: -9, close: 9.25, volume: 55 });
  assert.deepEqual(dense.at(-1)?.candle, { time: 990, open: 990, high: 1_999, low: -999, close: 999.25, volume: 9_955 });
  assert.equal(dense[0]?.x, 0.5);
  assert.equal(dense.at(-1)?.x, 99.5);

  const rtlScale = new TimeScale(candles.map((candle) => candle.time), { start: 0, end: 100 }, "rtl");
  const rtl = prepareCandleRenderPoints(candles, rtlScale, { left: 0, right: 100 });
  assert.ok((rtl[0]?.x ?? 0) > (rtl.at(-1)?.x ?? 0), "RTL reverses display columns without changing chronological aggregation");

  const exactScale = new TimeScale(candles.map((candle) => candle.time), { start: 0, end: 1_000 });
  const exact = prepareCandleRenderPoints(candles, exactScale, { left: 0, right: 1_000 });
  assert.equal(exact.length, candles.length);
  assert.equal(exact[0]?.candle, candles[0], "high-zoom rendering retains the original candle object");
  assert.equal(exact.at(-1)?.candle, candles.at(-1));
});

test("ChartModel replay cutoff masks every series while retaining protected source data", () => {
  const model = new ChartModel();
  model.resize(800);
  const candles = model.addSeries("candlestick", { id: "price" });
  const heikin = model.addSeries("heikin-ashi", { id: "ha" });
  const line = model.addSeries("line", { id: "line" });
  const volume = model.addSeries("volume", { id: "volume" });
  const raw = [
    { time: 10, open: 10, high: 12, low: 9, close: 11, volume: 100 },
    { time: 20, open: 11, high: 14, low: 10, close: 13, volume: 110 },
    { time: 35, open: 13, high: 15, low: 12, close: 14, volume: 120 },
  ];
  model.setSeriesData(candles, raw);
  model.setSeriesData(heikin, raw);
  model.setSeriesData(line, raw.map((candle) => ({ time: candle.time, value: candle.close })));
  model.setSeriesData(volume, raw.map((candle) => ({ time: candle.time, value: candle.volume ?? 0 })));

  model.setReplayCutoff(20);
  assert.deepEqual(model.allCandles.map((candle) => candle.time), [10, 20]);
  assert.deepEqual(model.getVisibleData().times, [10, 20]);
  assert.deepEqual(model.getSeries(line).data.map((point) => point.time), [10, 20]);
  assert.deepEqual(model.getSeries(volume).data.map((point) => point.time), [10, 20]);
  assert.equal(model.getSeries(heikin).data.length, 2);

  model.setReplayCutoff(35);
  assert.equal(model.allCandles.length, 3, "the protected source can reveal the next bar");
  model.setReplayCutoff(null);
  assert.equal(model.getSeries(line).data.length, 3, "exiting the mask restores the complete source");
});

test("ChartModel reads the latest candle time without cloning the full history", () => {
  const model = new ChartModel();
  const data = Array.from({ length: 10 }, (_, index) => ({
    time: index + 1,
    open: 10,
    high: 12,
    low: 8,
    close: 11,
  }));
  const id = model.addSeries("candlestick", { id: "price" });
  model.setSeriesData(id, data);
  assert.equal(model.getLatestCandleTime(), 10);
  model.setReplayCutoff(5);
  assert.equal(model.getLatestCandleTime(), 5);
  model.setReplayCutoff(Number.NEGATIVE_INFINITY);
  assert.equal(model.getLatestCandleTime(), undefined);
});

test("PointStore rejects malformed and duplicate time/value data", () => {
  const store = new PointStore();
  assert.throws(
    () => store.setData([{ time: 2, value: 1 }, { time: 1, value: 2 }]),
    PointValidationError,
  );
  store.setData([{ time: 1, value: 1 }]);
  store.update({ time: 2, value: 3 });
  store.update({ time: 1, value: 2 });
  assert.deepEqual(store.getAll(), [{ time: 1, value: 2 }, { time: 2, value: 3 }]);
});

test("ChartModel keeps panes independent while sharing one time viewport", () => {
  const model = new ChartModel();
  model.resize(32);
  const candles = model.addSeries("candlestick", { id: "price" });
  const rsiPane = model.addPane({ id: "rsi", height: 140 });
  const rsi = model.addSeries("line", { id: "rsi-value", pane: rsiPane });
  const volume = model.addSeries("volume", { id: "volume" });
  const times = [1, 2, 3, 4, 5];
  model.setSeriesData(candles, times.map((time) => ({ time, open: 10, high: 12, low: 8, close: 11 })));
  model.setSeriesData(rsi, times.map((time, index) => ({ time, value: 30 + index * 10 })));
  model.setSeriesData(volume, times.map((time) => ({ time, value: 100 })));

  const visible = model.getVisibleData();
  assert.deepEqual(visible.panes.map((pane) => pane.id), ["main", "rsi", "volume"]);
  assert.deepEqual(visible.panes.find((pane) => pane.id === "rsi")?.series.map((series) => series.id), ["rsi-value"]);
  assert.deepEqual(visible.panes.find((pane) => pane.id === "volume")?.series.map((series) => series.id), ["volume"]);
  model.removePane(rsiPane);
  assert.equal(model.getSeries("rsi-value").paneId, "main");
  model.removeSeries(volume);
  assert.deepEqual(model.getPaneIds(), ["main"]);
});

test("pane minimum heights are carried into renderer layout", () => {
  const model = new ChartModel();
  model.resize(800);
  model.addPane({ id: "oscillator", height: 120, minHeight: 96 });
  const bounds = getPaneBounds(800, 420, model.getVisibleData().panes);
  const oscillator = bounds.find((pane) => pane.id === "oscillator");
  assert.ok(oscillator !== undefined);
  assert.ok(oscillator.bottom - oscillator.top >= 96);
});

