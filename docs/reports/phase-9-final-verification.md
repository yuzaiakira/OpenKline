# Phase 9 final verification

Date: 2026-10-30

## Executive result

Phase 9.0 through 9.4 engineering work is implemented and locally verified for
the available Node and Chromium environments. The milestone remains **open**:
the committed public-API baseline needs explicit review/approval for the
intentional Phase 9 surface, and official Firefox, WebKit, mobile Safari, and
physical-device gates were unavailable in this cloud environment. This report
does not claim universal browser compatibility, exchange-reported
volume-at-price, or release readiness.

## Recovery and Git state

The interrupted workspace was recoverable. The Phase 9.1 uncommitted changes
were present at task entry, were reviewed in place, and were not reconstructed
from memory or duplicated. The task started from the verified Phase 9.0 commit:

| Item | SHA / result |
| --- | --- |
| Task-entry `main` and `origin/main` | `51c86bf8a0fe1546dfc7471c1227125568ad6598` |
| Phase 9.1 rendering | `67bdc26346fd3d83e1d22846bd504cd82f50fd9d` |
| Phase 9.2 interaction/persistence | `a206dbb2cc2ac839b1ce6d28d0529d4edde6217` |
| Phase 9.3 Studio integration | `955f1be65445d43675dd432410a291e33be1ba49` |
| Phase 9.4 lifecycle tests | `f7352ab` |
| Phase 9.4 benchmark | `3c339a1` |
| Phase 9 public API inventory | `9e675836625363cd1897f609a41e42744573ff7b` |
| Git identity used for all new commits | `Akira Yuzai <yuzai.akira@gmail.com>` |
| Delivery policy | commits pushed directly to `origin/main`; no force-push, release, npm publication, or GitHub Actions |

The final verified implementation/evidence SHA before this report-only change
is `9e675836625363cd1897f609a41e42744573ff7b`. The final report commit must be
included in the handoff's final remote-SHA check.

## Implemented capabilities

### Phase 9.1

- `Chart.addAnchoredVwap()` reuses the built-in causal `ANCHORED_VWAP`
  indicator on the main pane, including UTC anchor, typical/close source,
  output style, visibility, corrections, updates, replay masking, and normal
  indicator disposal.
- `Chart.addVolumeProfile()` owns a lifecycle-safe estimated OHLCV overlay with
  fixed/visible modes, close/range-uniform allocation, bin count, value-area
  percentage, POC, VAH, VAL, labels, left/right placement, theme-aware style,
  clipping to the main pane, and explicit empty results.
- Volume Profile uses the existing Canvas2D overlay command path. It does not
  allocate a second canvas, mutate raw candles, duplicate viewport logic, or
  create an uncontrolled render loop.

### Phase 9.2

- Anchored VWAP placement snaps a pointer/touch selection to the nearest
  visible candle timestamp and exposes the same operation through accessible
  UTC controls.
- Profile mode, fixed UTC range, allocation, bins, value-area percentage,
  visibility, markers, labels, and display options are updateable through the
  public lifecycle API.
- Version-1 workspace documents persist canonical profile options and
  Anchored VWAP indicator parameters. Derived bins, caches, pixel positions,
  sockets, and one-shot pointer state are not persisted. Legacy workspaces
  remain accepted.

### Phase 9.3

- The private Next.js Studio now exposes an accessible Volume Analytics panel.
- The panel supports Anchored VWAP enable/remove, UTC anchor editing, close or
  typical source, visible-candle placement, estimated Volume Profile enable/
  remove, visible/fixed range, range boundaries, allocation, bins, value area,
  POC/VAH/VAL and labels.
- Each chart panel owns independent analytics objects. Symbol, timeframe,
  layout, and panel switching do not leak anchors or profiles.
- Replay disables structural analytics controls and calculates against the
  replay-visible raw candle prefix. Comparison mode hides raw-price analytics
  while normalized series are shown and restores visibility on exit.
- Studio save/reload and comparison workflows preserve the canonical raw
  workspace rather than temporary normalized series.

### Phase 9.4

- Added deterministic numerical, replay, browser lifecycle, and disposal
  coverage.
- Added `npm run benchmark:volume-analytics` for 1,000, 10,000, and 100,000
  candle workloads.
- Added architecture, Studio, API, benchmark, and roadmap documentation.

## Public API verification

The current inventory contains 214 runtime exports and 480 type exports across
`openkline` and `@openkline/react`. New documented contracts include
`Chart.addAnchoredVwap`, `Chart.getAnchoredVwaps`,
`Chart.startAnchoredVwapPlacement`, `Chart.addVolumeProfile`,
`Chart.getVolumeProfiles`, `AnchoredVwapCalculator`, the pure volume-analytics
calculators, profile option/result types, and optional `WorkspaceDocument`
volume analytics.

`npm run api:inventory` passed and the current inventory is committed. The
compatibility command was executed and returned `FAIL`, with the following
evidence:

- baseline commit: `3e7a889a94c40255bbcce210a672856cfc98b32b`;
- removed exports: `0`;
- changed declaration hashes: `Chart` and `WorkspaceDocument`;
- additive exports: `71`.

The changed hashes are caused by the intentional Phase 9 public methods and
optional workspace field, while the additive exports are documented. The
historical baseline was not regenerated merely to make the command green.
Per the repository API-compatibility policy, owner approval and a reviewed
before/after migration record are still required before updating that baseline.
Therefore API compatibility is an open gate, not a claimed pass.

## Test results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 223/223 Node tests |
| `npm run api:inventory` | PASS — 214 runtime / 480 type exports |
| `npm run api:check` | BLOCKED/OPEN — 0 removals, 2 intentional declaration changes, baseline approval required |
| `npm run studio:check` | PASS — Studio remains private and core has no React/Next runtime dependency |
| `npm run package:check` | PASS — local dry-run, 414 files |
| `npm run package:smoke` | PASS — packed ESM consumer installed and imported successfully |
| `npm run distribution:check` | PASS — 414 files, 389,207 bytes, no package problems |
| `npm run test:browser` | PASS — 27/27 Chromium tests |
| `npm run test:react:browser` | PASS — 32/32 React/Studio Chromium tests |
| `npm --prefix examples/nextjs-app-router run build` | PASS — Next.js 16.4.3 production build |
| focused Volume Analytics browser suite | PASS — 2/2 Chromium tests |
| focused Studio Volume Analytics workflow | PASS — included in 13/13 file tests and 32/32 full suite |
| `npm run stress:ci` | PASS — Node and browser stress; no orphan workers, no orphan failures, zero remaining canvases |
| `npm run benchmark:browser` | PASS — Canvas2D workload evidence |
| `npm run benchmark:volume-analytics` | PASS — all numerical invariants and three dataset sizes |

The focused browser test verifies actual profile results and not only UI
presence: it checks numeric POC/VAH/VAL ordering, fixed-range stability after
viewport movement, replay cutoff reduction, backward/forward causal changes,
workspace round-trip, panel isolation, comparison suppression/restoration, and
zero page errors.

## Browser compatibility

Playwright version is `1.64.1`. The cloud environment had only system
Chromium available:

- system browser: Chromium `154.0.8037.57` at `/usr/bin/chromium`;
- Playwright-managed Chromium, Firefox, and WebKit paths were absent;
- no physical device access was available.

The 27 Vanilla and 32 React/Studio tests therefore ran with system Chromium
and are valid Chromium evidence only. Official Firefox, official WebKit,
mobile Safari emulation, and physical-device compatibility are **BLOCKED / NOT
VERIFIED**. No download retry or untrusted system-browser substitution was
used for those gates.

## Numerical correctness evidence

The 223 Node tests and the focused browser tests cover:

- inclusive Anchored VWAP anchors and explicit typical/close sources;
- missing and zero-volume handling;
- duplicate and out-of-order corrections with last-write-wins semantics;
- finite extreme-value handling;
- `[from, to)` profile ranges;
- close and range-uniform allocation;
- eligible-volume conservation;
- deterministic POC tie-breaking and contiguous value-area expansion;
- explicit empty states;
- no input-candle mutation;
- replay-visible prefix behavior and restored post-replay state.

All profile values remain explicitly labelled as estimated from OHLCV. No
tick-level, order-flow, bid/ask, or exchange-reported volume-at-price claim is
made.

## Performance and memory evidence

### Deterministic Node calculation benchmark

Five samples per scenario on Node `v24.19.0`, Linux x64, Intel Xeon Platinum
8573C:

| Candles | VWAP median/p95 ms | Close profile median/p95 ms | Range-uniform median/p95 ms | Visible range median/p95 ms | Append update median/p95 ms | Correction + result median/p95 ms | Dispose ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.421 / 1.464 | 0.789 / 1.110 | 3.145 / 6.704 | 0.153 / 0.175 | 0.003 / 0.010 | 0.253 / 0.994 | 0.001 |
| 10,000 | 3.115 / 3.673 | 4.893 / 6.125 | 4.412 / 4.976 | 1.377 / 1.458 | 0.004 / 0.005 | 1.452 / 4.022 | 0.003 |
| 100,000 | 35.198 / 89.123 | 30.160 / 41.252 | 53.903 / 74.239 | 27.484 / 44.265 | 0.003 / 0.010 | 29.038 / 41.158 | 0.008 |

Append timing measures the calculator state update only. Correction timing
includes result recalculation. These are host-specific workload measurements,
not universal guarantees.

### Canvas2D Chromium benchmark

The existing Canvas2D benchmark ran with system Chromium 154:

| Candles | FPS | Frame work median/p95 ms | Navigation median/p95 ms | Heap after update |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 65.01 | 1.8 / 3.6 | 0.1 / 0.3 | 11,845,174 bytes |
| 10,000 | 60.94 | 1.3 / 1.9 | 0.1 / 0.2 | 74,020,870 bytes |
| 100,000 | 61.69 | 1.7 / 2.1 | 0.1 / 0.4 | 185,637,022 bytes |

The run reported `frameIntervalMedianMs` around `16.7ms`,
`frameIntervalP95Ms` up to `17.6ms`, `usedAfterDestroy=3,131,871`, and
`remainingCanvasCount=0`. This is Chromium evidence in the cloud workload,
not a replacement for the previously observed Manjaro baselines.

## Acceptance matrix

| Criterion | Status | Evidence / remaining condition |
| --- | --- | --- |
| Phase 9.0 pure calculation engines | PASS | 223 Node tests, conservation and edge-case coverage |
| Phase 9.1 Anchored VWAP chart rendering | PASS for tested Chromium | Public indicator/Chart API, overlay and focused browser pixel/lifecycle evidence |
| Phase 9.1 estimated Volume Profile rendering | PASS for tested Chromium | Canvas2D overlay, fixed/visible modes, markers, empty state, disposal |
| Phase 9.2 interaction and persistence | PASS for tested Chromium | Placement, UTC options, range editing, workspace restore and no duplication |
| Phase 9.3 Studio integration | PASS for tested Chromium | 32/32 React/Studio tests, including integrated Volume Analytics workflow |
| Replay financial safety | PASS for tested scope | Causal prefix and backward/forward result assertions; no future data observed |
| Comparison compatibility | PASS for tested Chromium | Raw-price overlays hidden/restored around normalized comparison |
| Numerical and lifecycle verification | PASS | 223/223, 2/2 focused browser, deterministic benchmark |
| Package installation and distribution | PASS | Package check, smoke consumer, distribution check |
| Public API compatibility baseline | BLOCKED / OPEN | Intentional changes need owner-approved baseline update; command currently fails with no removals |
| Official Firefox | BLOCKED / NOT VERIFIED | Playwright-managed binary unavailable in cloud |
| Official WebKit | BLOCKED / NOT VERIFIED | Playwright-managed binary unavailable in cloud |
| Mobile Safari | BLOCKED / NOT VERIFIED | WebKit binary and physical device unavailable |
| Physical devices | NOT TESTED | No device lab/access in this environment |
| Live vendor volume-at-price | NOT IMPLEMENTED | Phase 9 deliberately provides OHLCV estimates only |
| Phase 9 overall closure | PARTIAL / OPEN | Engineering is implemented; mandatory open gates prevent closure |

## Remaining technical debt and next safe action

1. Obtain owner approval for the intentional public API additions, document
   migration impact, then update the API baseline in a separate reviewed
   change and rerun `npm run api:check`.
2. Run the existing five-project Playwright suite in an approved environment
   with official Firefox/WebKit binaries and record actual versions/results.
3. Keep physical-device and any live-provider acceptance claims open until
   separately authorized and tested.

Phase 10 was not started. No licensing, npm publication, release, or GitHub
Actions changes were made.
