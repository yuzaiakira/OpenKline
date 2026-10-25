# KlineScript Worker runtime

The synchronous KlineScript interpreter remains the reference execution path.
`KlineScriptWorkerRuntime` is an optional asynchronous adapter around that same
compiler and interpreter. The worker entry point is `src/klinescript/worker.ts`;
it is emitted as an ESM asset beside the package entry point and is created
only when a host asks for it. Server-side imports therefore remain safe.

## Boundary

The host sends versioned, structured-cloneable messages. A compiled program is
never transferred because it contains closures and frozen interpreter state.
The compile response contains only serializable language/version/id/source and
metadata. The worker keeps the executable program in its private cache and
the host receives execution results, diagnostics, and explicit error codes.

```text
host Chart/Studio
    | compile / execute / update-input
    v
KlineScriptWorkerRuntime -- structured clone --> worker.ts
                                                    |
                                         compileKlineScript + interpreter
                                                    |
                               result / diagnostic / error / ack
```

Requests carry a monotonically assigned request id and a caller-controlled
generation. Responses from an older generation are rejected as stale. A
timeout or explicit cancellation terminates the worker and recreates it lazily
for the next request; this is the hard cancellation boundary that synchronous
JavaScript cannot provide. `dispose()` terminates the worker and rejects every
pending task.

The `update-input` operation owns a worker-side `CandleStore` session. The
initial call transfers a validated snapshot; subsequent append or correction
calls transfer only the changed candle. The worker still recomputes the
current script result using the existing correctness-first interpreter. It does
not claim O(1) script updates until the incremental execution milestone proves
equivalence.

## Failure and cleanup contract

- Compiler diagnostics are returned as data and never execute a failed program.
- Runtime budget, invalid-input, cancellation, timeout, crash, and protocol
  failures reject the task with a stable `KlineScriptWorkerError.code`.
- A malformed request with an identifiable request id receives a protocol
  error; unidentifiable messages are ignored.
- Worker errors reject pending tasks and discard the worker instance.
- Request timers, sessions, compiled cache entries, and event listeners are
  cleared on cancellation, restart, and disposal.

This boundary is isolation and lifecycle control, not a complete security
sandbox. The language restrictions and runtime budgets remain mandatory, and a
host executing hostile content must apply its own origin/process policy.
