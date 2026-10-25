# Security policy

## Scope

The KlineScript compiler accepts source text and produces a validated,
restricted synchronous interpreter program. It does not evaluate JavaScript
source and exposes no filesystem, network, DOM, browser-global, Node-global,
prototype, or host-callback capability to scripts. Resource limits cover source
size, tokens, AST complexity, declarations, lookback, input bars, counted
operations, per-bar work, and output points.

KlineScript is not an OS-level sandbox. A synchronous JavaScript runtime cannot
hard-preempt arbitrary JavaScript or impose a heap cap. Applications executing
hostile or untrusted user scripts must add a separately controlled process or
Worker termination boundary and must treat the trusted TypeScript plugin SDK as
a different, in-process trust class.

## Reporting

Please do not publish an exploitable security issue with reproduction details
before the maintainer has had an opportunity to investigate. Use the
repository's GitHub security reporting channel when it is enabled, or contact
the project owner through the repository before opening a public issue. Include
the affected commit, a minimal reproduction, impact, and any required runtime
conditions. Do not include credentials or private market data.

There is currently no promise of a stable release or a guaranteed response
time. The current support baseline and known compatibility blockers are recorded
in `docs/reports/phase-5-readiness.md`.
