# ADR 011: preserve raw OHLCV under Heikin–Ashi rendering

## Status

Accepted for Phase 7.0.3.

## Context

Heikin–Ashi candles depend on earlier derived values. Replacing stored market
candles with transformed values would corrupt indicator input, workspace data,
financial drawing anchors, corrections, and user expectations about `getData`.

## Decision

Store validated raw OHLCV for `heikin-ashi` just as for other candle types.
Derive display candles from the complete raw sequence immediately before the
visible time slice. Public data access and indicator input remain raw.

## Consequences

Panning preserves HA continuity and historical corrections deterministically
recompute later derived bars. The display conversion has no bearing on
financial calculations. This intentionally favors correctness over a separate
transformed-data cache; cache design can be measured independently if a future
profiling run identifies it as a bottleneck.
