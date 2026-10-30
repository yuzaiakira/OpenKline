# Unified market replay architecture

The Phase 15 replay path is an optional research layer beside the existing
bar replay path:

```text
validated provider records
        -> versioned MarketReplayTape
        -> clock projection (event-time or receive-time)
        -> deterministic cursor
        -> causal state accumulator
        -> Chart/Studio consumers
```

`ReplayEngine` and `Chart.createReplay()` remain compatible and continue to
own inclusive candle-prefix presentation. `MarketReplayController` owns a
separate strict historical frontier for multi-stream research. A consumer can
therefore preserve legacy chart behavior while using strict completion and
availability semantics for strategies and order-flow inspection.

At each cursor the accumulator maintains completed candles, opening/forming
candle metadata, latest eligible trade revisions, CVD, bounded Footprint
cells, per-stream `OrderBookController` state, corporate-action frontiers,
session boundaries, and source coverage. All public values are defensive
copies. No execution or broker model is present.

## Causality

Opening events expose only the opening price in the public forming-candle
view. Final OHLCV is exposed only after a validated completion event. A trade
revision replaces an earlier stable trade only when its revision event is
eligible at the current cursor. A receive-time replay therefore does not let a
later correction rewrite an earlier observer's knowledge.

Level-2 events are delegated to the existing sequenced `OrderBookController`.
Snapshots establish state; deltas must satisfy source sequence semantics. A
gap moves a stream to stale/recovering state until a valid replacement snapshot
is accepted. The replay layer reports the gap even after recovery.

The controller has no global singleton and does not mutate a live Chart
datafeed. Chart attachment can be added by a host, but a stale live
subscription must remain unable to write into historical replay state.

Sequenced source order is preserved even when the selected clock is not
monotonic for that stream. In that case the controller marks integrity as
uncertain and timestamp seeking uses a conservative eligible prefix rather
than applying a later record whose clock is known to be beyond the requested
frontier. This preserves no-lookahead semantics while making the chronology
limitation visible to the consumer.

## Multi-instrument behavior

One controller can project events for several instruments under one clock.
Each event remains eligible according to its own timestamp and source. A
missing source or a closed session is represented by coverage/state metadata;
the controller does not synthesize candles, trades, or liquidity so that panels
appear synchronized.
