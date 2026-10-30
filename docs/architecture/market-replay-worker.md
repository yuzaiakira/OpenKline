# Market Replay worker boundary

Phase 15 profiling keeps the synchronous `MarketReplayController` as the
financial reference path. A Worker is not added merely to create a second
runtime: checkpoint state contains defensive market data and must remain
numerically identical to the synchronous reconstruction.

The current controller has no Worker protocol, no worker callbacks, and no
worker-owned subscriptions. If a measured production workload makes cold
backward seeks or checkpoint generation unacceptable, a future additive
protocol must include a version, cancellation, supersession generation,
progress, stale-message rejection, crash/timeout handling, and disposal. It
must be tested against the synchronous reference before use.

The absence of a Worker is therefore explicit, not an unverified claim of
Worker acceleration. Existing strategy, portfolio, and KlineScript Worker
contracts remain unchanged.
