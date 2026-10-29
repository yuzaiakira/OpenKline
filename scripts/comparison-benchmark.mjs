import { performance } from "node:perf_hooks";
import { ComparisonEngine } from "../dist/src/comparison.js";

const sizes = [10_000, 100_000];
const assets = ["BTC-USD", "ETH-USD", "AAPL"];
const startTime = Date.UTC(2026, 0, 1);

function createData(size, assetIndex) {
  return Array.from({ length: size }, (_, index) => ({
    time: startTime + index * 60_000,
    price: 100 + assetIndex * 7 + Math.sin(index / 23 + assetIndex) * 4 + index / size,
  }));
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

const reports = [];
for (const size of sizes) {
  const data = assets.map((_, index) => createData(size, index));
  const engine = new ComparisonEngine({ mode: "percentage" });
  const addStart = performance.now();
  assets.forEach((id, index) => engine.addAsset(id, data[index]));
  const addMs = performance.now() - addStart;
  const baselineStart = performance.now();
  engine.setBaseline(startTime + Math.floor(size / 2) * 60_000, { maxAgeMs: 60_000 });
  const normalized = engine.getNormalizedData();
  const normalizeMs = performance.now() - baselineStart;

  const updateSamples = [];
  for (let index = 0; index < 30; index += 1) {
    const point = data[0][size - 1];
    const started = performance.now();
    engine.updateAsset("BTC-USD", { ...point, price: point.price + index / 100 });
    updateSamples.push(performance.now() - started);
  }

  const beforeDispose = engine.getAssetIds().length;
  engine.removeAsset("AAPL");
  engine.dispose();
  reports.push({
    assets: assets.length,
    candlesPerAsset: size,
    addMs: Number(addMs.toFixed(3)),
    normalizeMs: Number(normalizeMs.toFixed(3)),
    normalizedPoints: normalized.reduce((total, asset) => total + asset.data.length, 0),
    updateMedianMs: Number(percentile(updateSamples, 0.5).toFixed(3)),
    updateP95Ms: Number(percentile(updateSamples, 0.95).toFixed(3)),
    assetsBeforeDispose: beforeDispose,
    disposed: true,
  });
}

console.log(JSON.stringify({ node: process.version, reports }, null, 2));
