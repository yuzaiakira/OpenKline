# Studio bar replay

OpenKline Studio exposes the public `Chart.createReplay()` controller through
the existing `FinancialChart` handle. It does not maintain a second chart or a
second market-data model.

## Controls

The Bar replay panel provides:

- a starting-point range control based on the complete deterministic fixture;
- Enter/Exit replay mode;
- previous and next bar stepping;
- Play/Pause and a bounded speed selector;
- Jump to Beginning and Jump to Latest;
- a seek timeline with progress and current bar count;
- a `REPLAY` indicator, state, current timestamp, and speed/progress feedback.

When the chart canvas is focused, plain Left/Right step one bar, Space toggles
playback, and Escape exits replay. Modifier-key shortcuts and form controls are
left untouched so browser and input shortcuts remain available.

## State and persistence

Entering replay captures the complete chart workspace, including presentation,
price scale, panes, indicators, drawings, and metadata. The chart then exposes
only the inclusive historical prefix. Studio disables source and structural
object operations while replay is active; this prevents an accidental data or
layout mutation from being mixed into the historical simulation.

Exit restores the captured workspace and synchronizes the Studio controls. A
drawing with an anchor after the cursor is temporarily unavailable in the
replay-visible drawing list and becomes available when every anchor is visible;
its stored anchors and prices are never changed. Creating or changing drawings
through Studio is disabled during replay, so there is no ambiguous replay-only
drawing persistence policy.

Workspace JSON exported directly from the chart API during replay is a partial
historical snapshot and contains a replay marker. It is not a resumable Studio
workspace; restoration requires the complete replay source and therefore rejects
that partial document. Save, Load, and Export controls are disabled in Studio
until replay exits.

The Studio fixture is local and deterministic. The page does not claim physical
mobile-device support: the responsive test uses a mobile-sized Chromium
viewport emulation.
