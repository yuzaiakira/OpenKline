import os from "node:os";
import { performance } from "node:perf_hooks";
import { CausalTimeframeAggregator, calculateMultiTimeframeIndicator, calculatePreviousTimeframeLevels, mapMultiTimeframeIndicatorToSourceTimes } from "../dist/src/index.js";

const minute = 60_000;
const sizes = [1_000, 10_000, 100_000];

function makeCandles(count) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 29) * 4 + index * 0.0007;
    const open = close - Math.cos(index / 11) * 0.45;
    return { time: index * minute, open, high: Math.max(open, close) + 0.8, low: Math.min(open, close) - 0.8, close, volume: 1_000 + (index % 37) * 3 };
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))] ?? 0;
}

function measure(fn, repetitions) {
  const values = [];
  for (let index = 0; index < repetitions; index += 1) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  return { medianMs: median(values), p95Ms: percentile(values, 0.95), samples: values.length };
}

function createAggregator(candles) {
  const result = new CausalTimeframeAggregator({ sourceTimeframe: "1m", targetTimeframe: "1h", coveragePolicy: "fixed-duration", finalityPolicy: "time-closed", asOfTime: candles.at(-1)?.time });
  result.setData(candles);
  return result;
}

const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  cpu: os.cpus()[0]?.model ?? "unknown",
  sourceTimeframe: "1m",
  targetTimeframe: "1h",
  note: "Node calculation timings only; these are not Canvas2D FPS or browser performance claims.",
  cases: [],
};

for (const count of sizes) {
  const candles = makeCandles(count);
  const repetitions = count === 100_000 ? 3 : 5;
  const initial = measure(() => {
    const result = createAggregator(candles);
    result.getResult();
    result.dispose();
  }, repetitions);
  const incremental = measure(() => {
    const result = createAggregator(candles);
    const last = candles.at(-1);
    if (last === undefined) throw new Error("Benchmark data is empty");
    result.update({ ...last, time: last.time + minute, close: last.close + 0.1, high: last.high + 0.1 });
    result.getResult();
    result.dispose();
  }, repetitions);
  const midpointIndex = Math.floor(Math.max(0, count - 1) / 2);
  const midpointAsOf = candles[midpointIndex]?.time ?? 0;
  const latestAsOf = candles.at(-1)?.time ?? 0;
  const seekAggregator = createAggregator(candles);
  let asOfSnapshot;
  const asOfSnapshotTiming = measure(() => { asOfSnapshot = seekAggregator.getResult(midpointAsOf); }, repetitions);
  const backwardSeek = measure(() => { seekAggregator.getResult(midpointAsOf); }, repetitions);
  const forwardSeek = measure(() => { seekAggregator.getResult(latestAsOf); }, repetitions);
  const repeatedReplayMovement = measure(() => {
    const steps = Math.min(16, count);
    for (let step = 0; step < steps; step += 1) {
      const index = Math.floor((step / Math.max(1, steps - 1)) * Math.max(0, count - 1));
      seekAggregator.getResult(candles[index]?.time ?? latestAsOf);
    }
  }, repetitions);
  seekAggregator.dispose();
  const correction = measure(() => {
    const result = createAggregator(candles);
    const middle = candles[midpointIndex];
    if (middle === undefined) throw new Error("Benchmark data is empty");
    result.update({ ...middle, close: middle.close + 0.25, high: middle.high + 0.25 });
    result.getResult(latestAsOf);
    result.dispose();
  }, repetitions);
  const disposal = measure(() => {
    const result = createAggregator(candles);
    result.dispose();
  }, repetitions);
  let indicatorResult;
  const indicator = measure(() => {
    indicatorResult = calculateMultiTimeframeIndicator(candles, { indicatorId: "SMA", sourceTimeframe: "1m", targetTimeframe: "1h", coveragePolicy: "fixed-duration", finalityPolicy: "time-closed", parameters: { period: 20 }, asOfTime: candles.at(-1)?.time });
  }, repetitions);
  const outputId = indicatorResult?.outputs[0]?.id ?? "value";
  let mappedOutput = [];
  const mapped = measure(() => { mappedOutput = mapMultiTimeframeIndicatorToSourceTimes(indicatorResult, candles.map((candle) => candle.time), outputId); }, repetitions);
  const references = measure(() => calculatePreviousTimeframeLevels(candles, { sourceTimeframe: "1m", targetTimeframe: "1h", coveragePolicy: "fixed-duration", finalityPolicy: "time-closed", asOfTime: candles.at(-1)?.time }), repetitions);
  const noLookahead = mappedOutput.every((point) => point.availableAt === null || point.availableAt <= point.time);
  const snapshotNoLookahead = (asOfSnapshot?.observations ?? []).every((observation) => observation.sourceTimes.every((time) => time + minute <= midpointAsOf));
  report.cases.push({ count, repetitions, aggregation: initial, asOfSnapshot: asOfSnapshotTiming, backwardSeek, forwardSeek, repeatedReplayMovement, appendAndRead: incremental, correction, disposal, indicator, mapping: mapped, previousLevels: references, noLookahead: noLookahead && snapshotNoLookahead, outputPoints: indicatorResult?.outputs.reduce((sum, output) => sum + output.points.length, 0) ?? 0, sourcePoints: count });
}

console.log(JSON.stringify(report, null, 2));
