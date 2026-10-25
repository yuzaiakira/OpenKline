# Alert Evaluation Semantics

This document is normative for the Phase 7.2 alert implementation.

## Values and timestamps

- A candle timestamp is the UTC Unix-millisecond `candle.time` value already
  used by OpenKline.
- Numeric comparisons require finite values. `null` and missing warm-up values
  do not match thresholds or crossings.
- An output snapshot with a `time` must equal the evaluation candle timestamp.
  Mismatched snapshots are ignored by the input map and become an unavailable
  output diagnostic if a rule references them.
- A boolean script value matches only `true` for `script-true`; it is not
  coerced from numbers or strings.

## Comparisons and crossings

`above` means `current > threshold`; `below` means `current < threshold`.
Equality never satisfies either strict comparison. A crossing above is
`previous <= threshold && current > threshold`; a crossing below is
`previous >= threshold && current < threshold`. Pair crossings use the same
rules after comparing left and right values. The first valid observation warms
state and cannot cross because there is no previous observation.

## Source events and corrections

`seed` warms a rule without emitting. `append` evaluates a new ordered bar.
`correction` and out-of-order timestamps update the latest ordered observation
only when they are not older than the current observation and do not emit.
An equivalent same-timestamp update is therefore deduplicated. Historical
corrections do not replay a historical notification automatically; an
application can explicitly reset and rebuild a deterministic prefix when that
behavior is desired.

OpenKline never infers bar finality. `once-per-confirmed-bar` emits only when
the caller passes `isFinal: true`; a missing flag is not treated as final.

## Frequency and cooldown

- `once`: one event per rule/runtime for the lifetime of that runtime.
- `every-event`: every matching ordered observation, subject to event-ID
  deduplication and cooldown.
- `once-per-bar`: at most one event for a timestamp.
- `once-per-confirmed-bar`: at most one final event for a timestamp.
- `cooldownMs` suppresses events whose UTC bar timestamp is less than the
  configured distance from the prior emitted timestamp.

Stable IDs use `alertId:mode:barTimestamp:conditionType`. Event history is
bounded by the engine's `maxHistory` option (1,000 by default) and returned as
defensive copies.

## Replay

Live and replay state are separate. Starting replay clears replay runtime and
history. A sequential step evaluates only the newly visible bar. A seek,
backward move, or other non-sequential cursor rebuilds the complete visible
prefix from oldest to newest, seeding the first bar and evaluating the rest.
This makes seek behavior deterministic and intentionally does not claim
constant-time arbitrary seeking. Replay events are retained as simulated
history while replay is active and are cleared on exit; live definitions and
live runtime are restored unchanged.
