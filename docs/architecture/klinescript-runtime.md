# KlineScript runtime

The v0.1 runtime is a synchronous validated interpreter, not a JavaScript code
generator or a general VM. It supports full historical calculation and uses
the same `IndicatorDefinition` lifecycle as built-in indicators. `update()`
therefore recomputes from the ordered snapshot; this is deliberately correct
for appends, developing-bar replacements, and historical corrections and is
not advertised as O(1).

Default limits are: 100,000 input bars, 5,000 bars of lookback, 50,000,000
counted operations, 50,000 counted operations for one bar, and 2,000,000
output points. Compiler defaults are 64 KiB source, 10,000 tokens, 20,000 AST
nodes, 256 statements, 64 outputs, and 5,000 lookback. Hosts can provide
stricter runtime limits.

`AbortSignal` is checked between expression and built-in work units. A
pre-aborted or cooperatively observed signal produces the structured
`RUNTIME_CANCELLED` error. Because the API is synchronous, a normal external
timer cannot interrupt an already executing JavaScript call at an arbitrary
wall-clock instant; the runtime makes no hard wall-clock or JavaScript heap-cap
claim. `KlineScriptWorkerRuntime` provides an optional asynchronous boundary
with request timeouts, generation checks, and hard worker termination. It
transfers serializable source/metadata and results, never executable closures.
See `docs/architecture/klinescript-worker-runtime.md`.

Window functions account for the number of values they scan, and the per-bar
limit aggregates work from multiple series passes for the same logical bar.
This is a resource guard, not a proof of a fixed memory footprint or a UI
responsiveness guarantee.

