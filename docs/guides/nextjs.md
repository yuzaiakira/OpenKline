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
      drawings={[{
        type: "trend-line",
        options: {
          points: [
            { time: candles[10].time, price: candles[10].low },
            { time: candles[35].time, price: candles[35].high },
          ],
        },
      }]}
      theme="dark"
      autoSize
      style={{ height: 520 }}
    />
  );
}
```

The complete example is in `examples/nextjs-app-router`. Its production build
was verified with Next.js 16.4.3 using the explicit Webpack build path. The
example uses a local bundler alias only
to consume the unpublished root package; a published application should list
`openkline` and `@openkline/react` as normal dependencies.

The local example enables a Webpack `.js` extension alias so TypeScript
NodeNext-style compiled imports resolve correctly when Next processes the
linked development packages. This is not required for a normal registry
installation.

Its root route is a private local Studio that demonstrates imperative public
chart composition, workspace persistence, indicators, drawings, and restricted
KlineScript. It uses deterministic fixtures only; see
[the Studio guide](studio.md).

Plugins and workspace documents are client-side props. Install trusted plugin
modules in the Client Component and pass a validated workspace after mount;
never import or execute plugin code in a Server Component.

KlineScript can be compiled in a server-safe module and passed to the React
adapter as a validated program:

```tsx
<FinancialChart
  candles={candles}
  scriptIndicators={[{ program: compiledProgram, options: { pane: "main" } }]}
/>
```

The adapter owns script indicator installation and removes each handle during
effect cleanup. Check compile diagnostics before passing a program to the
component.

Do not create a chart in a Server Component, module initializer, or during
server rendering. React cleanup destroys the chart on unmount and supports
Strict Mode's mount/unmount probe.
