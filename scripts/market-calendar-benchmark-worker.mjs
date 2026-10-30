#!/usr/bin/env node
/** One isolated scenario for market-calendar-benchmark.mjs. */
import { performance } from "node:perf_hooks";
import {
  SessionAwareCandleAggregator,
  TradingCalendarEngine,
  aggregateCandlesByTradingPeriod,
  calculatePreviousSessionLevels,
  calculateSessionIndicator,
  createComparisonDatafeedCalendarCoverage,
  resolveTradingLocalDateTime,
} from "../dist/src/index.js";

const minute = 60_000;
const count = Number(process.env.OPENKLINE_CALENDAR_BENCHMARK_SIZE ?? "0");
const scenario = process.env.OPENKLINE_CALENDAR_BENCHMARK_SCENARIO;
if (!Number.isSafeInteger(count) || count < 1 || typeof scenario !== "string") throw new Error("Calendar benchmark worker requires a positive size and scenario");

function createCalendar(version = "2026.1") {
  return new TradingCalendarEngine({
    id: "openkline-benchmark-market",
    version,
    timeZone: "America/New_York",
    weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:30", end: "12:00" }, { start: "13:00", end: "16:00" }] })),
    exceptions: [
      { date: "2024-07-03", kind: "modified", classification: "early-close", segments: [{ start: "09:30", end: "13:00" }] },
      { date: "2024-07-04", kind: "closed", label: "deterministic benchmark holiday" },
    ],
  });
}

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

function measure(action, samples, warmup) {
  if (warmup) action();
  globalThis.gc?.();
  const values = [];
  for (let index = 0; index < samples; index += 1) {
    const started = performance.now();
    action(index);
    values.push(performance.now() - started);
    globalThis.gc?.();
  }
  return { medianMs: Number(percentile(values, 0.5).toFixed(3)), p95Ms: Number(percentile(values, 0.95).toFixed(3)), samples: values.length };
}

function createCandles(size) {
  const calendar = createCalendar();
  const slots = [];
  for (const session of calendar.enumerateSessions(Date.UTC(2024, 0, 1), Date.UTC(2026, 0, 1), { maxSessions: 2_000 })) {
    for (const segment of session.segments) {
      for (let time = segment.start; time + minute <= segment.end && slots.length < size; time += minute) slots.push(time);
    }
    if (slots.length >= size) break;
  }
  if (slots.length < size) throw new Error(`Calendar fixture produced ${slots.length} slots, need ${size}`);
  return slots.map((time, index) => {
    const close = 100 + Math.sin(index / 31) * 3 + index * 0.0005;
    const open = close - Math.cos(index / 17) * 0.35;
    return { time, open, high: Math.max(open, close) + 0.7, low: Math.min(open, close) - 0.7, close, volume: 500 + (index % 97) * 2 };
  });
}

function options(calendar, targetPeriod, candles) {
  return { sourceTimeframe: "1m", targetPeriod, calendar, coveragePolicy: "fixed-duration", finalityPolicy: "time-closed", asOfTime: (candles.at(-1)?.time ?? 0) + minute };
}

function createAggregator(calendar, candles, targetPeriod = "session") {
  const aggregator = new SessionAwareCandleAggregator(options(calendar, targetPeriod, candles));
  aggregator.setData(candles);
  return aggregator;
}

function assertResult(result, label) {
  if (result.observations.length === 0) throw new Error(`${label} returned no observations`);
  if (!result.observations.every((observation) => observation.candle.high >= observation.candle.low)) throw new Error(`${label} violated OHLC ordering`);
}

if (scenario === "dst") {
  const started = performance.now();
  const spring = resolveTradingLocalDateTime({ date: "2024-03-11", time: "09:30" }, "America/New_York");
  const autumn = resolveTradingLocalDateTime({ date: "2024-11-04", time: "09:30" }, "America/New_York");
  const elapsed = performance.now() - started;
  console.log(JSON.stringify({ measurement: { medianMs: Number(elapsed.toFixed(3)), p95Ms: Number(elapsed.toFixed(3)), samples: 1 }, spring, autumn }));
  process.exit(0);
}

const candles = createCandles(count);
const calendar = createCalendar();
const from = candles[0]?.time ?? 0;
const latest = candles.at(-1)?.time ?? from;
const midpoint = candles[Math.floor(candles.length / 2)]?.time ?? from;
const repetitions = count === 100_000 ? 1 : count === 10_000 ? 3 : 5;
const warmup = count < 100_000;
let sessionCount = calendar.enumerateSessions(from, latest + minute, { maxSessions: 2_000 }).length;
let sourceSlotCount = 0;
let measurement;

switch (scenario) {
case "enumeration":
  measurement = measure(() => { sessionCount = createCalendar().enumerateSessions(from, latest + minute, { maxSessions: 2_000 }).length; }, repetitions, warmup);
  break;
case "expectedSlots":
  measurement = measure(() => { sourceSlotCount = createCalendar().expectedSourceTimes(from, latest + minute, minute, count + 1_000).length; if (sourceSlotCount === 0) throw new Error("Expected slots are empty"); }, repetitions, warmup);
  break;
case "coverageSlots":
  measurement = measure(() => { const coverage = createComparisonDatafeedCalendarCoverage(createCalendar(), minute, { maxGapIntervals: count + 1_000 }); sourceSlotCount = coverage.getExpectedTimes?.({ from, to: latest + minute }, minute).length ?? 0; if (sourceSlotCount === 0) throw new Error("Coverage slots are empty"); }, repetitions, warmup);
  break;
case "sessionAggregation":
  measurement = measure(() => assertResult(aggregateCandlesByTradingPeriod(candles, options(createCalendar(), "session", candles)), "session aggregation"), repetitions, warmup);
  break;
case "weekAggregation":
  measurement = measure(() => assertResult(aggregateCandlesByTradingPeriod(candles, options(createCalendar(), "week", candles)), "week aggregation"), repetitions, warmup);
  break;
case "monthAggregation":
  measurement = measure(() => assertResult(aggregateCandlesByTradingPeriod(candles, options(createCalendar(), "month", candles)), "month aggregation"), repetitions, warmup);
  break;
case "indicator":
  measurement = measure(() => { const result = calculateSessionIndicator(candles, { ...options(createCalendar(), "session", candles), indicatorId: "SMA", parameters: { period: 1 } }); if (result.outputs.length === 0) throw new Error("Session indicator output is empty"); }, repetitions, warmup);
  break;
case "previousLevels":
  measurement = measure(() => { const result = calculatePreviousSessionLevels(candles, options(createCalendar(), "session", candles)); if (result.points.length === 0) throw new Error("Previous levels are empty"); }, repetitions, warmup);
  break;
case "append": {
  const aggregator = createAggregator(createCalendar(), candles);
  const last = candles.at(-1);
  if (last === undefined) throw new Error("Last candle is missing");
  measurement = measure(() => { aggregator.update({ ...last, close: last.close + 0.01, high: last.high + 0.01 }); assertResult(aggregator.getResult(latest + minute), "append"); }, repetitions, warmup);
  aggregator.dispose();
  break;
}
case "correction": {
  const aggregator = createAggregator(createCalendar(), candles);
  const middle = candles[Math.floor(candles.length / 2)];
  if (middle === undefined) throw new Error("Midpoint candle is missing");
  measurement = measure(() => { aggregator.update({ ...middle, close: middle.close + 0.25, high: middle.high + 0.25 }); assertResult(aggregator.getResult(latest + minute), "correction"); }, repetitions, warmup);
  aggregator.dispose();
  break;
}
case "asOfSeek": {
  const aggregator = createAggregator(createCalendar(), candles);
  measurement = measure(() => { assertResult(aggregator.getResult(midpoint), "backward seek"); assertResult(aggregator.getResult(latest + minute), "forward seek"); }, repetitions, warmup);
  aggregator.dispose();
  break;
}
case "calendarReplacement": {
  const aggregator = createAggregator(createCalendar(), candles);
  measurement = measure(() => { aggregator.setCalendar(createCalendar("2026.2")); assertResult(aggregator.getResult(latest + minute), "calendar replacement"); aggregator.setCalendar(createCalendar()); }, repetitions, warmup);
  aggregator.dispose();
  break;
}
case "disposal":
  measurement = measure(() => { const aggregator = createAggregator(createCalendar(), candles); aggregator.dispose(); }, repetitions, warmup);
  break;
default:
  throw new Error(`Unknown calendar benchmark scenario: ${scenario}`);
}

console.log(JSON.stringify({ count, scenario, repetitions, warmup, measurement, sessionCount, sourceSlotCount, heapUsedBytes: process.memoryUsage().heapUsed }));
