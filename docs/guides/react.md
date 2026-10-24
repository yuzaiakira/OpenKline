# React Integration

The optional `@openkline/react` package is a thin lifecycle adapter over the
framework-independent `openkline` chart. It creates one chart per mounted
component, updates data and options without recreating the chart, forwards
crosshair events, and destroys the chart on unmount. It is safe to import in a
server-rendered module because chart construction occurs inside `useEffect`.

```tsx
import { FinancialChart } from "@openkline/react";

export function PriceChart({ candles }: { candles: Candle[] }) {
  return (
    <FinancialChart
      candles={candles}
      indicators={[{ indicatorId: "RSI", options: { period: 14, pane: "new" } }]}
      drawings={[{
        type: "horizontal-line",
        options: { points: [{ time: candles.at(-1)!.time, price: candles.at(-1)!.close }] },
      }]}
      plugins={[trustedPlugin]}
      workspace={savedWorkspace}
      theme="dark"
      autoSize
      onCrosshairMove={(event) => console.log(event.time, event.price)}
      style={{ height: 520 }}
    />
  );
}
```

The component is designed to work with React Strict Mode. The imperative
handle exposes `getChart()` for integrations that need to call `resize`,
`update`, `addLineSeries`, drawing methods, or `setDatafeed` directly; consumers
must not retain the chart after unmount. The cleanup effect unsubscribes
crosshair listeners, removes mounted indicators and drawings, destroys the
chart, and clears its series data.

`plugins` installs trusted plugins after the chart mounts and disposes their
handles when the prop changes or the component unmounts. `workspace` is
restored after plugins are installed, so custom indicators and drawing tools
are available. A workspace contains data and plugin state, not executable
plugin code.

For a data-driven integration, keep the `candles` prop immutable and replace it
when historical data changes. Use the imperative handle for streaming updates
or a `Datafeed` subscription owned by the application.
