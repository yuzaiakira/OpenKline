# Market sessions architecture

Phase 11 adds session scheduling as a separate foundation beneath calendar-aware
analytics. The existing fixed-duration `CausalTimeframeAggregator` remains the
source of truth for UTC `m`, `h`, and `D` durations. A host explicitly supplies
a `TradingCalendarEngine` when it wants trading-session semantics.

```text
versioned calendar definition
    -> IANA local-time resolver
    -> resolved UTC sessions and segments
    -> expected-slot adapter / session aggregation
    -> existing Indicator Registry and Chart replay boundary
```

The calendar engine owns schedule facts, not market data. It stores no candles,
does not call a holiday service, and does not infer future prices. The
`TradingCalendarSnapshot` identifies the calendar ID, version, timezone,
trading-date convention, and validity range used by a consumer. Historical
analysis must keep that snapshot separate from the as-of market-data frontier:
a future scheduled session is not future OHLCV, and a revised schedule is not
evidence that the revision was known at the historical analysis time.

## Resolved session invariants

Each resolved session has deterministic identity, local trading date, UTC
`start`/`end`, classification, schedule version, and ordered segments. The
outer session uses `[start, end)` and segments are non-overlapping. Gaps between
segments are explicit breaks. A timestamp in a break may belong to the outer
session for context, but it is not an expected open source interval. A source
candle is expected only when its entire interval lies inside one segment.

Resolution validates IANA timezone identifiers, civil dates, wall-clock values,
segment ordering, overlap, exceptions, and validity ranges. Ambiguous or
nonexistent DST times are never silently guessed. Bounded enumeration and
versioned registry lookup keep calendar work deterministic.

## Exceptions and coverage

Weekly templates define only regular schedule intent. Exceptions replace or
remove that intent for a declared local date. A closed date produces no
session; a modified date produces only the declared segments. This lets
coverage consumers distinguish an expected open slot, a scheduled break, a
known closure, an unsupported validity range, and an actually missing provider
observation. Unknown schedule coverage remains uncertainty, not a provider
outage claim.

## Session-aware aggregation boundary

`SessionAwareCandleAggregator` consumes resolved session units and reuses the
current OHLCV reducer, missing-volume policies, Indicator Registry, as-of
eligibility, and disposal contracts. It groups explicit session, trading-week,
or trading-month observations and retains the complete source store so
backward/forward seeking and corrections remain deterministic. Its internal
index keeps source timestamps, period membership, sorted period times, and
reduction state separately. Appends to the sorted stream update the active
period in constant time; corrections and out-of-order inserts invalidate only
the affected period reduction and use a deterministic rebuild on the next
snapshot. A calendar replacement clears resolved-session and expected-slot
caches before rebuilding dependent output.

Chart-owned session indicators and references use a private persistent runtime
around this aggregator. Ordinary realtime bars update the source index without
materializing all session observations or remapping every source timestamp.
The runtime publishes a new result when an available period changes, when a
causal frontier crosses a session boundary, or when a consumer explicitly asks
for a snapshot. Indicator calculations still run through the existing
`IndicatorRegistry`; no second indicator-math implementation is introduced.

Datafeed recovery uses `isExpectedSourceInterval` and `expectedSourceTimes`
instead of duplicating local timezone calculations.
`createComparisonDatafeedCalendarCoverage` supplies those schedule-aligned
openings to comparison coverage and bounded backfill. It never treats a break,
holiday, or early close as an outage, and it returns uncertain coverage when a
bounded schedule query cannot be trusted. Chart overlays can enumerate only
the bounded visible range and render UTC coordinates with localized labels.
Calendar configuration is serializable by ID/version; executable callbacks and
resolved caches are runtime-only.

The illustrative calendar is intentionally labelled as a demo fixture. Hosts
remain responsible for supplying a verified market schedule, its source, and
the historical validity/version policy appropriate to their application.
