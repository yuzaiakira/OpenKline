# KlineScript Preparation

Phase 2 only reserves the boundary for a future KlineScript language. The
public types describe a versioned source envelope and a small AST schema for
indicator declarations, plots, and drawing declarations. They are data shapes,
not an executable runtime.

```ts
const source: KlineScriptSource = {
  language: "KlineScript",
  version: 1,
  source: "indicator rsi = RSI(period: 14)",
};

const program: KlineScriptProgram = {
  language: "KlineScript",
  version: 1,
  declarations: [],
};
```

The future parser will convert `KlineScriptSource` into a validated
`KlineScriptProgram`. A future compiler/runtime may resolve indicator and
drawing names through registered extension capabilities, but that phase must
define sandboxing, resource limits, deterministic evaluation, diagnostics, and
permissions first.

No parser, evaluator, `eval`, `new Function`, code generation, or automatic
execution is included in the current package. Consumers may store or inspect
the schema, but must not treat the AST as executable code.
