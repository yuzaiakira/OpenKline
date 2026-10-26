# Phase 8.1 Paper Trading Performance Observation

## Scope

This report measures the framework-independent paper account, not Canvas2D
rendering or a real exchange. The benchmark feeds deterministic normalized
market events, submits approximately 100 market buys per scenario, and
measures event processing and order submission with Node's
`performance.now()`. It uses `node --expose-gc` and reports heap observations
after the account is disposed and its local reference is released.

Command:

```text
npm run benchmark:paper-trading
```

Environment for the recorded run:

- Node `v24.19.0`
- UTC deterministic fixture clock
- 1,000, 10,000, and 100,000 market events
- long-only, spot, no leverage, fixed zero commission/slippage
- garbage collection exposed; no browser or external data source

## Recorded run

| Events | Order fills | Append median (ms) | Append p95 (ms) | Max append (ms) | Submit p95 (ms) | Total (ms) | Retained heap delta (MB) |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 99 | 0.0034 | 0.0117 | 0.5439 | 0.0349 | 9.789 | 0.13 |
| 10,000 | 99 | 0.0014 | 0.0035 | 0.7994 | 0.0378 | 38.030 | 0.00 |
| 100,000 | 99 | 0.0010 | 0.0027 | 9.1480 | 0.0497 | 258.012 | 0.01 |

The benchmark observed `gcAvailable: true`, with post-dispose heap values of
5.50 MB, 5.50 MB, and 5.51 MB respectively. These are one local Node run,
not acceptance thresholds and not a claim about browser frame rate, device
memory, exchange latency, or production capacity. The 100k maximum append
outlier should be investigated in a future profiling pass if it repeats; the
median and p95 paths remained sub-millisecond in this run.

## Interpretation and open work

The account's event path keeps O(1) incremental position/equity updates and
does not recalculate the event history. The state intentionally retains
processed event identifiers for replay/idempotency safety, so memory behavior
depends on session duration and deduplication retention policy. No retention
policy or browser Canvas2D result is introduced by this benchmark. Browser
rendering, mobile devices, Firefox, WebKit, Mobile Safari, and formal
accessibility remain open gates.

