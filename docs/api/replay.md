# Replay API

The framework-independent replay primitive is exported as `ReplayEngine`.
Chart integration is provided by `Chart.createReplay()` in the later Phase
7.1 integration increment; applications do not need React to use either API.

```ts
import { ReplayEngine } from "openkline";

const replay = new ReplayEngine({
  source: historicalCandles,
  startAt: historicalCandles[40]!.time,
  speed: 2,
});

const unsubscribe = replay.subscribe((status) => {
  console.log(status.state, status.currentTimestamp, status.currentIndex);
});

replay.start();
replay.stepForward();
replay.seekToTimestamp(historicalCandles[60]!.time);
replay.play();
replay.pause();
replay.exit();
unsubscribe();
replay.dispose();
```

`startAt` and timestamp seeks use the first bar at or after the requested
timestamp. The current bar is inclusive: the cursor at index `N` reveals the
prefix through `N`. A replay status never contains future candle data.

The state values are `idle`, `ready`, `playing`, `paused`, `completed`,
`error`, and `disposed`. `pause()` stops automatic progression; it does not
reset the cursor. `exit()` leaves replay mode at `idle`; it does not mean the
chart has been restored because chart ownership belongs to the Chart
integration. `reset()` returns to the configured initial bar. `dispose()` is
terminal and cancels timers.

`ReplayScheduler` is available for deterministic tests and controlled hosts.
The default uses the host's timer API. Speed is bounded to `0.01..100` and
controls progression delay only; it never changes candle timestamps or
financial calculations.
