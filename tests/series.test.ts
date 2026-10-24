import assert from "node:assert/strict";
import test from "node:test";
import { ChartModel } from "../src/core/chart-model.js";
import { PointStore, PointValidationError } from "../src/core/point-store.js";
import { getPaneBounds } from "../src/renderer/canvas-renderer.js";

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

