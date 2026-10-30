# Trading calendars

OpenKline exposes a provider-neutral `TradingCalendarEngine` for schedules
whose trading sessions do not align with fixed UTC durations. The engine is
framework-independent and does not fetch or assert an authoritative exchange
holiday calendar. Hosts provide a versioned `TradingCalendarDefinition`.

```ts
import { TradingCalendarEngine } from "openkline";

const calendar = new TradingCalendarEngine({
  id: "demo-market",
  version: "2026.1",
  timeZone: "America/New_York",
  dstDisambiguation: "reject",
  weeklySchedule: [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    segments: [{ start: "09:30", end: "16:00" }],
  })),
  exceptions: [
    { date: "2026-01-01", kind: "closed" },
    {
      date: "2026-11-27",
      kind: "modified",
      classification: "early-close",
      segments: [{ start: "09:30", end: "13:00" }],
    },
  ],
});

const session = calendar.resolveSession("2026-11-27");
const previous = calendar.findPreviousCompletedSession(Date.now());
const sessions = calendar.enumerateSessions(from, to, { maxSessions: 500 });
```

## Definition contract

`id` and `version` identify the schedule snapshot. `timeZone` must be an IANA
identifier. `weeklySchedule` uses JavaScript weekdays (`0` Sunday through `6`
Saturday) and contains one or more ordered local-time segments. A segment is a
half-open interval `[start, end)`. An end at or before its start rolls to the
next local day unless `endDayOffset` is supplied. `startDayOffset` and
`endDayOffset` support overnight and multi-day session templates explicitly.

An omitted weekday is closed; it does not create a missing-data expectation.
`closed` exceptions suppress the regular session. A `modified` exception
replaces the regular segments and can represent a late open, early close,
special session, or scheduled break. Breaks are the gaps between resolved
segments. A full holiday never creates a zero-volume candle.

`validity` is an inclusive local trading-date range. Queries outside that range
return no session and `coverageForDate()` reports `outside-validity`; the engine
does not fabricate a schedule outside its declared coverage. Use
`TradingCalendarRegistry` to retain multiple explicit versions and select the
version appropriate to a historical analysis.

## IANA timezone and DST policy

All resolved session boundaries are UTC millisecond instants, while schedule
inputs are local civil times. The engine never adds a fixed timezone offset and
does not assume that a local day is 24 hours. During a spring transition, a
nonexistent local time is rejected. During an autumn transition, an ambiguous
local time is rejected unless the definition explicitly selects `earlier` or
`later` through `dstDisambiguation`. Hosts should retain the calendar version
and policy used for a historical result.

The session's `tradingDate` is the declared local schedule date and may differ
from the UTC date of either boundary. Overnight sessions remain associated with
their declared trading date. Session and segment IDs are deterministic:
`<calendar>@<version>:<tradingDate>` and numbered segment/break suffixes.

## Queries and expected slots

The engine provides bounded queries for containing sessions and segments,
previous completed sessions, next scheduled sessions, session enumeration,
session boundaries, and calendar coverage. `maxSessions` and `maxDays` prevent
unbounded work. `isExpectedSourceInterval(time, durationMs)` returns true only
when the complete source interval is inside one open segment; scheduled breaks,
closed dates, and overnight gaps therefore do not become false missing slots.

`toTimeframeCalendar()` adapts a resolved calendar to the existing Phase 10
`TimeframeCalendar` contract. The original fixed-duration UTC engine remains
unchanged; session-aware aggregation selects a calendar explicitly and does
not reinterpret an existing `1D` as a trading day.

`createIllustrativeWeekdayCalendar()` is a deterministic offline fixture for
tests and Studio. Its schedule is demonstrative, not an authoritative current
exchange calendar.
