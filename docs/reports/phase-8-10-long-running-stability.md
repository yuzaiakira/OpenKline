# OpenKline Phase 8.10 — Long-Running Stability and Real-Time Stress Testing

## Final technical verdict

**`STABILITY VERIFIED — TESTED WORKLOADS PASS`**

No product-code defects were reproduced under CI, local, or 30-minute soak
profiles. The P0 `setDatafeed()` lifecycle fix remains intact under sustained
indicator/Worker churn. Official five-browser certification from Phase 8.9.2
is preserved for the unchanged product SHA.

## 1. Exact tested source

| Role | SHA |
| --- | --- |
| P0 behavioral fix | `02e92874fa60e176099acb3eb96953858e31e87e` |
| Official five-browser product tip (Phase 8.9.2) | `a73334616543243245f0e63f2f845d1c31dd9e0c` |
| Phase 8.9.2 harness/docs tip (branch base) | `c33ab83740cd208821b6df3c5cdae0aa75d820a8` |
| Phase 8.10 branch | `qa/phase-8-10-long-running-stability` |

Product sources under stress are those of `a733346` / `c33ab83` (docs+harness
only after `a733346`). Phase 8.10 commits add stress harness, tests, and this
report — **no chart/engine behavioral changes**.

Phase 8.9.2 close-out: already committed on
`qa/phase-8-9-2-official-browser-verification` at `c33ab83` with stamp
`official-20261029T170300Z` (full five-browser + packed + benchmark green).

## 2. Stress harness configuration

Entry points:

- `scripts/phase-8-10-node-stress.mjs` — market integrity + advanced modules
- `scripts/phase-8-10-browser-stress.mjs` — chart interaction / lifecycle / memory
- Profiles: `scripts/phase-8-10/profiles.mjs`
- Oracle: `scripts/phase-8-10/expected-state.mjs` (independent of product stores)
- npm: `stress:ci`, `stress:local`, `stress:soak`
- CI gate: `tests/phase-8-10-stress.test.ts`

| Profile | Seed | Event budget | Max wall clock | Candle bases | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| `ci` | `0x81010c1` (`135270593`) | 4_000 | 2 min | 1k, 10k | Default CI |
| `local` | same | 80_000 | 5 min | 1k, 10k, 100k | Extended local |
| `soak` | same | 1_200_000 | **30 min** | 1k, 10k, 100k | Soft duration ceiling |

Overrides: `OPENKLINE_STRESS_PROFILE`, `OPENKLINE_STRESS_SEED`,
`OPENKLINE_STRESS_EVENTS`, `OPENKLINE_STRESS_MAX_MS`.

Correctness is event/seed based; wall-clock is a ceiling, not the sole pass
criterion.

## 3. Browser / runtime versions

| Surface | Runtime |
| --- | --- |
| Node stress | Node `v24.19.0` (agent host) / Node unit tests via `node --test` |
| Browser stress | Host Chromium via Playwright launch (`HeadlessChrome/155…`) |
| Phase 8.9.2 official cert (unchanged product) | Playwright `1.64.1`, Chromium `156.0.8078.4`, Firefox `157.0`, WebKit `27.2`, digest `sha256:47b510dd…` |

Stress browser work used the available host Chromium environment. Complete
five-browser soak was **not** required; the digest-locked five-browser matrix
remains the Phase 8.9.2 evidence for the unchanged product SHA.

## 4. Data-integrity results (node)

Independent expected-state oracle vs product `CandleStore` / dual
`InMemoryDatafeed` subscribers / `WebSocketDatafeed` reconnect /
delayed+aborted `RestDatafeed`.

| Profile | Status | Processed | Rejected (invalid OHLC) | Final store size | Timed out on wall clock |
| --- | --- | ---: | ---: | ---: | --- |
| ci | pass | 4_000 | 343 | 1_062 | no |
| local | pass | 80_000 | 6_674 | 20_075 | no |
| soak | pass | 190_106 | 14_774 | 58_439 | **yes** (30 min ceiling) |

Soak exercised reconnects, symbol/timeframe switches, delayed REST, aborted
REST, duplicates, revisions, historical inserts, and multi-subscriber delivery
for ~30 minutes wall clock (~190k events; delayed REST sleeps dominate). Store
remained chronological; oracle and product store matched at every sample
checkpoint.

Event-processing latency (soak reservoir, n=20_000): median **0.62 ms**,
p95 **17.4 ms**, max **56.3 ms**.

## 5. Chart interaction / setDatafeed lifecycle (browser)

| Profile | Status | Interaction rounds | setDatafeed rounds | Orphan failures | Remaining canvases |
| --- | --- | ---: | ---: | ---: | ---: |
| ci | pass | 16 | 24 | 0 | 0 |
| local | pass | 72 | 120 | 0 | 0 |
| soak | pass | 180 | 240 | 0 | 0 |

Workloads included pan/zoom/resize, theme + price-scale changes, indicator
add/remove, drawings, workspace serialize/restore, mount/unmount,
StrictMode-like double create/destroy, and repeated `setDatafeed` with prior
SMA/RSI/`addScriptIndicatorAsync` Workers. No orphaned `pre-*` indicator ids or
series after switches; Worker-backed scripts cleared with managed indicators.

Local/soak 100k path: destroy left **0** canvases each cycle.

## 6. Advanced module stability (node)

| Profile | KlineScript | Replay | Backtest cancel | Paper trading |
| --- | ---: | ---: | ---: | ---: |
| ci | 40/40 | 40/40 | 40/40 | 40/40 |
| local | 200/200 | 200/200 | 200/200 | 200/200 |
| soak | 800/800 | 800/800 | 800/800 | 800/800 |

Subsystem failures did not appear; cancellation and duplicate market events
stayed isolated to their APIs.

## 7. Memory and resource observations

- Browser heap samples show growth with candle base size (expected) and return
  to **0 canvases** after `destroy()`.
- Soak browser `heapDelta` ≈ 21 MB across the run with final canvas count 0 —
  not treated as a leak (single-process accumulation across 1k→100k loads;
  destroy clears canvases).
- Node soak RSS/heap samples recorded every 10k events; no unbounded
  chronological store growth beyond accepted inserts/appends.
- Do not infer leaks from a single heap sample; multi-sample + canvas/subscription
  cleanup were the gate.

## 8. Performance vs Phase 8.9.2 baseline

Host re-check (`scripts/browser-benchmark.mjs`, Chromium 155):

| Candles | rafFps | updateFrameMs | remainingCanvasCount |
| ---: | ---: | ---: | ---: |
| 1_000 | 65.73 | 1.045 | — |
| 10_000 | 62.41 | 0.685 | — |
| 100_000 | **62.0** | 0.73 | **0** |

Phase 8.9.2 official container baseline @ 100k: ~**62.7 FPS**, **0** canvases.
Host re-check is statistically comparable under an equivalent workload (no
invented guarantee; measurement noise and browser build differ).

## 9. Confirmed defects and fixes

| Item | Class | Outcome |
| --- | --- | --- |
| Product chart/datafeed/lifecycle bugs under stress | — | **None reproduced** |
| Soak harness `Math.max(...1.2M latencies)` stack overflow | Harness | Fixed (iterative max + latency reservoir) |
| Recursive `nextEvent` retry on exhausted insert slots | Harness | Fixed (bounded loop + unique historical insert cursor) |
| Browser stress counting vanilla example canvas | Harness | Fixed (isolated blank document) |

No product regression tests beyond the new stress gate were required.

## 10. Remaining functional limitations

1. Stress browser coverage is Chromium-host, not a second digest-locked
   five-browser soak.
2. Soak event count is wall-clock limited (~190k / 30 min) because delayed REST
   sleeps dominate; raise `OPENKLINE_STRESS_EVENTS` only with longer ceilings or
   lower delay injection if a pure event-budget soak is required.
3. Root-owned `dist/` from prior Docker runs can block `npm run clean` on the
   host until ownership is restored (environment ops, not product).

## 11. Recommended next engineering priorities

1. Optional: wire a digest-pinned container job for `stress:ci` only (short).
2. Optional: reduce delayed-REST sleep weight in soak to push higher event
   counts inside 30 minutes.
3. Keep Phase 8.9.2 official matrices as the browser certification source of
   truth until product behavior changes.

## 12. Evidence location

- `artifacts/phase-8-10/node-stress-{ci,local,soak}.json`
- `artifacts/phase-8-10/browser-stress-{ci,local,soak}.json`
- `artifacts/phase-8-10/benchmark-browser-recheck.log`
- Phase 8.9.2 official: `artifacts/phase-8-9-2/official-20261029T170300Z/`
