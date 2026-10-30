import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionAwareCandleAggregator,
  TradingCalendarEngine,
  aggregateCandlesByTradingPeriod,
  calculatePreviousSessionLevels,
  calculateSessionIndicator,
  mapSessionIndicatorToSourceTimes,
  mapSessionReferenceToSourceTimes,
  resolveTradingLocalDateTime,
  type Candle,
  type TradingCalendarDefinition,
} from "../src/index.js";

const hour = 3_600_000;

const utcCalendar = (overrides: Partial<TradingCalendarDefinition> = {}): TradingCalendarEngine => new TradingCalendarEngine({
  id: "utc-session-test",
  version: "1",
  timeZone: "UTC",
  weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:00", end: "16:00" }] })),
  ...overrides,
});

const candle = (time: number, value: number, volume = 10): Candle => ({ time, open: value, high: value + 2, low: value - 2, close: value + 1, volume });

function utcTime(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00.000Z`);
}

test("daily session aggregation honors half-open sessions, breaks, holidays, early closes, and causal as-of", () => {
  const calendar = utcCalendar({
    weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "16:00" }] })),
    exceptions: [
      { date: "2024-01-02", kind: "closed" },
      { date: "2024-01-03", kind: "modified", classification: "early-close", segments: [{ start: "09:00", end: "13:00" }] },
    ],
  });
  const first = [
    candle(utcTime("2024-01-01", "09:00"), 10),
    candle(utcTime("2024-01-01", "10:00"), 11),
    candle(utcTime("2024-01-01", "11:00"), 12),
    candle(utcTime("2024-01-01", "13:00"), 13),
    candle(utcTime("2024-01-01", "14:00"), 14),
    candle(utcTime("2024-01-01", "15:00"), 15),
    // The scheduled break is never expected and must not contribute.
    candle(utcTime("2024-01-01", "12:00"), 999),
  ];
  const early = [candle(utcTime("2024-01-03", "09:00"), 20), candle(utcTime("2024-01-03", "10:00"), 21), candle(utcTime("2024-01-03", "11:00"), 22), candle(utcTime("2024-01-03", "12:00"), 23)];
  const result = aggregateCandlesByTradingPeriod([...first, ...early], {
    sourceTimeframe: "1h",
    targetPeriod: "session",
    calendar,
    coveragePolicy: "fixed-duration",
    asOfTime: utcTime("2024-01-01", "11:00"),
  });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.tradingDates[0], "2024-01-01");
  assert.equal(result.observations[0]?.status, "forming");
  assert.deepEqual(result.observations[0]?.sourceTimes, [utcTime("2024-01-01", "09:00"), utcTime("2024-01-01", "10:00")]);
  assert.equal(result.observations[0]?.candle.high, 13);
  assert.equal(result.observations[0]?.candle.volume, 20);

  const complete = aggregateCandlesByTradingPeriod([...first, ...early], {
    sourceTimeframe: "1h",
    targetPeriod: "session",
    calendar,
    coveragePolicy: "fixed-duration",
    asOfTime: utcTime("2024-01-03", "14:00"),
  });
  assert.deepEqual(complete.observations.map((item) => item.tradingDates[0]), ["2024-01-01", "2024-01-03"]);
  assert.equal(complete.observations[0]?.candle.high, 17);
  assert.equal(complete.observations[1]?.periodEnd, utcTime("2024-01-03", "13:00"));
  assert.equal(complete.observations[1]?.availableAt, utcTime("2024-01-03", "13:00"));
  assert.equal(complete.observations[1]?.coverage, "complete");
  assert.equal(complete.observations[1]?.sourceCount, 4);
});

test("trading weeks and months group actual sessions rather than fixed UTC durations", () => {
  const calendar = utcCalendar({
    weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:00", end: "11:00" }] })),
  });
  const candles = [
    candle(utcTime("2024-01-02", "09:00"), 10), candle(utcTime("2024-01-02", "10:00"), 11),
    candle(utcTime("2024-01-03", "09:00"), 20), candle(utcTime("2024-01-03", "10:00"), 21),
    candle(utcTime("2024-01-31", "09:00"), 30), candle(utcTime("2024-01-31", "10:00"), 31),
    candle(utcTime("2024-02-01", "09:00"), 40), candle(utcTime("2024-02-01", "10:00"), 41),
  ];
  const asOf = utcTime("2024-02-02", "12:00");
  const weeks = aggregateCandlesByTradingPeriod(candles, { sourceTimeframe: "1h", targetPeriod: "week", calendar, coveragePolicy: "fixed-duration", asOfTime: asOf });
  assert.deepEqual(weeks.observations.map((item) => item.periodKey), ["2024-01-01", "2024-01-29"]);
  assert.deepEqual(weeks.observations[0]?.tradingDates, ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
  assert.equal(weeks.observations[0]?.candle.open, 10);
  assert.equal(weeks.observations[0]?.candle.close, 22);
  const months = aggregateCandlesByTradingPeriod(candles, { sourceTimeframe: "1h", targetPeriod: "month", calendar, coveragePolicy: "fixed-duration", asOfTime: asOf });
  assert.deepEqual(months.observations.map((item) => item.periodKey), ["2024-01", "2024-02"]);
  assert.equal(months.observations[0]?.tradingDates.includes("2024-01-31"), true);
  assert.equal(months.observations[1]?.periodEnd, utcTime("2024-02-29", "11:00"));
});

test("session indicators and previous-session levels remain causal and map by availability", () => {
  const calendar = utcCalendar({ weeklySchedule: [1, 2, 3].map((weekday) => ({ weekday, segments: [{ start: "09:00", end: "11:00" }] })) });
  const candles = [
    candle(utcTime("2024-01-01", "09:00"), 10), candle(utcTime("2024-01-01", "10:00"), 11),
    candle(utcTime("2024-01-02", "09:00"), 20), candle(utcTime("2024-01-02", "10:00"), 21),
    candle(utcTime("2024-01-03", "09:00"), 30), candle(utcTime("2024-01-03", "10:00"), 31),
  ];
  const asOf = utcTime("2024-01-02", "11:00");
  const indicator = calculateSessionIndicator(candles, { indicatorId: "SMA", parameters: { period: 2 }, sourceTimeframe: "1h", targetPeriod: "session", calendar, coveragePolicy: "fixed-duration", asOfTime: asOf });
  assert.deepEqual(indicator.outputs[0]?.points.map((point) => point.value), [null, 17]);
  const mapped = mapSessionIndicatorToSourceTimes(indicator, candles.map((item) => item.time), indicator.outputs[0]!.id);
  assert.equal(mapped.at(-1)?.value, null, "the source candle after the as-of frontier cannot see the next period");
  assert.equal(mapped.at(-1)?.availableAt, null);

  const reference = calculatePreviousSessionLevels(candles, { sourceTimeframe: "1h", targetPeriod: "session", calendar, coveragePolicy: "fixed-duration", asOfTime: utcTime("2024-01-03", "11:00") });
  assert.deepEqual(reference.points[0]?.levels, {});
  assert.deepEqual(reference.points[1]?.levels, { open: 10, high: 13, low: 8, close: 12 });
  assert.deepEqual(reference.points[2]?.levels, { open: 20, high: 23, low: 18, close: 22 });
  const mappedReference = mapSessionReferenceToSourceTimes(reference, candles.map((item) => item.time));
  assert.deepEqual(mappedReference[2]?.levels, { open: 10, high: 13, low: 8, close: 12 });
});

test("calendar replacement invalidates schedule caches and preserves correction/seek/disposal semantics", () => {
  const regular = utcCalendar({ id: "calendar-replace", weeklySchedule: [{ weekday: 1, segments: [{ start: "09:00", end: "16:00" }] }] });
  const shortened = utcCalendar({ id: "calendar-replace", version: "2", weeklySchedule: [{ weekday: 1, segments: [{ start: "09:00", end: "12:00" }] }] });
  const source = Array.from({ length: 7 }, (_, index) => candle(utcTime("2024-01-01", `${String(9 + index).padStart(2, "0")}:00`), index + 1));
  const aggregator = new SessionAwareCandleAggregator({ sourceTimeframe: "1h", targetPeriod: "session", calendar: regular, coveragePolicy: "fixed-duration", asOfTime: utcTime("2024-01-01", "16:00") });
  aggregator.setData(source);
  assert.equal(aggregator.getResult().observations[0]?.sourceCount, 7);
  aggregator.update({ ...source[2]!, close: 99, high: 100 });
  assert.equal(aggregator.getResult().observations[0]?.candle.high, 100);
  aggregator.setCalendar(shortened);
  const changed = aggregator.getResult();
  assert.equal(changed.calendar.version, "2");
  assert.equal(changed.observations[0]?.sourceCount, 3);
  assert.equal(changed.observations[0]?.status, "closed-complete");
  aggregator.setAsOfTime(utcTime("2024-01-01", "10:00"));
  assert.equal(aggregator.getResult().observations[0]?.status, "forming");
  aggregator.setAsOfTime(utcTime("2024-01-01", "16:00"));
  assert.equal(aggregator.getResult().observations[0]?.sourceCount, 3);
  aggregator.dispose();
  assert.throws(() => aggregator.getResult(), /disposed/);
});

test("session cursor falls back safely across sparse multi-year data gaps", () => {
  const calendar = utcCalendar({
    weeklySchedule: [{ weekday: 1, segments: [{ start: "09:00", end: "11:00" }] }],
  });
  const source = [
    candle(utcTime("2024-01-01", "09:00"), 10),
    candle(utcTime("2026-01-05", "09:00"), 20),
  ];
  const result = aggregateCandlesByTradingPeriod(source, {
    sourceTimeframe: "1h",
    targetPeriod: "session",
    calendar,
    coveragePolicy: "fixed-duration",
    asOfTime: utcTime("2026-01-05", "11:00"),
  });
  assert.deepEqual(result.observations.map((item) => item.tradingDates[0]), ["2024-01-01", "2026-01-05"]);
  assert.deepEqual(result.observations.map((item) => item.sourceCount), [1, 1]);
});

test("session aggregation uses real DST boundaries and never treats a holiday as a fake candle", () => {
  const calendar = new TradingCalendarEngine({
    id: "dst-session",
    version: "1",
    timeZone: "America/New_York",
    weeklySchedule: [{ weekday: 1, segments: [{ start: "09:30", end: "16:00" }] }],
  });
  const start = resolveTradingLocalDateTime({ date: "2024-03-11", time: "09:30" }, "America/New_York");
  const source = Array.from({ length: 6 }, (_, index) => candle(start + index * hour, index + 1));
  const result = aggregateCandlesByTradingPeriod(source, { sourceTimeframe: "1h", targetPeriod: "session", calendar, coveragePolicy: "fixed-duration", asOfTime: Date.parse("2024-03-11T20:00:00Z") });
  assert.equal(result.observations.length, 1);
  assert.equal(result.observations[0]?.periodEnd, Date.parse("2024-03-11T20:00:00Z"));
  const holiday = aggregateCandlesByTradingPeriod([candle(Date.parse("2024-03-12T13:30:00Z"), 9)], { sourceTimeframe: "1h", targetPeriod: "session", calendar, coveragePolicy: "fixed-duration", asOfTime: Date.parse("2024-03-12T20:00:00Z") });
  assert.equal(holiday.observations.length, 0);
});
