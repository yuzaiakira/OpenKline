# Trade-derived Footprint and CVD

Footprint and CVD consume `MarketTrade` records only. They do not transform
OHLCV candles into fake executions and do not use candle colour to assign
aggressor direction. `buy` and `sell` quantities contribute to signed delta;
`unknown` quantities remain unsigned and are reported separately. Estimated
classification is excluded by default and can be included only through an
explicit option.

Intervals use half-open `[from, to)` event-time boundaries. Stable trade IDs
and revisions are deduplicated before aggregation. CVD observations retain
buy, sell, unknown, delta, coverage, and session identity metadata. Continuous
CVD carries its value forward; session-reset CVD resets only when an explicit
`TradingCalendarEngine` reports a new real session. A missing calendar never
creates a naive UTC-midnight boundary.

Footprint cells use actual execution prices and a required tick size. The
default off-tick policy rejects a print; `round` and `allow` are explicit host
choices. Each bucket/cell exposes buy, sell, unknown, total, count, delta, and
coverage. This is distinct from the existing OHLCV range-estimated Volume
Profile and must not be described as exhaustive when source coverage is
partial or unknown.

## Presentation performance

The chart separates analytical truth from display resolution. A large visible
Footprint window uses a deterministic time/price pixel grid that conserves
buy, sell, and unknown volume in aggregated display bins; smaller windows use
the exact cell result. Price and time culling occurs before command emission,
and off-tick validation remains explicit. The public calculation functions and
`getOrderFlowState` continue to return exact bounded analytics rather than the
display LOD.

The stateful CVD calculator handles chronological appends in-place at the
affected bucket. Corrections and out-of-order trades intentionally take the
reference rebuild path because downstream cumulative values can change. The
Canvas2D renderer independently reduces dense line paths to deterministic
first/minimum/maximum/last samples per pixel column; this is a rendering
optimization only and does not discard stored observations.

The stateful Footprint calculator applies the same invalidation rule to the
latest time bucket. A chronological append updates an existing price cell or
adds a bounded new cell/bucket; any event that could alter an earlier bucket
rebuilds from the canonical trade store. This keeps the public Footprint result
bit-for-bit aligned with `calculateFootprint` while avoiding repeated full
aggregation during a live append stream.
