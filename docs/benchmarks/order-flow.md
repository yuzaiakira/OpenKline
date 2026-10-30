# Order-flow benchmark contract

Phase 14 benchmarks must measure deterministic Node analytics and the actual
Canvas2D consumer separately. Required Node sizes are 1,000, 10,000, and
100,000 trades, plus 1,000, 10,000, and 100,000 order-book deltas. Required
observations include ingestion, deduplication/correction, sequence checks,
best bid/ask, Footprint, CVD, as-of reconstruction, recovery, heap, and
disposal.

Browser measurements must distinguish plain OHLCV, CVD, Footprint, depth, and
combined views across realistic (120 bars), medium (2,000 bars), and fit (all
bars) visible windows. Report FPS, frame interval median/p95, update latency,
heap, canvas count, and Worker count after disposal. A result is
environment-specific and does not establish a universal device claim.
Displayed depth is liquidity observation, not guaranteed executable liquidity.

## Reproduction

Run the Node and browser workloads sequentially because both rebuild the shared
`dist/` directory:

```bash
npm run benchmark:order-flow
npm run benchmark:order-flow:browser
npm run benchmark:cvd-cache
npm run benchmark:realtime-cvd
npm run benchmark:dense-ohlcv
```

The Node workload uses deterministic `MarketTradeStore`, Footprint, CVD, and
`OrderBookController` fixtures at 1,000, 10,000, and 100,000 records. It also
checks correction replacement, event-time as-of filtering, sequence-gap
staleness, depth metrics, and disposal. The browser workload creates real
Canvas2D charts for plain, CVD, Footprint, depth, and combined scenarios at
the same trade/delta sizes, repeating each scenario for the three viewport
profiles. It measures load, pan/zoom visual latency, realtime update latency,
frame interval/FPS, and heap/canvas state around destruction. Every result
includes `size`, `viewport`, and `visibleBars`, so fit-content measurements are
not mixed with realistic-window measurements.

Neither command uses external credentials or market data. Values in the Phase
14 report are the output of the exact commands on the recorded environment;
the scripts deliberately make no cross-device performance guarantee. The
chart-facing Phase 14.5 path also measures the effect of indexed visible-range
reads, deterministic Footprint display LOD, cached CVD append state, and dense
Canvas2D line-path reduction; these optimizations must be reported separately
from exact analytics timing.

## Phase 14.6 focused workloads

`benchmark:cvd-cache` measures a 100,000-trade Node calculator with 100
chronological appends, latest-point reads, one historical correction, a full
snapshot, and independent numerical parity. `benchmark:realtime-cvd` runs the
same scale in a real Chromium Canvas2D chart and separates calculator update,
latest observation, chart call, series update, renderer commit, visual-frame
latency, and full public `getCvdResult()` snapshots. Its correction counters
must show the full replacement path and its parity flag must be true.

`benchmark:dense-ohlcv` measures 1,000, 10,000, and 100,000 source points for
candlestick, OHLC, hollow-candlestick, Heikin-Ashi, volume, and histogram
presentations. It records actual Canvas2D fill/stroke command counts, fit and
navigation timing, source length, and canvas cleanup. Candlestick/OHLC/hollow
commands may be reduced by display-only pixel-column aggregation; Heikin-Ashi
and volume/histogram remain exact because their semantics are not interchangeable
with a candle aggregate.

The focused browser scripts use the local system/Playwright Chromium selected
by the existing repository fallback. They do not claim Firefox, WebKit, mobile,
physical-device, or universal performance compatibility.
