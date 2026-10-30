# Phase 8.14.6 — Realtime Hardening Verification

Date: 2026-10-30

This report covers the final realtime-continuity and provider-integration work
requested for Phase 8.14.6. It does not start Phase 9 and does not certify
non-Chromium browsers, physical devices, or live external-provider access.

## Git

| Item | Result |
| --- | --- |
| Starting `origin/main` | `cff617b1c512f1199955535ebcf50d71983cf4eb` |
| Final implementation SHA | `3ea3e79001aad198a2554d47f72e67f4e85d5ec9` |
| Branch | `main` |
| Remote | `origin/main` |
| Synchronization | PASS; local `HEAD` matched `origin/main` after each push |
| Git identity | `Akira Yuzai <yuzai.akira@gmail.com>` for author and committer |

Implementation commits:

- `cf9e3eff20ba0fd8f595990c7038f5d1127c42a6` — `fix(comparison): support continuous realtime recovery`
- `3ea3e79001aad198a2554d47f72e67f4e85d5ec9` — `refactor(studio): unify provider and live comparison fixtures`

No branches, pull requests, releases, npm publications, license changes, or
GitHub Actions were created.

## Defect findings and fixes

### Defect A — realtime bars stopped at the initial upper bound

- Reproduced: **YES**. The new Node test first failed because `getNormalizedData()` filtered every point with the original `point.time < window.to` condition.
- Root cause: the historical acquisition window was incorrectly reused as the only live display boundary.
- Fix: added additive `realtimeWindowMode: "fixed" | "follow"`. Fixed mode remains the default. Follow mode keeps the original acquisition window while allowing accepted realtime and recovered points at or beyond its exclusive upper bound into normalized output.
- Evidence: realtime-following Node regression, fixed-window Node regression, React/Studio live-stream regression.

### Defect B — reconnect recovery stopped at the initial window

- Reproduced: **YES**. A reconnect after a future realtime frontier previously returned no useful range because recovery still used the original `window.to`.
- Root cause: `recoveryFrom()` had no live frontier or current recovery target.
- Fix: recovery now uses a monotonic per-asset frontier, an injectable `recoveryNow()` target (default `Date.now()`), valid `[frontier, target)` semantics, and a seven-day default automatic range bound configurable with `maxRecoveryRangeMs`. Empty intervals do not issue requests. Bounded recovery is reported as incomplete instead of being marked complete.
- Evidence: exact `[1200,1500)` Node request assertion, out-of-order frontier test, repeated reconnect test, and bounded-target test.

### Defect C — recovery/live lifecycle races

- Reproduced: **YES** for overlapping live corrections and stale lifecycle responses; the existing race test was retained and expanded with replacement coverage.
- Fix: live timestamps remain authoritative through `liveByTime`; frontier tracking uses `maxTime()`; load/backfill generations, abort signals, callback tokens, removal, replacement, and disposal continue to guard all mutations.
- Evidence: 214/214 Node tests, including live-before-recovery, repeated reconnect, replacement, cancellation, disposal, correction, duplicate, and out-of-order scenarios.

## Implementation

- Historical acquisition, raw retention, live display, fixed display, and replay visibility are now separate concepts.
- Follow mode does not call `setWindow()`, reload history, recreate subscriptions, or rebuild the controller for each new bar.
- Replay masking remains applied to derived normalized output. Raw OHLCV data and the existing `ComparisonEngine` baseline/normalization implementation are unchanged.
- The deterministic Studio datafeed now supports stream advancement, disconnected delivery suppression, reconnect lifecycle events, bounded recovery, and replay-safe workspace reload without external network access.
- Binance example protocol mapping is shared between Vanilla and Studio. Historical paging remains bounded and now fails instead of silently truncating an over-limit request. Studio maps only BTC-USD→BTCUSDT and ETH-USD→ETHUSDT; unsupported AAPL is reported as an asset error, not guessed as a Binance instrument.

## Verification

All build-backed commands were run sequentially:

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 214 tests |
| `npm run api:check` | PASS — no removed or changed public declarations |
| `npm run studio:check` | PASS |
| `npm run package:smoke` | PASS — installed local tarball as an ESM consumer |
| `npm run distribution:check` | PASS — 406 files, 373337-byte package, 2136833-byte unpacked, SHA-1 `6632cab765c1491346fff34ddea420648f66b9de` |
| `npm run test:browser` | PASS — 25/25 Chromium tests |
| `npm run test:react:browser` | PASS — 31/31 React/Studio Chromium tests |
| `npm --prefix examples/nextjs-app-router run build` | PASS |

The optional Binance fixture is included in the 25/25 Chromium result. No live
Binance request was used.

## Benchmarks

Environment: Node.js `v24.19.0`, npm `11.9.0`, local deterministic fixtures.
These are observations, not universal latency, FPS, memory, or provider
capacity guarantees.

`npm run benchmark:comparison`:

| Assets × candles | Add (ms) | Normalize (ms) | Update median / p95 (ms) | Disposed |
| --- | ---: | ---: | ---: | --- |
| 3 × 10,000 | 6.882 | 6.139 | 0.003 / 0.051 | yes |
| 3 × 100,000 | 19.015 | 37.373 | 0.003 / 0.048 | yes |

`npm run benchmark:comparison-datafeed`:

| Assets × candles | History load (ms) | Normalize median / p95 (ms) | Backfill (ms) | Realtime median / p95 (ms) | Dispose (ms) | Disposed |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 3 × 10,000 | 67.909 | 1.111 / 1.436 | 24.742 | 0.037 / 0.235 | 0.120 | yes |
| 3 × 100,000 | 605.739 | 7.476 / 18.782 | 257.822 | 0.012 / 0.223 | 0.014 | yes |

The benchmark reports successful bounded backfill and disposal. It does not
claim a particular browser FPS or prove absence of leaks on every platform.

## Browser and provider scope

| Target | Status | Evidence or limitation |
| --- | --- | --- |
| Chromium | PASS | System executable `/usr/bin/chromium`, version 154.0.8037.57; 25/25 |
| React/Studio Chromium | PASS | Same system Chromium; 31/31 |
| Playwright-managed Firefox | BLOCKED | Required managed binary absent in the cloud environment |
| Playwright-managed WebKit | BLOCKED | Required managed binary absent in the cloud environment |
| Mobile Safari emulation | BLOCKED | WebKit binary unavailable |
| Physical devices | NOT VERIFIED | No device access in this environment |
| Live Binance connectivity | NOT VERIFIED | External provider access was intentionally not used |
| Offline Binance fixture | PASS | Deterministic pagination, normalization, websocket, duplicate, and cleanup checks |

The project used the existing system Chromium configuration and did not
substitute system Firefox/Safari or disable TLS verification. No repeated
browser-artifact download attempts were made after confirming the missing
managed binaries.

## Acceptance matrix

| Criterion | Status | Evidence |
| --- | --- | --- |
| Follow-mode view advances after initial `window.to` | PASS | Node and React/Studio regressions |
| Fixed historical view remains bounded | PASS | Fixed-mode Node regression |
| No full reload per live bar | PASS | Controller path updates raw/normalized state directly; browser stream test |
| Recovery beyond initial window | PASS | Exact `[frontier, target)` Node range assertion |
| Valid exclusive recovery bounds and empty-interval handling | PASS | Recovery tests and Datafeed contract |
| Monotonic latest/recovery frontier | PASS | Out-of-order correction regression |
| Live corrections beat historical recovery | PASS | Existing and new race tests |
| Repeated reconnects and independent cleanup | PASS | Reconnect-cycle Node test and browser lifecycle coverage |
| Cancellation, replacement, and disposal safety | PASS | Node cancellation/replacement/disposal tests; browser cleanup suite |
| Replay no-lookahead | PASS | Node cutoff coverage and React/Studio follow/replay test |
| Studio live-following presentation | PASS | Deterministic advance/disconnect/reconnect/reload browser test |
| Canonical workspace persistence | PASS | Existing Studio persistence tests remained green |
| Optional provider integration | PARTIAL | Shared offline adapter and mapping verified; live provider not verified |
| Node/build/API/package/distribution checks | PASS | Table above |
| Chromium browser checks | PASS | 25/25 and 31/31 |
| Firefox/WebKit/mobile/physical compatibility | BLOCKED / NOT VERIFIED | Environment limitations above |
| Direct push and clean remote state | PASS | `main` matched `origin/main` after implementation pushes |

## Remaining risks and closure decision

- A reconnect outage older than the automatic bound requires an explicit
  manual backfill and remains reported as incomplete; no missing market bars
  are fabricated.
- Real Binance behavior, exchange availability, CORS, regional access, and
  provider rate limits remain unverified.
- Firefox, WebKit, Mobile Safari, physical-device, and universal visual
  compatibility certification remain open.

**Phase 8.14 engineering is ready for closure for the tested local scope.**
The browser/device and live-provider items above remain open gates and must not
be converted into universal release certification. Phase 9 was not started.
