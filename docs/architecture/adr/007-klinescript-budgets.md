# ADR 007: KlineScript resource budgets

Status: accepted for Phase 4 v0.1.

Conservative source, token, AST, lookback, dataset, operation, and output
limits are enforced at the compiler or runtime boundary. Expensive built-ins
count each generated value. Cancellation is cooperative at deterministic work
boundaries; synchronous JavaScript cannot promise arbitrary wall-clock
preemption or a heap cap, so neither is claimed.

