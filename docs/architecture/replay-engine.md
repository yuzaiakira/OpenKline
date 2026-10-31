# Replay engine architecture

Phase 7.1 introduces `ReplayEngine` as a framework-independent state machine.
It depends on the existing `CandleStore` only for OHLCV validation and cloning;
it does not depend on React, Next.js, the DOM, Canvas2D, datafeed vendors, or a
chart renderer.

## Source and cursor contract

The constructor accepts one complete, strictly ordered historical source. The
engine clones that source and never mutates or returns its candle objects. A
replay cursor is an inclusive source-bar index: when the cursor is `N`, bars
`0..N` are revealed and no bar after `N` is part of the replay-visible state.
`startAt` and `seekToTimestamp()` choose the first source bar whose timestamp
is greater than or equal to the requested UTC millisecond timestamp. This
works for irregular bars, session gaps, and non-uniform time intervals.

The engine exposes only defensive status data: current index, current
timestamp, total source-bar count, speed, state, and an error message when
applicable. It never exposes the protected source through status or events.

## State machine

```text
idle --start--> ready --play/resume--> playing --pause--> paused
  ^               |                       |                 |
  |               +--step/seek/jump-------+--step/seek------+
  |                                       |
  +------------- exit <-------------------+
                                          |
                                      completed
```

`completed` is reached only when playback attempts to progress beyond the
last bar. `jumpToLatest()` is a paused inspection state; it does not claim
that playback naturally consumed the history. `reset()` returns an active
engine to its initial cursor in `ready`. `exit()` returns it to `idle` and
does not destroy the engine. `dispose()` cancels scheduling and permanently
enters `disposed`. A callback failure enters `error`, cancels scheduling, and
requires `reset()` before playback can resume.

Empty sources enter `ready` with a null cursor; playing them immediately
transitions to `completed`. Invalid timestamps, bar indexes, and speeds are
rejected without changing the current state.

## Scheduling and determinism

Speed is a positive multiplier measured against one replay bar per second. It
changes only the delay between cursor advances; source financial timestamps
are never rewritten. `ReplayScheduler` is injectable, so unit tests can drive
callbacks synchronously without real time. The default scheduler delegates to
the host timer API. At most one timer exists per engine, and every pause,
seek, speed change, exit, reset, error, and dispose clears the prior timer.

Chart integration owns the cursor application callback. This separation lets
the engine be tested independently while the existing ChartModel remains the
single owner of viewport, series, indicator, drawing, scale, and renderer
state.

## Phase 16 execution-research boundary

The Phase 16.0 execution-research simulator is an internal consumer of this
controller, not a replacement for it. It consumes the validated event
ordering, clock policy, cursor, seek, reset, cancellation, and disposal
lifecycle rather than creating a second market clock. Historical order
decisions are recorded with their availability frontier and reconstructed on
backward seek; they are not silently moved earlier. The simulator remains
unexported and does not change this public replay contract. See
[`replay-execution-research.md`](./replay-execution-research.md).
