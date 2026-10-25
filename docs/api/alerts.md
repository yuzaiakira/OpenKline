# Alerts API

Alerts are local chart evaluations. They do not contact a server or deliver
notifications outside the application.

## Chart API

```ts
const alert = chart.addAlert({
  id: "close-crosses-100",
  name: "Close crosses 100",
  condition: { type: "price-cross-above", field: "close", value: 100 },
  frequency: "once-per-bar",
});

const unsubscribe = chart.subscribe("alertTriggered", (event) => {
  console.log(event.alertName, event.barTimestamp, event.simulated);
});

chart.subscribe("alertError", (diagnostic) => {
  console.warn(diagnostic.alertId, diagnostic.message);
});
```

`Chart` provides `addAlert`, `getAlert`, `updateAlert`, `removeAlert`,
`getAlerts`, `getAlertStatus`, `getAlertHistory`, and `clearAlertHistory`.
`AlertApi.update`, `setEnabled`, and `remove` use the same Chart replay
mutation guard as the direct methods. Definition changes are rejected while
replay is active; read-only history and status access remains available.

The Chart adapter supplies the current candle, aligned numeric indicator and
KlineScript outputs, and replay-visible drawings. Symbol and timeframe are
attached when a datafeed session provides them.

## Framework-neutral engine

```ts
const engine = new AlertEngine({ maxHistory: 500 });
engine.add({
  id: "rsi-high",
  name: "RSI high",
  condition: { type: "indicator-above", indicatorId: "rsi-1", outputId: "value", value: 70 },
});
engine.seed({ candle });
engine.evaluate({
  candle: nextCandle,
  outputs: [{ sourceId: "rsi-1", outputId: "value", value: 72, time: nextCandle.time }],
  sourceEvent: "append",
  isFinal: true,
});
```

`AlertEngine` also exposes `subscribe`, `subscribeDiagnostics`, `historyFor`,
`reset`, `exportDefinitions`, `replaceDefinitions`, and `dispose`. Use
`seedRule` when adding or updating one rule so other rule observations are not
disturbed.

## Serializable definitions

`exportDefinitions()` returns:

```json
{
  "version": 1,
  "alerts": [
    {
      "id": "close-crosses-100",
      "name": "Close crosses 100",
      "condition": { "type": "price-cross-above", "field": "close", "value": 100 },
      "frequency": "once-per-bar",
      "enabled": true
    }
  ]
}
```

Workspace serialization includes this document only when definitions exist.
Runtime state and event history are not persisted. Validate external JSON with
`parseAlertDefinitions` before using it.

The exact crossing, equality, warm-up, correction, finality, cooldown, and
replay rules are specified in
`docs/architecture/alert-evaluation-semantics.md`.
