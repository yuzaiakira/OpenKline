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

Heatmap range reads use a lazily maintained timestamp index and clone only the
selected observations. Insertion order remains the retention order exposed by
`getAll()`, while range results are chronological and safe for viewport-culling
renderers, including when accepted observations arrive out of order.

## Chart integration

`Chart.setOrderBookSnapshot` starts or replaces a book when instrument/source
identity changes. `Chart.applyOrderBookDelta` applies one validated update;
the controller's sequence state determines whether the book is live, stale, or
recovering. `setOrderBookSource` adds cancellation, stale-response checks,
subscription cleanup, and destruction cleanup around a provider-neutral
`OrderBookDatafeed`.

`setDepthOptions` controls the depth overlay and optional heatmap. The heatmap
contains only accepted timestamped observations; it does not interpolate
liquidity between provider events. `getDepthState(asOfTime)` and
`getDepthMetrics()` are safe for replay and expose explicit integrity/quality
states rather than treating stale or crossed data as available liquidity.
High-frequency snapshot and delta callbacks keep the controller state
synchronous while coalescing Canvas2D commits to the chart frame scheduler.

In unified replay, snapshots and deltas are applied only after their event
frontier is eligible. The existing `OrderBookController` remains responsible
for sequence gaps, duplicate deltas, stale/recovering transitions, and valid
snapshot recovery. Replay retains a gap diagnostic after recovery and never
interpolates missing liquidity; a displayed book is historical observation,
not an executable fill assumption.
