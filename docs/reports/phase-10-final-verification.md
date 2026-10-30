# OpenKline Phase 10 — Final Engineering Verification

Date: 2026-10-30

Phase 10 was implemented on `main` from `9929b233799e6186c3714d490a2587a923952137`.
The final implementation SHA before this report commit is
`9a9ed5cbbcaadea75f422dd16d71e0331d375dc6`. The report commit is the final
repository handoff commit and is recorded by the Git verification commands in
the delivery summary.

## Scope delivered

### Phase 10.0 — causal aggregation

- Added provider- and framework-neutral fixed-duration timeframe parsing.
- Aggregation uses explicit UTC half-open `[start, end)` buckets and accepts
  only fixed integer source-to-target ratios. Calendar, exchange-session, and
  guessed weekly/monthly semantics remain rejected.
- Duplicate timestamps are last-write corrections; out-of-order input is
  normalized; missing source candles are never synthesized.
- OHLC, volume policy, coverage (`complete`, `partial`, `unknown`), finality,
  forming/closed status, `availableAt`, and source availability are explicit.
- `CausalTimeframeAggregator` supports full replacement, incremental update,
  corrections, `asOfTime`, deterministic snapshots, and disposal.

### Phase 10.1 — higher-timeframe analysis

- Reused the existing `IndicatorRegistry` for SMA, EMA, RSI, warm-up, and
  custom registered definitions.
- Added previous completed higher-timeframe OHLC reference levels.
- Added causal source-time mapping. A derived value is exposed only when its
  `availableAt` is no later than the source/replay timestamp; forming and
  incomplete observations remain unavailable according to policy.

### Phase 10.2 — chart integration

- Added additive Chart APIs for managed higher-timeframe indicator series and
  previous-period reference overlays.
- Derived series reuse the existing ChartModel viewport, panes, scales,
  renderer, crosshair, theme, resize, interaction, and cleanup paths.
- Realtime append/correction, `setData`, datafeed replacement, replay cutoff,
  workspace restore, visibility, and chart destruction recalculate or dispose
  derived state without retaining orphan canvases or subscriptions.

### Phase 10.3 — Studio workflows

- Added per-panel Next Studio controls for indicator, target timeframe, period,
  finality, and previous OHLC levels.
- Configuration is optional workspace state and preserves workspace version 1
  compatibility. Derived buckets and callbacks are not serialized.
- Controls are disabled during replay and normalized comparison while saved
  causal configuration remains isolated and restorable per panel.
- A Chromium suite regression found an accessible-name collision with the
  existing `Indicator` control. It was corrected in
  `9a9ed5cbbcaadea75f422dd16d71e0331d375dc6` and the full React suite passed.

### Phase 10.4 — verification and documentation

- Added public API regression coverage and a reproducible Node benchmark for
  1,000, 10,000, and 100,000 source candles.
- Updated the roadmap, chart/indicator/workspace/Studio API references, public
  API stability notes, and multi-timeframe architecture/API documentation.
- No Phase 11 work was started. No license, npm publication, release, or
  GitHub Actions changes were made.

## Test and package results

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 238/238 Node tests |
| `npm run studio:check` | PASS — core remains framework-neutral; Studio remains private |
| `npm run package:check` | PASS — local dry-run pack |
| `npm run package:smoke` | PASS — tarball installed by an ESM consumer |
| `npm run distribution:check` | PASS — 418 files, package SHA-1 `cdbc9896e1f37c6d9c7257afe6a92a93be6fc1e2` |
| Next app `npm run build` in `examples/nextjs-app-router` | PASS — Next 16.4.3, static routes generated |
| `npm run test:browser` | PASS — 28/28 system Chromium tests |
| `npm run test:react:browser` | PASS — 33/33 system Chromium tests |
| `npm run stress:ci` | PASS — Node and Chromium stress artifacts; zero orphan failures and zero remaining canvases |

The full Node suite includes the new aggregation, indicator, public API, and
workspace lifecycle tests. The focused MTF Vanilla and Next Studio tests also
passed before the full suites.

## Compatibility browser matrix

`npm run test:browser:compat` discovered 112 tests:

| Project | Result | Evidence |
| --- | --- | --- |
| Firefox | BLOCKED — 28/28 launch failures | Playwright-managed `firefox-1555` missing at `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox` |
| WebKit | BLOCKED — 28/28 launch failures | Playwright-managed `webkit-2370` missing at `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh` |
| Mobile Chrome emulation | PASS — 28/28 | Uses the installed system Chromium executable |
| Mobile Safari emulation | BLOCKED — 28/28 launch failures | Requires the missing Playwright-managed WebKit binary |

The 84 blocked cases failed before test assertions because the official
Playwright browser executables are not installed in this cloud environment.
No system Firefox, WebKit substitute, Docker browser, or TLS bypass was used.
Physical-device compatibility, Firefox, WebKit, and mobile Safari behavior are
therefore not claimed.

Chromium accessibility and preliminary contrast suites passed as part of the
33-test React run. This is not a physical-device or all-engine accessibility
approval.

## Performance evidence

### Multi-timeframe Node benchmark

Environment: Node `v24.19.0`, `linux/x64`, `INTEL(R) XEON(R) PLATINUM 8573C`.
Source timeframe `1m`, target timeframe `1h`; five repetitions for 1k/10k and
three for 100k. Values are milliseconds, median/p95. These are calculation
timings only, not Canvas2D FPS claims.

| Source candles | Aggregate | Append + read | Indicator | Mapping | Previous levels | No lookahead |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1,000 | 0.569 / 1.210 | 0.879 / 0.887 | 0.985 / 1.199 | 0.190 / 0.240 | 0.406 / 0.425 | true |
| 10,000 | 5.643 / 6.727 | 4.875 / 4.918 | 5.911 / 7.086 | 0.618 / 1.334 | 5.745 / 7.442 | true |
| 100,000 | 86.581 / 86.581 | 63.310 / 63.310 | 69.984 / 69.984 | 9.553 / 9.553 | 63.538 / 63.538 | true |

### Existing Canvas2D benchmark

The existing Chromium benchmark remained healthy at approximately 64.31 FPS
for 1k, 62.31 FPS for 10k, and 62.24 FPS for 100k candles. At 100k, frame
interval median/p95 was 16.6/17.2 ms, frame-work median/p95 was 1.3/3.5 ms,
and the final canvas count after destruction was zero. Browser heap values are
environment-specific: 556,659,674 bytes before destroy and 3,179,951 bytes
after destroy in this run; they are not cross-machine memory guarantees.

CI stress reported zero orphan failures, zero Worker orphans, zero remaining
canvases, and no page errors. Node stress processed 4,000 events with a 0.1791
ms median and 13.6818 ms p95 event latency.

## Public API compatibility

The root package exposes the documented aggregation, mapping, indicator, level,
Chart, workspace, and React-consumer contracts. `npm run api:diagnostics`
returned `PASS_ADDITIVE_REVIEW_REQUIRED`: no removed exports, no changed
declaration members, and no incompatible findings were detected.

The strict historical `npm run api:check` remains `FAIL` against its older
baseline commit `3e7a889a94c40255bbcce210a672856cfc98b32b`. It reports the
intentional additive Chart and `WorkspaceDocument` surface changes and does
not report removals. `docs/audits/public-api-baseline.json` was not modified;
owner approval is still required before adopting a new compatibility baseline.

## Acceptance matrix

| Criterion | Status | Basis / remaining gate |
| --- | --- | --- |
| 10.0 provider-neutral causal fixed-duration aggregation | IMPLEMENTED / VERIFIED | Node tests, corrections, coverage/finality, benchmark |
| 10.1 registry-backed indicators and previous levels | IMPLEMENTED / VERIFIED | Node tests, public API test, no-lookahead benchmark |
| 10.2 reusable Chart integration and lifecycle | IMPLEMENTED / VERIFIED IN CHROMIUM | 28 Vanilla Chromium tests, cleanup/stress evidence |
| 10.3 Studio per-panel workflows, persistence, replay, comparison isolation | IMPLEMENTED / VERIFIED IN CHROMIUM | 33 React/Next Chromium tests |
| 10.4 tests, docs, and performance evidence | IMPLEMENTED / PARTIALLY VERIFIED | Node/package/Chromium gates pass; non-Chromium browser gates blocked |
| Firefox, WebKit, mobile Safari | OPEN | Playwright-managed binaries unavailable in cloud |
| Physical-device and all-engine visual/accessibility approval | OPEN | Not available in this environment |
| Strict historical API baseline adoption | OPEN | Intentional additive changes require owner approval |

Phase 10 implementation is complete for the available environment, but the
overall acceptance gate remains open for the blocked browser and API approval
criteria. Phase 11 must not begin until those gates are resolved or the owner
documents an explicit exception.

## Git and release status

Verified milestone commits, all authored and committed as
`Akira Yuzai <yuzai.akira@gmail.com>` and pushed to `origin/main`:

1. `ba5ae142fbb56897eb902b4f1b57bab066234e64` —
   `feat(analytics): add causal multi-timeframe candle aggregation`
2. `69a40bdac268311c1c445ed4743b1ad60d1f017b` —
   `feat(indicators): add higher-timeframe analysis and reference levels`
3. `4f0fcb039f4793fdb139450a9e5ddf1155fa890e` —
   `feat(chart): integrate multi-timeframe overlays`
4. `baa9e1f20170d4a4ec00796879278ccd18416724` —
   `feat(studio): add multi-timeframe analysis workflows`
5. `634455e5023ae4beac3b670716cb44fc82e4fe91` —
   `test(analytics): verify multi-timeframe causality and lifecycle`
6. `9a9ed5cbbcaadea75f422dd16d71e0331d375dc6` —
   `fix(studio): isolate higher-timeframe control labels`

The final report commit is pushed after this file is verified. Final sync is
confirmed only when `git rev-parse HEAD` equals
`git rev-parse origin/main`; no force-push, release tag, npm publication, or
public release was performed.
