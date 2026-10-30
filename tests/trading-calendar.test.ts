import assert from "node:assert/strict";
import test from "node:test";
import {
  TradingCalendarEngine,
  TradingCalendarRegistry,
  createIllustrativeWeekdayCalendar,
  resolveTradingLocalDateTime,
  toTimeframeCalendar,
  tradingDateForTimestamp,
  type TradingCalendarDefinition,
} from "../src/index.js";

const weekdayCalendar = (overrides: Partial<TradingCalendarDefinition> = {}): TradingCalendarDefinition => ({
  id: "test-market",
  version: "1",
  timeZone: "America/New_York",
  dstDisambiguation: "reject",
  weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, segments: [{ start: "09:30", end: "16:00" }] })),
  ...overrides,
});

test("resolves weekday sessions in IANA time and follows DST without fixed UTC offsets", () => {
  const calendar = new TradingCalendarEngine(weekdayCalendar());
  const beforeDst = calendar.resolveSession("2024-03-08");
  const afterDst = calendar.resolveSession("2024-03-11");
  assert.ok(beforeDst);
  assert.ok(afterDst);
  assert.equal(new Date(beforeDst.start).toISOString(), "2024-03-08T14:30:00.000Z");
  assert.equal(new Date(afterDst.start).toISOString(), "2024-03-11T13:30:00.000Z");
  assert.equal(afterDst.end - afterDst.start, 6.5 * 60 * 60 * 1000);
  assert.equal(tradingDateForTimestamp(afterDst.start, "America/New_York"), "2024-03-11");
});

test("supports holidays, early closes, late opens, split sessions, and expected intervals", () => {
  const calendar = new TradingCalendarEngine(weekdayCalendar({
    exceptions: [
      { date: "2024-07-04", kind: "closed" },
      { date: "2024-07-03", kind: "modified", classification: "early-close", segments: [{ start: "09:30", end: "13:00" }] },
      { date: "2024-07-05", kind: "modified", classification: "late-open", segments: [{ start: "11:00", end: "16:00" }] },
    ],
  }));
  assert.equal(calendar.resolveSession("2024-07-04"), null);
  assert.equal(calendar.resolveSession("2024-07-03")?.classification, "early-close");
  assert.equal(calendar.resolveSession("2024-07-03")?.end, Date.parse("2024-07-03T17:00:00.000Z"));
  assert.equal(calendar.resolveSession("2024-07-05")?.classification, "late-open");

  const split = new TradingCalendarEngine(weekdayCalendar({
    id: "split-market",
    weeklySchedule: [{ weekday: 1, segments: [{ id: "morning", start: "09:00", end: "12:00" }, { id: "afternoon", start: "13:00", end: "16:00" }] }],
  }));
  const session = split.resolveSession("2024-01-01");
  assert.ok(session);
  assert.equal(session.segments.length, 2);
  assert.equal(session.breaks.length, 1);
  assert.equal(split.isExpectedSourceInterval(Date.parse("2024-01-01T17:30:00.000Z"), 30 * 60 * 1000), false);
  assert.equal(split.isExpectedSourceInterval(Date.parse("2024-01-01T20:30:00.000Z"), 30 * 60 * 1000), true);
  const adapter = toTimeframeCalendar(split);
  assert.equal(adapter.isExpectedSourceTime(Date.parse("2024-01-01T17:30:00.000Z")), false);
});

test("assigns overnight sessions to their declared trading date", () => {
  const calendar = new TradingCalendarEngine({
    id: "overnight-market",
    version: "1",
    timeZone: "Asia/Tokyo",
    weeklySchedule: [{ weekday: 1, segments: [{ start: "22:00", end: "02:00" }] }],
  });
  const session = calendar.resolveSession("2024-01-01");
  assert.ok(session);
  assert.equal(new Date(session.start).toISOString(), "2024-01-01T13:00:00.000Z");
  assert.equal(new Date(session.end).toISOString(), "2024-01-01T17:00:00.000Z");
  assert.equal(calendar.findSessionContaining(Date.parse("2024-01-01T16:59:59.000Z"))?.tradingDate, "2024-01-01");
  assert.equal(calendar.findSessionContaining(Date.parse("2024-01-01T17:00:00.000Z")), null);
});

test("rejects ambiguous and nonexistent local clocks unless the host selects a policy", () => {
  assert.throws(() => resolveTradingLocalDateTime({ date: "2024-03-10", time: "02:30" }, "America/New_York"), /Nonexistent/);
  assert.throws(() => resolveTradingLocalDateTime({ date: "2024-11-03", time: "01:30" }, "America/New_York"), /Ambiguous/);
  const earlier = resolveTradingLocalDateTime({ date: "2024-11-03", time: "01:30" }, "America/New_York", "earlier");
  const later = resolveTradingLocalDateTime({ date: "2024-11-03", time: "01:30" }, "America/New_York", "later");
  assert.equal(new Date(earlier).toISOString(), "2024-11-03T05:30:00.000Z");
  assert.equal(new Date(later).toISOString(), "2024-11-03T06:30:00.000Z");
});

test("bounds queries, validity, previous/next sessions, and registry versions", () => {
  const calendar = new TradingCalendarEngine(weekdayCalendar({ validity: { from: "2024-01-01", to: "2024-01-31" } }));
  assert.equal(calendar.coverageForDate("2023-12-29").status, "outside-validity");
  assert.equal(calendar.coverageForDate("2024-01-06").status, "supported");
  assert.equal(calendar.coverageForDate("2024-01-06").session, null);
  const monday = calendar.resolveSession("2024-01-08")!;
  const previous = calendar.findPreviousCompletedSession(monday.start + 1);
  assert.equal(previous?.tradingDate, "2024-01-05");
  assert.equal(calendar.findNextScheduledSession(previous!.end)?.tradingDate, "2024-01-08");
  assert.equal(calendar.enumerateSessions(Date.parse("2024-01-01T00:00:00Z"), Date.parse("2024-01-10T00:00:00Z")).length, 7);
  assert.throws(() => calendar.enumerateSessions(0, Date.parse("2030-01-01T00:00:00Z"), { maxSessions: 1 }), /bounded/);

  const registry = new TradingCalendarRegistry();
  registry.register(calendar);
  registry.register({ ...weekdayCalendar(), version: "2" });
  assert.equal(registry.get("test-market", "1"), calendar);
  assert.equal(registry.get("test-market")?.version, "2");
  assert.deepEqual(registry.list().map((entry) => entry.version), ["1", "2"]);
  assert.throws(() => registry.register(calendar), /already registered/);
});

test("illustrative calendar is explicitly deterministic and non-authoritative", () => {
  const definition = createIllustrativeWeekdayCalendar();
  const calendar = new TradingCalendarEngine(definition);
  assert.equal(definition.id, "illustrative-weekday-market");
  assert.equal(calendar.resolveSession("2026-01-01"), null);
  assert.equal(calendar.resolveSession("2026-11-27")?.classification, "early-close");
});
