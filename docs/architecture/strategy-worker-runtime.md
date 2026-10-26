# Strategy Worker runtime

OpenKline keeps `createBacktest()` as the synchronous financial reference and
adds `createBacktestWorker()` for UI and other asynchronous hosts. The Worker
is an execution boundary, not a second financial engine:

```text
BacktestWorkerSession
  ├─ initialize(datasetId, validated-clone of Candle[])
  └─ run(serializable built-in options)
        |
        v
  Backtest Worker -> createBacktest() -> built-in StrategyRegistry
        |
        v
  progress / complete / error
```

## Protocol

`OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION` is currently `1`. Every request
and response includes a non-empty `requestId` and non-negative integer
`generation`. The request types are:

- `initialize`: transfers a defensive candle dataset and stable dataset ID;
- `run`: sends strategy ID, parameters, execution assumptions, and no
  callbacks, signals, registries, or source code;
- `cancel`: identifies the active request; and
- `dispose`: releases Worker-side dataset and execution state.

Responses are throttled `progress`, one `complete` result, typed `error`, or
an `ack`. Stable error codes include `WORKER_UNAVAILABLE`, `WORKER_CRASHED`,
`TIMEOUT`, `CANCELLED`, `SUPERSEDED`, `PROTOCOL`, `WORKER_DISPOSED`,
`INITIALIZE_REQUIRED`, `INVALID_INPUT`, and `EXECUTION_FAILED`.

The public type boundary intentionally has no `strategyRegistry`, `AbortSignal`,
progress callback, arbitrary evaluator, JavaScript source, or function field.
Custom trusted TypeScript strategies remain available only to synchronous
`createBacktest()` unless a future explicitly versioned extension adds them.

## Cancellation and generations

Backtest execution is synchronous inside the Worker. A `cancel()` therefore
rejects the active promise and terminates the Worker, which is the only
reliable way to interrupt a long synchronous loop. A later run creates a fresh
Worker and reinitializes its dataset. A superseding run rejects the previous
promise with `SUPERSEDED`; a timeout or crash rejects all pending work and
allows a new Worker to recover.

The host accepts a result only when its request and generation still belong to
the active session. Studio additionally checks component mount state, panel
scope, and run token before applying results or markers. Disposal terminates
the Worker and removes listeners; no partial result is retained.

## Parity and ownership

The Worker handler invokes `createBacktest()` with the built-in registry. It
uses the same validation, causal strategy evaluation, next-bar-open fills,
order transitions, accounting, equity/drawdown, metrics, fingerprints, and
serialization model. Protocol progress is throttled to avoid flooding the
main thread, while the synchronous engine remains responsible for the
financial result.

The Worker keeps a validated defensive dataset after initialization so repeat
runs do not resend candles. Each run still creates a fresh backtest session
and built-in registry. Structured-clone transfer cost and Worker startup are
separate from engine execution and must be measured separately; no universal
latency or memory claim follows from the local tests.
