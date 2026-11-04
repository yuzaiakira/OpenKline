# KlineScript security boundary

KlineScript is a restricted DSL, not an OS-level security sandbox. It has no
`eval`, `new Function`, dynamic import, filesystem, network, DOM, browser
global, Node global, reflection, prototype access, arbitrary member traversal,
host callback, loop, recursion, or user-defined function capability. The only
external values are validated candles and validated input parameters. Calls
are selected from a fixed intrinsic table during semantic analysis.

The compiled program retains a frozen validated AST internally, while the
public metadata exposes only stable names, types, styles, and limits. Workspace
persistence stores source and a content-derived id, never executable functions
or runtime objects. Runtime budgets count AST evaluation, vector work, actual
window scans, output allocation, and aggregate work per logical bar; they reject
excessive datasets/lookback/output and fail before publishing a partial
`IndicatorResult`.

The lexer, parser, checker, and runtime all have bounded inputs. Source is
limited to 64 KiB, tokens to 10,000, AST nodes to 20,000, statements to 256,
outputs to 64, nesting to 128, input data to 100,000 bars, lookback to 5,000,
and output points to 2,000,000 by default. The parser has its own nesting guard
so malformed parentheses or unary chains produce diagnostics instead of
relying on the checker to catch stack exhaustion.

Trusted TypeScript plugins remain trusted in-process JavaScript and are a
different security class. `KlineScriptWorkerRuntime` adds a structured,
versioned Worker boundary with timeout/cancellation termination, generation
stale-result rejection, and cleanup. It is a resource and lifecycle boundary,
not an OS or browser security sandbox: Workers may still access the origin's
ambient capabilities unless the host's deployment policy prevents them, and
the language restrictions and runtime budgets remain required.

Studio workspace import treats embedded KlineScript source as untrusted
executable content even when the JSON document parses successfully.
`quarantineStudioImportedScripts` strips chart script indicators into
`pendingImportedScripts` so import never auto-compiles or Worker-executes
embedded source. Explicit Activate is required; self-declared trust flags
inside imported JSON are ignored. Locally authored scripts that the user
already applied and saved continue to restore through the Chart workspace
contract. See
`docs/reports/phase-16-5-10-klinescript-settings-diagnostics-activation.md`.

