# Backtesting Worker API

Use `createBacktestWorker()` when a browser or application UI must remain
responsive during a built-in historical simulation. Use `createBacktest()` as
the synchronous financial reference and for trusted custom TypeScript
strategies.

```ts
import { createBacktestWorker } from "openkline";

const session = createBacktestWorker({
  strategy: "EMA_TREND",
  parameters: { period: 20 },
  candles,
  initialCapital: 10_000,
  positionSizing: { type: "fixed-quantity", quantity: 1 },
  commission: { type: "percent", value: 0.001 },
  slippage: { type: "percent", value: 0.0005 },
});

const unsubscribe = session.subscribe((status) => {
  console.log(status.state, status.processedBars, status.totalBars);
});

try {
  const result = await session.run();
  // serializeBacktestResult(result) matches createBacktest().run().
} finally {
  unsubscribe();
  session.dispose();
}
```

The Worker API supports the built-in strategies only. It accepts no registry,
evaluator, callback, signal, or arbitrary source field. `cancel()` terminates
the active Worker and rejects the run with `BacktestWorkerError` code
`CANCELLED`; a newer `run()` supersedes a pending run with `SUPERSEDED`.
`WORKER_UNAVAILABLE`, `WORKER_CRASHED`, `TIMEOUT`, `PROTOCOL`,
`INVALID_INPUT`, and `EXECUTION_FAILED` are observable failure codes.

The dataset is defensively cloned and initialized once for repeat runs. The
returned result is the same domain result produced by `createBacktest()`;
parity includes signals, deterministic IDs and timestamps, orders, fills,
accounting, equity/drawdown, trades, metrics, input fingerprint, and exports.
No partial result is published after cancellation, supersession, failure, or
component disposal.
