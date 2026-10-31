# Replay-causal execution research foundation

Status: **PROPOSED — INTERNAL DESIGN ONLY**

Phase 16.0 is not authorized for implementation at the current governance
boundary. This document is the reviewable design and implementation plan; it
does not describe an existing engine, supported API, broker integration, or
historical fill reconstruction.

## Boundary

The proposed component is a deterministic research simulator for hypothetical
spot, long-only, unleveraged orders over a `MarketReplayTape`. It must keep
three domains separate:

1. Observed records: imported candles, trades, Level-2 snapshots/deltas,
   source status, sessions, and corporate-action events.
2. Assumptions: clock and knowledge policy, modeled latency, tick and quantity
   rules, fee/slippage policy, liquidity policy, risk limits, and initial cash.
3. Results: simulated order transitions, indicative fills, ledger snapshots,
   diagnostics, and a causal scenario journal.

No simulated fill may be inserted into `MarketTradeStore`, canonical CVD,
Footprint, or any observed event tape. A tape fingerprint identifies the
canonical input representation; it does not authenticate provider data.

## Existing capabilities to reuse

| Existing component | Reuse in the proposed simulator | Boundary |
| --- | --- | --- |
| `MarketReplayTape` and `MarketReplayController` | Canonical event ordering, event/receive clocks, strict-causal knowledge policy, cursor, seek, reset, step, cancellation, and disposal | Do not create a second market clock or reorder events independently |
| `MarketReplayCoordinator` | Optional panel/session coordination after public approval | No Studio integration in the unauthorized foundation |
| `market-replay-identity.ts` | Instrument/venue/source-generation logical identities and collision prevention | Never key records by display symbol or trade ID alone |
| `MarketTradeStore` and `market-trades.ts` | Validation, revision-aware observed trade lookup, source coverage, and as-of filtering | Results remain separate from the canonical store |
| `OrderBookController` | Snapshot/delta reconstruction, sequence-gap detection, stale/recovering/error states, tick policy, and bounded history | A reconstructed book is indicative liquidity, not proof of executable inventory |
| `market-depth.ts` and `order-flow.ts` | Depth quality diagnostics and observed CVD/Footprint views for analysis | Never feed simulated trades into these calculations |
| `financial.ts` | Transaction-cost and adverse-slippage mathematics | Add only explicitly approved tick/quantity normalization around it |
| `paper-trading/engine.ts` | Accounting invariants, order audit vocabulary, risk rejection ideas, and lifecycle safety | Existing public Paper Trading semantics remain unchanged; its live/replay isolation is not bypassed |
| `backtesting/` and `portfolio-backtesting/` | Deterministic ledger/reference calculations, cost assumptions, long-only policy, corporate-action boundaries, and result export patterns | Do not silently widen the existing backtest contract or duplicate incompatible accounting |
| Corporate actions and trading calendar modules | Causal effective/payment boundaries, split cost-basis treatment, session closures, and calendar identity | Unsupported mechanics fail closed |
| Existing Worker protocols | Future isolated execution only after measured need and explicit protocol design | No Worker or public export is added in the unauthorized design phase |

The first implementation task must compare the Paper Trading and portfolio
ledger formulas line by line with the proposed reference ledger. Reuse is
required where semantics are compatible; an adapter must document every
intentional difference.

## Proposed internal module boundary

If owner authorization is granted, the implementation should live behind an
internal module boundary such as `src/research-execution/` (final names must
follow repository conventions). The planned responsibilities are:

- `types.ts`: internal versioned assumptions, decisions, outcomes, quality,
  ledger, journal, and export records;
- `identity.ts`: scenario/order/source logical identities;
- `eligibility.ts`: replay frontier, latency, knowledge, source, and clock
  checks;
- `liquidity.ts`: synchronized Level-2 validation and conservative passive
  policy;
- `execution-model.ts`: marketable and passive scenario evaluation;
- `ledger.ts`: cash, reserve, long position, costs, P&L, valuation, and risk;
- `journal.ts`: immutable causal transitions with bounded retention/export;
- `reference.ts`: small synchronous reference implementation for parity;
- `session.ts`: replay controller adapter, seek reconstruction, reset, and
  disposal;
- `export.ts`: bounded JSON-only scenario export/import validation.

These names are a design proposal, not authorization to create source files.
The root package, React package, Studio, and existing Paper Trading exports
must not import or re-export this boundary during Phase 16.0 without a later
owner-approved additive API decision.

## Causal event processing

For a decision made after cursor event `E`, the simulator records:

- the decision cursor and event ID;
- the decision clock and genuine receive time, when present;
- an eligibility frontier computed from the selected replay clock and latency;
- the source/instrument/venue/generation identity;
- the first later eligible event(s) considered by the model.

The event at `E` is not eligible by default. A zero-latency policy still means
“after the decision event,” not “reuse the decision event.” Fixed and bounded
deterministic latency are modeled assumptions and are never presented as
observed network latency. `receive-time` mode cannot fabricate a receive time;
missing receive timestamps produce an explicit unavailable/indeterminate
diagnostic.

Processing order must be inherited from the validated tape. Future book,
trade, candle, CVD, Footprint, source-status, session, or corporate-action
events cannot influence a result before their frontier. Same-timestamp ordering
must use the tape's ordering version and be recorded in the scenario export.

## Order lifecycle

The bounded initial model supports market buy/sell, limit buy/sell, and cancel
pending order for one spot instrument. Long-only, no leverage, no borrowing,
no shorting, no derivatives, and no live routing are hard constraints.

The internal lifecycle is:

```text
submitted -> accepted -> pending -> partially-simulated -> fully-simulated
                         |             |                    |
                         +----------> cancelled             +--> terminal
                         +----------> rejected
                         +----------> expired
                         +----------> indeterminate
```

Every transition is deterministic and idempotent. `indeterminate` means that
the historical information cannot establish the modeled outcome; it is not a
rejected live-exchange order. Order IDs and idempotency keys must include the
scenario identity and must not collide across source generations.

## Replay seek and reconstruction

Interactive decisions are scenario records, not mutable market history. On a
backward seek, the engine reconstructs from the tape start or a validated
checkpoint using only decisions whose recorded availability frontier is at or
before the new cursor. Decisions made later are excluded from the visible
scenario state, not silently moved earlier. A user changing a historical
decision must create a new scenario branch or explicitly reset the scenario.

Forward seek, step, pause, reset, cancellation, and disposal must use the
existing `MarketReplayController` lifecycle. Reconstruction must compare the
complete ledger and journal with a full run, not only final P&L.

Source switches invalidate the active scenario unless an explicit new source
generation is selected. Similar symbols and provider trade IDs are never
merged. Stale callbacks, subscriptions, Workers, and pending frames must be
cancelled on switch and disposal.

## Financial and quality invariants

The reference ledger must preserve:

- `availableCash = cash - reservedCash`;
- non-negative available cash under the unleveraged spot model;
- non-negative long quantity and cost basis consistency;
- weighted-average simulated fill price for partial fills;
- cumulative fees and modeled slippage separately from gross P&L;
- `equity = cash + eligible mark value` when valuation is complete;
- partial/unknown valuation when an eligible mark is stale or absent;
- no synthetic end-of-tape liquidation;
- explicit split, dividend entitlement, and payment boundaries.

Missing quotes, crossed/locked books, stale books, sequence gaps, partial
coverage, unknown receive time, unavailable venues, and unsupported corporate
actions must affect a quality classification and fail closed according to the
selected policy. OHLCV never supplies an inferred executable bid/ask.

## Incremental authorization plan

After written owner authorization for internal Phase 16 engineering:

1. Freeze this design and record the exact approved internal scope.
2. Add internal contracts and a synchronous reference ledger without changing
   root exports or existing Paper Trading behavior.
3. Add marketable eligibility, passive uncertainty, precision, cost, and risk
   handling with independent numerical fixtures.
4. Add replay session reconstruction, source switching, quality diagnostics,
   export validation, and disposal tests.
5. Add optimized/reference differential tests and no-lookahead mutation tests.
6. Add the bounded benchmark and compare chart/order-flow baselines without
   changing them.
7. Re-run API inventory/diagnostics and confirm no public surface changed.
8. Update the Phase 16 report with executable results and keep all Phase 15.5
   acceptance gates open.

Until step 1 is authorized, only this design and the associated review
documents may be changed.
