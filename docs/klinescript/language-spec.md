# KlineScript v0.1 language specification

KlineScript is a small, Python-inspired expression language for describing
technical indicators. The compiler in `src/klinescript` produces a validated
program; it never translates source into JavaScript and never calls `eval` or
`new Function`.

## Supported program shape

Programs are UTF-16 source strings limited to 64 KiB. Statements are separated
by a newline or semicolon. `#` starts a comment through the end of the line.
Indentation has no meaning. A program must begin with exactly one indicator
declaration, followed by immutable variable bindings and one or more `plot` or
`hline` statements.

```python
indicator("My EMA", overlay=True)
period = input.int("Period", default=21, min=1, max=500)
source = close
value = ta.ema(source, period)
plot(value, title="EMA", color="#8B5CF6", width=2)
```

The accepted literal spellings are numbers, single- or double-quoted strings,
`True`/`False` (also lower-case `true`/`false`), and `None`/`na` for missing.
Identifiers are ASCII letters, digits, and `_`, beginning with a letter or `_`.
Unicode is rejected deliberately in v0.1 so source diagnostics are byte/column
stable.

Supported expressions include `+ - * / %`, comparisons, `and`/`or`, `not`,
parentheses, conditional expressions (`condition ? when_true : when_false`),
fixed intrinsic calls, and historical indexing (`close[1]`). Calls accept
positional arguments followed by named arguments. Unknown, duplicate, or
out-of-order arguments are compile errors.

There are no loops, recursion, user-defined functions, imports, arbitrary
member access, object literals, comprehensions, assignments after a binding,
or statements other than the forms above. `macd.macd`, `macd.signal`, and
`macd.histogram` are fixed projections of the `ta.macd` result, not general
property access.

## Compilation and lifecycle

```ts
import { compileKlineScript } from "openkline";

const result = compileKlineScript(source);
if (!result.success) {
  console.error(result.diagnostics);
} else {
  const indicator = result.program.createIndicatorDefinition();
  // Register the definition in an IndicatorRegistry or use chart.addScriptIndicator.
}
```

Compiled metadata and the validated program identity are immutable. Workspaces
persist source and the deterministic program id only; closures and runtime
state are never serialized.

