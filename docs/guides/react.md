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
`update`, or `setDatafeed` directly; consumers must not retain the chart after
unmount.
