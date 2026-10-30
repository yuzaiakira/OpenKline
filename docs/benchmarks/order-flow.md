# Order-flow benchmark contract

Phase 14 benchmarks must measure deterministic Node analytics and the actual
Canvas2D consumer separately. Required Node sizes are 1,000, 10,000, and
100,000 trades, plus 1,000, 10,000, and 100,000 order-book deltas. Required
observations include ingestion, deduplication/correction, sequence checks,
best bid/ask, Footprint, CVD, as-of reconstruction, recovery, heap, and
disposal.

Browser measurements must distinguish plain OHLCV, CVD, Footprint, depth, and
combined views. Report FPS, frame interval median/p95, update latency, heap,
canvas count, and Worker count after disposal. A result is environment-specific
and does not establish a universal device claim. Displayed depth is liquidity
observation, not guaranteed executable liquidity.
