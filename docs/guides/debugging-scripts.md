# Debugging KlineScript

Diagnostics have stable codes and one-based line/column source spans. Display
`diagnostic.message` beside the source range and keep the source unchanged so
offsets remain useful. Compile-time failures include unknown identifiers,
unsupported calls, type mismatches, invalid arguments, and excessive static
lookback.

Runtime failures are `KlineScriptRuntimeError` values. `RUNTIME_INPUT` means
host data or parameters were invalid, `RUNTIME_BUDGET` means a configured
resource limit was reached, `RUNTIME_CANCELLED` means the supplied
`AbortSignal` was aborted, and `RUNTIME_CALCULATION` means a validated program
encountered an invalid calculation. Run `npm test` and the focused compiler
tests with:

```bash
npx tsc -p tsconfig.test.json
node --test test-dist/tests/klinescript.test.js
```
