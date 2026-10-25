# Phase 4 security verification

Date: 2026-10-25 (UTC)

Status: **Security hardening verified for the implemented v0.1 boundary;
Phase 4 remains open for inherited browser compatibility and production gates.**

## Acceptance matrix

| Criterion | Status | Evidence / limitation |
| --- | --- | --- |
| Restricted source-to-AST compiler | Verified | Lexer, parser, checker, and frozen compiled program; no source-to-JavaScript execution. |
| Structured diagnostics | Verified | Stable diagnostic codes, severity, one-based line/column spans, malformed-source fixtures. |
| Compiler complexity limits | Verified | Source, token, AST node, statement, output, nesting, and lookback limits with negative tests. |
| Parser stack safety | Verified | 5,000-level parenthesis/unary adversarial seeds now return diagnostics without `RangeError`. |
| Forbidden host access | Verified | Fixed grammar/checker rejects unsupported identifiers, members, calls, and dynamic-code attempts; source audit has no runtime `eval`/`new Function`. |
| Runtime input and parameter validation | Verified | OHLCV and parameter boundary errors are structured `KlineScriptRuntimeError` values. |
| Runtime total/per-bar budgets | Verified | Actual window work and aggregate multi-series per-bar accounting are covered by regression tests. |
| Lookback/output/dataset limits | Verified | Enforced in runtime and checker; output is bounded before result publication. |
| Cooperative cancellation | Partially verified | Pre-aborted signal and work-boundary checks pass. Synchronous API cannot promise hard interruption by an external timer. |
| Numerical/time-series semantics | Verified | Native SMA/EMA/RSI/ATR parity, stdev/highest/lowest fixtures, warm-up/indexing/correction tests. |
| Indicator and Chart integration | Verified | Existing Indicator Engine, pane, style, update, remove, and destruction tests. |
| Workspace persistence | Verified | Source/program-id references only; no executable runtime state serialized. |
| Public API boundary | Verified | Root exports compile/execute-on-program APIs; internal `executeKlineScript` and metadata AST are not public. |
| Memory isolation / hard heap cap | Not implemented | JS heap is host-managed; current runtime has allocation/output guards but no heap cap. |
| OS-level sandbox | Not implemented | Explicitly outside v0.1; use a separately controlled host boundary for hostile scripts. |
| Chromium | Verified | Existing Chromium browser suite passes. |
| Mobile Chrome emulation | Verified | Existing Pixel 7 project passes. |
| Firefox, WebKit, Mobile Safari | Blocked | Official Playwright-managed binaries unavailable; no system or untrusted substitutes used. |

## Local evidence

The focused security/correctness suite after hardening passed 14 tests. The
full test, browser, package, Next.js, and benchmark results are recorded in
`docs/reports/phase-5-readiness.md` after the final local run. The independent
finding log is `docs/audits/klinescript-security-audit.md`.

The hardening commit is:

```text
54f40246ad87eb79cb01ea8b45c23da4a9ef6c40
fix(klinescript): harden parser and runtime budgets
```

It was created and pushed with `Akira Yuzai <yuzai.akira@gmail.com>` as both
author and committer. No GitHub Actions workflow was added.

## Security conclusion

The verified v0.1 interpreter is suitable as a restricted, bounded in-process
indicator DSL under a trusted host policy. It is not suitable to advertise as
a hard sandbox or as a non-blocking execution service. Phase 4 must remain open
until the owner accepts the documented browser/environment exception and the
separate package/release blockers are resolved.
