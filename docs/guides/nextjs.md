# Next.js App Router Integration

Use `@openkline/react` from a Client Component. Importing the package is safe in
server modules, but `createChart` must only run after the client component
mounts because it creates a canvas and observes the DOM.

```tsx
"use client";

import { FinancialChart } from "@openkline/react";

export default function ChartClient() {
  return (
    <FinancialChart
      candles={candles}
      indicators={[{ indicatorId: "RSI", options: { period: 14, pane: "new" } }]}
      theme="dark"
      autoSize
      style={{ height: 520 }}
    />
  );
}
```

The complete example is in `examples/nextjs-app-router`. Its production build
was verified with Next.js 15.5.28. The example uses a local bundler alias only
to consume the unpublished root package; a published application should list
`openkline` and `@openkline/react` as normal dependencies.

The local example enables a Webpack `.js` extension alias so TypeScript
NodeNext-style compiled imports resolve correctly when Next processes the
linked development packages. This is not required for a normal registry
installation.

Do not create a chart in a Server Component, module initializer, or during
server rendering. React cleanup destroys the chart on unmount and supports
Strict Mode's mount/unmount probe.
