# Optimization Worker Scheduling

Phase 8.2.2 adds `createOptimizationWorker()` as a typed orchestration layer
over the existing `createBacktestWorker()` boundary.

## Pool and ownership

The session validates and generates the same deterministic candidate list as
the synchronous core. It launches at most `workerCount` candidate jobs at a
time. Each active candidate owns one existing Backtest Worker session, and the
session is disposed immediately after completion or failure. This bounds
simultaneous Worker count and avoids sending full candidate results in
progress events. Worker execution is available only for the trusted built-in
strategy registry; custom registries remain synchronous.

Results are placed into the candidate's original index before deterministic
ranking. Worker completion order cannot affect the selected result. Every
summary carries the optimization job ID, strategy/version, candidate ID,
dataset fingerprint, assumptions, and execution status. Full backtest payloads
remain opt-in and bounded.

## Lifecycle

The public lifecycle is `idle → running → completed`, with explicit
`cancelled`, `failed`, and terminal `disposed` states. A second `run()`
supersedes the active generation. `cancel()` terminates every active
Backtest Worker, rejects the job, and never publishes a partial report as
completed. `dispose()` performs the same cleanup and removes listeners.

Candidate timeouts come from the existing Backtest Worker runtime. An overall
timeout can be supplied directly or through
`limits.maxTotalExecutionTimeMs`. Worker startup/crash failures may be retried
once with a fresh existing Worker session; cancellation, invalid input, and
financial execution failures are not silently retried.

The session's generation checks ensure a stale Worker response cannot update
the current job status. A host must still scope a session to its chart/panel
identity and dispose it when the panel is unmounted.

## Financial boundary

The scheduler transfers serializable strategy parameters and execution
assumptions only. The Worker invokes `createBacktest()`; it does not contain a
second order simulator. Paper Trading is not called by the optimizer, and no
result activates an account or submits an order.
