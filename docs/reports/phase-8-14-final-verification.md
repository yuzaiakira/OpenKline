# OpenKline Phase 8.14 — Final Engineering Verification

Date: 2026-10-30

## Scope and Git evidence

This report covers the Phase 8.14 implementation requested from the
consolidated `main` baseline. The functional implementation was verified at:

- Initial `main`: `d5cd0b5977d5ed50bf474373b02a39f00140dae7`
- Final implementation revision: `96620b2f56401a8feea2487b1c73a3eddf06102b`
- Remote checked after push: `origin/main` resolved to the same
  `96620b2f56401a8feea2487b1c73a3eddf06102b` revision.

The report and roadmap are documentation follow-up changes to that verified
implementation revision. All commits use `Akira Yuzai <yuzai.akira@gmail.com>`
as author and committer; the complete delivery commit list is recorded below.

No GitHub Actions workflow, npm publication, release tag, public release,
license change, credential, or provider secret was added.

## Delivered commits

| Revision | Conventional Commit | Scope |
|---|---|---|
| `f9a8a24651facd00a5f661bdea67f5bcd0cd3825` | `feat(datafeed): add historical coverage and bounded recovery` | 8.14.1/8.14.2 core controller, lifecycle status, tests, and reports |
| `7455f0eeb82b1db21281f53913de3295dfbc006e` | `feat(studio): complete datafeed-backed asset comparison` | 8.14.3/8.14.4 provider example, Studio source/recovery UI, fixtures, and browser workflow |
| `96620b2f56401a8feea2487b1c73a3eddf06102b` | `perf(datafeed): reduce redundant coverage scans` | API-compatible lifecycle extension, controller realtime optimization, benchmark, and docs |

## Phase 8.14.1 — Historical completeness

`ComparisonDatafeedController` now acquires from the minimum of the visible
window and the safely clamped `baseline.time - baseline.maxAgeMs`. `maxAgeMs =
0` retains exact-boundary behavior. Acquisition-only baseline candles remain in
defensive raw storage but are excluded from normalized output outside the
configured `[from, to)` visible window. Future observations are never used as
baselines, and no observation is fabricated.

Each asset can opt into provider-neutral continuous, session-aware, sparse, or
unknown coverage semantics. Coverage reports requested and observed ranges,
confirmed missing intervals, calendar knowledge, completeness, recovery need,
attempt status, and recovery errors. Unknown or sparse schedules remain
uncertain rather than treating weekends, holidays, or irregular markets as
provider failures.

Evidence: baseline lower-bound, exact boundary, continuous gap, session
closure, sparse schedule, different timeframe, partial history, and raw/visible
separation tests in `tests/comparison-datafeed.test.ts`.

## Phase 8.14.2 — Controlled backfill and realtime recovery

`backfill()` accepts explicit ranges or confirmed coverage gaps and enforces
bounded ranges, attempts, concurrency, retry delay, cancellation, generation
checks, and disposal. Recovered candles are validated, ordered, deduplicated,
and merged with deterministic correction semantics. A live candle received while
recovery is pending remains authoritative over an older historical response.

`DatafeedRealtimeSubscriptionArgs` is an additive lifecycle extension; the
existing `SubscribeBarsArgs` declaration remains unchanged for API
compatibility. `WebSocketDatafeed` emits connection, reconnect, disconnect,
error, and stop status values. The controller requests bounded recovery when a
reconnect is observable and retains explicit manual recovery for providers that
cannot expose lifecycle state.

Replay cutoff masking remains separate from acquired raw data. Backward seeks
hide future normalized points again, and the Studio status display uses the
visible comparison timestamp during replay rather than exposing the raw latest
observation.

Evidence: controller race, cancellation, disposal, live-correction precedence,
reconnect lifecycle, replay, stale asset, and invalid-event tests; deterministic
Studio gap-recovery workflow.

## Phase 8.14.3 — Provider integration

The optional `examples/vanilla/binance-datafeed.js` adapter remains outside the
core package. It maps public REST klines and public WebSocket kline messages,
validates supported intervals, paginates at most 100 pages of 1,000 rows,
normalizes integer UTC timestamps and OHLCV, deduplicates overlapping pages,
filters the exclusive upper bound, forwards cancellation, and inherits bounded
WebSocket reconnect and cleanup behavior.

`tests/browser/provider-examples.spec.ts` injects all transports and blocks
external requests. It verifies a deterministic two-page 1,001-row fixture,
normalization, ordering, WebSocket parsing, and unsubscribe cleanup. This is
provider contract evidence, not a live exchange result.

Live Binance connectivity: **NOT VERIFIED**. The managed cloud environment
does not provide an authorized external-provider connectivity gate; no TLS,
CORS, geographic, authentication, or security restriction was bypassed.

## Phase 8.14.4 — Studio integration

The private Next.js Studio now offers an explicit offline demo source and an
optional Binance source, with deterministic demo data as the default. It shows
per-asset historical state, realtime state, coverage completeness, recovery
state, latest visible observation, and provider errors. It exposes bounded
`Recover missing history`, deterministic missing-history simulation, and
deterministic realtime-correction actions. Asset, timeframe, normalization,
baseline, replay, and canonical workspace behavior remain integrated with the
existing chart APIs.

The workspace schema adds only an optional serializable `dataSource` identifier;
legacy documents remain valid and no transport, socket, token, or credential is
persisted. The Chromium workflow verifies demo loading, multiple assets,
normalization, correction, missing-history recovery, replay cutoff safety,
seek in both directions, save/reload, canonical presentation restoration, and
absence of page errors.

## Phase 8.14.5 — Verification results

Environment: Node `v24.19.0`, npm `11.9.0`, Playwright `1.64.1`, Linux cloud
workspace. Build-backed commands were run sequentially to avoid the repository's
known `dist` clean/build race.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 207/207 Node tests |
| `npm run api:check` | PASS — no removals or changed declaration hashes; additive exports only |
| `npm run studio:check` | PASS — 101 core files audited; no React/Next core runtime dependency |
| `npm run package:smoke` | PASS — local tarball installed and imported as ESM; 406 files |
| `npm run distribution:check` | PASS — 406 files, package size 372,032 bytes, unpacked size 2,129,964 bytes, SHA-1 `205da287c06c06841a48314219aad1b4f59e1f1b` |
| `npm run test:browser` | PASS — 25/25 Chromium tests |
| `npm run test:react:browser` | PASS — 30/30 React/Studio Chromium tests |
| `npm run benchmark:comparison` | PASS — 3 assets at 10k/100k observations; disposal verified |
| `npm run benchmark:comparison-datafeed` | PASS — 3 assets at 10k/100k; bounded backfill complete and disposal verified |

The browser suites used the repository-configured `/usr/bin/chromium`, version
`154.0.8037.57`, in headless mode. Playwright-managed executable paths for
Chromium, Firefox, and WebKit were absent under the cloud cache. The Chromium
results are therefore a local configured-Chromium result, not a claim that the
official Playwright-managed browser set or all device profiles were verified.

## Performance observations

The ordinary comparison benchmark reported:

| Assets / observations per asset | Add (ms) | Normalize (ms) | Update median (ms) | Update p95 (ms) | Disposed |
|---|---:|---:|---:|---:|---|
| 3 / 10,000 | 9.345 | 6.685 | 0.002 | 0.046 | yes |
| 3 / 100,000 | 33.598 | 36.518 | 0.002 | 0.019 | yes |

The controller benchmark reported:

| Assets / observations per asset | Historical load (ms) | Normalize median/p95 (ms) | Backfill (ms) | Realtime median/p95 (ms) | Dispose (ms) |
|---|---:|---:|---:|---:|---:|
| 3 / 10,000 | 68.529 | 1.024 / 1.259 | 22.190 | 0.023 / 0.254 | 0.113 |
| 3 / 100,000 | 536.891 | 5.958 / 17.832 | 223.933 | 0.010 / 0.064 | 0.012 |

These are Node reference measurements on this environment, not browser frame
times, network latency, a memory budget, or a universal capacity claim. The
measured realtime bottleneck was repeated full coverage scanning for same-time
corrections; the final implementation reuses unchanged coverage for such
corrections and only rescans when a new timestamp can change coverage. In a
paired local run, 100k/3-asset realtime p95 moved from approximately 105.8ms to
0.064ms. New timestamps still trigger coverage recalculation.

## Public API verification

The pre-existing `SubscribeBarsArgs` declaration and `Datafeed` contract retain
their baseline signatures. New lifecycle and comparison coverage/recovery
contracts are additive. `api:check` reported no removals and no changed hashes;
it listed `DatafeedRealtimeStatus`,
`DatafeedRealtimeSubscriptionArgs`, `ComparisonDatafeedController`, and related
coverage/recovery types as additive exports. No historical API baseline was
rewritten.

## Acceptance matrix

| Criterion | Status | Evidence / limitation |
|---|---|---|
| Correct baseline freshness lookback | PASS | Controller acquisition tests and safe subtraction |
| Exclusive historical range and visible-range separation | PASS | Raw/normalized range assertions |
| Continuous coverage gap detection | PASS | Deterministic interval-gap test |
| Session/sparse/unknown calendar handling | PASS | Closure and uncertainty tests; no fabricated candles |
| Targeted bounded historical backfill | PASS | Explicit and detected-range recovery tests and benchmark |
| Realtime subscription lifecycle | PASS | WebSocket status/reconnect test |
| Reconnect recovery where lifecycle is observable | PASS | Injected transport/controller recovery tests |
| Recovery/live correction race authority | PASS | Live correction remains authoritative |
| Cancellation, stale response, removal, and disposal safety | PASS | Node lifecycle tests and disposed benchmark state |
| Replay isolation and no future normalized values | PASS | Controller and Chromium Studio assertions |
| Provider-neutral core boundary | PASS | `studio:check`, API, and package checks |
| Optional realistic provider integration | PASS | Isolated Binance adapter with offline two-page fixture |
| Live external provider connectivity | PARTIAL | Not verified; no authorized cloud provider gate |
| Demo and provider-backed Studio source selection | PASS | React/Studio Chromium suite |
| Studio status, coverage, recovery, correction, and persistence | PASS | 30/30 React/Studio tests and focused workflow |
| TypeScript and Node regression suite | PASS | Typecheck and 207/207 |
| Public API compatibility | PASS | Sequential API check, no changed hashes |
| Package installation and distribution contents | PASS | Package smoke and distribution check |
| Comparison/datafeed performance measurements | PASS | 10k/100k reference benchmarks; environment-specific |
| Chromium rendering and interaction | PASS | 25/25 vanilla and 30/30 React/Studio |
| Playwright-managed Firefox | BLOCKED | Managed executable absent; not executed |
| Playwright-managed WebKit | BLOCKED | Managed executable absent; not executed |
| Mobile Safari emulation | BLOCKED | WebKit executable absent; not executed |
| Physical-device compatibility | NOT TESTED | No physical device attached |
| Universal browser/provider compatibility | NOT IMPLEMENTED | This phase does not claim certification beyond executed evidence |

## Final assessment

Phase 8.14 engineering is implemented and verified for the available local
scope. The core, optional provider contract fixtures, Studio demo/provider
selection path, recovery semantics, package surface, and measured Node/browser
regressions satisfy the executable acceptance criteria above. Live external
provider access, Playwright-managed Firefox/WebKit/mobile Safari, physical
devices, and universal compatibility remain explicitly open. They must not be
reported as complete or used as a final release certification without new
evidence.
