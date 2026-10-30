# OpenKline Phase 13 Final Verification

Date: 2026-10-30 UTC  
Scope: corporate actions, split-adjusted data, cash dividends, total-return analytics, and portfolio accounting  
Environment: managed cloud workspace, Node.js `v24.19.0`, npm `11.9.0`

## Outcome

Phase 13 engineering is implemented and verified for the locally available
environment. The implementation is not an unconditional release approval.
The historical public-API baseline still requires owner approval, and official
Firefox, official WebKit, mobile Safari, physical-device, formal visual, and
formal accessibility gates remain open.

## Git

- Specified starting SHA: `0ecdcdb285a5fb79274847703746f6a5af9d6cc4`.
- Implementation verification SHA: `2e914c56f5b37bf3620306b11b80c8d955f1ad1f`.
- Branch: `main`.
- Remote: `origin/main`.
- At the time of this report, `HEAD == origin/main` was verified.
- After the implementation commit, only the generated API inventory update
  and this report were pending for the final documentation commit.
- All commits in the Phase 13 range use `Akira Yuzai <yuzai.akira@gmail.com>`
  as both author and committer.
- No force-push, GitHub Actions, npm publication, release tag, or public
  release was performed.

Commits in the implementation range:

| Commit | Message |
|---|---|
| `76c8d16673a28c0c2a5bc030d398aa0ff91020ce` | `feat(corporate-actions): add provider-neutral action contracts` |
| `5a6f06c4448046359f718ac8ec7d013fc929e46e` | `feat(corporate-actions): integrate chart and portfolio accounting` |
| `f7defaf5120fa5a0cf7628b3d0910b714276266c` | `feat(studio): add corporate action analysis workflow` |
| `5611b7a885cd672187a3d41fa86de9b8a2a01c4b` | `test(financial): harden corporate action causality and benchmarks` |
| `2e914c56f5b37bf3620306b11b80c8d955f1ad1f` | `fix(replay): preserve revealed data through chart snapshots` |

## Financial implementation

- Provider-neutral, versioned corporate-action datasets support stock splits,
  reverse splits, and cash dividends. Events carry stable IDs, instrument and
  source identity, revisions, effective time, optional ex/record/payment
  times, and knowledge-time metadata.
- Split adjustment uses the `newShares / oldShares` ratio. Historical OHLC is
  scaled by the reciprocal ratio and equivalent-share volume is adjusted by
  the ratio. Raw candles remain unchanged and are never used as adjusted
  execution prices.
- Raw, retrospective split-adjusted, causal-as-of split-adjusted, and
  explicit total-return views are separate. Total return is an analytical
  index with dividend reinvestment at the ex-dividend boundary; it does not
  fabricate executable OHLCV candles.
- Causal/as-of calculations exclude events after the effective frontier and
  events whose declared knowledge time is after the knowledge frontier.
  Unknown announcement or knowledge time is not inferred.
- The portfolio engine processes corporate actions on a deterministic merged
  timeline. Splits change quantity while preserving aggregate cost basis;
  reverse splits and fractional-share rejection are explicit. Dividend
  entitlement is separated from payment, with receivables and one-time cash
  settlement represented in the ledger and metrics.
- The current accounting policy cancels pending orders crossing a split,
  rejects unsupported fractional results, and does not spend unsettled
  receivables as available cash.
- Portfolio result export/import, worker serialization, cancellation,
  supersession, and disposal remain versioned and tested. Synchronous and
  Worker result fingerprints match.

## Chart, datafeed, comparison, and Studio integration

- `Chart.setCorporateActions()` attaches a validated dataset without mutating
  the raw source. `setCorporateActionDisplayMode()` supports `raw`,
  `split-adjusted`, and analytical `total-return`; `getDisplayedData()` is the
  rendered OHLCV domain and `getCorporateActionAdjustment()` exposes provenance
  and the analytical index.
- `getData()` returns the defensive raw source during normal operation. During
  replay it returns only the revealed raw prefix, preserving legacy replay
  diagnostics and preventing future-bar lookahead. Workspace serialization
  now applies the same revealed-prefix rule to the primary series.
- Existing marker/overlay, indicator, pane, viewport, replay, and destruction
  paths are reused. Indicators consume the selected displayed OHLCV domain;
  total return is not silently treated as executable candles.
- Comparison assets require an explicit performance basis and preserve raw
  observations. Raw, split-adjusted, and total-return lines cannot be mixed
  without an explicit mode.
- Corporate-action datafeed contracts support source identity, bounded
  pagination, corrections, revisions, cancellation, and deterministic
  in-memory fixtures. No live vendor or network data is used by the reference
  tests.
- Next.js Studio provides offline, visibly illustrative split/dividend
  controls, markers, raw/split-adjusted/total-return presentation, replay-safe
  warnings, event details, and portfolio accounting preview. Workspace state
  stores only the source/policy reference; it does not serialize the fixture
  dataset or derived results. Missing source references remain explicit and
  unresolved until the consumer loads a source.

## Correctness coverage

The Node suite includes 283 passing tests and 0 failures. It covers:

- 2-for-1, 3-for-2, and reverse splits;
- aggregate cost-basis preservation and fractional-share rejection;
- dividend entitlement, payment, payment-once behavior, entitlement after a
  sale, and no entitlement before purchase;
- as-of no-lookahead and pre/post-split position reconstruction;
- revisions, duplicates, contradictory events, source identity, missing
  coverage, invalid data, and bounded imports;
- replay forward/backward behavior, raw/adjusted isolation, comparison basis,
  workspace round trips, indicator consistency, Worker parity, cancellation,
  and disposal;
- existing calendars, early closes, overnight sessions, risk limits,
  multi-asset accounting, and shared-capital behavior.

## Validation commands

All shared-build-backed commands were run sequentially.

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm test` | PASS — 283/283 |
| `npm run api:inventory` | PASS — 276 runtime exports, 631 type exports; baseline not written |
| `npm run api:diagnostics` | `PASS_ADDITIVE_REVIEW_REQUIRED`; no removals, 0 findings, 284 additive declarations |
| `npm run api:check` | FAIL by design — protected historical baseline unchanged; owner approval required |
| `npm run studio:check` | PASS — core/studio boundary audit |
| `npm run package:check` | PASS — 478 files, 513.6 kB package |
| `npm run package:smoke` | PASS — local tarball installed and imported as ESM |
| `npm run package:audit` | PASS; license status remains `pending-owner-approval` |
| `npm run package:portability` | PASS — zero runtime dependencies; public ESM/declarations/workers verified |
| `npm run distribution:check` | PASS — 478 files, SHA-1 `1c069865a8109041355952847e51a8f43f74ae73` |
| `npm run test:browser` | PASS — Chromium 31/31 |
| `npm run test:react:browser` | PASS — Chromium 36/36 |
| `npm run test:react:production` | PASS — Next.js production + Chromium Worker 1/1 |
| `npm --prefix examples/nextjs-app-router run build` | PASS |
| `npm run stress:ci` | PASS — Node and Chromium stress paths |

The initial Chromium run exposed three replay visibility regressions. They
were fixed in `2e914c5`, then the focused replay/KlineScript tests passed 4/4,
the full Vanilla suite passed 31/31, and the full React suite passed 36/36.

## Browser environment

Playwright package version is `1.64.1`. The cloud image has system Chromium
`154.0.8037.57` at `/usr/bin/chromium`, which is the executable explicitly
configured by the local Playwright configs. Physical devices are unavailable.

The compatibility command was run once without attempting downloads:

```text
npm run test:browser:compat
```

Result: mobile Chrome emulation passed 31/31. Firefox, WebKit, and mobile
Safari could not launch because the Playwright-managed executables are absent:

- `/home/agent/.cache/ms-playwright/firefox-1555/firefox/firefox`
- `/home/agent/.cache/ms-playwright/webkit-2370/pw_run.sh`

The command therefore ended with 31 passed and 93 environment-blocked launch
failures. The failures are not reported as browser compatibility failures,
and the cloud environment did not substitute system Firefox/Safari or disable
TLS/download verification.

Automated Chromium accessibility and contrast checks passed in the React suite,
but formal accessibility approval, formal visual approval, and physical-device
verification remain independent gates.

## Performance and memory evidence

The dedicated deterministic Node benchmark was run with `npm run
benchmark:corporate-actions` on Node `v24.19.0`. Values are median/p95
milliseconds from the final run; heap deltas are process observations.

| Candles | Split adjustment | Total return | As-of | Comparison | Portfolio | Export | Heap delta |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1,000 | 1.995/5.554 | 1.365/2.083 | 0.622/1.072 | 2.577/4.623 | 14.867/20.763 | 1.667/1.918 | 0.50 MB |
| 10,000 | 4.677/7.844 | 2.967/4.558 | 4.742/15.500 | 16.742/18.603 | 119.262/155.345 | 22.642/40.490 | 0.03 MB |
| 100,000 | 128.613/188.012 | 143.462/236.882 | 67.141/87.523 | 262.290/400.171 | 3006.321/3404.439 | 503.926/587.817 | 0.09 MB |

Additional benchmark evidence:

- Synchronous portfolio median run time was 40.076 ms / 393.409 ms /
  5592.363 ms for 1k / 10k / 100k candles; p95 was 53.042 ms / 445.996 ms /
  5965.762 ms.
- Portfolio protocol handler measured 68.3 ms for 1k and 442.427 ms for 10k;
  progress, complete, and disposal acknowledgements were observed.
- Result serialization/import measured 4.611/8.900 ms for 1k,
  54.676/83.326 ms for 10k, and 326.366/467.745 ms for 100k
  (serialize/parse). Heap deltas were 1.54 MB, 17.79 MB, and 119.92 MB.
- Multi-timeframe and calendar benchmark commands passed. At 100k, the
  calendar benchmark recorded approximately 1.25 s session aggregation,
  1.16 s indicator calculation, and 1.00 s disposal in this Node process.
- Browser benchmark used cloud system Chromium, not the historical Manjaro
  baseline. It measured 64.36 FPS at 1k, 63.28 FPS at 10k, and 28.66 FPS at
  100k; the 100k frame interval was 26.2 ms median / 47.9 ms p95. After
  destruction, `remainingCanvasCount` was 0. The 100k heap observation was
  585.15 MB before destroy and 3.63 MB after destroy. These cloud measurements
  are environment-specific and are not a claim of universal performance or a
  regression against the prior Manjaro measurement.
- Stress CI recorded Node status `pass`, browser status `pass`, 0 orphan
  failures, 0 Worker orphans, and 0 remaining canvases. Node stress processed
  4,000 events with median latency 0.1802 ms and p95 13.7271 ms.

## Acceptance matrix

| Criterion | Status | Evidence / remaining gate |
|---|---|---|
| Versioned provider-neutral action contracts | PASS | Public types, validation, store, fixtures, 283 Node tests |
| Split and reverse-split mathematics | PASS | 2-for-1, 3-for-2, reverse, cost-basis tests |
| Dividend entitlement and payment separation | PASS | Receivable, sale-before-payment, payment-once tests |
| Raw OHLCV preservation | PASS | Chart/browser isolation tests |
| Reproducible split-adjusted and total-return views | PASS | Corporate-action unit/browser tests and benchmark |
| Historical knowledge-time/as-of causality | PASS | Focused as-of tests and no-lookahead assertions |
| Chart markers and adjusted presentation | PASS | Chromium Vanilla/React Studio suites |
| Indicator and comparison basis isolation | PASS | Node and browser comparison/indicator coverage |
| Portfolio split/dividend accounting | PASS | Node fixtures, portfolio benchmark, Studio workflow |
| Replay forward/backward causality | PASS | Focused 4/4 and full Chromium 31/31 after fix |
| Workspace backward compatibility and bounded persistence | PASS | Workspace tests and React Studio persistence tests |
| Datafeed correction/revision/cleanup behavior | PASS | Existing datafeed lifecycle tests and corporate-action store tests |
| Synchronous/Worker parity and disposal | PASS | Node Worker tests, production Worker 1/1, stress cleanup |
| Package installation and portability | PASS | Package, smoke, audit, portability, distribution gates |
| Locally available Chromium regression coverage | PASS | Vanilla 31/31; React 36/36; mobile Chrome 31/31 |
| Historical public API baseline approval | PARTIAL | Diagnostics additive-review-required; strict `api:check` remains open |
| Official Firefox verification | BLOCKED | Playwright `firefox-1555` executable unavailable in cloud |
| Official WebKit verification | BLOCKED | Playwright `webkit-2370` executable unavailable in cloud |
| Mobile Safari verification | BLOCKED | Depends on unavailable Playwright WebKit |
| Physical-device verification | NOT VERIFIED | No physical devices attached |
| Formal visual approval | NOT VERIFIED | Automated review artifacts exist; owner approval is separate |
| Formal accessibility approval | NOT VERIFIED | Automated Chromium checks pass; formal sign-off is separate |
| Licensing/release approval | OPEN | Package audit reports `pending-owner-approval`; no publication performed |

## Remaining technical debt and gates

1. Obtain owner approval for the additive public API and intentionally update
   the protected baseline only through the project’s approval process.
2. Run the same browser matrix with trusted Playwright-managed Firefox and
   WebKit artifacts. Mobile Safari emulation depends on that WebKit binary.
3. Perform physical-device, formal visual, and formal accessibility review.
4. Complete the separate licensing and release authorization process before
   changing effective licensing metadata or publishing anything.
5. Treat the cloud 100k Canvas2D measurement as an environment-specific
   observation; repeat performance comparison on the trusted baseline machine
   before making a release-level claim.

Phase 14 was not started.
