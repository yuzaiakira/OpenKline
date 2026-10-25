# ADR 006: KlineScript time-series semantics

Status: accepted for Phase 4 v0.1.

Bars are the validated, strictly ascending UTC-millisecond candles owned by
OpenKline. A series is aligned one value per input bar; historical index `n`
reads `current - n`, with missing values before the beginning. Full execution
is the reference behavior for append, current-bar replacement, and historical
correction. Sessions are not inferred from timestamps and no session intrinsic
is exposed in v0.1.

