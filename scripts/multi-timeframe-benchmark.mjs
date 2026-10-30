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
    const result = new CausalTimeframeAggregator({ sourceTimeframe: "1m", targetTimeframe: "1h", coveragePolicy: "fixed-duration", finalityPolicy: "time-closed", asOfTime: candles.at(-1)?.time });
    result.setData(candles);
    result.getResult();
    result.dispose();
  }, repetitions);
  const incremental = measure(() => {
    const result = new CausalTimeframeAggregator({ sourceTimeframe: "1m", targetTimeframe: "1h", coveragePolicy: "fixed-duration", finalityPolicy: "time-closed", asOfTime: candles.at(-1)?.time });
    result.setData(candles);
    const last = candles.at(-1);
    if (last === undefined) throw new Error("Benchmark data is empty");
    result.update({ ...last, time: last.time + minute, close: last.close + 0.1, high: last.high + 0.1 });
    result.getResult();
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
  report.cases.push({ count, repetitions, aggregation: initial, appendAndRead: incremental, indicator, mapping: mapped, previousLevels: references, noLookahead, outputPoints: indicatorResult?.outputs.reduce((sum, output) => sum + output.points.length, 0) ?? 0, sourcePoints: count });
}

console.log(JSON.stringify(report, null, 2));
