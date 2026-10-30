# Multi-timeframe analysis architecture

Phase 10 uses a single provider-neutral path for historical data, realtime
corrections, datafeed replacement, and replay:

```text
source candles
    -> CausalTimeframeAggregator (UTC buckets + coverage/finality)
    -> existing IndicatorRegistry (SMA/EMA/RSI or registered definitions)
    -> as-of mapping (availableAt <= source time)
    -> chart series / reference overlays
```

The aggregator stores source timestamps by value, so duplicate timestamps are
corrections and out-of-order events are normalized before aggregation. It does
not create bars for missing slots. A source candle is eligible at an as-of
frontier only after its source interval has ended (`sourceTime + sourceDuration
<= asOfTime`). A target bucket is `forming` until its end is at or before the
`asOfTime` frontier. The default unknown coverage policy
deliberately reports closed buckets as uncertain unless the application
provides fixed-duration or explicit calendar semantics.

The aggregator keeps complete source history separately from the eligible
historical view. `getResult(asOfTime)` filters source timestamps before OHLCV,
coverage, source counts, missing counts, or availability metadata are built.
Buckets with no eligible source observation are omitted rather than represented
by fabricated non-finite candles. This makes repeated backward and forward
seeking deterministic without reloading or mutating the source store.

Chart integration must recalculate from the replay-visible primary candle set.
That makes replay a strict no-lookahead boundary: future source candles are not
present in the aggregator and a higher-timeframe value is not mapped before its
`availableAt`. Workspace documents store only serializable analysis options;
aggregated candles, derived indicator points, and calendar functions are
runtime state.

The existing ChartModel owns time scales, panes, viewport, and primary data.
Multi-timeframe series are managed derived series and reuse that model rather
than introducing a second renderer, scale, or interaction system. Reference
levels use the existing overlay render path and are removed with their owning
chart. All public APIs remain additive and version-1 workspaces without
multi-timeframe state remain valid.
