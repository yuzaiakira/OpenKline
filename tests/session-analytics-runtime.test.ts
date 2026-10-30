import assert from "node:assert/strict";
import test from "node:test";
import {
  SessionIndicatorRuntime,
  SessionReferenceRuntime,
} from "../src/session-analytics-runtime.js";
import {
  calculatePreviousSessionLevels,
  calculateSessionIndicator,
} from "../src/session-aggregation.js";
import { TradingCalendarEngine } from "../src/trading-calendar.js";
import type { Candle } from "../src/types.js";

function calendar(): TradingCalendarEngine {
  return new TradingCalendarEngine({
    id: "runtime-test-calendar",
    version: "1",
    timeZone: "UTC",
    weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:00", end: "11:00" }] })),
  });
}

function time(date: string, hourOfDay: number): number {
  return Date.parse(`${date}T${String(hourOfDay).padStart(2, "0")}:00:00.000Z`);
}

function candle(timestamp: number, value: number): Candle {
  return { time: timestamp, open: value, high: value + 2, low: value - 1, close: value + 1, volume: 10 };
}

test("session indicator runtime keeps forming updates incremental and matches a fresh snapshot", () => {
  const market = calendar();
  const options = {
    indicatorId: "SMA",
    parameters: { period: 1 },
    sourceTimeframe: "1h",
    targetPeriod: "session" as const,
    calendar: market,
    coveragePolicy: "fixed-duration" as const,
  };
  const first = candle(time("2024-01-01", 9), 10);
  const second = candle(time("2024-01-01", 10), 11);
  const runtime = new SessionIndicatorRuntime(options);
  runtime.setData([first], time("2024-01-01", 10));
  assert.equal(runtime.update(second, time("2024-01-01", 10)), false, "a forming session must not force a full chart snapshot");
  assert.deepEqual(runtime.getResult(), calculateSessionIndicator([first, second], { ...options, asOfTime: time("2024-01-01", 10) }));
  const corrected = { ...second, high: 21, close: 20 };
  assert.equal(runtime.update(corrected, time("2024-01-01", 11)), true, "session close must publish newly available output");
  const expected = calculateSessionIndicator([first, corrected], { ...options, asOfTime: time("2024-01-01", 11) });
  assert.deepEqual(runtime.getResult(), expected);
  runtime.dispose();
  assert.throws(() => runtime.getResult(), /disposed/);
});

test("session reference runtime preserves causal levels through corrections and disposal", () => {
  const market = calendar();
  const options = {
    sourceTimeframe: "1h",
    targetPeriod: "session" as const,
    calendar: market,
    coveragePolicy: "fixed-duration" as const,
    levels: ["open", "high", "low", "close"] as const,
  };
  const first = [candle(time("2024-01-01", 9), 10), candle(time("2024-01-01", 10), 11)];
  const next = candle(time("2024-01-02", 9), 20);
  const runtime = new SessionReferenceRuntime(options);
  runtime.setData(first, time("2024-01-01", 11));
  assert.equal(runtime.update(next, time("2024-01-02", 10)), false, "the next forming session does not alter the previous level");
  const corrected = { ...first[1]!, high: 99 };
  assert.equal(runtime.update(corrected, time("2024-01-02", 10)), true, "a correction to an available source period must refresh");
  const expected = calculatePreviousSessionLevels([...first.slice(0, 1), corrected, next], { ...options, asOfTime: time("2024-01-02", 10) });
  assert.deepEqual(runtime.getResult(), expected);
  runtime.dispose();
});
