# Time axis

OpenKline stores every timestamp as an integer UTC Unix millisecond. The
`TimeScale` maps the actual elapsed range between the first and last visible
timestamps to pixels; it never rewrites source data for a display timezone.

## Adaptive ticks

`TimeScale.getTicks({ locale, timeZone, minimumLabelSpacing? })` chooses a
bounded interval from milliseconds through years according to the elapsed range
and horizontal pixel width. It returns the visible endpoints plus aligned
candidates. Canvas then measures each formatted label and suppresses overlap,
including in RTL layouts where visual x order is reversed. This keeps narrow
views readable while exposing more labels as width or zoom permits.

Intervals are UTC-aligned for deterministic geometry: sub-second, second,
minute, hour, day, week, month, and year candidates advance by their matching
UTC calendar operation. Month/year candidates use UTC calendar arithmetic, not
a fixed 30-day approximation. Approximate duration is used only to choose a
candidate density.

## Locale, timezones, and DST

Labels are formatted with `Intl.DateTimeFormat(locale, { timeZone })` at
rendering time. Named zones therefore follow runtime timezone rules, including
daylight-saving jumps; the underlying UTC tick values and x positions remain
unchanged. The test fixture covers New York's 2024 spring transition, where
06:30 UTC formats as 1:30 AM and 07:30 UTC as 3:30 AM rather than inventing a
fixed offset or a 2:30 AM local time.

## Financial-time semantics

The current axis represents actual elapsed UTC time. Ordered trading bars may
be sparse because markets close, feeds omit intervals, or a symbol has no
trade; a gap is therefore visible as elapsed time. It is deliberately not a
bar-index axis and does not infer exchange sessions, holidays, or early closes.

Session-aware labeling requires an explicit exchange-calendar design and is
not part of Phase 7.0. Applications that need session semantics can preserve
them in datafeed metadata without changing the chart's timestamp contract.
