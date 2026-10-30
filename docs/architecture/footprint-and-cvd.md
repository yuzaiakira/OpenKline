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
