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
`update`, `fitContent`, `resetView`, `addLineSeries`, drawing methods, or
`setDatafeed` directly; consumers must not retain the chart after unmount. The
cleanup effect unsubscribes crosshair listeners, disposes declaratively managed
resources, and destroys the chart.

Use stable IDs when declaring managed resources:

```tsx
<FinancialChart
  indicators={[{ id: "main-rsi", indicatorId: "RSI", options: { period: 14, pane: "new" } }]}
  drawings={[{ type: "horizontal-line", options: { id: "support", points: [{ time, price }] } }]}
/>
```

Equivalent newly allocated arrays do not recreate those resources. Omit a prop
to preserve workspace or imperative state; pass an explicit empty array to
clear that declarative category. Workspace restoration happens after plugins
are available and before explicitly supplied candles, indicators, scripts, or
drawings, so omitted `candles` never clears restored workspace data. A workspace
contains data and plugin state, not executable plugin code. See
[React lifecycle architecture](../architecture/react-lifecycle.md) for the
complete precedence contract.

For a data-driven integration, keep the `candles` prop immutable and replace it
when historical data changes. Use the imperative handle for streaming updates
or a `Datafeed` subscription owned by the application.

To link two React charts, keep refs to their imperative handles and register
the charts with the framework-independent `ChartSynchronizationController`
after both `onChartReady` callbacks have fired. Remove each chart on unmount or
let its `chartDestroy` event unregister it automatically; destroy the
controller when the owning workspace is disposed. The controller does not
couple React state or datafeed instances.
