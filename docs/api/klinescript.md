# KlineScript API

```ts
import { compileKlineScript, createChart } from "openkline";

const compiled = compileKlineScript(source);
if (!compiled.success) {
  for (const diagnostic of compiled.diagnostics) {
    console.error(diagnostic.code, diagnostic.span.start, diagnostic.message);
  }
} else {
  const script = chart.addScriptIndicator(compiled.program, {
    parameters: { period: 21 },
    // overlay=false scripts default to a new pane; `pane` can override it.
  });
  script.setParameters({ period: 34 });
  script.remove();
}
```

`compileKlineScript` is browser/framework independent. A compiled program can
also be passed to `createIndicatorDefinition()` and registered in an
`IndicatorRegistry`, or executed for a deterministic fixture with
`program.execute(candles, parameters, { signal })`. The returned result is a
defensive ordinary `IndicatorResult` plus an operation count.

