# KlineScript Preparation

Phase 4 implements the first restricted KlineScript subset. The original
versioned source envelope remains useful for persistence, while the real
compiler/runtime is documented in `docs/architecture/klinescript.md` and the
language reference under `docs/klinescript/`.

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

Use `compileKlineScript` for validated v0.1 programs. The implementation is
expression-only and deliberately excludes drawing calls, loops, recursion,
imports, and arbitrary host access. The old declaration shapes are retained
for source compatibility but are not the executable representation.
