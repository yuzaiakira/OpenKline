# Customization API

```ts
chart.setOptions({
  theme: {
    background: "#0b1220",
    text: "#dbeafe",
    grid: "#24324a",
    border: "#334155",
    upCandle: "#22c55e",
    downCandle: "#ef4444",
    crosshair: "#facc15",
    volumeUp: "#22c55e",
    volumeDown: "#ef4444",
    bandFill: "#38bdf8",
    bandFillOpacity: 0.18,
  },
  locale: "fa-IR",
  timeZone: "Asia/Tehran",
  pricePrecision: 3,
  direction: "rtl",
  interaction: {
    wheelZoom: true,
    pointerPan: true,
    crosshair: true,
    keyboardShortcuts: true,
  },
});
```

Options are applied without recreating the chart. `direction: "rtl"` changes
the time coordinate mapping; it does not change timestamp ordering in the data
contract. `interaction` applies to the chart canvas only. Surrounding toolbars,
menus, and translated labels belong to the host application and can consume
the typed chart events.
