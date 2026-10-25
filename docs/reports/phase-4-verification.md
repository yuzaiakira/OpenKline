# OpenKline Phase 4 verification

Date: 2026-10-25 (UTC)

Status: **Implementation milestones 4.0–4.4 and the independent security
hardening pass are locally verified; Phase 4.5 remains open.** The inherited
Firefox, WebKit, and Mobile Safari
Playwright gate is still blocked by the browser environment. This report does
not claim full browser compatibility, a hardened OS sandbox, or Phase 4
closure.

## Acceptance matrix

| Requirement | Status | Evidence / limitation |
| --- | --- | --- |
| Documented v0.1 grammar and types | Implemented / Verified | `docs/klinescript/{language-spec,grammar,types}.md`; compiler tests |
| Lexer with spans and invalid-token diagnostics | Implemented / Verified | `src/klinescript/lexer.ts`; malformed-source tests |
| Precedence-aware parser and bounded error recovery | Implemented / Verified | `src/klinescript/parser.ts`; 5,000-level nesting regression seeds cannot escape with stack overflow |
| Semantic analysis and type checking | Implemented / Verified | `src/klinescript/checker.ts`; fixed intrinsic/name/argument checks |
| Immutable compiled program and public compile API | Implemented / Verified | `compileKlineScript`, frozen metadata, package smoke |
| Restricted runtime without dynamic JS execution | Implemented / Verified | AST interpreter; source audit finds no runtime `eval`/`new Function` |
| Dataset/lookback/AST/token/output/operation budgets | Implemented / Verified | compiler/runtime limits; actual window work and aggregate per-bar budget tests |
| Cancellation and idempotent indicator disposal | Implemented / Verified | cooperative `AbortSignal`; existing IndicatorInstance disposal |
| True wall-clock interruption / JS heap cap | Not Implemented | synchronous runtime cannot promise either; no false sandbox claim |
| OHLCV/time, missing, warm-up, historical indexing | Implemented / Verified | deterministic runtime tests and documented semantics |
| Native-compatible SMA/EMA/RSI/ATR behavior | Implemented / Verified | parity fixtures against existing Indicator Engine |
| MACD, stdev, highest, lowest, safe math | Implemented / Verified | independent fixtures, zero-denominator behavior, and documented projections |
| Indicator inputs, plots, hlines, multi-output metadata | Implemented / Verified | output/input tests and chart integration |
| Existing Indicator Engine and pane integration | Implemented / Verified | `Chart.addScriptIndicator`; Chromium playground test |
| Append/developing/correction behavior | Implemented / Verified | full snapshot recomputation through existing lifecycle; corrections tested |
| O(1) script append path | Not Implemented | v0.1 intentionally prioritizes correctness; updates are full recomputes |
| Workspace persistence of script definitions | Implemented / Verified | source/program-id-only references; Chromium restore test |
| Vanilla editor/playground | Implemented / Verified | `examples/vanilla/klinescript.html`; Chromium test |
| React script integration and cleanup | Implemented / Verified | `scriptIndicators` prop, SSR/typecheck, cleanup path |
| Next.js server-safe compilation/production use | Implemented / Verified | example script and Next.js 15.5.28 production build |
| Package installation and public exports | Implemented / Verified | `package:check`, `package:smoke`, root build; internal executor and AST metadata are not public |
| Chromium browser behavior | Verified | 3/3 tests pass; Headless Chromium 154.0.0.0 |
| Mobile Chrome emulation | Verified | 3/3 tests pass using Chromium 154 / Pixel 7 profile |
| Firefox Playwright | Blocked | Firefox 157 / build 1555 binary unavailable; no substitute used |
| WebKit Playwright | Blocked | WebKit 27.2 / build 2370 binary unavailable; no substitute used |
| Mobile Safari emulation | Blocked | depends on unavailable Playwright WebKit binary |
| Property/fuzz coverage | Implemented / Verified | bounded deterministic malformed-source and complexity-limit seeds; not unbounded fuzzing |
| Phase 2 browser gate | Blocked | preserved as an inherited project acceptance item |
| Git identity, push, no Actions | Verified | commits below; no `.github/workflows/` directory |
| Phase 4 milestone closure | Open | 4.5 remains open while browser criteria and production-readiness gates are blocked |

## Implemented language subset

Programs are line-separated, indentation-insensitive, and begin with one
`indicator` declaration. Bindings use `name = expression`. Supported syntax is
numeric/string/boolean/missing literals, comments, arithmetic, comparisons,
boolean operators, parentheses, conditional expressions, named/positional
arguments, fixed `ta.*`/`input.*` calls, and non-negative historical indexes.
The fixed MACD projections are `.macd`, `.signal`, and `.histogram`.

The language deliberately does not implement loops, recursion, user functions,
imports, arbitrary object/member traversal, browser/Node globals, strategy
orders, drawing calls, sessions, Python compatibility, or Pine compatibility.
The exact grammar and type rules are in `docs/klinescript/`.

## Compiler and runtime evidence

The pipeline is:

```text
source -> lexer -> AST -> semantic/type checker -> frozen compiled program
       -> bounded interpreter -> IndicatorDefinition -> Chart series/panes
```

Diagnostics have stable codes, severity, message, and one-based source spans.
For example, `plot(eval(close))` reports `KS3063` at the call and
`ta.unknown(close, 3)` reports `KS3066` on the technical call. Invalid source
never produces an executable program.

The interpreter evaluates defensive candle snapshots and memoizes expression
vectors per execution. No script receives CandleStore, PointStore, renderer
state, prototypes, host callbacks, filesystem, network, DOM, or dynamic code
execution. `AbortSignal` cancellation is checked at deterministic work
boundaries. This is a restricted DSL boundary, not an OS-level security
sandbox; hostile deployments still need process/Worker isolation and a host
termination policy.

## Built-ins and financial correctness

The verified built-ins are `ta.sma`, `ta.ema`, `ta.rsi`, `ta.macd`, `ta.atr`,
`ta.stdev`, `ta.highest`, `ta.lowest`, scalar `abs/min/max/sqrt/pow/round/floor/ceil`,
typed inputs, `plot`, and `hline`. EMA, RSI, and ATR use the same warm-up and
smoothing conventions as the current native Indicator Engine. Missing values
are `null` in aligned series; arithmetic/comparison/conditional operations
propagate missing values. Bars are ascending UTC Unix milliseconds and sessions
are not inferred from wall-clock timestamps.

Script instance updates use the full ordered snapshot. This makes append,
developing-bar replacement, historical correction, and parameter changes
deterministic and isolated, but the v0.1 implementation does not claim O(1)
script updates.

## Commands and results

Executed locally:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm test` | Pass: 48 Node tests |
| `npm run test:browser` | Pass: 3 Chromium tests |
| `npx playwright test --project=mobile-chrome` | Pass: 3 tests |
| `npm run test:browser:compat` | 3 Mobile Chrome passed; 9 Firefox/WebKit/Mobile Safari launches blocked; command exits non-zero by design |
| `cd examples/nextjs-app-router && npm run build` | Pass: Next.js 15.5.28 |
| `npm run package:check` | Pass: packed public package contains compiler/runtime exports |
| `npm run package:smoke` | Pass: clean tarball consumer imports ESM package |
| `npm run benchmark:browser` | Pass: measured Canvas2D and cleanup output below; repeated runs show host variance |
| `npm run benchmark:klinescript` | Pass: measured runtime output below after operation-accounting hardening |
| source audit / `test ! -d .github/workflows` | Pass: no GitHub Actions and no dynamic runtime execution |

The compiler/runtime suite includes deterministic malformed-source seeds for
unterminated strings, Unicode policy boundaries, nested expressions, unknown
intrinsics, non-finite numerics, complexity limits, and attempts to reference
`constructor`, `globalThis`, and `eval`. The focused hardening suite passed 14
tests; the complete Node suite passed 48 tests.

## Browser and environment

Project Playwright is `1.64.1`. The official dry-run requires Firefox 157
(Playwright build 1555) and WebKit 27.2 (build 2370); those cache entries were
absent. The official pinned Docker attempt
`mcr.microsoft.com/playwright:v1.64.1-noble` also failed with `Forbidden` while
downloading image layers. No arbitrary binaries, system Firefox, or system
Safari were substituted. The existing Chromium configuration uses the
available Headless Chromium 154.0.0.0 executable.

## Performance and memory

The latest Canvas2D benchmark ran with Headless Chromium 154.0.0.0,
`--disable-gpu`, and the repository's deterministic fixture:

| Candles | rAF FPS | Frame p50/p95 (ms) | Frame-work p50/p95 (ms) | Append/update (ms) |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 64.10 | 16.6 / 17.2 | 1.0 / 1.3 | 1.146 |
| 10,000 | 61.68 | 16.7 / 16.8 | 0.8 / 3.1 | 0.590 |
| 100,000 | 62.29 | 16.7 / 16.9 | 0.7 / 1.2 | 0.652 |

Observed heap was 620.65 MB before destruction and 1.90 MB after destruction;
remaining canvas count was zero. Separate immediately preceding runs observed
54.51 FPS and 31.2 ms frame-interval p95 at 100k, demonstrating host variance.
These are engine/workload observations, not memory caps or universal
performance claims; no Canvas subsystem rewrite was made for KlineScript.

The latest release-check KlineScript benchmark ran on Node.js v24.19.0 Linux
x64. Observed values were compile 3.255 ms; historical execution median/p95
1.524/1.524 ms at 1k, 4.910/4.910 ms at 10k, and 52.608/52.608 ms at 100k;
2,699,794 counted operations at 100k; ten lifecycle updates 8.055 ms; four
concurrent 10k instances 26.077 ms; pre-cancelled execution raised
`KlineScriptRuntimeError`; and disposal completed. Three samples make these
directional local observations, not release budgets.

## Public API and documentation

The root package exports `compileKlineScript`, diagnostic/runtime types,
`KlineScriptCompiledProgram`, `execute`/`createIndicatorDefinition`, and
`Chart.addScriptIndicator`. `@openkline/react` exports the
`scriptIndicators` prop. Runnable documentation is in:

- `docs/api/klinescript.md`
- `docs/klinescript/{language-spec,grammar,types,builtins,examples}.md`
- `docs/architecture/klinescript*.md` and ADRs 004–008
- `docs/guides/{writing-indicators,debugging-scripts}.md`
- `examples/vanilla/klinescript.html`
- `examples/nextjs-app-router/app/example-script.ts`

## Known technical debt and deferred scope

- A synchronous evaluator cannot hard-preempt arbitrary wall-clock work or
  enforce a JavaScript heap cap. A terminating Worker/process boundary is a
  future host feature, not silently implied by this runtime.
- Script updates recompute full history. Incremental script state/bytecode
  optimization is deferred until a correctness-preserving design is measured.
- Session metadata/intrinsics, loops, user functions, imports, strategy/order
  APIs, drawing language, plugin marketplace, and Python/Pine compatibility are
  deliberately not implemented.
- Firefox, WebKit, and Mobile Safari require official Playwright artifacts from
  an environment with access to the official CDN/image registry. The project
  acceptance gate remains open; no exception was invented in this report.
- Phase 3's trusted TypeScript plugins remain trusted in-process code and are
  not converted into the KlineScript security model.

## Git verification and Phase 2 readiness

The Phase 4 implementation commits use `Akira Yuzai <yuzai.akira@gmail.com>`
as both author and committer and were pushed immediately after verification:

- `0d4602b` — compiler/runtime foundation
- `7464dad` — workspace source references
- `2c6c6a7` — integration playground and benchmarks
- `3ee7e1d` — runtime correctness and fuzz coverage
- `a7e4d98` — browser workspace restoration
- `54f4024` — parser/runtime security hardening and public API boundary

The branch is `work`; the hardening push was synchronized with `origin/work`
at `54f4024` before this documentation increment, and no history was rewritten
or force-pushed. The final documentation commit must use the same identity and
be pushed immediately.

The independent security audit and Phase 5 readiness assessment are in
`docs/audits/klinescript-security-audit.md` and
`docs/reports/phase-5-readiness.md`.

Phase 2 remains ready for continued work only under its already documented
environment exception; it is not closed by Phase 4. Phase 4 is **not ready to
close** until the owner accepts the unresolved browser gate or the official
Firefox/WebKit artifacts become available and the compatibility suite passes.
