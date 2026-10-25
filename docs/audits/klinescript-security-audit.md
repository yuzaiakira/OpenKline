# Independent KlineScript security audit

Date: 2026-10-25 (UTC)

Audit baseline: `ec1e4a80ce4c9ca897f32fab096621d2ae04e372`.
Hardening fixes are present at `54f40246ad87eb79cb01ea8b45c23da4a9ef6c40`.
This is an independent source, test, and runtime audit; existing Phase 4
claims were not accepted without re-running adversarial checks.

## Scope and threat model

The audited boundary is `compileKlineScript(source)` followed by
`program.execute(candles, parameters, options)` or
`program.createIndicatorDefinition()`. The assumed attacker can provide
malformed or deliberately expensive source, input parameters, and candle
snapshots, and can restore script source references from a workspace. Multiple
independent programs and indicator instances may be active at once.

The compiler and interpreter are the security boundary for the DSL. The host
still owns JavaScript execution, memory, scheduling, browser APIs, datafeeds,
workspace policy, and plugin loading. Phase 3 TypeScript plugins are trusted
in-process modules and are not covered by the KlineScript restrictions.

KlineScript has no loops, user functions, imports, dynamic calls, arbitrary
member traversal, object literals, host callbacks, strategy orders, filesystem,
network, DOM, browser-global, Node-global, reflection, prototype access,
`eval`, or `new Function`. Intrinsics are selected by fixed namespace/name
tables after semantic checking. Workspace state stores source and a
content-derived id, never executable closures or runtime objects.

This is a restricted DSL boundary, not an OS-level sandbox. Synchronous
JavaScript cannot hard-preempt an arbitrary call or enforce a heap cap. Hosts
that execute hostile user content must add a separately controlled process or
Worker termination policy; a Worker alone is not asserted to be a complete
security boundary.

## Findings and fixes

| ID | Severity | Finding | Resolution and regression evidence |
| --- | --- | --- | --- |
| KS-AUDIT-001 | P1 | 5,000 nested parentheses or unary operators caused `RangeError: Maximum call stack size exceeded` during parsing before the audit. | Added parser expression/unary depth guards with structured `KS2013`/`KS2014` diagnostics. Five-thousand-level seeds are now in `tests/klinescript-fuzz.test.ts` and compile without escaping exceptions. |
| KS-AUDIT-002 | P1 | Window built-ins charged one operation per bar while scanning up to 5,000 values, so global/per-bar limits did not represent their actual work. | `sma`, `ema`, `stdev`, `highest`, `lowest`, and Wilder window initialization charge the scanned window length before scanning. A 10,000-bar/5,000-period budget regression fails with `RUNTIME_BUDGET` before completion. |
| KS-AUDIT-003 | P1 | The per-bar counter reset when a second vector pass returned to index zero, allowing several series calculations for the same logical bar to avoid aggregation. | Per-bar work is now accumulated in a bounded index map. A two-series regression with `maxOperationsPerBar` fails deterministically. |
| KS-AUDIT-004 | P1 | Checker rejected numeric series/scalar arithmetic although the interpreter implemented aligned element-wise arithmetic. | Checker now accepts numeric scalar/series combinations and unary numeric series. Independent `close / 0` and window fixtures compile and execute as documented. |
| KS-AUDIT-005 | P2 | Public output metadata retained an internal AST `expression` field. | Removed the field from public metadata; internal `CheckedProgram` remains private to the compiler/runtime. A public namespace test asserts the executor and output AST are absent. |

No P0 findings were identified. The P1 findings above are fixed in the
hardening commit and covered by deterministic regressions. The remaining
synchronous preemption, heap-cap, and trusted-plugin issues are documented
design limitations rather than silently treated as fixed vulnerabilities.

## Adversarial verification

| Area | Test / result |
| --- | --- |
| Long source | More than 64 KiB returns `KS1001`; no parser execution follows the rejected token stream. |
| Token exhaustion | A low `maxTokens` option returns `KS1002`. |
| AST exhaustion | A low `maxAstNodes` option returns `KS3004`; default AST depth is also checked. |
| Deep nesting | 5,000 parentheses and 5,000 unary operators produce diagnostics without `RangeError`. |
| Strings and Unicode | Unterminated strings and non-ASCII identifiers produce diagnostics; identifiers remain deliberately ASCII-only in v0.1. |
| Numeric values | Non-finite numeric literals produce `KS1004`; invalid historical indexes are rejected by the checker/runtime. |
| Host access | `constructor`, `globalThis`, `window`, `document`, `process`, `require`, `eval`, and unsupported calls cannot resolve through the fixed grammar/checker. |
| Dynamic code | Source audit of the compiler/runtime found no `eval` or `new Function`; the interpreter dispatches only fixed AST kinds and intrinsics. |
| Input validation | Invalid OHLCV input becomes structured `RUNTIME_INPUT` rather than partial output. |
| Runtime work | Dataset, lookback, output, total operation, and aggregate per-bar limits are enforced. Actual window scans are charged. |
| Cancellation | Pre-aborted `AbortSignal` returns `RUNTIME_CANCELLED`; cooperative checks occur at expression and built-in work boundaries. A normal external timer cannot interrupt a synchronous JavaScript call already in progress. |
| Fault isolation | Failed executions return/throw per-instance errors and do not mutate the frozen program or shared registry definitions. Full chart/React lifecycle evidence remains in the browser and integration suites. |

The deterministic seed suite currently passes 14 KlineScript/fuzz tests when
run with the focused command below. It is bounded regression coverage, not a
claim of exhaustive property-based or unbounded fuzz testing.

## Time-series and numerical review

The runtime uses ascending validated candle snapshots. `close[1]` yields a
leading missing value, technical functions emit aligned warm-up `null`s, and
historical corrections recompute the full ordered snapshot through the existing
indicator lifecycle. Sessions and timeframes are not inferred from wall-clock
timestamps. Missing values propagate through arithmetic and conditionals;
division by zero and non-finite math produce missing output rather than
`Infinity`/`NaN` points.

Independent fixtures cover EMA/SMA/RSI/ATR parity with the native engine,
MACD projections, population standard deviation, highest/lowest windows,
series-scalar arithmetic, zero denominators, invalid candles, parameter
limits, and insufficient history. Numerical assertions use exact values for
the small deterministic fixtures and the native implementation's exact
warm-up convention; no broad floating-point tolerance claim is made.

## Remaining risks and recommended follow-up

1. Keep script execution off the UI thread when a host accepts untrusted
   authors. A terminating process/Worker design needs a separate lifecycle and
   security review; the current synchronous API must not be described as
   hard-preemptible.
2. Add repeat-compilation and multi-instance heap profiling with a reproducible
   Node/Browser harness before setting memory release thresholds. Current
   benchmarks report execution timing and chart cleanup observations, not a
   KlineScript heap cap or leak proof.
3. Keep trusted plugin APIs outside the script trust model and document host
   authorization when installing plugins.
4. Resolve the project license, third-party attribution inventory, and blocked
   official Firefox/WebKit/Mobile Safari verification before stable release.

## Reproduction commands

```bash
npm run build:core
npx tsc -p tsconfig.test.json
node --test test-dist/tests/klinescript.test.js test-dist/tests/klinescript-fuzz.test.js
npm run benchmark:klinescript
```

The audit does not publish a stable package and does not relax any existing
browser acceptance gate.
