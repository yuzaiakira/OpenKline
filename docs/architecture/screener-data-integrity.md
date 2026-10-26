# Screener Data Integrity

Snapshot acquisition is provider-driven and bounded. The screener requests one explicit timeframe, follows provider cursors only within `maxPagesPerInstrument`, and passes an `AbortSignal` to every page. Universe and rule validation happen before the first `resolveInstrument` call.

Each returned bar is validated with the chart engine's OHLCV validator. Confirmed and developing bars are distinct; the default snapshot includes confirmed bars only. Duplicate timestamps are merged deterministically, preferring the higher provider revision and then the later receive time. The final history is sorted and validated again, so out-of-order pages cannot enter indicator evaluation.

One symbol's provider failure produces an unavailable result with an explicit `provider-error` diagnostic. It does not erase other symbols. Strict mode can turn unavailable results into a failed job when the caller requires all symbols. Cancellation throws `ScreenerSnapshotCancellationError`; a partial result is never returned as completed.

Results preserve instrument identity, selected timeframe, rule-set ID, generation, source bar time/revision, match state, data status, values, and diagnostics in a stable result ID. Reproducibility therefore depends on the provider's data and explicit evaluation inputs; wall-clock evaluation time is caller-controlled when deterministic output is required.

## Incremental watch state

`ScreenerWatchSession` owns one bounded bar cache and one `IndicatorInstance` per referenced indicator for each instrument. A confirmed append updates those instances through the existing incremental API and evaluates only the affected cache. A correction, out-of-order event, or cache trim resets that instrument's instances from its validated bars. Duplicate revisions are suppressed. Subscription cleanup and indicator disposal are idempotent, and a provider error is surfaced without fabricating a market event or changing unrelated instruments.

