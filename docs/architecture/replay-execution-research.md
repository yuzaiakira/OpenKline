# Replay-causal execution research foundation

Status: **INTERNAL IMPLEMENTATION VERIFIED — NOT PUBLIC**

The owner has authorized internal Phase 16.0 engineering based on the reviewed
design at commit `76ad54525958e5689b752b49855209beacdb37ee`. The current
implementation is an unexported research simulator; it is not a supported
package API, broker integration, live execution path, or claim of historical
exchange fills. Phase 15.5 compatibility, legal, accessibility, and release
gates remain independent and open. Phase 16.0.1 corrective hardening is
verified by focused and full local tests, but does not expand that boundary.

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

The implementation lives behind the internal `src/research-execution/`
boundary. The current milestone keeps the cohesive runtime in a small number
of files rather than prematurely splitting it into public-style subsystems:

- `types.ts`: internal versioned assumptions, decisions, outcomes, quality,
  ledger, journal, and export records;
- `engine.ts`: replay-controller session adapter, causal frontier and latency,
  Level-2 eligibility, passive policy, execution, ledger, corporate actions,
  reconstruction, journal retention, and disposal;
- `reference.ts`: small synchronous reference implementation for numerical
  parity; and
- `index.ts`: internal-only module entry point, never imported by the root
  package export.

Future extraction into identity, eligibility, liquidity, ledger, journal, or
serialization files is deliberately deferred until measured need justifies
it.

The root package, React package, Studio, and existing Paper Trading exports do
not import or re-export this boundary. The public API proposal remains
`PROPOSED — NOT PUBLIC` and requires a separate additive API decision.

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

## Phase 16.0.1 correctness hardening

The internal implementation now treats interactive decisions as durable,
ordered scenario records rather than transient mutations:

- submissions and cancellations are a discriminated decision union with a
  stable `decisionId`, monotonic `decisionOrdinal`, cursor, clock, and event
  identity; cancellation records survive backward/forward reconstruction and
  release a reservation at most once;
- same-cursor decisions are replayed in canonical ordinal/ID order, while
  edits against a future branch are rejected instead of being silently moved
  earlier;
- `maxPendingOrders` counts the candidate being submitted (`>=` capacity is
  full), and rejected, cancelled, and terminal orders do not consume future
  capacity;
- bounded journals use a monotonic sequence for unique IDs and expose retained
  count, total emitted count, eviction count, and an explicit completeness
  flag. An evicted journal is not described as a complete audit trail;
- every reservation and fill path asserts finite, non-negative cash/position
  state and the available-cash and reserved-position identities. These are
  fail-closed research invariants, not exchange guarantees; and
- corporate actions are keyed by instrument/action logical identity and source
  generation. Ambiguous source generations fail closed unless an exact
  authoritative source is selected. Dividend entitlement is fixed at the
  ex-dividend boundary and is not retroactively rescaled by a later split.
  Observed session boundaries also fail closed while a venue is closed or its
  boundary state is indeterminate.

The corresponding fixtures compare complete orders, fills, ledger, journal,
and retention metadata against the independent reference ledger. No internal
research type is re-exported through the root package.

## Replay seek and reconstruction

Interactive decisions are scenario records, not mutable market history. On a
backward seek, the engine reconstructs from the tape start or a validated
checkpoint using only decisions whose recorded availability frontier is at or
before the new cursor. Decisions made later are excluded from the visible
scenario state, not silently moved earlier. Durable cancellation records are
replayed through the same decision activation path, so a cancelled order
cannot become executable after reconstruction. A user changing a historical
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

The owner authorization for internal Phase 16 engineering is recorded in the
current owner instruction. The implementation milestones are:

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

Phase 16.0.1 completed the corrective verification increment for the
decision journal, pending-capacity boundary, bounded-audit metadata,
financial reservations, corporate-action provenance, and session eligibility.
Its benchmark adds a deterministic cancellation/reconstruction scenario and
does not replace the separate chart or Order Flow performance gates.

## Phase 16.0.2 scalability and lifecycle hardening

The internal runtime now separates canonical state construction from defensive
consumer reads. A runtime revision invalidates one canonical `ResearchSnapshot`
cache; `getSnapshot()` and listener delivery receive cloned data, while
`getOrders()`, `getFills()`, and `getJournal()` reuse the canonical snapshot
without rebuilding unrelated state. This preserves the immutable boundary
without making repeated inspection pay for repeated map sorting, diagnostics,
or ledger projection.

Bounded journal storage is an in-place ring buffer. The retained export is
still chronological and journal IDs remain monotonic, but an append at the
retention limit does not allocate a second full retained array. Decision
records are indexed by replay cursor, so event reconstruction activates the
small cursor-local decision list rather than filtering the complete scenario
history on every event.

Order-book diagnostic counts are maintained by the research adapter instead of
calling `OrderBookController.getHistory()` for each snapshot. This avoids a
defensive clone solely for a count and keeps the public order-book contract
unchanged. Disposal clears the research decision indexes, observation maps,
journal ring, warning/quality state, and snapshot cache after unsubscribing and
disposing replay and order-book controllers.

The Phase 16.0.2 benchmark records repeated snapshot-read latency separately
from event processing. It deliberately does not claim that the simulator is a
broker, matching engine, or exchange-capacity measurement. Full historical seek
still reconstructs from the event tape; introducing a checkpoint format remains
an open, measured follow-up because order-book gap state and causal decisions
must be restored exactly.

The source remains internal until a separate public API decision; no npm
publication, release, live broker connectivity, or license change is covered
by this authorization.
