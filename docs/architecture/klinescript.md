# KlineScript architecture

KlineScript is a compiler and data adapter layered on the existing OpenKline
indicator engine:

```text
source -> lexer -> AST parser -> semantic/type checker
       -> frozen compiled program -> bounded interpreter
       -> IndicatorDefinition -> IndicatorRegistry -> Chart series/panes
```

`src/klinescript/lexer.ts`, `parser.ts`, and `checker.ts` are framework-neutral.
`runtime.ts` evaluates validated expressions against a defensive candle
snapshot and returns ordinary `IndicatorResult` output. `Chart.addScriptIndicator`
registers that definition in the existing registry and routes pane, styles,
update, correction, and disposal behavior through the existing indicator path.

The interpreter memoizes each expression vector for one execution. Technical
functions therefore operate over a complete source vector rather than
re-evaluating each historical expression recursively. Script instances are
independent because parameter maps, caches, and output arrays are created per
execution/indicator instance.

