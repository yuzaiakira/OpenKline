# Market Replay benchmark

`npm run benchmark:market-replay` runs the deterministic Node reference
benchmark in `scripts/market-replay-benchmark.mjs`. It measures tape
validation, controller construction, next/previous event, cold seek, warm
checkpoint seek, export/import, and two-panel coordinator routing for mixed
candle, trade, Level-2, session, and Footprint workloads.

The benchmark reports median and p95 over repeated samples. It distinguishes
cold seek from seek after checkpoints. It is not a browser FPS test and does
not measure provider/network throughput.

Default sizes are 1,000, 10,000, and 100,000 events. A 500,000-event run is
available on a machine with sufficient memory:

```bash
OPENKLINE_REPLAY_INCLUDE_500K=1 npm run benchmark:market-replay
```

Checkpoint snapshots are deliberately defensive. The 500k workload therefore
uses a sparse checkpoint interval and must be interpreted separately from
warm-checkpoint results. Existing Phase 14.6 Order Flow and Canvas2D
benchmarks remain the reference for chart rendering performance; this replay
benchmark must not replace the historical 100k Chart/Fit Content matrix.

## Latest local run

The exact command, Node version, event counts, medians, p95 values, heap
observations, and whether the optional 500k run was completed belong in
`docs/reports/phase-15-final-verification.md`. No browser compatibility or
production-capacity claim is inferred from this Node benchmark.
