# Portfolio backtesting API

`createPortfolioBacktest()` is the synchronous reference engine for a bounded,
multi-instrument, long-only simulation with one shared cash ledger. It accepts
provider-neutral `PortfolioInstrumentInput` values and evaluates each trusted
registered strategy on completed candles. A signal becomes eligible at the end
of its source interval and fills only at the next eligible candle open.

```ts
import {
  createPortfolioBacktest,
  serializePortfolioBacktestResult,
  serializePortfolioOrdersCsv,
} from "openkline";

const session = createPortfolioBacktest({
  accountCurrency: "USD",
  initialCapital: 100_000,
  instruments: [
    {
      id: "btc",
      symbol: "BTC-USD",
      quoteCurrency: "USD",
      timeframe: "1h",
      candles: btcCandles,
      strategy: { strategy: "EMA_TREND", parameters: { period: 20 } },
      calendar: { id: "UTC-24x7", version: "1" },
    },
    {
      id: "eth",
      symbol: "ETH-USD",
      quoteCurrency: "USD",
      timeframe: "1h",
      candles: ethCandles,
      strategy: { strategy: "EMA_CROSSOVER", parameters: { fastPeriod: 8, slowPeriod: 21 } },
    },
  ],
  positionSizing: { type: "fixed-notional", amount: 5_000 },
  commission: { type: "percent", value: 0.001 },
  slippage: { type: "percent", value: 0.0005 },
  risk: { maxTotalGrossExposure: 50_000, minimumAvailableCash: 10_000 },
  valuation: { policy: "last-known-price", maxAgeMs: 86_400_000, incomplete: "allow" },
});

try {
  const result = session.run();
  console.log(result.finalAccount, result.metrics.perInstrument);
  console.log(serializePortfolioBacktestResult(result));
  console.log(serializePortfolioOrdersCsv(result));
} finally {
  session.dispose();
}
```

## Contracts and deterministic semantics

- All instruments must use the same explicit quote and account currency. The
  engine does not guess FX conversion or exchange calendars.
- Instrument IDs are unique and are sorted canonically before timeline
  construction. Unsorted candles are normalized; duplicate timestamps are
  rejected by default or resolved explicitly with `last-write-wins`.
- The canonical event order at equal timestamps is market-open, bar-complete,
  order-fill, and valuation. Stable instrument and order IDs break remaining
  ties. A completed-bar signal can therefore fill at the next eligible open,
  including across a data gap, but never on the signal bar.
- One cash ledger is shared by all instruments. Initial entries are long-only,
  unleveraged, and rejected when cash, exposure, drawdown, allocation, active
  position, or minimum-cash limits would be violated. Rejection reasons remain
  in the order ledger.
- `last-known-price` valuation uses the newest causal completed close or an
  execution mark. Stale/unknown marks produce `partial` or `unknown` account
  status; `incomplete: "reject"` fails a run with an open position rather than
  inventing a liquidation price.
- `cancel()`, abort signals, and `dispose()` never publish a partial result.
  `run()` is terminal after completion or failure; `dispose()` is terminal for
  the session lifecycle.

`PortfolioBacktestResult` contains assumptions, instrument summaries, causal
signals, timeline, orders, completed trades, open positions, shared equity
snapshots, final account state, per-instrument contributions, metrics, and a
deterministic input fingerprint. JSON export includes `schemaVersion: 1`;
CSV helpers export orders, completed trades, and equity snapshots. JSON import
validates ledger identities, finite financial values, timestamps, status
transitions, references, and bounded array sizes before returning a defensive
copy.

### Causal as-of presentation

`projectPortfolioBacktestAsOf(result, asOfTime)` creates a presentation-safe
projection of a completed run. It includes only signals available by the
boundary, hides future fills and completed trades, derives positions that were
open at the boundary, and selects the last causal account snapshot. The source
result remains unchanged and `sourceFinalAccount` is retained only as an
explicit comparison field:

```ts
import { projectPortfolioBacktestAsOf } from "openkline";

const asOf = projectPortfolioBacktestAsOf(result, Date.UTC(2025, 0, 15));
console.log(asOf.projection, asOf.finalAccount, asOf.metrics);
```

An as-of projection is a presentation of the completed deterministic ledger;
it is not a resumable backtest session and must not be used to infer fills
after its `asOfTime`.

## Worker boundary

`createPortfolioBacktestWorker()` accepts the serializable
`PortfolioBacktestWorkerRunOptions` shape and runs the built-in strategy
registry in a dedicated Worker. Registries, callbacks, `AbortSignal`, and
arbitrary code are intentionally excluded from this boundary. Progress is
versioned and generation-scoped. Cancellation terminates the Worker; a newer
run supersedes the previous run; stale responses, timeouts, malformed messages,
crashes, and disposal cannot update the current result. Use
`docs/architecture/portfolio-execution.md` for the lifecycle and ownership
model.
In a bundled application the host should provide a Worker entry that bundles
`createPortfolioBacktestWorkerHandler`; package-relative Worker URLs are not
assumed to work in every bundler.

## Workspace and Studio

`createPortfolioBacktestWorkspace()` and `parsePortfolioBacktestWorkspace()`
persist only bounded serializable configuration: capital, costs, sizing, risk,
valuation, strategy parameters, and calendar identity. Candle history,
credentials, Worker objects, progress, results, and runtime subscriptions are
never persisted. `StudioWorkspaceDocument.portfolioBacktest` is optional so
older workspaces remain valid. The Next.js Studio uses deterministic offline
fixtures and a host-owned Worker entry. Its synchronous fallback is visible and
bounded to small demo runs only; large runs fail explicitly when the host
cannot serve a Worker.
