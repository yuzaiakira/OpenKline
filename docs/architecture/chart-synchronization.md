# Chart synchronization

Synchronization is opt-in and belongs to the host composition layer. The core
Chart exposes only timestamp-based primitives:

- `getVisibleTimeRange()` returns visible UTC boundaries;
- `setVisibleTimeRange({ from, to })` maps boundaries through each chart's
  available timestamps rather than assuming equal bar indexes;
- `setCrosshairAtTime(time)` selects the nearest visible bar and returns the
  timestamp actually selected, or clears the crosshair with `null`.

The Studio controller tags every propagated operation with its source panel ID
and ignores events originated by its own propagation. A target chart resolves
crosshair timestamps to its nearest available visible bar. Missing timestamps
never receive invented values. Range synchronization uses UTC boundaries and
lets the target clamp to its available history.

Symbol and timeframe synchronization are separate switches. Enabling symbol
sync updates participating panel metadata and deterministic fixture data;
timeframe sync is independent and does not overwrite a panel's symbol unless
both switches are enabled. Replay is never synchronized implicitly. A replay
chart keeps its source and future-data boundary private, and crosshair/range
propagation carries only timestamps and viewport intent.

The core remains framework-independent and does not retain a synchronization
registry or import React. Hosts own subscriptions and must dispose them with
the chart panels.
