# Phase 8.14.0 — Provider-Neutral Multi-Asset Datafeed Integration

Date: 2026-10-29

## Scope and Git baseline

Implementation started from the confirmed `origin/main` revision
`4fb4ca7b223a8e4712a91652afc620d977875cb4` on `main`. The work stayed
directly on `main`; no branch, Pull Request, release, npm publication,
licensing change, or GitHub Actions workflow was created.

The existing `ComparisonEngine`, chart synchronization, rendering, replay
engine, and canonical Studio workspace logic were reused. The new coordinator
is an additive provider-neutral boundary around those existing contracts.

## API compatibility investigation

The Phase 8.13.1 report recorded an apparent `WorkspaceRestoreResult` API
mismatch. Inspection of `scripts/api-compatibility.mjs`,
`scripts/public-api-inventory.mjs`, the stored baseline, historical source, and
current declarations showed identical signatures and the same hash
`04a723abd0b74519b8d98b7e8de4be0e90c208facd7a9e641dd2c173ce197147`.

The failure was reproduced only when multiple build-backed commands ran in
parallel: they shared `dist` while each ran `clean`, allowing the inventory to
read partial declarations. The API check passes when executed sequentially.
No baseline regeneration, suppression, or public signature change was made.

## Implemented public API

Added and exported `ComparisonDatafeedController` and its typed contracts from
the root `openkline` package:

- `ComparisonDatafeedAsset` and `ComparisonDatafeedWindow` associate each
  comparison id with a `Datafeed`, provider symbol, timeframe, label, and
  color.
- `registerAsset`/`addAsset`, `removeAsset`, and `replaceAsset` support
  independent or shared providers and runtime asset changes.
- `load` resolves symbols, requests the shared exclusive `[from, to)` UTC
  window, extends the lower bound when an earlier baseline is required, and
  reports per-asset `registered`, `loading`, `ready`, `empty`, and `error`
  states through `getState()`/`getAssetStatuses()`.
- `cancel`, `AbortSignal`, generation checks, and asset callback tokens prevent
  stale history or realtime events from mutating current state.
- `getRawCandles` preserves defensive raw OHLCV data independently from
  normalized comparison points.
- `setMode` and `setBaseline` delegate all formulas and causal baseline
  selection to `ComparisonEngine`; no normalization logic was duplicated.
- `setReplayCutoff` masks future normalized points without mutating acquired
  data, so backward seeks cannot expose previously hidden observations.
- Independent `subscribeBars` lifecycles handle corrections, out-of-order
  inserts, duplicate suppression, provider errors, missing realtime support,
  removal, replacement, and disposal.

## Studio integration

The private Next.js Studio now creates deterministic offline
`InMemoryDatafeed` instances for its BTC-USD, ETH-USD, and AAPL fixtures and
loads comparison lines through the public coordinator. The UI retains the
existing comparison controls, displays historical data state and per-asset
errors, applies replay cutoffs through the coordinator, and preserves the
Phase 8.13.1 canonical workspace save/restore behavior. The fixtures are local
test data and are not claims of live exchange connectivity.

## Verification results

Environment: Node `v24.19.0`, Playwright `1.64.1`, managed headless Chromium
`154.0.0.0`. Browser results are environment-specific.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 203/203 Node tests |
| `npm run api:check` | PASS sequentially — no removals/signature changes; new coordinator exports are additive |
| `npm run studio:check` | PASS — core remains free of React/Next runtime dependencies |
| `npm run package:smoke` | PASS — local tarball installed and imported |
| `npm run distribution:check` | PASS — 406 files, 362,269 bytes, SHA-1 `61f647dd4ea5b4c5dfce102607a6fa855d72100f` |
| `npm run test:browser` | PASS — 25/25 Chromium tests |
| `npm run test:react:browser` | PASS — 30/30 React/Studio Chromium tests |
| Focused Studio comparison/reload tests | PASS — 2/2 |
| `npm run benchmark:comparison` | PASS — 3 assets at 10k/100k observations; disposal verified |

Focused Node coverage adds five tests for different timeframes/calendars,
exclusive range and baseline acquisition, partial failures and empty data,
realtime corrections/out-of-order events/duplicates, replay masking,
cancellation, stale loads, invalid events, removal, and disposal. Existing
Chromium comparison/workspace tests verify the Studio consumer and no page
errors.

## Financial correctness and lifecycle safeguards

- Every asset selects its own latest-at-or-before baseline through the existing
  engine. Future bars are never used to establish a baseline.
- Missing sessions remain missing; no interpolation or forward-fill was added.
- Historical duplicate timestamps use deterministic last-write-wins behavior;
  final timestamps are strictly ordered and OHLC relationships are validated.
- Realtime corrections replace equal timestamps, out-of-order events are
  inserted chronologically, and invalid observations are rejected before state
  changes.
- Raw candle storage and normalized line data are separate.
- Realtime callbacks are token-gated after asset removal, replacement, reload,
  cancellation, and disposal. Active subscriptions and in-flight requests are
  released by lifecycle operations.

## Performance and compatibility limitations

The comparison normalization benchmark remained healthy:

| Assets / observations per asset | Add (ms) | Normalize (ms) | Update median (ms) | Update p95 (ms) | Disposed |
|---|---:|---:|---:|---:|---|
| 3 / 10,000 | 6.817 | 8.053 | 0.003 | 0.085 | yes |
| 3 / 100,000 | 35.385 | 35.159 | 0.002 | 0.019 | yes |

These are comparison-engine measurements, not a claim about network latency or
full Canvas2D frames. No performance-sensitive normalization implementation was
rewritten.

Only Chromium was available for this cloud verification. Firefox, WebKit,
Mobile Safari, physical devices, and external provider connectivity were not
tested and remain open. No system-browser substitution or credentialed provider
request was used.

## Acceptance matrix

| Criterion | Status | Evidence |
|---|---|---|
| Multiple Datafeeds/assets | Implemented / verified | Public controller and Node tests |
| Symbol resolution and exclusive history range | Implemented / verified | Query assertions and controller tests |
| Different timeframes and missing calendars | Implemented / verified locally | Per-asset timeframe test and sparse data behavior |
| Partial success, empty, and error states | Implemented / verified | Isolated provider/empty-history test |
| Cancellation and stale response protection | Implemented / verified | Abort and newer-load regression |
| Realtime corrections/out-of-order/duplicates | Implemented / verified | Controlled subscription test |
| Replay cutoff safety | Implemented / verified | Backward cutoff test and Studio integration |
| Raw OHLCV preservation | Implemented / verified | `getRawCandles` assertions |
| Resource cleanup | Implemented / verified | Unsubscribe, removal, replacement, disposal tests |
| Public API compatibility | Verified | Sequential API check; additive exports only |
| Studio public coordinator integration | Verified in Chromium | 30/30 React/Studio tests |
| Firefox/WebKit/Mobile Safari/physical devices | Not tested / open | Managed browser/device limitations |

## Final delivery

The implementation commit is `0c4bb784708a2a107c3a4c1708f5244e40f07ddf`.
It was pushed to `origin/main`, and a subsequent fetch verified that local
`HEAD` and `origin/main` resolve to the same revision. Required identity:
`Akira Yuzai <yuzai.akira@gmail.com>`. Phase 8.14.0 is implemented and locally
verified for the available environment; non-Chromium/device/provider-
credential gates are not claimed as complete. This delivery note is finalized
in the follow-up documentation commit that records the verified push.
