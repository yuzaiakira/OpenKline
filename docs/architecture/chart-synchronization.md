# Chart synchronization architecture

`ChartSynchronizationController` is a core, browser-framework-neutral adapter
around existing Chart APIs:

```text
Chart A events ──UTC time/range──> synchronization controller
                                      │
                                      ├──> Chart B public setters
                                      └──> Chart C public setters
```

The controller never reads or mutates a `CandleStore`, does not copy series,
and does not assume matching bar indexes. `Chart.setCrosshairAtTime()` performs
nearest-visible-bar selection. `Chart.getVisibleTimeRange()` converts the
source's current viewport to UTC boundaries, while each target's
`setVisibleTimeRange()` applies its own clamping and replay cutoff.

Each registration owns five event unsubscriptions. A per-channel reentrancy
guard prevents target setters from echoing back into the source, and per-target
last-value caches avoid repeated rendering. Data updates and replay transitions
invalidate those caches because the same UTC request may resolve differently
after a correction, symbol switch, or replay boundary. `chartDestroy` removes
the registration automatically. `destroy()` removes all remaining listeners.

The private Next.js Studio uses this controller for crosshair and viewport
events. Its symbol/timeframe switches and nested workspace persistence remain
host concerns, so the core API stays usable without React, Next.js, or a
backend.
