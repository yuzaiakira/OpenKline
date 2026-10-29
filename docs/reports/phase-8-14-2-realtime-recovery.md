# Phase 8.14.2 — Controlled Backfill and Realtime Recovery

Date: 2026-10-30

## Implementation

`ComparisonDatafeedController.backfill()` is an explicit recovery operation
that uses confirmed coverage gaps by default or caller-supplied ranges. It
supports bounded maximum ranges, attempts, concurrency, retry backoff,
`AbortSignal` cancellation, stale-generation checks, asset removal, and
controller disposal.

Recovered candles are validated and merged with deterministic last-write-wins
correction semantics. Realtime candles received while a history request is in
flight are tracked as authoritative for their timestamp, so an older recovery
response cannot overwrite a live correction. Raw OHLCV and normalized
comparison data remain separate, and recovery never creates candles for market
closures.

`DatafeedRealtimeSubscriptionArgs.onStatus` is an additive lifecycle signal;
the pre-existing `SubscribeBarsArgs` declaration is unchanged. The generic
`WebSocketDatafeed` emits connection, reconnection, disconnection, error, and
stop transitions. When a reconnect is observable, the comparison coordinator
requests a bounded recovery interval. Providers without lifecycle visibility
remain supported through explicit `backfill()` calls rather than guessed
disconnect detection.

## Deterministic evidence

- Gap recovery fills only the confirmed interval and restores complete
  coverage.
- A live correction arriving during recovery remains authoritative when the
  delayed history response contains an older candle.
- Cancellation and disposal return a cancelled result and prevent late data
  from resurrecting state.
- WebSocket fixture tests verify `connecting`, `connected`, `disconnected`,
  `reconnected`, and `stopped` lifecycle notifications alongside bounded
  reconnect and cleanup.

## Status

Implemented and locally tested with injected transports. Actual provider
disconnect behavior is covered at the generic WebSocket adapter contract; live
external connectivity is not claimed for this cloud environment.
