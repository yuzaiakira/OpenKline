# Phase 14.5 — Order Flow Performance Hardening

## Verification disposition

Phase 14.5 engineering work is implemented and locally verified on the
provider-neutral order-flow path. The milestone remains open: the protected
historical API baseline still reports three changed declaration hashes, and
this cloud environment does not provide the managed Firefox/WebKit binaries or
physical mobile devices required for a full browser acceptance claim.

- Starting baseline: `46255e5d95e7466019b67df9e9bd70350c256575`
- Source implementation tip used for this verification: `6ae278a74418f6f499a1a68e6fc2fd52c382afc1`
- Verification date: 2026-10-30 UTC
- Branch: `main` (Phase 14.5 was explicitly required to continue on `main`)
- Phase 15: not started

The report records measured behavior from deterministic local fixtures. It does
not convert cloud timings into device-wide performance guarantees.

## Implemented improvements

### Data and analytics

- `MarketTradeStore` now maintains a lazy chronological index and uses binary
  time bounds for range reads. Corrections and out-of-order inserts invalidate
  the index; returned records remain defensive copies.
- `OrderBookHeatmapStore` uses the same indexed-range approach and preserves
  chronological output after out-of-order observations.
- `CumulativeVolumeDeltaCalculator` caches the exact result and updates the
  affected bucket for strictly chronological inserts. Exact duplicates are
  ignored; revisions, out-of-order events, option changes, session-calendar
  changes, and causal boundaries use the deterministic reference calculation.
- `FootprintCalculator` incrementally updates the newest bucket for same-cell,
  new-cell, and new-bucket appends. Corrections, out-of-order events, bounded
  budget changes, off-tick failures, and `asOfTime` boundaries invalidate the
  cache and use `calculateFootprint`.

### Rendering and lifecycle

- Footprint rendering reads only the visible trade window. Large windows use a
  deterministic time/price pixel grid with bounded columns, rows, and command
  output; exact analytics are not replaced by display LOD.
- Footprint render commands are cached with the flow revision, viewport range,
  chart-data revision, replay cutoff, direction, pane geometry, price
  transform, device scale, and display options. Resize, scale, replay, style,
  series, and data changes therefore invalidate transformed commands.
- Depth heatmap rendering performs time/price culling and deterministic level
  stride sampling under an 8,000-command budget.
- Dense Canvas2D line paths use first/minimum/maximum/last samples per pixel
  column for display only. Stored data, queries, and tooltip values remain
  complete.
- High-frequency trade and depth state mutations stay synchronous while visual
  commits are coalesced to one animation frame. Pending frames are cancelled
  during chart destruction.

## Profiling findings

The initial real-browser workload showed that the dominant costs were not
Canvas primitive calls alone:

1. Full-history trade range filtering/sorting was repeated for visible order
   flow queries.
2. CVD and Footprint paths allocated and rebuilt dense analytical structures
   during live updates.
3. Full-window Footprint and depth overlays emitted work outside the visible
   time/price rectangle and had no deterministic display budget.
4. Each live order-flow event could trigger a complete synchronous chart
   commit, causing duplicate layout and Canvas work.

The evidence came from the real `order-flow-browser-benchmark.mjs` workload,
not from synthetic function-only timing. The final run used 45 records:
1,000/10,000/100,000 trades, plain/CVD/Footprint/depth/combined scenarios, and
realistic (120 bars), medium (2,000 bars), and fit-content viewports.

## Performance measurements

### Node analytics

Command: `npm run benchmark:order-flow`

All values are median/p95 milliseconds from the final deterministic run.

| Records | Trade flow | CVD | Footprint | Order-book apply |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 2.245 / 2.301 | 2.385 / 2.783 | 3.061 / 5.548 | 2.313 / 2.485 |
| 10,000 | 9.324 / 15.406 | 16.033 / 17.834 | 22.150 / 32.240 | 10.577 / 17.896 |
| 100,000 | 90.621 / 108.913 | 155.741 / 192.286 | 278.684 / 300.715 | 145.391 / 146.317 |

The same run measured correction-result reads at 0.001–0.004 ms median for
the larger sizes and as-of indexed reads at 0.347 ms (10k) and 4.764 ms
(100k). These are Node reference measurements, not browser frame times.

### Canvas2D browser matrix

Command: `npm run benchmark:order-flow:browser`

Browser: system Chromium fallback, `HeadlessChrome/154.0.0.0`; Playwright
package version: `1.64.1`. The final command produced 45 records. Values below
are median/p95 latency in milliseconds and navigation/realtime FPS.

| 100k fit scenario | Navigation latency | Realtime latency | FPS nav / realtime |
| --- | ---: | ---: | ---: |
| Plain | 151.2 / 155.3 | 155.3 / 156.6 | 6.57 / 6.80 |
| CVD | 188.0 / 194.2 | 458.9 / 473.3 | 5.63 / 2.71 |
| Footprint | 203.6 / 293.8 | 179.2 / 195.2 | 4.64 / 5.68 |
| Depth | 174.7 / 182.2 | 184.2 / 196.9 | 5.73 / 5.25 |
| Combined | 259.5 / 422.1 | 511.4 / 567.4 | 3.38 / 2.22 |

The 100k combined realistic viewport measured 16.7/17.1 ms navigation and
156.2/308.7 ms realtime latency at 60.06/4.73 FPS. The medium viewport
measured 16.6/16.7 ms navigation and 153.2/310.1 ms realtime latency at
60.61/4.32 FPS. Fit-content remains materially more expensive because it
intentionally processes the complete visible history.

For directional comparison, the pre-hardening fit-content run recorded
approximately 561.5/563.1 ms CVD navigation and 694.6/875.5 ms combined
navigation. The final run recorded 188.0/194.2 ms and 259.5/422.1 ms. These
are separate process runs with the same deterministic fixture and should be
treated as evidence of the optimization direction, not as a controlled device
benchmark or a universal claim.

### Cleanup measurements

All 45 browser records reported:

- one chart Canvas before destruction and zero canvases afterward;
- zero active Workers before and after each scenario;
- no browser page errors in the stress profile;
- `stress:ci` status `pass` and `remainingCanvases: 0`.

## Correctness and invalidation

- Trade revisions and out-of-order inserts remain reference-calculation
  fallbacks; no incremental path silently signs or drops corrected volume.
- Unknown and estimated aggressor-side volume remains explicitly separated.
- Replay and `asOfTime` calculation paths continue to use causal filtering;
  future trades are not appended to an as-of Footprint or CVD result.
- Source replacement, chart removal, workspace restoration, and destruction
  dispose stores, subscriptions, heatmap state, CVD state, and pending frames.
- Order-flow state updates are synchronous; only the visual commit is deferred,
  so financial state and event ordering are not changed by frame coalescing.
- Existing public Chart APIs and `docs/audits/public-api-baseline.json` were
  not modified.

## Regression validation

Successful commands on the final implementation:

- `npm run typecheck`
- `npm test` — 305 passed, 0 failed, 0 skipped
- `npm run api:inventory`
- `npm run api:diagnostics` — no structural removals or incompatible member changes
- `npm run studio:check`
- `npm run package:check`
- `npm run package:smoke`
- `npm run package:audit`
- `npm run package:portability`
- `npm run distribution:check`
- `npm run test:browser` — 34 Chromium tests passed
- `npm run test:react:browser` — 37 Chromium tests passed
- `npm run test:react:production` — 1 Chromium production test passed
- `npm --prefix examples/nextjs-app-router run build`
- `npm run benchmark:order-flow`
- `npm run benchmark:order-flow:browser` — 45 records produced
- `npm run benchmark:browser`
- `npm run benchmark:multi-chart`
- `npm run profile:multi-chart`
- `npm run benchmark:corporate-actions`
- `npm run benchmark:corporate-actions:chart`
- `npm run benchmark:portfolio`
- `npm run benchmark:portfolio-worker`
- `npm run benchmark:portfolio-result`
- `npm run benchmark:multi-timeframe`
- `npm run benchmark:calendar`
- `npm run stress:ci` — pass

### Open or blocked commands

`npm run api:check` exited 1. The protected baseline reports no removed
exports but changed hashes for:

- `openkline:runtime:Chart`
- `openkline:type:WorkspaceDocument`
- `openkline:type:WorkspaceRestoreOptions`

The diagnostics report no structural removals or incompatible member changes;
the additive/evolution review and protected baseline approval remain open. The
baseline file was not rewritten to make this gate pass.

The official Playwright-managed Chromium, Firefox, and WebKit paths are absent
in this cloud image. The run used the available `/usr/bin/chromium` fallback.
Firefox, WebKit, mobile-browser projects, physical devices, GPU/WebGL paths,
and accessibility/visual sign-off were not claimed or tested by this report.

## Acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Indexed bounded trade and heatmap reads | Implemented / verified | Node tests and 1k/10k/100k benchmark |
| Incremental CVD with correction fallback | Implemented / verified | Reference parity tests and chart integration |
| Incremental Footprint with causal fallback | Implemented / verified | Same-cell/new-cell/new-bucket/correction/as-of tests |
| Viewport time/price culling and deterministic LOD | Implemented / verified | Chromium order-flow matrix and exact analytics separation |
| Depth indexed reads and bounded heatmap sampling | Implemented / verified | Order-book tests, browser matrix, cleanup evidence |
| Frame coalescing without async financial state | Implemented / verified | Chromium lifecycle/synchronization tests |
| Replay, source switching, stale response, disposal | Implemented / verified | Node/browser lifecycle and existing datafeed tests |
| 1k/10k/100k analytics and Canvas workloads | Implemented / verified | Node benchmark plus 45-record browser matrix |
| Public API compatibility | Open | `api:diagnostics` clean; protected `api:check` fails on 3 hashes |
| Chromium browser verification | Verified in environment | 34 + 37 + 1 tests; system Chromium only |
| Firefox/WebKit/mobile/physical-device verification | Blocked / not tested | Required browser binaries/devices unavailable |
| Accessibility and visual approval | Not tested in this gate | Requires the separate evidence workflow |
| Phase 15 readiness | Open | Do not begin Phase 15 while mandatory gates remain open |

## Git and publication controls

The Phase 14.5 implementation commits use `Akira Yuzai
<yuzai.akira@gmail.com>` as both author and committer. Each successful
implementation commit was pushed immediately to `origin/main`; no force push,
history rewrite, GitHub Actions, npm publication, release tag, license change,
or public release was performed.

Implementation commits from the starting baseline:

- `8c6c50e5e22976a15a626f54faa450b1bc413e04`
- `7e11e805d7f2c98da4903578ee7a1c62c88bfc02`
- `95b8c061108da129e8444c71b4053cf808b59015`
- `2716a5839fa35377ba4e5d2f5033b99b8aba1769`
- `027bd02c6deaa7d4724d3f38a8c4292f3bd94578`
- `708cd0fe957605783d3ecea2bd5b508d11a50ef6`
- `e768e34e3eca4baf090ba725b47292d661d4c1a9`
- `6ae278a74418f6f499a1a68e6fc2fd52c382afc1`

The audit artifacts in this documentation increment were regenerated locally;
they do not alter the protected compatibility baseline. The repository must
remain on the open Phase 14.5 gate until the owner approves the API baseline
decision and the unavailable browser/device evidence is supplied.
