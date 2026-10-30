# Market depth contracts

`OrderBookSnapshot` and `OrderBookDelta` are versioned, provider-neutral Level-2
records. Each record carries instrument, optional venue, UTC event time, source
identity, and optional sequence information. A delta declares one explicit
`quantityMode`: `absolute` replaces a level size, while `delta` applies a signed
quantity change. Zero absolute size removes a level.

`OrderBookController` applies snapshots and ordered deltas without mutating
provider objects. A delta received before a sequenced snapshot is bounded in a
pending buffer. A missing sequence interval, contradictory previous sequence,
invalid resulting quantity, or source mismatch prevents a live publication and
marks the book stale/error. A replacement snapshot is required for recovery.
Duplicate IDs and already-applied sequence ranges are idempotent. Reads are
defensive and depth/history retention is bounded.

The default tick policy rejects off-tick prices. Hosts may explicitly choose
`round` or `allow`; the choice is never implicit. `calculateOrderBookDepthMetrics`
returns explicit `empty`, `stale`, `locked`, `crossed`, or `insufficient` quality
states. The imbalance formula is `(bidDepth - askDepth) / (bidDepth +
askDepth)`, calculated over the requested top-N levels.

Displayed liquidity is not executed volume and does not prove executable fills.
The optional `OrderBookHeatmapStore` retains bounded timestamped observations
only; it does not interpolate unseen depth samples.
