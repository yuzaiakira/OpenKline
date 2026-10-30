# Historical replay checkpoints

`MarketReplayController` creates bounded checkpoints after a configurable
number of eligible events (`checkpointInterval`, default 250). The retained
checkpoint count is bounded (`maxCheckpoints`, default 64).

Each checkpoint is identified by:

- tape version and deterministic dataset fingerprint;
- clock policy (`event-time` or `receive-time`);
- ordering-policy version;
- eligible event cursor and event identity.

The captured state includes completed/forming candle state, accepted trade
revisions, CVD and Footprint accumulators, validated order-book levels,
corporate-action and session frontiers, source coverage, and integrity
diagnostics. No event after the checkpoint cursor is included.

Backward and random seeks restore the nearest compatible checkpoint and apply
only the remaining eligible events. If a stale order-book state cannot be
restored safely from a defensive snapshot, the controller falls back to a
full deterministic reconstruction instead of marking the book live. This
fallback preserves numerical correctness at the cost of seek latency.

Checkpoint snapshots are defensive and are not ordinary workspace persistence.
Changing the tape fingerprint, ordering policy, clock policy, correction
policy, or source versions requires a new controller/checkpoint set.

Correctness is defined by parity with a fresh full replay to the same cursor:
completed candle values, current revisions, trade totals, CVD, Footprint,
corporate-action visibility, order-book levels/status, and coverage flags must
match exactly.
