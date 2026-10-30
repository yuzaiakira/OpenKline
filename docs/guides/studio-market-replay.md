# Studio Market Replay Lab

The private Next.js Studio includes a deterministic, credential-free Market
Replay Lab. It consumes the public `MarketReplayTape` and
`MarketReplayController` APIs; it does not create a second chart renderer or
assume broker execution.

The Lab provides:

- an offline candle/trade/Level-2 fixture and explicit dataset/instrument
  selectors;
- event-time and recorded receive-time clock policies;
- reset, exit, play/pause, speed, previous/next event, next completed candle,
  and timeline-position controls;
- causal completed-candle rendering, Time & Sales, CVD, Footprint cells, and
  current depth;
- source/fingerprint, coverage, sequence-integrity, cursor, and event-inspector
  status.

The fixture is illustrative only. Displayed depth is historical observation,
not executable liquidity, and the Lab has no credentials or network provider.

## Causal display rules

The opening event exposes only the candle opening price. Final OHLCV appears
after a separate completion event. A receive-time replay excludes records that
do not carry a genuine recorded receipt timestamp and marks the resulting
historical knowledge as incomplete. Trade corrections become visible only when
their correction event is eligible under the selected clock.

## Embedding the same workflow

Library consumers can create a validated tape and attach it to an existing
chart without replacing legacy `Chart.createReplay()`:

```ts
const replay = chart.createMarketReplay({
  tape,
  clockPolicy: "event-time",
  knowledgePolicy: "strict-causal",
});
replay.start();
replay.stepNextCompletedCandle();
```

Use `MarketReplayCoordinator` when multiple panels share one cursor. Register
each panel with its own instrument identity; a missing source remains an empty
or unavailable panel and is never filled with synthetic candles or depth.

Workspace persistence should use `createMarketReplayWorkspace()` for the
small configuration reference. Store the tape ID/source version, selected
instrument, clock/knowledge policy, speed, display flags, panel references,
and optional cursor. Do not put event records, credentials, subscriptions,
workers, checkpoints, or derived order-book history in an ordinary workspace.
