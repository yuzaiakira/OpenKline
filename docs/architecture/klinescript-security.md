# KlineScript security boundary

KlineScript is a restricted DSL, not an OS-level security sandbox. It has no
`eval`, `new Function`, dynamic import, filesystem, network, DOM, browser
global, Node global, reflection, prototype access, arbitrary member traversal,
host callback, loop, recursion, or user-defined function capability. The only
external values are validated candles and validated input parameters. Calls
are selected from a fixed intrinsic table during semantic analysis.

The compiled program retains a frozen validated AST. Workspace persistence
stores source and a content-derived id, never executable functions or runtime
objects. Runtime budgets count evaluation and built-in work, reject excessive
datasets/lookback/output, validate finite numeric results, and fail before
publishing a partial `IndicatorResult`.

Trusted TypeScript plugins remain trusted in-process JavaScript and are a
different security class. Hosts that execute hostile scripts should add a
process/Worker isolation boundary and termination policy; this package does
not claim that a browser Worker alone is a security sandbox.

