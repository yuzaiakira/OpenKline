# Multi-chart historical replay

`MarketReplayCoordinator` is a small routing layer over one
`MarketReplayController`. Each panel registers an id and instrument id and
receives a defensive filtered snapshot. The global cursor and clock remain
shared, while candle, trade, and Level-2 eligibility stays instrument-scoped.

```ts
const coordinator = new MarketReplayCoordinator(replay);
const remove = coordinator.registerPanel(
  { id: "left", instrumentId: "BTC-USD" },
  (panel) => renderLeft(panel),
);
coordinator.registerPanel({ id: "right", instrumentId: "ETH-USD" }, renderRight);

replay.start();
replay.seekToTimestamp(asOfTime);
remove(); // only the left panel is detached
```

A panel with no eligible source data receives an empty filtered view, not a
synthetic bar or order-book state. Changing a panel's instrument is explicit.
Independent controllers can still be created for independent replay sessions.
Coordinator disposal only removes routing subscriptions; it does not dispose
the controller supplied by the host.
