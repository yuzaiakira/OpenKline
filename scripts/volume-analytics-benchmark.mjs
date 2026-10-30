#!/usr/bin/env node
/**
 * Deterministic Phase 9 volume-analytics benchmark.
 *
 * This measures the public calculation and calculator lifecycle in Node. It
 * intentionally does not report Canvas2D frame time or FPS; those require a
 * browser workload and are covered by the browser benchmark suites.
 */
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  AnchoredVwapCalculator,
  calculateAnchoredVwap,
  calculateEstimatedVolumeProfile,
} from "../dist/src/index.js";

const sizes = [1_000, 10_000, 100_000];
const samplesPerScenario = 5;
const interval = 60_000;
let sink = 0;

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function summarize(values) {
  return {
    medianMs: Number(percentile(values, 0.5).toFixed(3)),
    p95Ms: Number(percentile(values, 0.95).toFixed(3)),
  };
}

function measure(action) {
  action();
  const values = [];
  for (let index = 0; index < samplesPerScenario; index += 1) {
    const started = performance.now();
    action(index);
    values.push(performance.now() - started);
  }
  return summarize(values);
}

function createCandles(size) {
  const start = Date.UTC(2026, 0, 1);
  return Array.from({ length: size }, (_, index) => {
    const close = 100 + Math.sin(index / 23) * 4 + index / size;
    return {
      time: start + index * interval,
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: 1_000 + (index % 10_000),
    };
  });
}

function assertProfileConservesVolume(result, label) {
  const binVolume = result.bins.reduce((sum, bin) => sum + bin.estimatedVolume, 0);
  const tolerance = Math.max(1, Math.abs(result.totalEligibleVolume)) * 1e-9;
  if (Math.abs(binVolume - result.totalEligibleVolume) > tolerance) {
    throw new Error(`${label} does not conserve eligible volume: ${binVolume} vs ${result.totalEligibleVolume}`);
  }
  if (result.status !== "ready" || result.pointOfControl === null || result.valueArea === null) {
    throw new Error(`${label} unexpectedly returned an empty profile`);
  }
  if (!(result.valueArea.low <= result.pointOfControl.price && result.pointOfControl.price <= result.valueArea.high)) {
    throw new Error(`${label} returned invalid POC/value-area ordering`);
  }
}

function run(size) {
  const candles = createCandles(size);
  const anchorIndex = Math.floor(size * 0.25);
  const anchorTime = candles[anchorIndex]?.time;
  const first = candles[0]?.time;
  const last = candles.at(-1)?.time;
  if (anchorTime === undefined || first === undefined || last === undefined) throw new Error(`Unable to build ${size} candles`);
  const fullRange = { from: first, to: last + interval };
  const profileOptions = { ...fullRange, binCount: 64, valueAreaPercentage: 0.7 };

  const anchoredVwap = measure(() => {
    const result = calculateAnchoredVwap(candles, { anchorTime, priceSource: "typical" });
    if (result.currentValue === null || !Number.isFinite(result.currentValue)) throw new Error("Anchored VWAP result is not finite");
    sink += result.currentValue;
  });

  const closeProfile = measure(() => {
    const result = calculateEstimatedVolumeProfile(candles, { ...profileOptions, allocation: "close" });
    assertProfileConservesVolume(result, `close profile ${size}`);
    sink += result.pointOfControl?.price ?? 0;
  });

  const rangeUniformProfile = measure(() => {
    const result = calculateEstimatedVolumeProfile(candles, { ...profileOptions, allocation: "range-uniform" });
    assertProfileConservesVolume(result, `range-uniform profile ${size}`);
    sink += result.pointOfControl?.price ?? 0;
  });

  let rangeIndex = 0;
  const visibleRange = measure(() => {
    const fromIndex = Math.min(size - 1, Math.floor((rangeIndex % 5) * size / 10));
    const toIndex = Math.min(size - 1, fromIndex + Math.max(1, Math.floor(size * 0.6)));
    rangeIndex += 1;
    const result = calculateEstimatedVolumeProfile(candles, {
      from: candles[fromIndex]?.time ?? first,
      to: (candles[toIndex]?.time ?? last) + interval,
      binCount: 48,
      allocation: "close",
    });
    if (result.status !== "ready") throw new Error(`Visible-range profile ${size} unexpectedly empty`);
    sink += result.totalEligibleVolume;
  });

  const appendCalculator = new AnchoredVwapCalculator({ anchorTime, priceSource: "typical" });
  appendCalculator.setData(candles);
  let nextTime = last + interval;
  const appendUpdate = measure(() => {
    const close = 100 + Math.sin(nextTime / interval / 23) * 4;
    appendCalculator.update({ time: nextTime, open: close - 0.5, high: close + 1, low: close - 1, close, volume: 1_001 });
    nextTime += interval;
  });
  const appendedResult = appendCalculator.getResult();
  if (appendedResult.eligibleCandleCount !== size - anchorIndex + samplesPerScenario + 1) throw new Error(`Append lifecycle count mismatch for ${size}`);
  appendCalculator.dispose();

  const correctionCalculator = new AnchoredVwapCalculator({ anchorTime, priceSource: "close" });
  correctionCalculator.setData(candles);
  const correctionIndex = Math.floor(size * 0.5);
  const correctionCandle = candles[correctionIndex];
  if (correctionCandle === undefined) throw new Error(`Unable to create correction for ${size}`);
  const correctionUpdateAndResult = measure(() => {
    correctionCalculator.update({ ...correctionCandle, close: correctionCandle.close + 0.25, open: correctionCandle.open + 0.25, high: correctionCandle.high + 0.25, low: correctionCandle.low + 0.25 });
    const result = correctionCalculator.getResult();
    if (result.currentValue === null || !Number.isFinite(result.currentValue)) throw new Error(`Correction result is not finite for ${size}`);
    sink += result.currentValue;
  });
  correctionCalculator.dispose();

  const disposableCalculator = new AnchoredVwapCalculator({ anchorTime });
  disposableCalculator.setData(candles);
  const disposeStarted = performance.now();
  disposableCalculator.dispose();
  const disposalMs = Number((performance.now() - disposeStarted).toFixed(3));

  return {
    candles: size,
    anchorIndex,
    anchoredVwap,
    profileClose: closeProfile,
    profileRangeUniform: rangeUniformProfile,
    visibleRange,
    appendUpdate,
    correctionUpdateAndResult,
    disposalMs,
  };
}

const results = sizes.map(run);
console.log(JSON.stringify({
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
    date: new Date().toISOString(),
  },
  samplesPerScenario,
  results,
  notes: [
    "Node calculation and calculator lifecycle measurements only; no Canvas2D rendering or FPS claim.",
    "Datasets are deterministic UTC candles generated by this script.",
    "Median and p95 are workload evidence on this machine, not universal performance guarantees.",
    `sink=${sink.toFixed(3)}`,
  ],
}, null, 2));
