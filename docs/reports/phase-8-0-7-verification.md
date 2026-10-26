# OpenKline Phase 8.0.7 verification

Date: 2026-10-26  
Repository: `yuzaiakira/OpenKline`  
Branch: `work`  
Playwright: 1.64.1  
Node: v24.19.0

## Outcome

Phase 8.0.7 implementation work covered the strategy-history bottleneck,
versioned Backtest Worker runtime, responsive Studio integration, deterministic
tests, public exports, package verification, and local Chromium measurements.
The engineering increment is implemented and verified where the environment
permits. The overall Phase 8.0.7 acceptance gate remains open because official
Playwright Firefox, WebKit, and Mobile Safari binaries are unavailable, and
formal accessibility and physical-device verification were not performed.

No unsupported cross-browser or accessibility claim is made.

## Implemented capabilities

- Built-in strategies opt out of unused per-bar history allocation with the
  additive `requiresHistory` hint.
- Custom trusted strategies retain an array-compatible bounded causal history
  view by default. Indexing, iteration, `slice`, `map`, `reduce`, retained
  references, and anti-lookahead behavior are covered by tests.
- Added `OPENKLINE_BACKTEST_WORKER_PROTOCOL_VERSION` version 1 with typed
  initialize, run, cancel, dispose, progress, complete, acknowledgement, and
  error messages.
- Added `createBacktestWorker()` and `BacktestWorkerError` with request IDs,
  generations, stable error codes, progress status, timeout/crash recovery,
  hard cancellation by Worker termination, supersession, and disposal.
- Worker execution accepts built-in strategies and serializable options only;
  trusted custom TypeScript registries remain synchronous by design.
- Worker execution delegates to `createBacktest()`. It does not duplicate
  signal evaluation, fills, accounting, metrics, fingerprints, or exports.
- Studio Strategy Tester now uses the Worker, applies results only for the
  current mounted panel/run token, and does not silently fall back to a
  synchronous run when Workers are unavailable.
- Studio exposes deterministic 100,000- and 500,000-bar fixtures for local
  responsiveness and cancellation verification.
- Added a real Chromium Worker benchmark and a 500,000-bar cancellation E2E.

## Verification results

### Node and type checks

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | Passed: 110 tests, 0 failed, 0 skipped, 0 cancelled |
| Worker protocol/parity suite | Passed: 6 tests |
| `git diff --check` | Passed |

The Worker suite verifies byte-for-byte serialized result parity with
`createBacktest()`, signals, orders, trades, metrics, repeat-run dataset reuse,
progress, cancellation, timeout, recovery, supersession, invalid data, and
disposal.

### Browser checks

| Target | Result | Evidence |
| --- | --- | --- |
| Chromium vanilla | Passed: 8/8 | `npm run test:browser` |
| Chromium React/Next Studio | Passed: 12/12 | `npm run test:react:browser` |
| Mobile Chrome emulation | Passed: 8/8 | compatibility run |
| Firefox | Blocked: 8/8 could not launch | Playwright binary unavailable |
| WebKit | Blocked: 8/8 could not launch | Playwright binary unavailable |
| Mobile Safari emulation | Blocked: 8/8 could not launch | WebKit binary unavailable |
| Physical devices | Not tested | No device farm attached |
| Formal accessibility audit | Not tested | Remains an open gate |

The React suite includes a real Worker run over 500,000 deterministic candles.
It clicks Cancel and verifies `cancelled` status and no JSON export/partial
result. The existing Chromium suite also verifies rendering, interactions,
KlineScript Worker lifecycle, replay, plugin loading, and chart cleanup.

### Worker benchmark

Command: `npm run benchmark:strategy-worker`  
Environment: headless Chromium 154, Linux, 2026-10-26.

| Candles | First run (ms) | First progress (ms) | Repeat run (ms) | Result bytes | Export parity | Status after dispose |
| ---: | ---: | ---: | ---: | ---: | --- | --- |
| 1,000 | 110.2 | 91.9 | 20.1 | 299,495 | true | disposed |
| 10,000 | 181.1 | 87.2 | 90.3 | 3,101,105 | true | disposed |
| 100,000 | 786.2 | 302.3 | 489.9 | 31,144,644 | true | disposed |

The separate 500,000-bar cancellation observation returned code `CANCELLED`
in 323.9 ms, state `cancelled`, and state `disposed` after explicit cleanup.
The final observed heap was 194,198,724 bytes after the benchmark's GC
opportunity. This is a local observation, not a leak proof, memory limit, or
universal latency target. The synchronous strategy benchmark remains the
financial performance reference; its optimized 100k built-in runs were
approximately 0.3–0.4 seconds in Node.

### Package and integration checks

- `npm run package:check` passed and included `dist/src/backtesting/worker.js`
  plus public declaration files in the dry-run tarball.
- `npm run package:smoke` passed in a clean temporary consumer and imported the
  packed ESM package.
- Next.js 16.4.3 production build passed with TypeScript checking and static
  page generation.
- No npm publish, release tag, GitHub release, license change, or GitHub
  Actions workflow was created.

## Acceptance matrix

| Criterion | Status | Evidence / remaining work |
| --- | --- | --- |
| Remove unnecessary historical-prefix quadratic work | Implemented / Verified | `requiresHistory`, causal-view tests, 1k/10k/100k benchmark |
| Versioned typed Worker protocol | Implemented / Verified | protocol guards and handler tests |
| Built-in Worker strategy execution | Implemented / Verified | Worker handler delegates to sync engine |
| Synchronous financial reference preserved | Implemented / Verified | byte-for-byte serialized parity test |
| Progress and status reporting | Implemented / Verified | throttled protocol and runtime tests |
| Hard cancellation | Implemented / Verified | termination tests and 500k Chromium E2E |
| Timeout, crash, stale generation, supersession, recovery | Implemented / Verified | deterministic Worker harness tests |
| Unmount/dispose cleanup | Implemented / Verified | runtime disposal and Studio lifecycle checks |
| Custom trusted TS strategy Worker execution | Not implemented by design | Sync `createBacktest()` remains the supported path |
| Worker benchmark and cleanup observations | Implemented / Verified | `benchmark:strategy-worker` |
| Public Vanilla/React/Next package consumption | Verified locally | package smoke, Next build, Chromium suites |
| Chromium compatibility | Verified locally | 8 vanilla + 12 React/Studio tests |
| Mobile Chrome emulation | Verified locally | 8 compatibility tests |
| Firefox | Blocked by environment | Official binary download HTTP 403 |
| WebKit | Blocked by environment | Official binary download HTTP 403 |
| Mobile Safari emulation | Blocked by environment | Depends on WebKit binary |
| Formal accessibility | Open / Not tested | Must be completed separately |
| Physical mobile devices | Open / Not tested | Must be completed separately |

## Browser environment investigation

The installed Playwright package is 1.64.1 and requires Firefox 157
(`firefox-1555`) and WebKit 27.2 (`webkit-2370`). No compatible cached
Playwright Firefox or WebKit executable was available. The official installer
was attempted with a writable temporary browser path and failed with HTTP 403
(`Domain forbidden`) on the official CDN and fallback URLs. Docker 28.4.0 was
available; the pinned official image
`mcr.microsoft.com/playwright:v1.64.1-noble` was also attempted and failed with
`Forbidden` while pulling the image configuration.

No system Firefox or Safari substitute was used. TLS verification was not
disabled, no arbitrary browser binary was introduced, and no endless retry was
performed. Reproducible next steps are to run the same pinned Playwright image
or installer from a trusted network, or transfer verified official artifacts
into the configured Playwright cache. Until then the three browser gates stay
open.

## Git and documentation verification

The implementation commits were:

- `cc0c562` — `perf(strategy): remove unused history prefix copies`
- `351df04` — `feat(backtesting): add cancellable strategy worker`

Both were created as `Akira Yuzai <yuzai.akira@gmail.com>` for author and
committer, pushed immediately to `origin/work`, and verified with
`git ls-remote`. The report itself is committed in the follow-up documentation
commit after this verification pass. No history rewrite or force push was used.

Updated documentation includes the PDR, roadmap, strategy architecture,
history optimization, Worker architecture and API, Studio guide, benchmark
methodology, testing guide, and this report.

## Phase 8.0.7 readiness

The implementation is ready for owner review and for continued compatibility
verification. The milestone is not formally closed: Firefox, WebKit, Mobile
Safari, physical-device, and formal accessibility acceptance criteria remain
open. This report does not authorize Phase 3 work or redefine those gates.
