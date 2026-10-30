# Multi-timeframe analysis

OpenKline provides a provider-neutral, causal engine for deriving fixed UTC
timeframes from a lower-timeframe candle stream. The public functions are
exported from the package root:

```ts
import {
  aggregateCandlesByTimeframe,
  calculateMultiTimeframeIndicator,
  calculatePreviousTimeframeLevels,
} from "openkline";
```

## Supported timeframe contract

`1m`, `5m`, `1h`, and `1D`-style fixed durations are supported. The target
must be larger than the source and an integer multiple of it. Weekly, monthly,
exchange-session, and provider-specific intervals are rejected because the
core library cannot infer their calendar semantics.

Buckets use UTC `[start, end)` boundaries:

```text
bucketStart = floor(sourceTimestamp / targetDuration) * targetDuration
bucketEnd   = bucketStart + targetDuration
```

The engine accepts candles in any order and applies the last occurrence of a
timestamp as a correction. It never synthesizes missing candles. Aggregated
OHLC uses the first open, highest high, lowest low, and last close of observed
source candles. Volume behavior is explicit through `missingVolumePolicy`:
`ignore` (default), `zero`, or `unknown`.

## Coverage and causality

`coveragePolicy: "unknown"` is the safe default. Closed buckets are then
reported as `closed-uncertain`; the library does not claim that an exchange
session was complete. `coveragePolicy: "fixed-duration"` checks all expected
source slots for the fixed ratio. An application that owns a session calendar
may provide a `TimeframeCalendar` and must document that calendar itself.

`asOfTime` is the source-data availability frontier. A source candle opening at
`t` is considered finalized by the core only when
`t + sourceDurationMs <= asOfTime`; a candle at its opening timestamp is still
forming. This is deliberately conservative because the provider-neutral core
does not invent exchange finality metadata. A target bucket cannot be
available before its target end. `finalityPolicy: "time-closed"` allows a
closed partial/uncertain observation with its status preserved. Use
`"complete-only"` when downstream logic must wait for complete coverage.
Forming observations have `availableAt: null`.

As-of results contain only buckets with at least one eligible source candle.
Within a forming bucket, `candle`, `sourceTimes`, `sourceCount`, volume, and
coverage are calculated from eligible source candles only. Future stored source
candles remain in the aggregator for later forward seeking, but cannot change
an earlier snapshot. The indicator and reference results carry the same
`asOfTime`, and their source-time mapping returns unavailable values after that
frontier.

`CausalTimeframeAggregator` supports `setData`, append/correction/out-of-order
`update`, `setAsOfTime`, and disposal. `update` only replaces the affected
source bucket; result construction remains deterministic and defensively
copies data.

## Higher-timeframe indicators and levels

`calculateMultiTimeframeIndicator` aggregates first, then invokes the existing
`IndicatorRegistry` for SMA, EMA, RSI, or another registered indicator. It
preserves indicator warm-up nulls and attaches `bucketStart`, `bucketEnd`,
`availableAt`, coverage, and finality metadata to every output point.

`mapMultiTimeframeIndicatorToSourceTimes` is an as-of mapping helper. It only
returns an output value when the output's `availableAt` is no later than the
source timestamp, so it cannot introduce lookahead into a lower-timeframe
chart or replay.

`calculatePreviousTimeframeLevels` exposes the previous eligible target
period's OHLC levels. The current forming period is never used as its own
reference. `mapMultiTimeframeReferenceToSourceTimes` applies the same
availability rule to source timestamps.

The chart and workspace integrations build on these contracts. They persist
configuration, not derived buckets or calendar callbacks. See
`docs/architecture/multi-timeframe-analysis.md` for lifecycle details.
