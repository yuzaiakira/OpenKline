# Screener Worker Runtime

The Screener Worker is a separate, framework-neutral calculation boundary. It does not reuse the Backtest Worker and it never receives a provider object, callback, credential, socket, or browser state. Acquisition resolves instruments and validates bars outside the Worker; the Worker receives only structured-clone-safe rule JSON, instrument metadata, confirmed bars, timeframe, and generation.

Protocol version `1` has `run`, `cancel`, and `dispose` messages plus progress, complete, acknowledgement, and structured error responses. The runtime rejects stale request IDs or generations, terminates a timed-out/crashed worker, rejects superseded jobs, and clears pending timers. Cancellation terminates the Worker, so synchronous indicator evaluation cannot leave a promise unresolved.

The handler uses the same synchronous `evaluateScreenerRuleSet` reference implementation as the main thread. This is the correctness oracle for later scheduling improvements. Worker results are descriptive screener matches only; they do not create alerts, orders, or actions.

