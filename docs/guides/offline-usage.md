# Offline usage

OpenKline works with no internet connection when the application supplies
local candles. The source can be a bundled JSON file, an in-memory array, a
desktop database, or a backtest fixture.

```ts
const candles = await readLocalJsonFile();
const chart = createChart(container, { timeZone: "UTC" });
chart.setData(candles);
chart.addIndicator("SMA", { period: 20 });
chart.update(nextLocalCorrectionOrAppend);
```

There is no implicit fetch, provider registration, authentication, telemetry,
or cloud connection. Keep file loading and persistence in the host application
and pass validated data to OpenKline. The executable
[offline JSON example](../../examples/vanilla/offline-data.html) loads only the
adjacent `offline-candles.json` file and is covered by a Chromium network-deny
test.
