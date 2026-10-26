# Paper Trading API

The public API is exported from the package root and is framework-neutral.

```ts
import { createDeterministicPaperMarketStream, createPaperTradingAccount } from "openkline";

const account = createPaperTradingAccount({
  id: "demo",
  displayName: "Simulated USD",
  symbol: "BTCUSD",
  currency: "USD",
  initialBalance: 10_000,
  execution: {
    commission: { type: "percent", value: 0.001 },
    slippage: { type: "percent", value: 0.0005 },
    maxQuoteAgeMs: 5_000,
    allowFractionalQuantity: true,
  },
});
const stream = createDeterministicPaperMarketStream({ symbol: "BTCUSD", initialPrice: 50_000, seed: 42 });
stream.subscribe((event) => account.processMarketEvent(event));
stream.step();
account.submitOrder({ idempotencyKey: "demo-buy-1", side: "buy", type: "market", notional: 1_000 });
stream.step(); // the next fresh event fills the order
```

Only market orders are supported in this milestone. Sizing is one of
`quantity`, `notional`, or `percentageOfAvailableCash`. The account is
single-symbol spot, long-only, and has no leverage or short selling. A reused
idempotency key must repeat the same request or fails with an idempotency
conflict.

Use `getSnapshot()` for cash, reserve, position, P&L, equity, fees, and
drawdown; `getOrders()` and `getTrades()` for audit; `getJournal()` for
diagnostics; `subscribe()` for UI updates; and `exportState()` plus the
parse/serialize helpers for persistence. Call `dispose()` to remove listeners.

Optional risk limits cover order quantity/notional, open exposure, session
loss, high-water drawdown, and pending-order count. The explicit
`setRiskHalt()` operator switch blocks new orders while preserving market
updates and is included in the account snapshot and journal.

The deterministic stream is a test/demo source. It does not represent a real
exchange and does not authorize live execution.

## Transport adapters

`PaperRestMarketAdapter` and `PaperWebSocketMarketAdapter` are reference
transport boundaries. Inject a fetcher or socket in tests and map the vendor
payload to the documented event fields. REST history is paginated and
cancelable; a newer request makes an older response stale. WebSocket
reconnection is bounded and subscriptions are disposable. The adapters
normalize timestamps and validate prices, symbols, modes, quote status, and
sequence numbers, but they do not decide whether an account should fill an
event—that remains the account engine's causal policy.

