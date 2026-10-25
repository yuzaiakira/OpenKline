# ADR 010: use elapsed-UTC adaptive time ticks

## Status

Accepted for Phase 7.0.2.

## Context

The renderer previously displayed only the first, middle, and last timestamp.
That did not respond to chart width, zoom level, intraday data, or multi-year
ranges. Fixed timezone offsets would also mislabel daylight-saving boundaries.

## Decision

`TimeScale` owns an interval-selection and tick-generation contract over the
visible UTC range. It chooses bounded candidates from milliseconds to years,
aligns them in UTC, and formats them through `Intl` using the requested named
timezone. Canvas performs a final measured-label overlap pass.

## Consequences

The same elapsed-time coordinate contract serves renderer and interactions.
Timezone changes are display-only and respect DST. The design intentionally
does not flatten weekends or introduce exchange/session calendars; those need
market metadata and a separately approved scope.
