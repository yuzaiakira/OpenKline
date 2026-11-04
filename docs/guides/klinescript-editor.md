# KlineScript editor integration

The public package provides the language compiler, diagnostics, synchronous
execution, and an optional Worker boundary. An application owns its editor
component; no editor dependency is required by OpenKline.

## Compile and display diagnostics

```ts
const result = compileKlineScript(source);
if (!result.success) {
  diagnostics.set(result.diagnostics.map((item) => ({
    code: item.code,
    message: item.message,
    line: item.span.start.line,
    column: item.span.start.column,
  })));
} else {
  const indicator = chart.addScriptIndicator(result.program);
}
```

Diagnostics use stable codes and one-based source spans. The editor should keep
the source text unchanged while highlighting the reported span. Autocomplete
should be limited to the implemented grammar and intrinsic names documented in
the KlineScript API; it must not suggest JavaScript globals or imply unsupported
language features.

## Responsive execution

For an opt-in asynchronous path, use `chart.addScriptIndicatorAsync(source)`.
The returned promise resolves only after the Worker has compiled and produced
the first result, so an editor can display a `compiling`/`running` state until
the chart indicator is ready. The chart applies only the latest generation and
emits `scriptError` for a current Worker failure. Removing the indicator or
destroying the chart terminates pending work.

```ts
const indicator = await chart.addScriptIndicatorAsync(source, {
  parameters: { period: 21 },
  timeoutMs: 10_000,
});
```

Use `KlineScriptWorkerRuntime` directly when the editor needs independent
compile/execute/cancel controls, such as a preview pane that is not yet owned
by a Chart. Its compile response contains serializable metadata only; never
attempt to transfer or persist executable program closures.

The private Next.js Studio includes a dependency-free editor surface built for
the current restricted grammar. It provides syntax highlighting, line numbers,
precise compiler diagnostics, implemented-language autocomplete, starter
templates, browser-local script save/delete, explicit Compile with generation
gating, Worker runtime status, AbortController-backed Cancel, and an applied
script list for the active panel. Studio helpers in `openkline` keep user
scripts out of the built-in Indicator Explorer registry while wiring apply to
`Chart.addScriptIndicatorAsync` with active-panel stale-completion protection.
Applied instances can be inspected for compiler-declared inputs, recompiled,
and reapplied with best-effort restoration if Worker replacement fails.
Imported workspace JSON that embeds script source is quarantined until explicit
activation; valid JSON is not treated as execution permission. It intentionally
does not add Monaco or CodeMirror: neither dependency is present in the
repository, and the current surface keeps the Next.js client bundle and SSR
boundary small. A future editor replacement can adopt a maintained package
after measuring bundle and SSR impact without changing the compiler contract.
See `docs/reports/phase-16-5-9-klinescript-studio-integration.md` and
`docs/reports/phase-16-5-10-klinescript-settings-diagnostics-activation.md`.
