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
defensive ordinary `IndicatorResult` plus an operation count. The lower-level
checked-program executor is intentionally not part of the package root.

Default runtime limits are 100,000 input bars, 5,000 bars of lookback,
50,000,000 counted operations, 50,000 operations for one logical bar, and
2,000,000 output points. Compiler defaults are 64 KiB source, 10,000 tokens,
20,000 AST nodes, 256 statements, 64 outputs, and 128 levels of expression
nesting. Applications may pass stricter limits to `execute` or
`createIndicatorDefinition`.

The interpreter is synchronous and cooperative. Cancellation is checked at
work boundaries, but no synchronous JavaScript API can hard-preempt arbitrary
wall-clock work or enforce a heap cap. Use a separately controlled Worker or
process boundary when hostile scripts must be terminated; a Worker alone is
not presented as a complete security sandbox.

## Optional Worker execution

For asynchronous UI work, import `KlineScriptWorkerRuntime` from the public
package. The default factory resolves the package's ESM `worker.js` asset only
in a browser environment; hosts may provide a custom factory for bundlers and
tests.

```ts
const runtime = new KlineScriptWorkerRuntime({ timeoutMs: 10_000 });
const task = runtime.execute(source, candles, { period: 21 });
const result = await task.promise;
task.cancel(); // rejects the task and terminates the current Worker
runtime.dispose();
```

`compile()` returns serializable metadata, not a transferable executable
program. `updateInput(sessionId, source, initialInput, candle, ...)` keeps the
ordered input session in the Worker; pass the initial snapshot once and later
pass an append or correction candle. All requests accept a generation so a
chart or replay controller can discard stale results. Timeouts, Worker crashes,
malformed messages, compiler failures, and runtime budget failures are
reported as `KlineScriptWorkerError` codes. The Worker path uses the same
validated compiler/interpreter and does not relax the security boundary.

