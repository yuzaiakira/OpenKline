# Studio volume analytics

The private Next.js Studio exposes the public chart-owned volume analytics APIs
through the **Volume Analytics** disclosure panel.

## Anchored VWAP

Enable **Anchored VWAP**, choose `Typical price` or `Close`, and edit the UTC
anchor. **Select candle anchor** activates a one-shot pointer/touch placement
that snaps to the nearest visible candle timestamp. The same timestamp and
price-source configuration is retained when the workspace is saved.

Anchored VWAP is calculated from the causal historical prefix beginning at the
inclusive anchor. It is not a tick-accurate execution benchmark.

## Estimated Volume Profile

Enable **Estimated Volume Profile** and choose:

- **Visible range** to follow the chart's current visible UTC interval.
- **Fixed UTC range** to calculate over an explicit `[from, to)` interval.
- `Close` or `Uniform high/low range` allocation.
- Bin count and value-area percentage.
- POC, VAH/VAL, and labels visibility.

The panel displays numerical POC, VAH, and VAL results. Every profile is an
OHLCV estimate; the Studio does not claim exchange-reported volume-at-price,
order-flow, bid/ask volume, or tick distribution.

## Replay, comparison, and panels

During bar replay, analytics controls are disabled. Profile calculations use
only candles through the inclusive replay cursor, so backward seeks remove
future contributions and forward seeks add only newly eligible candles. Exiting
replay restores the ordinary workspace.

Each chart panel owns independent analytics state. Switching panels, symbols,
timeframes, or layouts does not copy anchors or profile calculations. While
normalized comparison mode is active, raw-price analytics are hidden so they
are not drawn against a normalized scale; their visibility is restored on exit.

Save/Save As and reload use the versioned Studio workspace document. Temporary
pointer placement and calculated bins are not persisted.

The fixture is deterministic and local. Chromium interaction coverage is
provided by `tests/react-browser/multi-chart-studio.spec.ts`; other browser and
physical-device gates remain separate verification work.
