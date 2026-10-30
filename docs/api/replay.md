# Replay API

The framework-independent replay primitive is exported as `ReplayEngine`.
Chart integration is provided by `Chart.createReplay()`; neither API requires
React or Next.js.

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

For a chart-owned replay, pass the complete historical source to
`createReplay`. The chart keeps its existing source and workspace private,
then exposes only the inclusive visible prefix:

```ts
const replay = chart.createReplay({
  source: chart.getData(),
  startAt: chart.getData()[40]!.time,
  speed: 2,
});

replay.subscribe((status) => console.log(status.state, status.currentIndex));
replay.start();
// chart.getData() now contains bars 0..40, inclusive.
replay.stepForward();
replay.exit(); // restores the complete pre-replay chart workspace
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

During chart replay, source and structural mutations are rejected so a live
datafeed, indicator, drawing, or plugin cannot introduce future state. Series,
indicators, Heikin–Ashi projections, crosshair/tooltip values, autoscale,
drawings, and plugin render contexts are all limited to the current cursor.
The active datafeed subscription is suspended and safely resubscribed after
`exit()`. A workspace serialized during replay is marked as a partial replay
snapshot and cannot be restored without the complete replay source.

Trade-derived order-flow state follows the same event-time frontier. Chart
Footprint, CVD, Time & Sales, and Level-2 `getDepthState()` reads exclude
prints or book events after the inclusive replay cursor. Before the first
cursor the derived state is empty; seeking backward reconstructs the bounded
order book from retained snapshot/delta history. A replay restore retains
order-flow source identity and presentation settings, but never serializes
future market events.

## Causal multi-timeframe replay

Chart-managed higher-timeframe indicators and previous-period reference levels
use the latest replay-visible source opening time as their as-of frontier. An
explicit `asOfTime` option is clamped to that frontier while replay is active.
The multi-timeframe engine still requires each source candle's interval to have
ended before including its OHLCV or metadata, so a forming source candle cannot
leak into a replay snapshot. Seeking backward removes values that are no longer
eligible; seeking forward deterministically restores them from the retained
source history. See `docs/api/multi-timeframe.md` for the source-time mapping
and finality contract.
