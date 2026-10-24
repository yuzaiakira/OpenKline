import assert from "node:assert/strict";
import test from "node:test";
import { ChartModel } from "../src/core/chart-model.js";
import { PointStore, PointValidationError } from "../src/core/point-store.js";

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
  store.update({ time: 1, value: 2 });
  assert.deepEqual(store.getAll(), [{ time: 1, value: 2 }]);
});

