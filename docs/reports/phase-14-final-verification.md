# OpenKline Phase 14 — Final Verification

Status: **engineering implementation delivered; final acceptance remains open**.

This report records only work and measurements performed in the local cloud
environment. It does not certify an exchange feed, executable liquidity,
cross-browser compatibility, physical devices, licensing, or release approval.

## 1. Revision and delivery ledger

| Item | Value |
| --- | --- |
| Starting revision | `33b80653633dd3df4cf63732fb52e8671353b39d` |
| Implementation revision before this report | `086c9c6942b5e5dd14ccf1237bf1025564a20683` |
| Branch | `main` |
| Remote | `origin/main` |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` |
| GitHub Actions | Not used |

Phase 14 implementation commits, in order:

1. `24ccb56dec138f4514e44c5faec4ee5965ffb97e` — `feat(market-data): add trade print contracts`
2. `951bedc66e9b659e4194b81023ea460f44dac5c0` — `feat(market-data): expose trade contracts`
3. `fbd61b9b14080ebd0705928128af9a7a00c837cc` — `feat(orderbook): implement sequenced depth reconstruction`
4. `1e3bfeabf5ca6af4892312a913c32b25cefe3ec9` — `feat(orderflow): calculate trade-derived footprint and cvd`
5. `9c10c3a953fe46f86b9bf4b742ecdc0bc717060b` — `feat(chart): integrate order flow displays and lifecycle`
6. `b4faae39a2fd1e41f782f6c7fa743072f36b73b6` — `feat(studio): add order flow analysis workflows`
7. `086c9c6942b5e5dd14ccf1237bf1025564a20683` — `perf(orderflow): optimize bounded aggregation workloads`

Each implementation commit was created with the required identity, pushed to
`origin/main`, and synchronized before continuing. The final documentation
commit(s) will be added to this ledger after the report is committed.

## 2. Implemented capabilities

### Phase 14.0 — trade-print contracts

- Versioned `MarketTrade` and `MarketTradeDataset` contracts with UTC event
  time, source and venue provenance, stable IDs, revisions, positive price and
  quantity, and explicit `buy`, `sell`, or `unknown` aggressor side.
- `sideQuality` distinguishes observed, estimated, and unknown classification.
  The core never derives authoritative aggression from candle colour or OHLCV.
- Bounded, correction-aware `MarketTradeStore` and deterministic
  `InMemoryMarketTradeDatafeed` with defensive reads and as-of filtering.

### Phase 14.1 — Level-2 reconstruction

- `OrderBookController` accepts snapshots and explicitly absolute or signed
  delta updates.
- Sequenced deltas are buffered before a snapshot; gaps and contradictory
  predecessors mark the book stale until a replacement snapshot is accepted.
- Duplicate IDs, delayed snapshots, source/instrument identity, tick policy,
  negative resulting quantities, bounded pending state, bounded history, and
  disposal are handled deterministically.
- As-of reconstruction replays only retained accepted events. It never
  interpolates unseen liquidity.

### Phase 14.2 — Footprint and CVD

- Trade-derived buy, sell, unknown, and estimated-volume accounting.
- Revision-aware deduplication and `[from, to)` plus `asOfTime` semantics.
- Actual execution prices and explicit tick normalization for Footprint cells.
- Continuous CVD and calendar-backed session reset; session reset without an
  explicit calendar is rejected.
- Bounded Time & Sales output.
- Aggregation now canonicalizes input once per calculation and performs nested
  bucket/cell aggregation without rebuilding stores for every child slice.
  This preserves output semantics and removes a measured allocation/sorting
  bottleneck.

### Phase 14.3–14.5 — chart, replay, workspace, and Studio

- Depth best bid/ask, spread, imbalance, locked/crossed/stale quality, and a
  bounded non-interpolating heatmap.
- Canvas2D Footprint overlay, CVD line series/pane, depth overlay, and Time &
  Sales through the existing ChartModel, SeriesCollection, CanvasRenderer,
  Pane, and plugin-overlay architecture.
- Provider-neutral Chart source APIs with cancellation, stale-response
  protection, live subscription cleanup, replay masking, and destruction
  cleanup.
- Workspace documents persist canonical source references and bounded display
  settings, not raw market data or live book state.
- Next.js Studio exposes deterministic offline fixtures, Footprint/CVD/depth
  controls, coverage and book-quality status, Time & Sales, replay-safe state,
  and per-chart isolation.

### Phase 14.6 — verification assets

- Deterministic Node trade/order-book benchmark at 1k, 10k, and 100k records.
- Real Chromium Canvas2D benchmark for plain, CVD, Footprint, depth, and
  combined workloads, including visual latency, FPS, heap, canvas, and Worker
  cleanup observations.
- Focused cell-budget, as-of, replay, sequence-gap, lifecycle, and browser
  cleanup coverage.

## 3. Test and verification results

All shared-build commands were run sequentially.

| Command or check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 302/302 Node tests |
| `npm run api:inventory` | PASS — 299 runtime exports, 687 type exports |
| `npm run api:diagnostics` | PASS_ADDITIVE_REVIEW_REQUIRED — no removals or incompatible changes |
| `npm run api:check` | FAIL/OPEN — protected historical baseline detects additive surface and changed signatures; no removals |
| `npm run studio:check` | PASS — core remains provider/framework independent |
| `npm run package:check` | PASS — local dry-run package |
| `npm run package:smoke` | PASS — packed ESM consumer |
| `npm run package:audit` | PASS — license status remains `pending-owner-approval` |
| `npm run package:portability` | PASS — zero core/runtime provider dependencies |
| `npm run distribution:check` | PASS — 494 files, local SHA-1 `021142e78ef9f1369f92fc56cca05732274dec57` |
| `npm run test:browser` | PASS — 34/34 Chromium tests |
| `npm run test:react:browser` | PASS — 37/37 Chromium Studio/React tests |
| `npm run test:react:production` | PASS — production Next/Chromium Worker test 1/1 |
| `npm --prefix examples/nextjs-app-router run build` | PASS — Next.js 16.4.3 webpack build |
| `npm run stress:ci` | PASS — Node and Chromium stress; zero orphan failures, zero Worker orphans, zero remaining canvases |
| `npm run benchmark:corporate-actions` | PASS |
| `npm run benchmark:corporate-actions:chart` | PASS — zero remaining canvases |
| `npm run benchmark:portfolio` | PASS |
| `npm run benchmark:portfolio-worker` | PASS |
| `npm run benchmark:portfolio-result` | PASS |
| `npm run benchmark:multi-timeframe` | PASS |
| `npm run benchmark:calendar` | PASS |
| `npm run benchmark:browser` | PASS — existing baseline preserved; 100k plain workload 63.68 FPS in this run |
| `npm run benchmark:multi-chart` | PASS — dual 100k cleanup and synchronization measurements completed |
| `npm run profile:multi-chart` | PASS — trace and component timings produced |
| `npm run benchmark:order-flow` | PASS — deterministic Node order-flow/depth workload |
| `npm run benchmark:order-flow:browser` | PASS — real Chromium Canvas2D workload |

The strict API command is intentionally not converted into a pass by changing
`docs/audits/public-api-baseline.json`; that protected baseline still requires
owner approval for additive API adoption.

## 4. Browser environment and compatibility

Recorded environment: Node `v24.19.0`, npm `11.9.0`, Playwright `1.64.1`,
Linux `x64`, CPU `INTEL(R) XEON(R) PLATINUM 8573C`.

The locally available browser was system Chromium at `/usr/bin/chromium`,
reporting HeadlessChrome `154.0.0.0`. The project’s Playwright configuration
uses that executable for the Chromium projects. Playwright-managed executable
paths were absent for Chromium, Firefox, and WebKit in this cloud environment.

Therefore:

- Desktop Chromium tests and measurements above are verified for this
  environment.
- Official Playwright Firefox and WebKit runs are **BLOCKED / NOT VERIFIED**.
- Mobile Safari emulation is **BLOCKED / NOT VERIFIED** because WebKit is not
  available.
- The mobile-Chrome project was not counted as a Phase 14 pass; responsive and
  touch-sized Chromium Studio tests are not a substitute for device emulation.
- Physical-device compatibility, GPU behavior, Safari, and Firefox are not
  claimed.

No browser-artifact download was retried after the missing managed binaries
were confirmed. No system browser was used to claim Firefox/WebKit support.

## 5. Performance and memory measurements

### 5.1 Node order-flow benchmark after optimization

Median / p95 milliseconds on the recorded Node environment:

| Records | Trade flow | CVD | Footprint | Store ingest | L2 apply |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 1.899 / 2.188 | 2.533 / 2.888 | 3.082 / 5.573 | 0.429 / 0.737 | 3.176 / 3.345 |
| 10,000 | 10.553 / 17.573 | 15.860 / 20.276 | 26.280 / 35.713 | 2.882 / 3.170 | 10.103 / 12.964 |
| 100,000 | 87.523 / 98.528 | 207.097 / 239.257 | 292.645 / 364.645 | 59.045 / 83.710 | 142.571 / 175.004 |

Sequence-gap recovery was `0.105ms`, `0.079ms`, and `0.020ms` for 1k, 10k,
and 100k fixtures; every run ended at the expected sequence and a gap entered
`stale` state. Disposal completed without reported retained controller state.

The focused optimization was measurable against the pre-change run: at 100k,
CVD changed from `344.226ms` median to `207.097ms`, and Footprint changed from
`498.254ms` median to `292.645ms`. These are workload measurements, not a
universal performance promise.

### 5.2 Order-flow Canvas2D benchmark

The combined scenario is the most demanding because it draws candles, a CVD
series, Footprint cells, depth, and heatmap observations:

| Size | Navigation median / p95 | Realtime median / p95 | Navigation FPS | Realtime FPS | Heap before → after destroy | Canvas / Worker |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,000 | 16.6 / 17.2ms | 16.7 / 20.2ms | 59.84 | 60.04 | 10.37MB → 10.37MB | 1→0 / 0→0 |
| 10,000 | 81.7 / 90.0ms | 135.8 / 155.6ms | 11.91 | 7.26 | 105.32MB → 105.32MB | 1→0 / 0→0 |
| 100,000 | 691.8 / 872.1ms | 1352.5 / 1392.6ms | 1.38 | 0.73 | 259.97MB → 72.57MB | 1→0 / 0→0 |

The low 100k order-flow FPS is an observed limitation of this cloud
environment/workload and remains an optimization target. It is not presented
as production readiness. The existing plain 100k benchmark still measured
`63.68 FPS` with `16.7ms` median frame interval in the same Chromium run.

### 5.3 Multi-chart and profiler evidence

- Dual 10k visible-range median: `17.8ms`; dual 100k visible-range median:
  `154.4ms`, p95 `201.1ms`.
- Dual 100k pan median: `153.5ms`; zoom median `156.2ms`; rapid alternating
  median `157.0ms`; crosshair median `3.6ms`, p95 `4.1ms`.
- Dual 100k heap was `410,967,810` bytes before destroy and `77,578,151`
  bytes after; owned canvases were `0` after cleanup.
- The profiler identified series/pane Canvas2D drawing as the dominant cost
  (approximately `57.7ms` median per chart render), with base-frame capture
  approximately `6.3ms` median. Viewport state and crosshair overlay work were
  small by comparison.

## 6. Documentation and public API status

Updated and verified:

- `docs/api/order-flow.md`
- `docs/api/market-depth.md`
- `docs/architecture/order-book-reconstruction.md`
- `docs/architecture/footprint-and-cvd.md`
- `docs/guides/studio-order-flow.md`
- `docs/benchmarks/order-flow.md`
- `docs/ROADMAP.md`
- `docs/audits/public-api-inventory.json`
- `docs/audits/distribution-check.json`

The package remains unlicensed in metadata pending the separately tracked
owner/legal approval. No license, npm metadata, release tag, npm publication,
or GitHub release was changed by Phase 14.

## 7. Acceptance matrix

| Criterion | Status | Evidence / remaining gate |
| --- | --- | --- |
| Versioned trade contracts and explicit unknown side | PASS | Node tests and public API checks |
| Deterministic bounded trade store and corrections | PASS | Node tests, stress, as-of fixtures |
| Sequenced L2 reconstruction and recovery | PASS | Node tests and 1k/10k/100k benchmark |
| Depth metrics and heatmap integrity states | PASS | Node tests and Chromium order-flow test |
| Trade-derived Footprint and CVD | PASS | 6 focused Node tests, Chromium order-flow test |
| Chart-native Footprint/CVD/depth/Time & Sales | PASS | Chromium browser and React Studio suites |
| Replay causality and as-of isolation | PASS | Node and Chromium replay/order-flow tests |
| Workspace canonical persistence | PASS | Workspace Node and React Studio tests |
| Provider-neutral lifecycle/cancellation/cleanup | PASS | Node tests, browser lifecycle tests, stress |
| Studio order-flow workflows and chart isolation | PASS | 37 React Chromium tests, including order-flow Studio |
| Numerical, lifecycle, package, and distribution checks | PASS | Required local command set, except strict baseline |
| Order-flow performance target at 100k | PARTIAL | Measurements completed; combined Canvas2D FPS is low in cloud |
| Historical strict API baseline adoption | BLOCKED / OPEN | Additive API requires owner approval; protected file unchanged |
| Playwright Firefox | BLOCKED / NOT VERIFIED | Managed Firefox binary unavailable |
| Playwright WebKit / mobile Safari | BLOCKED / NOT VERIFIED | Managed WebKit binary unavailable |
| Mobile Chrome emulation | NOT VERIFIED | Not counted as a Phase 14 acceptance pass |
| Physical devices and GPU/browser certification | NOT VERIFIED | Not available in this environment |
| Licensing, release authorization, npm publication | OPEN / NOT VERIFIED | Separate owner/legal gate; no publication performed |
| Phase 15 | NOT STARTED | Explicitly outside this delivery |

## 8. Phase decision

Phase 14’s provider-neutral order-flow implementation, chart integration,
Studio workflow, local tests, package checks, stress checks, and deterministic
benchmarks are delivered and pushed. The overall Phase 14 milestone remains
open because the strict API baseline, official Firefox/WebKit/mobile gates,
physical-device gates, licensing/release authorization, and the measured 100k
order-flow rendering limitation have not been cleared. Phase 15 has not been
started.

Final SHA and remote synchronization are recorded in the commit ledger after
this report is committed. The worktree must remain clean and `HEAD` must equal
`origin/main` before this report is considered final.
