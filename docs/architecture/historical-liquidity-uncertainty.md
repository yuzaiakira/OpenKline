# Historical liquidity and execution uncertainty

Status: **PROPOSED — INTERNAL DESIGN ONLY**

Historical prices and displayed Level-2 records are observations. They do not
prove that a hypothetical order could access inventory, obtain queue priority,
or receive a fill. Phase 16.0 must preserve that uncertainty in both data
structures and user-facing language.

## Information domains

| Domain | Examples | Allowed use |
| --- | --- | --- |
| Observed | `MarketTrade`, order-book snapshot/delta, source status, receive time, sequence, corporate-action event | Only after identity, clock, revision, and quality validation |
| Assumption | latency, tick policy, fees, slippage, participation cap, passive scenario, risk limits | Must be immutable in a scenario and included in every export |
| Simulated | order status, indicative fill, cash, position, P&L, diagnostics | Must carry `simulated`/quality labels and never become observed data |

## Marketable orders

A modeled market order may be considered only when all required conditions are
true at an eligible frontier:

1. instrument, venue, source ID, and source generation match the order;
2. a synchronized order-book state is available for that source stream;
3. the state is not stale, recovering, errored, or affected by an unresolved
   sequence gap;
4. the best bid/ask is finite, positive, and not crossed or locked under the
   selected policy;
5. tick, quantity, and requested size are valid;
6. displayed depth and participation limits are sufficient for the modeled
   portion of the order;
7. the event clock and latency frontier make the state eligible; and
8. source coverage is adequate for the selected result quality.

If any required condition is absent, the result is unavailable or
indeterminate according to policy. The engine must not derive a quote from a
candle, OHLC range, trade print, CVD, or Footprint. Displayed depth is an
indicative constraint only and is never described as guaranteed executable
inventory.

## Passive limit orders

The default policy is `no-inferred-passive-fill`: a price touch alone cannot
produce a definitive fill. Queue position, cancellations, hidden liquidity,
latency, and matching priority are not observable from historical snapshots.

The planned policies are:

| Policy | Behavior | Result language |
| --- | --- | --- |
| `no-inferred-passive-fill` | Keep the order pending/indeterminate unless an explicitly supported observation proves the modeled condition | No fill claim |
| `conservative-eligibility` | Record that price/liquidity conditions were eligible, without declaring execution | Hypothetical eligibility only |
| `explicit-scenario` | Apply a named, deterministic scenario with participation/queue assumptions | Simulated and assumption-bound; never measured probability |

Scenario results must include an optimism classification (`optimistic`,
`conservative`, or `indeterminate`) and the exact assumption set. They must not
claim actual queue priority, historical fill probability, or exchange access.

## Quality classification

The internal quality model should preserve distinct reasons instead of
collapsing them into a boolean fill result:

- `available`: all selected evidence is eligible and internally consistent;
- `stale`: quote/book age exceeds the configured bound;
- `crossed` or `locked`: bid/ask relationship violates the selected policy;
- `sequence-gap`: order-book continuity is not established;
- `missing-receive-time`: receive-time replay cannot establish eligibility;
- `partial-coverage`: source coverage does not cover the requested interval;
- `source-unavailable`: no matching source state exists;
- `invalid-quantity` or `invalid-price`: precision/validation failed;
- `unsupported-corporate-action`: accounting cannot be applied safely;
- `indeterminate`: the available observations cannot establish a result.

The selected quality, source status, sequence, last synchronized timestamp,
quote age, and diagnostic reason belong in the journal and result snapshot.

## Latency and causality

Latency is a scenario assumption, not a correction to historical timestamps.
The simulator must record decision time, observed receive time when present,
modeled delay, and eligibility time separately. Zero modeled delay still
advances beyond the decision event. Fixed delay uses a deterministic frontier;
a bounded schedule must be deterministic and identified by version. Missing
receive timestamps cannot be filled with `event.time`, wall-clock time, or an
estimated network delay.

## Precision and partial quantity

Tick-size and quantity policies must be explicit (`reject`, deterministic
rounding, or an explicitly bounded allowance). Invalid tick sizes, negative or
non-finite quantities, and precision that would create a phantom fill must
reject or become indeterminate before ledger mutation. Partial simulated
execution records requested, simulated, remaining, weighted-average price,
fees, modeled slippage, depth consumed under the policy, and the quality of
each portion.

## Corporate actions and sessions

Splits, dividends, and session boundaries are replay events with their own
causal frontiers. A split may transform an open long position only at its
effective event and must preserve aggregate economic cost. Pending-order
handling must be an explicit policy. Dividend entitlement and payment are
separate. No future action, calendar state, or session close may affect an
earlier decision. Unsupported action mechanics fail closed.

## Contamination prevention

Simulated fills use a separate internal type and result store. They are not
written to `MarketTradeStore`, `MarketTradeDataset`, canonical CVD, Footprint,
time-and-sales, or order-book history. Any future chart or Studio integration
must render simulated results as a separate research overlay and must not
present them as venue prints.

This separation is a hard acceptance criterion, not merely a documentation
convention.
