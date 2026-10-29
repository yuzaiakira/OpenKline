# Phase 8.14.1 — Historical Completeness

Date: 2026-10-30

## Implementation

`ComparisonDatafeedController` now separates acquisition history from the
visible comparison window. When a baseline is configured with `maxAgeMs`, the
request lower bound is:

```text
min(window.from, max(0, baseline.time - baseline.maxAgeMs))
```

The subtraction is performed only on validated non-negative safe integers.
The upper bound remains exclusive. Raw OHLCV candles acquired solely to make a
baseline eligible remain in `getRawCandles()` and the comparison engine, while
`getNormalizedData()` emits only `[window.from, window.to)` points (and the
active replay cutoff).

Each asset can opt into a provider-neutral coverage policy. Fixed continuous
slots and session-aware expected-slot callbacks produce confirmed missing
intervals. Sparse, unknown, or insufficiently described schedules report
`uncertain`; weekends, holidays, and irregular calendars are not treated as
datafeed failures by inference.

Coverage is exposed in each asset status with requested/observed ranges,
missing intervals, calendar knowledge, completeness, and recovery flags.

## Deterministic evidence

- Baseline lookback regression: a visible range beginning at `1000` with a
  baseline at `1000` and maximum age `300` requests from `700`; raw history
  before the visible range is retained, while normalized output starts at
  `1000`.
- `maxAgeMs = 0`: requests the exact baseline boundary.
- Exclusive upper boundary: a candle at `to` is retained only when acquired
  by realtime storage, not emitted as visible history for `[from, to)`.
- Continuous coverage: a missing `1100` slot between `1000` and `1200` is
  reported as `[1100, 1200)`.
- Session coverage: an `isExpectedTime` policy excludes a known closed slot
  without reporting a missing candle.
- Unknown/sparse coverage: no fabricated gap or backfill request is produced.

Focused tests are in `tests/comparison-datafeed.test.ts`. The full Node suite
must be run sequentially with generated-build commands; the final Phase 8.14
report records the complete matrix.

## Status

Implemented and locally tested. External provider calendars and live market
completeness remain provider/application responsibilities and were not claimed
as verified in the restricted cloud environment.
