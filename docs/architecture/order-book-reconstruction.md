# Deterministic order-book reconstruction

The Level-2 runtime is an independent state machine. It uses separate bid and
ask maps keyed by normalized price; sorting is deferred to bounded public reads,
so a small delta does not clone or sort the entire book. Snapshots replace both
sides. Absolute updates replace/delete levels, and signed delta updates reject a
negative result.

Sequenced sources progress contiguously. Before the first snapshot, deltas are
bounded and buffered. A gap or contradictory predecessor changes the state to
`stale`; later deltas cannot make the book look live until a valid replacement
snapshot is accepted. Sources without sequence numbers are marked
`unsequenced`, which is a weaker integrity guarantee rather than a fabricated
sequence.

The controller records a bounded history of accepted snapshots and deltas. Its
as-of reconstruction replays only events at or before the requested event-time
frontier. This is used by replay and later Chart integration to prevent future
depth leakage without mutating the complete source history. Disconnect and
dispose cancel subscriptions and clear pending/history state.
