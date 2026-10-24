import { performance } from "node:perf_hooks";
import { ChartModel } from "../dist/src/core/chart-model.js";

const sizes = [1_000, 10_000, 100_000];
const results = [];

for (const size of sizes) {
  const candles = Array.from({ length: size }, (_, index) => {
    const close = 100 + Math.sin(index / 23) * 4 + index / size;
    return {
      time: 1_700_000_000_000 + index * 60_000,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000 + index,
    };
  });
  const model = new ChartModel();
  model.resize(1_200);

  const loadStart = performance.now();
  model.setData(candles);
  const loadMs = performance.now() - loadStart;

  const navigationStart = performance.now();
  model.zoom(0.8, 0.5);
  model.pan(5);
  model.zoom(1.25, 0.5);
  const navigationMs = performance.now() - navigationStart;

  const updateStart = performance.now();
  model.update({ ...candles[size - 1], close: candles[size - 1].close + 0.25 });
  const updateMs = performance.now() - updateStart;

  results.push({
    candles: size,
    loadMs: Number(loadMs.toFixed(3)),
    navigationMs: Number(navigationMs.toFixed(3)),
    updateMs: Number(updateMs.toFixed(3)),
  });
}

console.log(JSON.stringify({ node: process.version, results }, null, 2));
